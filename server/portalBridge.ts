import crypto from 'node:crypto';
import { AttendanceRecord, ClassSession, Student } from '../src/types.js';

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
  if (!result.response.ok) throw new Error(result.data?.message || 'Could not create portal invite.');
  return result.data as { invite_url: string; expires_at: string };
}
