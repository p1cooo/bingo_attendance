import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db.js';
import { financeDetail } from '../server/finance.js';
import { overlapsPause, pauseMonthCoverage, pauseOnDate, validatePauseDates, canManagePause } from '../server/studentPauses.js';
import { planFinanceTestReset } from '../server/rolloutResetPlan.js';
import { router } from '../server/routes.js';
import { getAccountantReport } from '../server/accountantExport.js';
import type { StudentPause } from '../src/types.js';

const pause = (id: string, membership_id: string, start_date: string, end_date: string | null): StudentPause => ({
  id, student_id: 'student', membership_id, schedule_id: membership_id, class_id: membership_id,
  start_date, end_date, reason: 'EXAMINATION', declared_by_user_id: 'coach', declared_by_name: 'Coach',
  declared_by_role: 'COACH', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  history: [{ action: 'DECLARED', at: '2026-09-01T00:00:00Z', user_id: 'coach' }],
});

test('dated pauses are class specific, inclusive, auto expire, and reject overlapping intervals', () => {
  const fixed = pause('fixed', 'group-membership', '2026-10-01', '2026-10-31');
  const indefinite = pause('open', 'other-membership', '2026-11-01', null);
  assert.equal(pauseOnDate([fixed, indefinite], 'group-membership', '2026-10-01')?.id, 'fixed');
  assert.equal(pauseOnDate([fixed], 'group-membership', '2026-11-01'), undefined);
  assert.equal(pauseOnDate([fixed], 'other-membership', '2026-10-15'), undefined);
  assert.equal(pauseOnDate([indefinite], 'other-membership', '2027-02-01')?.id, 'open');
  assert.equal(overlapsPause([fixed], 'group-membership', '2026-10-31', '2026-11-10'), true);
  assert.equal(overlapsPause([fixed], 'group-membership', '2026-11-01', null), false);
  assert.equal(validatePauseDates('2026-02-30', null), false);
  assert.equal(pauseMonthCoverage([fixed], 'group-membership', '2026-10'), 'FULL');
  assert.equal(pauseMonthCoverage([fixed], 'group-membership', '2026-11'), 'NONE');
  assert.equal(pauseMonthCoverage([pause('partial', 'group-membership', '2026-10-15', null)], 'group-membership', '2026-10'), 'PARTIAL');
});

test('only assigned coaches and admins can manage a class pause', () => {
  const membership = { id: 'm', schedule_id: 'schedule' } as any;
  const schedule = { id: 'schedule', coach_id: 'coach-1' } as any;
  assert.equal(canManagePause({ role: 'COACH', coach_id: 'coach-1' } as any, membership, schedule), true);
  assert.equal(canManagePause({ role: 'COACH', coach_id: 'coach-2' } as any, membership, schedule), false);
  assert.equal(canManagePause({ role: 'ADMIN' } as any, membership, schedule), true);
});

test('pause API hides confidential reasons from unrelated coaches and supplies one Finance notification', () => {
  const previous = [db.memberships, db.schedules, db.studentPauses] as const;
  try {
    db.memberships = new Map([['m-one', { id: 'm-one', student_id: 'student', schedule_id: 's-one' } as any],
      ['m-two', { id: 'm-two', student_id: 'student', schedule_id: 's-two' } as any]]);
    db.schedules = new Map([['s-one', { id: 's-one', coach_id: 'coach-one' } as any], ['s-two', { id: 's-two', coach_id: 'coach-two' } as any]]);
    db.studentPauses = new Map([['p-one', pause('p-one', 'm-one', '2026-10-01', null)], ['p-two', pause('p-two', 'm-two', '2026-10-01', null)]]);
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/student-pauses' && item.route.methods.get);
    const handler = layer.route.stack.at(-1).handle;
    const read = (user: any) => { let body: any; handler({ user, query: { student_id: 'student' } }, { json(value: any) { body = value; return this; } }); return body; };
    assert.deepEqual(read({ role: 'COACH', coach_id: 'coach-one' }).pauses.map((p: StudentPause) => p.id), ['p-one']);
    assert.equal(read({ role: 'COACH', coach_id: 'coach-one' }).finance_notifications.length, 0);
    assert.equal(read({ role: 'ADMIN' }).pauses.length, 2);
    assert.equal(read({ role: 'ADMIN' }).finance_notifications.length, 2);
  } finally { [db.memberships, db.schedules, db.studentPauses] = previous; }
});

