import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { db } from '../server/db.js';
import { attendanceRecordId, persistAttendanceWithReplacementReconciliation, replacementCreditBalance,
  AttendanceConflictError } from '../server/replacementCredits.js';
import type { AttendanceRecord } from '../src/types.js';

test('isolated Firestore replacement booking is atomic and idempotent under concurrent requests',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
    const app = initializeApp({ projectId: 'bingo-rollout-isolated' }, `replacement-${crypto.randomUUID()}`);
    const firestore = getFirestore(app, 'bingo-rollout-test');
    const previous = { attendance: db.attendance, replacementCredits: db.replacementCredits,
      replacementAdvanceCommitments: db.replacementAdvanceCommitments };
    const prefix = crypto.randomUUID();
    const studentId = `student-${prefix}`;
    const oldId = `old-${prefix}`;
    const sessionId = `session-${prefix}`;
    const id = attendanceRecordId(sessionId, studentId);
    const old: AttendanceRecord = { id: oldId, student_id: studentId, session_id: `prior-${prefix}`,
      status: 'PRESENT', attendance_type: 'REPLACEMENT', marked_at: '2026-09-01T00:00:00.000Z',
      marked_by_user_id: 'coach', replacement_credit_impact: -1, replacement_credit_revision: 1 };
    const booking: AttendanceRecord = { id, student_id: studentId, session_id: sessionId,
      status: 'BOOKED', attendance_type: 'REPLACEMENT', marked_at: '2026-10-18T00:00:00.000Z',
      marked_by_user_id: 'coach' };
    const persist = (record: AttendanceRecord, bookingOnly = false) =>
      persistAttendanceWithReplacementReconciliation({ attendance: record, classType: 'GROUP', bookingOnly },
        firestore, async () => {});
    try {
      db.attendance = new Map([[oldId, old]]);
      db.replacementCredits = new Map();
      db.replacementAdvanceCommitments = new Map();
      await firestore.collection('attendance').doc(oldId).set(old);
      // Existing negative balance is retained while the new booking consumes exactly one more credit.
      const priorCredit = { id: `prior-credit-${prefix}`, student_id: studentId, amount: -2 };
      db.replacementCredits.set(priorCredit.id, priorCredit as any);
      await firestore.collection('replacementCredits').doc(priorCredit.id).set(priorCredit);
      const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => persist(booking, true)));
      const failures = outcomes.filter(result => result.status === 'rejected');
      assert.equal(failures.length, 0, failures.map(result => String(result.reason)).join('; '));
      assert.equal(outcomes.filter(result => result.status === 'fulfilled' && !result.value.idempotent).length, 1);
      assert.equal(outcomes.filter(result => result.status === 'fulfilled' && result.value.idempotent).length, 7);
      const attendance = await firestore.collection('attendance').where('session_id', '==', sessionId)
        .where('student_id', '==', studentId).get();
      assert.equal(attendance.size, 1);
      assert.equal(attendance.docs[0].id, id);
      assert.equal(attendance.docs[0].data().status, 'BOOKED');
      assert.equal(attendance.docs[0].data().base_stars, undefined);
      assert.equal(attendance.docs[0].data().portal_sync_status, undefined);
      assert.deepEqual((await firestore.collection('attendance').doc(oldId).get()).data(), old);
      const debits = await firestore.collection('replacementCredits').where('attendance_id', '==', id).get();
      assert.equal(debits.size, 1);
      assert.equal(debits.docs[0].data().amount, -1);
      assert.equal(replacementCreditBalance(studentId), -3);
      assert.equal((await firestore.collection('replacementCredits').doc(priorCredit.id).get()).data()?.amount, -2);

      // A conflicting legacy row makes booking fail without a second debit or any mutation.
      await assert.rejects(() => persist({ ...booking, id: `different-${prefix}` }, true), AttendanceConflictError);
      assert.equal((await firestore.collection('replacementCredits').where('attendance_id', '==', id).get()).size, 1);
      assert.equal((await firestore.collection('attendance').doc(id).get()).data()?.status, 'BOOKED');

      for (const status of ['PRESENT', 'ABSENT'] as const) {
        const marked = await persist({ ...booking, status, marked_at: `2026-10-18T0${status === 'PRESENT' ? 1 : 2}:00:00.000Z` });
        assert.equal(marked.credit, undefined);
        assert.equal(marked.attendance.status, status);
        assert.equal((await firestore.collection('replacementCredits').where('attendance_id', '==', id).get()).size, 1);
        assert.equal(replacementCreditBalance(studentId), -3);
      }
      assert.deepEqual((await firestore.collection('attendance').doc(oldId).get()).data(), old);

      const zeroStudent = `zero-${prefix}`;
      const zeroSession = `zero-session-${prefix}`;
      const zeroBooking: AttendanceRecord = { ...booking, id: attendanceRecordId(zeroSession, zeroStudent),
        session_id: zeroSession, student_id: zeroStudent };
      assert.equal(replacementCreditBalance(zeroStudent), 0);
      await persist(zeroBooking, true);
      assert.equal(replacementCreditBalance(zeroStudent), -1);
      assert.equal((await firestore.collection('replacementCredits').where('attendance_id', '==', zeroBooking.id).get()).size, 1);
      await persist({ ...zeroBooking, status: 'ABSENT', marked_at: '2026-10-18T03:00:00.000Z' });
      assert.equal(replacementCreditBalance(zeroStudent), -1);
    } finally {
      db.attendance = previous.attendance;
      db.replacementCredits = previous.replacementCredits;
      db.replacementAdvanceCommitments = previous.replacementAdvanceCommitments;
      await deleteApp(app);
    }
  });
