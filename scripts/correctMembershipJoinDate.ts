/**
 * Move one class enrolment's start date earlier, so a coach can mark a lesson the
 * student really attended before they were added in the app.
 *
 * Run on the VPS from /var/www/bingo-attendance/app (PM2's env file has the Firestore credentials):
 * Dry run (reads only):  node --env-file=/etc/bingo-attendance.env --import tsx scripts/correctMembershipJoinDate.ts --student STU-0074 --date 2026-11-01
 * Apply (one enrolment): add  --membership <id> --apply --reason "<why>"
 *
 * Every enrolment path stamps joined_date with the day it was created, and roll call
 * only accepts students whose joined_date is on or before the lesson date.
 */
import crypto from 'node:crypto';
import { deleteApp } from 'firebase-admin/app';
import { adminApp, getFirestoreDb } from '../server/firebaseAdmin.js';
import type { AcademyClass, ClassSchedule, ClassSession, Student, StudentClassMembership } from '../src/types.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REVISION_DOC = { collection: '_system', doc: 'academy' } as const;

type Args = { student: string; date: string; membership?: string; apply: boolean; reason?: string };

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  const args = { student: value('--student') || '', date: value('--date') || '', membership: value('--membership'), apply: argv.includes('--apply'), reason: value('--reason') };
  if (!/^STU-\d{4}$/.test(args.student)) throw new Error('--student must look like STU-0074');
  if (!DATE_PATTERN.test(args.date)) throw new Error('--date must be YYYY-MM-DD');
  if (args.apply && (!args.membership || !args.reason?.trim())) throw new Error('--apply needs --membership <id> and --reason "<why>"');
  return args;
}

async function load<T>(name: string): Promise<Map<string, T>> {
  const snapshot = await getFirestoreDb().collection(name).get();
  return new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as T]));
}

async function main(args: Args): Promise<void> {
  const [students, memberships, schedules, classes, sessions] = await Promise.all([
    load<Student>('students'), load<StudentClassMembership>('memberships'), load<ClassSchedule>('schedules'),
    load<AcademyClass>('classes'), load<ClassSession>('sessions'),
  ]);
  const student = [...students.values()].find((item) => item.student_id === args.student);
  if (!student) throw new Error(`No student ${args.student}`);
  console.log(`student ${student.student_id} "${student.full_name}" id=${student.id} status=${student.status}`);

  const own = [...memberships.values()].filter((m) => m.student_id === student.id);
  for (const m of own) {
    const classId = schedules.get(m.schedule_id)?.class_id || m.schedule_id;
    const lessonOnDate = [...sessions.values()].some((s) => s.session_date === args.date && (s.schedule_id === m.schedule_id || s.class_id === m.schedule_id));
    console.log(JSON.stringify({ membership: m.id, class: classes.get(classId)?.name, status: m.status, joined_date: m.joined_date, ended_date: m.ended_date, lesson_on_date: lessonOnDate }));
  }
  if (!args.apply) { console.log('DRY RUN: nothing changed.'); return; }

  const target = own.find((m) => m.id === args.membership);
  if (!target) throw new Error(`Membership ${args.membership} is not one of ${args.student}'s enrolments`);
  if (target.status !== 'ACTIVE') throw new Error(`Membership is ${target.status}, not ACTIVE; not changed`);
  if (target.joined_date <= args.date) { console.log(`Already joined ${target.joined_date}; nothing to change.`); return; }

  const firestore = getFirestoreDb();
  const ref = firestore.collection('memberships').doc(target.id);
  const now = new Date().toISOString();
  const activityId = `activity-${crypto.randomUUID()}`;
  await firestore.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() as StudentClassMembership | undefined;
    if (!fresh || fresh.joined_date !== target.joined_date || fresh.status !== 'ACTIVE') throw new Error('Membership changed since it was read; run again');
    tx.update(ref, { joined_date: args.date });
    tx.set(firestore.collection('activityLogs').doc(activityId), {
      id: activityId, actor_user_id: 'system-script', actor_user_name: 'Admin script', actor_role: 'SUPER_ADMIN',
      action: 'MEMBERSHIP_JOIN_DATE_CORRECTED', entity_type: 'membership', entity_id: target.id,
      summary: `${student.full_name} (${student.student_id}) start date ${target.joined_date} -> ${args.date}`,
      previous_values: { joined_date: target.joined_date }, new_values: { joined_date: args.date }, notes: args.reason, created_at: now,
    });
  });
  // The running app compares this revision on each request and reloads all collections when it changes.
  await firestore.collection(REVISION_DOC.collection).doc(REVISION_DOC.doc).set({ revision: `${now}:${crypto.randomUUID()}` }, { merge: true });
  console.log(`APPLIED: membership ${target.id} joined_date ${target.joined_date} -> ${args.date}`);
}

try {
  await main(parseArgs(process.argv.slice(2)));
} catch (error: unknown) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (adminApp) await deleteApp(adminApp);
}