test('paused student stays on the occurrence roster but leaves the expected attendance count', () => {
  const previous = [db.students, db.memberships, db.studentPauses, db.sessions, db.schedules, db.classes, db.attendance] as const;
  try {
    db.students = new Map([['student', { id: 'student', student_id: 'STU-1', full_name: 'Alex', status: 'ACTIVE' } as any]]);
    db.memberships = new Map([['m', { id: 'm', student_id: 'student', schedule_id: 'schedule', joined_date: '2026-01-01', status: 'ACTIVE' } as any]]);
    db.studentPauses = new Map([['pause', pause('pause', 'm', '2026-10-01', '2026-10-31')]]);
    db.schedules = new Map([['schedule', { id: 'schedule', class_id: 'class', coach_id: 'coach', is_active: true } as any]]);
    db.classes = new Map([['class', { id: 'class', name: 'Individual', class_type: 'INDIVIDUAL', is_active: true } as any]]);
    db.sessions = new Map([['session', { id: 'session', schedule_id: 'schedule', class_id: 'class', session_date: '2026-10-11', status: 'SCHEDULED', scheduled_coach_id: 'coach', actual_coach_id: 'coach' } as any]]);
    db.attendance = new Map();
    const roster = db.getPopulatedSession('session')!;
    assert.equal(roster.enrolled_students?.length, 1);
    assert.equal(roster.paused_students?.[0].student_id, 'student');
    assert.equal(roster.expected_students_count, 0);
    db.sessions.get('session')!.session_date = '2026-11-01';
    assert.equal(db.getPopulatedSession('session')!.expected_students_count, 1);
  } finally {
    [db.students, db.memberships, db.studentPauses, db.sessions, db.schedules, db.classes, db.attendance] = previous;
  }
});

test('Finance zeroes only a fully paused class and flags partial months until a custom fee is reviewed', () => {
  const previous = [db.students, db.memberships, db.schedules, db.classes, db.sessions, db.attendance, db.studentFees, db.studentPayments, db.studentAdjustments, db.studentPauses] as const;
  const oldBoundary = process.env.ACADEMY_GO_LIVE_DATE;
  try {
    delete process.env.ACADEMY_GO_LIVE_DATE;
    db.students = new Map([['student', { id: 'student', status: 'ACTIVE' } as any]]);
    db.memberships = new Map([['group-membership', { id: 'group-membership', student_id: 'student', schedule_id: 'group', joined_date: '2026-01-01', status: 'ACTIVE' } as any],
      ['individual-membership', { id: 'individual-membership', student_id: 'student', schedule_id: 'individual', joined_date: '2026-01-01', status: 'ACTIVE' } as any]]);
    db.schedules = new Map([['group', { id: 'group', class_id: 'group', coach_id: 'coach' } as any], ['individual', { id: 'individual', class_id: 'individual', coach_id: 'coach' } as any]]);
    db.classes = new Map([['group', { id: 'group', name: 'Group', class_type: 'GROUP' } as any], ['individual', { id: 'individual', name: 'Individual', class_type: 'INDIVIDUAL' } as any]]);
    db.sessions = new Map([['group-session', { id: 'group-session', schedule_id: 'group', class_id: 'group', session_date: '2026-10-10', status: 'SCHEDULED' } as any],
      ['individual-session', { id: 'individual-session', schedule_id: 'individual', class_id: 'individual', session_date: '2026-10-14', status: 'SCHEDULED' } as any],
      ['group-nov', { id: 'group-nov', schedule_id: 'group', class_id: 'group', session_date: '2026-11-10', status: 'SCHEDULED' } as any]]);
    db.attendance = new Map([['mark', { id: 'mark', student_id: 'student', session_id: 'individual-session', status: 'PRESENT' } as any]]);
    db.studentFees = new Map([['group-fee', { id: 'group-fee', student_id: 'student', membership_id: 'group-membership', class_name: 'Group', billing_mode: 'MONTHLY', amount_cents: 20000, effective_month: '2026-10', created_at: '2026-09-01' } as any],
      ['individual-fee', { id: 'individual-fee', student_id: 'student', membership_id: 'individual-membership', class_name: 'Individual', billing_mode: 'PER_SESSION', amount_cents: 5000, effective_month: '2026-10', created_at: '2026-09-01' } as any]]);
    db.studentPayments = new Map(); db.studentAdjustments = new Map();
    const full = pause('full', 'group-membership', '2026-10-01', '2026-10-31');
    db.studentPauses = new Map([[full.id, full]]);
    const month = financeDetail('student', '2026-10')!.months.find(m => m.month === '2026-10')!;
    assert.equal(month.charges_cents, 5000);
    assert.equal(month.lines.find(l => l.membership_id === 'group-membership')?.amount_cents, 0);
    assert.equal(month.lines.find(l => l.membership_id === 'individual-membership')?.amount_cents, 5000);
    const partial = pause('partial', 'group-membership', '2026-10-15', '2026-10-31');
    db.studentPauses = new Map([[partial.id, partial]]);
    const pending = financeDetail('student', '2026-10')!.months[0];
    assert.equal(pending.status, 'Pending Finance Review');
    assert.equal(pending.lines.find(l => l.membership_id === 'group-membership')?.pending_finance_review, true);
    partial.billing_reviews = { '2026-10': { amount_cents: 7500, reviewed_by_user_id: 'admin', reviewed_at: '2026-10-15' } };
    assert.equal(financeDetail('student', '2026-10')!.months[0].charges_cents, 12500);
    process.env.ACADEMY_GO_LIVE_DATE = '2026-11-01';
    assert.equal(financeDetail('student', '2026-10')!.months.length, 0);
    assert.equal(financeDetail('student', '2026-11')!.months.find(m => m.month === '2026-11')?.charges_cents, 20000);
    process.env.ACADEMY_GO_LIVE_DATE = '2026-11-15';
    assert.throws(() => financeDetail('student', '2026-11'), /start a billing month/);
  } finally {
    [db.students, db.memberships, db.schedules, db.classes, db.sessions, db.attendance, db.studentFees, db.studentPayments, db.studentAdjustments, db.studentPauses] = previous;
    if (oldBoundary === undefined) delete process.env.ACADEMY_GO_LIVE_DATE; else process.env.ACADEMY_GO_LIVE_DATE = oldBoundary;
  }
});

