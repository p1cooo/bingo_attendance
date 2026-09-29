import crypto from 'node:crypto';
import { deleteApp } from 'firebase-admin/app';
import { adminApp, getFirestoreDb } from '../server/firebaseAdmin.js';
import { publishFirestoreRevision } from '../server/firestoreSync.js';
import { legacyReplacementDebitRepair } from '../server/legacyReplacementDebits.js';
import type { AttendanceRecord, ReplacementCredit } from '../src/types.js';

const firestore = getFirestoreDb();
const apply = process.argv.includes('--apply');
const suppliedHash = process.argv.find((arg) => arg.startsWith('--plan-hash='))?.slice('--plan-hash='.length);

async function documents<T>(collection: string): Promise<Map<string, T>> {
  const snapshot = await firestore.collection(collection).get();
  return new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as T]));
}

async function main() {
  const [attendance, credits] = await Promise.all([
    documents<AttendanceRecord>('attendance'), documents<ReplacementCredit>('replacementCredits'),
  ]);
  const byAttendance = new Map<string, ReplacementCredit[]>();
  for (const credit of credits.values()) {
    if (!credit.attendance_id) continue;
    const group = byAttendance.get(credit.attendance_id) || [];
    group.push(credit);
    byAttendance.set(credit.attendance_id, group);
  }
  const plan: string[] = [];
  const conflicts: string[] = [];
  let createCount = 0;
  let stampCount = 0;
  for (const [id, record] of attendance) {
    const decision = legacyReplacementDebitRepair(record, byAttendance.get(id) || []);
    if (decision === 'CREATE_DEBIT' || decision === 'STAMP_IMPACT') {
      plan.push(`${id}:${decision}:${record.student_id}:${record.session_id}`);
      if (decision === 'CREATE_DEBIT') createCount++;
      else stampCount++;
    }
    if (decision === 'CONFLICT') conflicts.push(id);
  }
  plan.sort();
  conflicts.sort();
  const hash = crypto.createHash('sha256').update(plan.join('\n')).digest('hex').slice(0, 16);
  console.log(`missing_debit_count=${createCount} stamp_count=${stampCount} conflict_count=${conflicts.length} plan_hash=${hash}`);
  console.log(`repair_ids=${plan.map((line) => line.split(':')[0]).join(',')}`);
  if (conflicts.length) throw new Error(`Conflicting debit state: ${conflicts.join(',')}`);
  if (!apply) return;
  if (!suppliedHash || suppliedHash !== hash) throw new Error('Apply requires the exact dry-run plan hash.');

  let created = 0;
  let stamped = 0;
  for (const line of plan) {
    const [id, plannedDecision, plannedStudentId, plannedSessionId] = line.split(':');
    const result = await firestore.runTransaction(async (transaction) => {
      const attendanceRef = firestore.collection('attendance').doc(id);
      const creditRef = firestore.collection('replacementCredits').doc(`${id}:replacement-credit:1`);
      const [attendanceDoc, existingCredits, keyDoc] = await Promise.all([
        transaction.get(attendanceRef),
        transaction.get(firestore.collection('replacementCredits').where('attendance_id', '==', id)),
        transaction.get(creditRef),
      ]);
      if (!attendanceDoc.exists) throw new Error(`Attendance disappeared: ${id}`);
      const current = attendanceDoc.data() as AttendanceRecord;
      const decision = legacyReplacementDebitRepair(current, existingCredits.docs.map((doc) => doc.data() as ReplacementCredit));
      if (current.student_id !== plannedStudentId || current.session_id !== plannedSessionId ||
          (decision !== plannedDecision && decision !== 'NONE') ||
          decision === 'CONFLICT' || (decision === 'CREATE_DEBIT' && keyDoc.exists)) throw new Error(`Credit state changed: ${id}`);
      if (decision === 'NONE') return decision;
      if (decision === 'CREATE_DEBIT') {
        const credit: ReplacementCredit = {
          id: creditRef.id, student_id: current.student_id, amount: -1,
          reason: 'REPLACEMENT_ATTENDED_DEBIT', attendance_id: id, session_id: current.session_id,
          created_by_user_id: current.marked_by_user_id, created_at: current.marked_at,
          effective_at: current.marked_at, idempotency_key: creditRef.id,
        };
        transaction.create(creditRef, credit);
      }
      transaction.set(attendanceRef, { ...current, replacement_credit_impact: -1, replacement_credit_revision: 1 });
      return decision;
    }, { maxAttempts: 1 });
    if (result === 'CREATE_DEBIT') created++;
    if (result === 'STAMP_IMPACT') stamped++;
  }
  if (created || stamped) await publishFirestoreRevision();
  console.log(`created=${created} stamped=${stamped}`);
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message.includes('RESOURCE_EXHAUSTED') ? 'Firestore write quota exhausted; no further repairs attempted.' : message);
    process.exitCode = 1;
  })
  .finally(async () => { if (adminApp) await deleteApp(adminApp); });
