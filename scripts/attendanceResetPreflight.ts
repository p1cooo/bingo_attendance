/** Read-only inventory for a proposed attendance-markings reset. Never writes. */
import { databaseId, getFirestoreDb, projectId } from '../server/firebaseAdmin.js';
import { planAttendanceMarkReset, type ResetDocument } from '../server/attendanceResetPlan.js';

const requestedProject = process.argv.find((arg) => arg.startsWith('--project='))?.slice(10);
const requestedDatabase = process.argv.find((arg) => arg.startsWith('--database='))?.slice(11);
if (!requestedProject || !requestedDatabase || requestedProject !== projectId || requestedDatabase !== databaseId) {
  throw new Error('Specify --project and --database matching FIREBASE_PROJECT_ID and FIREBASE_DATABASE_ID exactly. No data was read or changed.');
}

const firestore = getFirestoreDb();
const names = ['attendance', 'sessions', 'students', 'classes', 'memberships', 'replacementCredits',
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
const sessionIds = new Set(marked.map((row) => row.session_id));
const classIds = new Set(docs.sessions.filter((row) => sessionIds.has(row.id)).map((row) => row.class_id));
const completed = docs.sessions.filter((row) => row.status === 'COMPLETED' && sessionIds.has(row.id));

console.log(JSON.stringify({
  generated_at: new Date().toISOString(), project_id: projectId, database_id: databaseId,
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
  note: 'Counts are inventory only. Candidate IDs are not an execution allowlist until backup, external award, ledger, and operational dependencies are verified. No deletion is implemented.',
}, null, 2));
