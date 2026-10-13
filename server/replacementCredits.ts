import { getFirestoreDb } from './firebaseAdmin.js';
import { db } from './db.js';
import { AttendanceRecord, ClassType, ReplacementAdvanceCommitment, ReplacementCredit, ReplacementCreditReason } from '../src/types.js';
import { markFirestoreStateChanged, publishFirestoreRevision } from './firestoreSync.js';
import { attendanceTiming } from './attendanceTiming.js';
import type { Firestore } from 'firebase-admin/firestore';
import crypto from 'node:crypto';

export function replacementCreditBalance(studentId: string): number {
  return [...db.replacementCredits.values()].filter(x => x.student_id === studentId).reduce((sum, x) => sum + x.amount, 0);
}

export async function createReplacementCredit(entry: ReplacementCredit): Promise<ReplacementCredit> {
  const firestore = getFirestoreDb();
  const ref = firestore.collection('replacementCredits').doc(entry.idempotency_key);
  const result = await firestore.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (existing.exists) return existing.data() as ReplacementCredit;
    const durable = { ...entry, id: entry.idempotency_key };
    transaction.create(ref, durable);
    return durable;
  });
  db.replacementCredits.set(result.id, result);
  await markFirestoreStateChanged();
  return result;
}

/**
 * Replacement credits are derived from attendance, never maintained as a
 * mutable balance.  LATE and EXCUSED deliberately remain neutral.
 */
export function replacementCreditImpact(record: Pick<AttendanceRecord, 'status' | 'attendance_type'>, classType: ClassType): number {
  if (record.attendance_type === 'REGULAR' && classType === 'GROUP' && record.status === 'ABSENT') return 1;
  if (record.attendance_type === 'REPLACEMENT' && record.status === 'PRESENT') return -1;
  return 0;
}

export function replacementCreditChange(previous: AttendanceRecord | undefined, next: AttendanceRecord, classType: ClassType) {
  const priorImpact = previous?.replacement_credit_impact ?? 0;
  const nextImpact = replacementCreditImpact(next, classType);
  const changed = priorImpact !== nextImpact;
  const revision = changed ? (previous?.replacement_credit_revision ?? 0) + 1 : previous?.replacement_credit_revision;
  return { nextImpact, changed, revision, delta: nextImpact - priorImpact };
}

function withoutUndefined<T>(value: T): T {
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined)) as T;
}

function ledgerReason(nextImpact: number): ReplacementCreditReason {
  if (nextImpact === 1) return 'GROUP_ABSENCE_CREDIT';
  if (nextImpact === -1) return 'REPLACEMENT_ATTENDED_DEBIT';
  return 'REVERSAL';
}

export interface AttendanceReconciliationInput {
  attendance: AttendanceRecord;
  classType: ClassType;
  expectedMarkedAt?: string | null;
  pauseMembershipIds?: string[];
  sessionDate?: string;
  /** Required only when this replacement attendance is an approved advance use. */
  advanceCommitment?: ReplacementAdvanceCommitment;
}

export interface AttendanceReconciliationResult {
  attendance: AttendanceRecord;
  credit?: ReplacementCredit;
  commitments: ReplacementAdvanceCommitment[];
}

export class ReplacementCreditError extends Error {}
export class PauseAttendanceError extends Error {}
export class AttendanceConflictError extends Error {}

/** Stable across requests and server instances, including a retry after timeout. */
export function attendanceRecordId(sessionId: string, studentId: string): string {
  return `att-${crypto.createHash('sha256').update(`${sessionId}\0${studentId}`).digest('hex')}`;
}

/**
 * Atomically persists an attendance mutation and its ledger delta.  The
 * stored impact is intentionally introduced only from this feature onward:
 * historic records do not get a synthetic backfill or reversal.
 */
