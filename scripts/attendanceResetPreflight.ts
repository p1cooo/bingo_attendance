/** Read-only inventory for a proposed attendance-markings reset. Never writes. */
import { databaseId, getFirestoreDb, projectId } from '../server/firebaseAdmin.js';
import { planAttendanceMarkReset, type ResetDocument } from '../server/attendanceResetPlan.js';
import { planFinanceTestReset } from '../server/rolloutResetPlan.js';

const requestedProject = process.argv.find((arg) => arg.startsWith('--project='))?.slice(10);
const requestedDatabase = process.argv.find((arg) => arg.startsWith('--database='))?.slice(11);
const environment = process.argv.find((arg) => arg.startsWith('--environment='))?.slice(14);
const goLiveDate = process.argv.find((arg) => arg.startsWith('--go-live-date='))?.slice(15);
if (!requestedProject || !requestedDatabase || requestedProject !== projectId || requestedDatabase !== databaseId || !['production', 'emulator'].includes(environment || '')) {
  throw new Error('Specify --project and --database matching FIREBASE_PROJECT_ID and FIREBASE_DATABASE_ID exactly. No data was read or changed.');
}
if (!goLiveDate) throw new Error('Specify --go-live-date=YYYY-MM-DD. No data was read or changed.');
planFinanceTestReset({ payments: [], adjustments: [], fees: [], goLiveDate });
if (environment === 'emulator' !== Boolean(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('Environment does not match FIRESTORE_EMULATOR_HOST. No data was read or changed.');
if (process.env.ACADEMY_GO_LIVE_DATE && process.env.ACADEMY_GO_LIVE_DATE !== goLiveDate) throw new Error('Go-live date differs from ACADEMY_GO_LIVE_DATE. No data was read or changed.');

const firestore = getFirestoreDb();
const names = ['attendance', 'sessions', 'students', 'classes', 'memberships', 'studentPauses', '_student_pause_locks', 'replacementCredits',
  'replacementAdvanceCommitments', 'studentFees', 'studentPayments', 'studentAdjustments',
  'auditLogs', 'activityLogs', 'notificationLogs', 'schedules', 'users', 'coaches',
  '_academy_state', '_system'] as const;
const snapshots = await Promise.all(names.map((name) => firestore.collection(name).get()));
const docs: Record<string, ResetDocument[]> = Object.fromEntries(
  names.map((name, index) => [name, snapshots[index].docs.map((item) => ({ ...item.data(), id: item.id }))]));
const attendance = docs.attendance;
const marked = attendance.filter((row) => row.status !== 'BOOKED');
const plan = planAttendanceMarkReset({ attendance, sessions: docs.sessions, classes: docs.classes,
  replacementCredits: docs.replacementCredits,
  replacementAdvanceCommitments: docs.replacementAdvanceCommitments,
  studentFees: docs.studentFees, studentPayments: docs.studentPayments,
  studentAdjustments: docs.studentAdjustments });
const financePlan = planFinanceTestReset({ payments: docs.studentPayments, adjustments: docs.studentAdjustments, fees: docs.studentFees, goLiveDate });
const sessionIds = new Set(marked.map((row) => row.session_id));
const classIds = new Set(docs.sessions.filter((row) => sessionIds.has(row.id)).map((row) => row.class_id));
const completed = docs.sessions.filter((row) => row.status === 'COMPLETED' && sessionIds.has(row.id));

console.log(JSON.stringify({
  generated_at: new Date().toISOString(), project_id: projectId, database_id: databaseId,
  environment, go_live_date: goLiveDate,
  read_only: true, collection_counts: Object.fromEntries(names.map((name) => [name, docs[name].length])),
  attendance_documents: attendance.length, marked_attendance_documents: marked.length,
  booked_records_preserved: plan.bookedIds.length,
  isolated_mark_candidates: plan.candidateIds.length,
  ambiguous_markings_requiring_review: plan.blockers.length,
  blocker_details: plan.blockers,
  affected_students: new Set(marked.map((row) => row.student_id)).size,
  affected_classes: classIds.size, affected_occurrences: sessionIds.size,
  completed_sessions_requiring_review: completed.length,
  replacement_credit_documents: docs.replacementCredits.length,
  replacement_advance_commitments: docs.replacementAdvanceCommitments.length,
  finance: financePlan,
  note: 'Read-only dry run. Candidate IDs are not an execution allowlist until backup, external award, ledger, operational dependencies, and Finance source classification are verified. No deletion is implemented.',
}, null, 2));
