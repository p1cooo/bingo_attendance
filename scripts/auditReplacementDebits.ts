import { deleteApp } from 'firebase-admin/app';
import { adminApp, getFirestoreDb } from '../server/firebaseAdmin.js';
import type { AttendanceRecord, ReplacementCredit, ReplacementAdvanceCommitment, Student, ClassSession } from '../src/types.js';

async function load<T>(name: string): Promise<Map<string, T>> {
  const snapshot = await getFirestoreDb().collection(name).get();
  return new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as T]));
}

try {
  const [attendance, credits, commitments, students, sessions] = await Promise.all([
    load<AttendanceRecord>('attendance'), load<ReplacementCredit>('replacementCredits'),
    load<ReplacementAdvanceCommitment>('replacementAdvanceCommitments'),
    load<Student>('students'), load<ClassSession>('sessions'),
  ]);
  const ledger = [...credits.values()];
  const present = [...attendance.values()].filter((record) => record.attendance_type === 'REPLACEMENT' && record.status === 'PRESENT');
  console.log(`replacement_present=${present.length} advance_commitments=${commitments.size} ledger_entries=${credits.size}`);
  for (const record of present) {
    const entries = ledger.filter((credit) => credit.attendance_id === record.id);
    const debits = entries.filter((credit) => credit.amount === -1 && credit.student_id === record.student_id);
    if (debits.length === 1 && entries.length === 1) continue;
    const student = students.get(record.student_id);
    const session = sessions.get(record.session_id);
    const related = [...attendance.values()].filter((other) => other.student_id === record.student_id && other.attendance_type === 'REGULAR' && other.status === 'ABSENT').map((other) => ({ id: other.id, date: sessions.get(other.session_id)?.session_date, credits: ledger.filter((credit) => credit.attendance_id === other.id).map((credit) => `${credit.amount}:${credit.reason}`) }));
    const balance = ledger.filter((credit) => credit.student_id === record.student_id).reduce((sum, credit) => sum + credit.amount, 0);
    console.log(JSON.stringify({ student: student?.student_id, name: student?.full_name, replacement: record.id, date: session?.session_date, impact: record.replacement_credit_impact, revision: record.replacement_credit_revision, entries: entries.map((credit) => `${credit.id}:${credit.amount}:${credit.reason}`), balance, absences: related, commitment: [...commitments.values()].filter((commitment) => commitment.replacement_attendance_id === record.id).map((commitment) => ({ id: commitment.id, status: commitment.status, future_session_id: commitment.future_session_id })) }));
  }
} finally {
  if (adminApp) await deleteApp(adminApp);
}