test('Finance dry-run inventory preserves fee versions and blocks unknown or post-live transactions', () => {
  assert.throws(() => planFinanceTestReset({ billingBaselineDate: '2026-11-15', fees: [], payments: [], adjustments: [] }), /first day of a month/);
  const input = {
    billingBaselineDate: '2026-10-01', testTransactionCutoffDate: '2026-11-01', fees: [{ id: 'standard-fee' }],
    payments: [{ id: 'old-payment', student_id: 's', amount_cents: 1000, payment_date: '2026-10-01', method: 'Cash', source: 'MANUAL', allocations: [{ month: '2026-10', amount_cents: 1000 }], recorded_by_user_id: 'admin', created_at: '2026-10-01' },
      { id: 'new-payment', student_id: 's', amount_cents: 1000, payment_date: '2026-11-01', allocations: [{ month: '2026-11', amount_cents: 1000 }] }],
    adjustments: [{ id: 'old-adjustment', student_id: 's', month: '2026-10', amount_cents: 500, type: 'WAIVER', reason: 'test', created_by_user_id: 'admin', created_at: '2026-10-01' },
      { id: 'unknown', student_id: 's', month: '2026-10', amount_cents: 500, protected_link: 'x' }],
  };
  const unchanged = JSON.stringify(input);
  const withoutApprovedCutoff = planFinanceTestReset({ ...input, testTransactionCutoffDate: undefined });
  assert.deepEqual(withoutApprovedCutoff.provisional_candidate_ids.studentPayments, []);
  assert.deepEqual(withoutApprovedCutoff.provisional_candidate_ids.studentAdjustments, []);
  assert.equal(withoutApprovedCutoff.blockers.length, 4);
  const result = planFinanceTestReset(input);
  assert.equal(JSON.stringify(input), unchanged);
  assert.deepEqual(result.provisional_candidate_ids.studentPayments, ['old-payment']);
  assert.deepEqual(result.provisional_candidate_ids.studentAdjustments, ['old-adjustment']);
  assert.equal(result.blockers.length, 2);
  assert.equal(result.fee_versions_preserved, 1);
  assert.equal(result.payment_amount_cents, 1000);
  assert.equal(result.adjustment_amount_cents, 500);
});

test('accountant report ignores operational bookings and pre-go-live test attendance', () => {
  const previous = [db.sessions, db.attendance, db.coaches, db.classes, db.students] as const;
  const oldBoundary = process.env.ACADEMY_GO_LIVE_DATE;
  try {
    db.sessions = new Map([['old', { id: 'old', class_id: 'class', session_date: '2026-10-15', start_time: '09:00', end_time: '10:00', actual_coach_id: 'coach' } as any],
      ['new', { id: 'new', class_id: 'class', session_date: '2026-11-15', start_time: '09:00', end_time: '10:00', actual_coach_id: 'coach' } as any]]);
    db.attendance = new Map([['mark', { id: 'mark', session_id: 'old', student_id: 'student', status: 'PRESENT' } as any],
      ['booking', { id: 'booking', session_id: 'new', student_id: 'student', status: 'BOOKED' } as any]]);
    db.coaches = new Map([['coach', { id: 'coach', name: 'Coach' } as any]]);
    db.classes = new Map([['class', { id: 'class', name: 'Class', class_type: 'GROUP' } as any]]);
    db.students = new Map([['student', { id: 'student', full_name: 'Alex' } as any]]);
    process.env.ACADEMY_GO_LIVE_DATE = '2026-11-01';
    assert.deepEqual(getAccountantReport('2026-10'), []);
    assert.deepEqual(getAccountantReport('2026-11'), []);
  } finally {
    [db.sessions, db.attendance, db.coaches, db.classes, db.students] = previous;
    if (oldBoundary === undefined) delete process.env.ACADEMY_GO_LIVE_DATE; else process.env.ACADEMY_GO_LIVE_DATE = oldBoundary;
  }
});
