import type { User } from '../src/types.js';
import { db } from './db.js';
import { getFirestoreDb } from './firebaseAdmin.js';

/** Every Attendance record that belongs to one student. */
export function studentRecords(studentId: string) {
  const own = <T extends { student_id: string }>(values: Iterable<T>) => [...values].filter(v => v.student_id === studentId);
  return {
    memberships: own(db.memberships.values()),
    attendance: own(db.attendance.values()),
    credits: own(db.replacementCredits.values()),
    commitments: own(db.replacementAdvanceCommitments.values()),
    pauses: own(db.studentPauses.values()),
    finance: own(db.studentFees.values()).length + own(db.studentPayments.values()).length +
      own(db.studentAdjustments.values()).length + own(db.membershipBillingReviews.values()).length,
  };
}

export type PortalStatus = 'REGISTERED' | 'NOT_REGISTERED' | 'UNKNOWN';

/**
 * Admin delete removes the student's whole Attendance history. Finance
 * records still block it: billing history must be kept (mark Inactive).
 */
export function adminDeleteBlockers(studentId: string): string[] {
  return studentRecords(studentId).finance ? ['This student has Finance records. Mark the student Inactive to keep billing history.'] : [];
}

/**
 * A coach may only undo a student they created by mistake, before anything
 * has happened: no roll call, credits, pauses, Finance, Bingo Space account,
 * or enrolment in a class they do not manage.
 */
export function coachUndoBlockers(input: {
  user: User; studentId: string; createdByUserId: string | null; portal: PortalStatus;
  canManageSchedule: (scheduleId: string) => boolean;
}): string[] {
  const records = studentRecords(input.studentId);
  const reasons: string[] = [];
  if (input.createdByUserId !== input.user.id) reasons.push('Only the coach who created this student can delete it.');
  if (records.attendance.length) reasons.push('Attendance has already been recorded.');
  if (records.credits.length || records.commitments.length) reasons.push('Replacement credits exist.');
  if (records.pauses.length) reasons.push('A pause has been recorded.');
  if (records.finance) reasons.push('Finance records exist.');
  if (input.portal === 'REGISTERED') reasons.push('This student has a Bingo Space account.');
  if (input.portal === 'UNKNOWN') reasons.push('Bingo Space could not be checked right now.');
  if (records.memberships.some(m => !input.canManageSchedule(m.schedule_id))) reasons.push('This student is also in another coach\'s class.');
  return reasons;
}

/** Who created a student, from the activity log (kept since 28 Sep 2026). */
export async function findStudentCreator(studentId: string): Promise<string | null> {
  const isCreation = (entry: { action?: string; entity_id?: string }) =>
    entry.entity_id === studentId && (entry.action === 'STUDENT_CREATED' || entry.action === 'TRIAL_STUDENT_CREATED');
  const cached = db.activityLogs.find(isCreation);
  if (cached) return cached.actor_user_id;
  // The in-memory log holds only recent entries; the durable log is authoritative.
  const snapshot = await getFirestoreDb().collection('activityLogs').where('entity_id', '==', studentId).get();
  const entry = snapshot.docs.map(d => d.data() as { action?: string; entity_id?: string; actor_user_id?: string }).find(isCreation);
  return entry?.actor_user_id || null;
}

/**
 * Deletes the student and all their Attendance records durably, then from
 * memory. The STU code reservation is kept (created if missing) so the code
 * can never be issued to another child.
 */
export async function deleteStudentEverywhere(studentId: string) {
  const student = db.students.get(studentId)!;
  const records = studentRecords(studentId);
  const firestore = getFirestoreDb();
  const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [
    batch => batch.delete(firestore.collection('students').doc(studentId)),
    batch => batch.set(firestore.collection('_student_code_reservations').doc(student.student_id), { student_id: student.student_id, retired_at: new Date().toISOString() }, { merge: true }),
    ...records.memberships.map(m => (batch: FirebaseFirestore.WriteBatch) => batch.delete(firestore.collection('memberships').doc(m.id))),
    ...records.attendance.map(a => (batch: FirebaseFirestore.WriteBatch) => batch.delete(firestore.collection('attendance').doc(a.id))),
    ...records.credits.map(c => (batch: FirebaseFirestore.WriteBatch) => batch.delete(firestore.collection('replacementCredits').doc(c.id))),
    ...records.commitments.map(c => (batch: FirebaseFirestore.WriteBatch) => batch.delete(firestore.collection('replacementAdvanceCommitments').doc(c.id))),
    ...records.pauses.map(p => (batch: FirebaseFirestore.WriteBatch) => batch.delete(firestore.collection('studentPauses').doc(p.id))),
  ];
  // Firestore batches hold at most 500 writes; the student document goes in the last batch.
  const [first, ...rest] = writes;
  const ordered = [...rest, first];
  for (let i = 0; i < ordered.length; i += 450) {
    const batch = firestore.batch();
    ordered.slice(i, i + 450).forEach(write => write(batch));
    await batch.commit();
  }
  records.memberships.forEach(m => db.memberships.delete(m.id));
  records.attendance.forEach(a => db.attendance.delete(a.id));
  records.credits.forEach(c => db.replacementCredits.delete(c.id));
  records.commitments.forEach(c => db.replacementAdvanceCommitments.delete(c.id));
  records.pauses.forEach(p => db.studentPauses.delete(p.id));
  db.students.delete(studentId);
  return { memberships: records.memberships.length, attendance: records.attendance.length, credits: records.credits.length, pauses: records.pauses.length };
}