export async function persistAttendanceWithReplacementReconciliation(
  input: AttendanceReconciliationInput,
  firestore: Firestore = getFirestoreDb(),
  publishRevision: () => Promise<void> = publishFirestoreRevision,
): Promise<AttendanceReconciliationResult> {
  const attendanceRef = firestore.collection('attendance').doc(input.attendance.id);
  const transactionStartedAt = performance.now();
  const result = await firestore.runTransaction(async (transaction) => {
    const matchingQuery = firestore.collection('attendance').where('session_id', '==', input.attendance.session_id)
      .where('student_id', '==', input.attendance.student_id);
    const [snapshot, matches] = await Promise.all([transaction.get(attendanceRef), transaction.get(matchingQuery)]);
    if (matches.docs.some(document => document.id !== input.attendance.id)) {
      throw new AttendanceConflictError('Attendance already exists for this student and occurrence. Reload before saving.');
    }
    const previous = snapshot.exists ? snapshot.data() as AttendanceRecord : undefined;
    if (input.expectedMarkedAt !== undefined && (previous?.marked_at ?? null) !== input.expectedMarkedAt) {
      throw new AttendanceConflictError('Attendance changed since this occurrence was loaded. Reload before saving.');
    }
    if (previous?.portal_sync_status === 'SYNCED' &&
        (!['PRESENT', 'LATE'].includes(input.attendance.status) ||
          input.attendance.base_stars !== previous.base_stars ||
          Boolean(input.attendance.lucky_tshirt_worn) !== Boolean(previous.lucky_tshirt_worn))) {
      throw new AttendanceConflictError('This attendance already awarded stars. Reload before making a correction.');
    }
    const { nextImpact, changed, revision, delta } = replacementCreditChange(previous, input.attendance, input.classType);
    const attendance = withoutUndefined({
      ...previous,
      ...input.attendance,
      ...(previous ? {
        portal_sync_status: previous.portal_sync_status,
        portal_transaction_id: previous.portal_transaction_id,
        portal_awarded_stars: previous.portal_awarded_stars,
        portal_multiplier: previous.portal_multiplier,
        portal_sync_message: previous.portal_sync_message,
      } : {}),
      replacement_credit_impact: nextImpact,
      ...(revision === undefined ? {} : { replacement_credit_revision: revision }),
    });

    let credit: ReplacementCredit | undefined;
    const commitmentsQuery = firestore.collection('replacementAdvanceCommitments').where('future_session_id', '==', attendance.session_id);
    const creditRef = changed
      ? firestore.collection('replacementCredits').doc(`${attendance.id}:replacement-credit:${revision}`)
      : undefined;
    // All reads happen before any transaction writes, as required by Firestore.
    const [creditSnapshot, futureCommitmentsSnapshot, pauseLocks] = await Promise.all([
      creditRef ? transaction.get(creditRef) : Promise.resolve(undefined),
      transaction.get(commitmentsQuery),
      Promise.all((input.pauseMembershipIds || []).map(id => transaction.get(firestore.collection('_student_pause_locks').doc(id)))),
    ]);
    if (input.sessionDate && pauseLocks.some(lock => ((lock.data()?.intervals || []) as Array<{ start_date: string; end_date: string | null }>).some(
      pause => pause.start_date <= input.sessionDate! && (!pause.end_date || input.sessionDate! <= pause.end_date)))) {
      throw new PauseAttendanceError('Attendance is not required while this student is on pause for this class.');
    }

    if (changed) {
      const idempotencyKey = creditRef!.id;
      if (creditSnapshot?.exists) {
        credit = creditSnapshot.data() as ReplacementCredit;
      } else {
        credit = {
          id: idempotencyKey,
          student_id: attendance.student_id,
          amount: delta,
          reason: input.advanceCommitment ? 'ADVANCE_REPLACEMENT_DEBIT' : ledgerReason(nextImpact),
          attendance_id: attendance.id,
          session_id: attendance.session_id,
          created_by_user_id: attendance.marked_by_user_id,
          created_at: attendance.marked_at,
          effective_at: attendance.marked_at,
          idempotency_key: idempotencyKey,
        };
        transaction.create(creditRef!, credit);
      }
    }
    const commitments: ReplacementAdvanceCommitment[] = [];
    if (input.advanceCommitment) {
      const duplicate = futureCommitmentsSnapshot.docs
        .map((document) => document.data() as ReplacementAdvanceCommitment)
        .find((commitment) => commitment.status === 'PENDING' || commitment.status === 'REVIEW_REQUIRED');
      if (duplicate) throw new ReplacementCreditError('That future class is already linked to an unresolved advance replacement.');
      transaction.create(
        firestore.collection('replacementAdvanceCommitments').doc(input.advanceCommitment.id),
        input.advanceCommitment,
      );
      commitments.push(input.advanceCommitment);
    }
    // A linked future normal class is resolved only by its actual outcome.
    for (const document of futureCommitmentsSnapshot.docs) {
      if (input.classType !== 'GROUP' || attendance.attendance_type !== 'REGULAR') continue;
      const commitment = document.data() as ReplacementAdvanceCommitment;
      const nextStatus = attendance.status === 'ABSENT' ? 'RECONCILED'
        : attendance.status === 'PRESENT' ? 'REVIEW_REQUIRED'
        : commitment.status;
      if (nextStatus !== commitment.status) {
        const updated = { ...commitment, status: nextStatus, updated_at: attendance.marked_at } as ReplacementAdvanceCommitment;
        transaction.set(document.ref, updated);
        commitments.push(updated);
      }
    }
    transaction.set(attendanceRef, attendance);
    return { attendance, credit, commitments };
  });
  attendanceTiming('transaction', transactionStartedAt);

  db.attendance.set(result.attendance.id, result.attendance);
  if (result.credit) db.replacementCredits.set(result.credit.id, result.credit);
  result.commitments.forEach((commitment) => db.replacementAdvanceCommitments.set(commitment.id, commitment));
  // Canonical attendance and credit documents are committed above. Invalidate
  // cached snapshots and await the small revision write before reporting success.
  const publishStartedAt = performance.now();
  await publishRevision();
  attendanceTiming('transaction_publish', publishStartedAt);
  return result;
}
