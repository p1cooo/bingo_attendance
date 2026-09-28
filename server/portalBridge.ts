import crypto from 'node:crypto';
import { AttendanceRecord, ClassSession, Student } from '../src/types.js';
import { db } from './db.js';
import { syncDocToFirestore } from './firestoreSync.js';

type AwardResult = {
  status: 'SYNCED' | 'NOT_LINKED' | 'PENDING' | 'DISABLED';
  transactionId?: string;
  awardedStars?: number;
  multiplier?: number;
  message?: string;
};

function configuration() {
  const url = process.env.PORTAL_BRIDGE_URL?.replace(/\/$/, '');
  const secret = process.env.ATTENDANCE_BRIDGE_SECRET;
  return url && secret ? { url, secret } : undefined;
}

async function signedPost(path: string, body: unknown) {
  const config = configuration();
  if (!config) return undefined;
  const payload = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac('sha256', config.secret).update(`${timestamp}.${payload}`).digest('hex');
  const response = await fetch(`${config.url}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Attendance-Timestamp': timestamp,
      'X-Attendance-Signature': signature,
    },
    body: payload,
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

/** Returns statuses only for IDs already authorized by the Attendance caller. */
export async function portalAccountStatuses(studentCodes: string[]): Promise<Record<string, 'REGISTERED' | 'NOT_REGISTERED' | 'UNKNOWN'>> {
  const unknown = Object.fromEntries(studentCodes.map((studentCode) => [studentCode, 'UNKNOWN' as const]));
  if (!studentCodes.length) return unknown;
  try {
    const result = await signedPost('/integration/attendance/account-statuses', { student_ids: studentCodes });
    if (!result?.response.ok || !result.data?.statuses || typeof result.data.statuses !== 'object') return unknown;
    return Object.fromEntries(studentCodes.map((studentCode) => [studentCode, result.data.statuses[studentCode] === true ? 'REGISTERED' : result.data.statuses[studentCode] === false ? 'NOT_REGISTERED' : 'UNKNOWN']));
  } catch {
    return unknown;
  }
}

/** The portal owns pets and calculates bonuses. Attendance never reads its DB. */
export async function awardPortalStars(params: {
  attendance: AttendanceRecord;
  student: Student;
  session: ClassSession;
  coachName?: string;
  baseStars: number;
  luckyTshirtWorn: boolean;
}): Promise<AwardResult> {
  if (!configuration()) return { status: 'DISABLED', message: 'Portal connection is not configured yet.' };
  try {
    const result = await signedPost('/integration/attendance/award', {
      event_id: `attendance:${params.attendance.id}`,
      student_id: params.student.student_id,
      base_stars: params.baseStars,
      lucky_tshirt_worn: params.luckyTshirtWorn,
      coach_name: params.coachName,
      effective_at: params.session.session_date,
    });
    if (!result) return { status: 'DISABLED' };
    if (result.response.status === 404) return { status: 'NOT_LINKED', message: 'This student has not registered their portal account yet.' };
    if (!result.response.ok) return { status: 'PENDING', message: result.data?.message || 'Portal sync will need a retry.' };
    return {
      status: 'SYNCED',
      transactionId: result.data.transaction_id,
      awardedStars: result.data.awarded_stars,
      multiplier: result.data.multiplier,
    };
  } catch (error) {
    console.error('[Portal bridge] award failed:', error);
    return { status: 'PENDING', message: 'Portal is temporarily unavailable; attendance was saved.' };
  }
}

export async function createPortalInvite(student: Student) {
  const result = await signedPost('/integration/attendance/invite', { student_id: student.student_id, student_name: student.full_name });
  if (!result) throw new Error('Portal connection is not configured yet.');
  if (!result.response.ok) {
    const error: Error & { status?: number; code?: string } = new Error(result.data?.message || 'Could not create portal invite.');
    error.status = result.response.status;
    error.code = result.data?.code;
    throw error;
  }
  return result.data as { invite_url: string };
}

/** Resolve first: a linked account must never be sent through registration again. */
export async function getPortalLink(student: Student): Promise<{ status: 'REGISTERED' | 'INVITED'; portal_url?: string; invite_url?: string }> {
  const status = await portalAccountStatuses([student.student_id]);
  if (status[student.student_id] === 'REGISTERED') {
    return { status: 'REGISTERED', portal_url: configuration()?.url ? `${configuration()!.url}/student` : undefined };
  }
  if (status[student.student_id] === 'UNKNOWN') throw new Error('Portal connection is unavailable. No invitation was created.');
  const invite = await createPortalInvite(student);
  return { status: 'INVITED', invite_url: invite.invite_url };
}

/**
 * Mirrors recurring attendance enrolments only. One-off replacement sessions
 * deliberately do not enter this list, so they never grant permanent access.
 */
export async function syncPortalCoachLinksForStudent(studentId: string): Promise<void> {
  const student = db.students.get(studentId);
  if (!student || !configuration()) return;
  const coachNames = Array.from(new Set(
    Array.from(db.memberships.values())
      .filter((membership) => membership.student_id === studentId && membership.status === 'ACTIVE')
      .map((membership) => db.schedules.get(membership.schedule_id))
      .filter((schedule): schedule is NonNullable<typeof schedule> => Boolean(schedule && schedule.status === 'ACTIVE'))
      .map((schedule) => db.coaches.get(schedule.default_coach_id || schedule.coach_id)?.name)
      .filter((name): name is string => Boolean(name))
  ));
  const previous = student.portal_coach_sync_names || [];
  const allNames = Array.from(new Set([...previous, ...coachNames]));
  for (const coachName of allNames) {
    const result = await signedPost('/integration/attendance/coach-assignment', {
      student_id: student.student_id,
      coach_name: coachName,
      assigned: coachNames.includes(coachName),
    });
    if (!result?.response.ok) throw new Error(result?.data?.message || `Could not sync portal coach ${coachName}.`);
  }
  student.portal_coach_sync_names = coachNames;
  db.students.set(student.id, student);
  await syncDocToFirestore('students', student.id, student);
}
