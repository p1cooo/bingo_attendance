import crypto from 'node:crypto';
import { deleteApp } from 'firebase-admin/app';
import { db } from '../server/db.js';
import { adminApp, getFirestoreDb } from '../server/firebaseAdmin.js';
import { initializeFirestoreSync, markFirestoreStateChanged } from '../server/firestoreSync.js';
import { legacyAbsenceRepair } from '../server/legacyAbsenceCredits.js';
import type { AcademyClass, AttendanceRecord, ClassSession, ReplacementCredit } from '../src/types.js';

const firestore = getFirestoreDb();
const apply = process.argv.includes('--apply');
const suppliedHash = process.argv.find((arg) => arg.startsWith('--plan-hash='))?.slice('--plan-hash='.length);

async function documents<T>(collection: string): Promise<Map<string, T>> {
  const snapshot = await firestore.collection(collection).get();
  return new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as T]));
}

async function main() {
  const [attendance, sessions, classes, credits] = await Promise.all([
    documents<AttendanceRecord>('attendance'), documents<ClassSession>('sessions'),
    documents<AcademyClass>('classes'), documents<ReplacementCredit>('replacementCredits'),
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
  for (const [id, record] of attendance) {
    const cls = classes.get(sessions.get(record.session_id)?.class_id || '');
    if (!cls) continue;
    const decision = legacyAbsenceRepair(record, cls.class_type, byAttendance.get(id) || []);
    if (decision === 'CREATE_CREDIT' || decision === 'STAMP_IMPACT') plan.push(id);
    if (decision === 'CONFLICT') conflicts.push(id);
  }
  plan.sort();
  const hash = crypto.createHash('sha256').update(plan.join('\n')).digest('hex').slice(0, 16);
  console.log(`eligible_repair_count=${plan.length} conflict_count=${conflicts.length} plan_hash=${hash}`);
  console.log(`repair_ids=${plan.join(',')}`);
  if (conflicts.length) throw new Error(`Conflicting credit state: ${conflicts.join(',')}`);
  if (!apply) return;
  if (!suppliedHash || suppliedHash !== hash) throw new Error('Apply requires the exact dry-run plan hash.');

  // Run only while the Attendance process is stopped. Its in-memory state and
  // snapshots must not be overwritten by a concurrent attendance save.
  await initializeFirestoreSync();
  // These two collections are authoritative even if a previous repair was
  // interrupted after its transactions but before publishing new snapshots.
  db.attendance = attendance;
  db.replacementCredits = credits;
  let created = 0;
  let stamped = 0;
  for (const id of plan) {
    const original = attendance.get(id)!;
    const cls = classes.get(sessions.get(original.session_id)!.class_id)!;
    const result = await firestore.runTransaction(async (transaction) => {
      const attendanceRef = firestore.collection('attendance').doc(id);
      const creditRef = firestore.collection('replacementCredits').doc(`${id}:replacement-credit:1`);
      const [attendanceDoc, existingCredits] = await Promise.all([
        transaction.get(attendanceRef),
        transaction.get(firestore.collection('replacementCredits').where('attendance_id', '==', id)),
      ]);
      if (!attendanceDoc.exists) throw new Error(`Attendance disappeared: ${id}`);
      const current = attendanceDoc.data() as AttendanceRecord;
      const creditEntries = existingCredits.docs.map((doc) => doc.data() as ReplacementCredit);
      const decision = legacyAbsenceRepair(current, cls.class_type, creditEntries);
      if (decision === 'CONFLICT') throw new Error(`Credit state changed: ${id}`);
      if (decision === 'NONE') return { attendance: current, credit: undefined, decision };
      const repaired = { ...current, replacement_credit_impact: 1, replacement_credit_revision: 1 };
      let credit: ReplacementCredit | undefined;
      if (decision === 'CREATE_CREDIT') {
        credit = {
          id: creditRef.id, student_id: current.student_id, amount: 1,
          reason: 'GROUP_ABSENCE_CREDIT', attendance_id: id, session_id: current.session_id,
          created_by_user_id: current.marked_by_user_id, created_at: current.marked_at,
          effective_at: current.marked_at, idempotency_key: creditRef.id,
        };
        transaction.create(creditRef, credit);
      }
      transaction.set(attendanceRef, repaired);
      return { attendance: repaired, credit, decision };
    });
    db.attendance.set(id, result.attendance);
    if (result.credit) db.replacementCredits.set(result.credit.id, result.credit);
    if (result.decision === 'CREATE_CREDIT') created++;
    if (result.decision === 'STAMP_IMPACT') stamped++;
  }
  await markFirestoreStateChanged();
  console.log(`created=${created} stamped=${stamped}`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; })
  .finally(async () => { if (adminApp) await deleteApp(adminApp); });
