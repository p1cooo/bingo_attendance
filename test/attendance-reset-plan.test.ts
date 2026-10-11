import assert from 'node:assert/strict';
import test from 'node:test';
import { planAttendanceMarkReset, type ResetDocument } from '../server/attendanceResetPlan.js';

const row = (id: string, extra: Record<string, unknown> = {}): ResetDocument => ({
  id, session_id: 'session-1', student_id: 'student-1', status: 'PRESENT',
  attendance_type: 'REGULAR', marked_at: '2026-10-11T00:00:00Z',
  marked_by_user_id: 'coach-1', ...extra,
});
const session = { id: 'session-1', class_id: 'class-1', status: 'SCHEDULED',
  original_session_date: '2026-10-10', replacement_coach_id: 'coach-2' };
const cls = { id: 'class-1', class_type: 'GROUP', name: 'Chess' };
const input = (attendance: ResetDocument[], extra: Record<string, ResetDocument[]> = {}) => ({
  attendance, sessions: [session], classes: [cls], replacementCredits: [], replacementAdvanceCommitments: [],
  studentFees: [], studentPayments: [], studentAdjustments: [], ...extra,
});

test('Finance-linked attendance is never a reset candidate', () => {
  const plan = planAttendanceMarkReset(input([row('paid')], {
    studentFees: [{ id: 'fee-1', student_id: 'student-1', billing_mode: 'PER_SESSION' }],
  }));
  assert.deepEqual(plan.candidateIds, []);
  assert.ok(plan.blockers[0].reasons.includes('student has Finance history'));
});

test('read-only reset plan selects only isolated regular marks and keeps bookings', () => {
  const fixture = input([row('plain'), row('booked', { status: 'BOOKED', attendance_type: 'REPLACEMENT' })]);
  const before = structuredClone(fixture);
  const plan = planAttendanceMarkReset(fixture);
  assert.deepEqual(plan.candidateIds, ['plain']);
  assert.deepEqual(plan.bookedIds, ['booked']);
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.affectedStudentIds, ['student-1']);
  assert.deepEqual(plan.affectedSessionIds, ['session-1']);
  assert.deepEqual(plan.affectedClassIds, ['class-1']);
  assert.deepEqual(fixture, before);
  assert.deepEqual(planAttendanceMarkReset(input([fixture.attendance[1]])).candidateIds, []);
});

test('reset plan refuses portal awards, credit links, commitments and unknown fields', () => {
  const fixture = input([
    row('portal', { portal_sync_status: 'SYNCED', portal_transaction_id: 'stars-1' }),
    row('credit', { status: 'ABSENT' }),
    row('commitment'),
    row('trial', { trial_request_key: 'request-1' }),
    row('unknown', { finance_reference: 'fee-1' }),
    row('replacement', { attendance_type: 'REPLACEMENT' }),
  ], { replacementCredits: [{ id: 'credit-1', attendance_id: 'credit' }],
    replacementAdvanceCommitments: [{ id: 'advance-1', replacement_attendance_id: 'commitment' }] });
  const plan = planAttendanceMarkReset(fixture);
  assert.deepEqual(plan.candidateIds, []);
  assert.equal(plan.blockers.length, 6);
  assert.ok(plan.blockers.find((item) => item.id === 'portal')?.reasons.includes('Bingo Space award state'));
  assert.ok(plan.blockers.find((item) => item.id === 'credit')?.reasons.includes('replacement credit ledger link'));
  assert.ok(plan.blockers.find((item) => item.id === 'credit')?.reasons.includes('possible group absence credit'));
  assert.ok(plan.blockers.find((item) => item.id === 'commitment')?.reasons.includes('advance replacement commitment link'));
  assert.ok(plan.blockers.find((item) => item.id === 'unknown')?.reasons.includes('unrecognized attendance document fields'));
});

test('reset plan refuses completed or missing occurrences and malformed statuses', () => {
  const plan = planAttendanceMarkReset(input([
    row('complete'), row('missing', { session_id: 'lost' }), row('bad', { status: 'NO_SHOW' }),
  ], { sessions: [{ ...session, status: 'COMPLETED' }] }));
  assert.equal(plan.candidateIds.length, 0);
  assert.equal(plan.blockers.length, 3);
});
