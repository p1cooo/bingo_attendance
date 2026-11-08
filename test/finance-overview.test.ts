import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db.js';
import { financeDetail, financeMonthStatus, financeOverview } from '../server/finance.js';
import type { AcademyClass, AttendanceRecord, ClassSchedule, ClassSession, Student, StudentClassMembership, StudentPayment } from '../src/types.js';

const maps = () => [db.students, db.classes, db.schedules, db.memberships, db.sessions, db.attendance, db.studentFees, db.studentPayments, db.studentAdjustments, db.studentPauses, db.membershipBillingReviews, db.classFees] as const;
function isolated(fn: () => void) {
  const saved = maps().map(m => new Map(m as Map<string, any>));
  try { maps().forEach(m => m.clear()); fn(); }
  finally { maps().forEach((m, i) => { m.clear(); for (const [k, v] of saved[i]) (m as Map<string, any>).set(k, v); }); }
}
const addStudent = (id: string, extra: Partial<Student> = {}) => db.students.set(id, { id, student_id: `STU-${id}`, full_name: `Student ${id}`, status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', ...extra });
const addClass = (id: string) => {
  db.classes.set(id, { id, name: id, class_type: 'GROUP', day_of_week: 6, default_duration_mins: 60, default_capacity: 10, is_active: true, created_at: '' } as AcademyClass);
  db.schedules.set(id, { id, class_id: id, coach_id: 'coach', day_of_week: 6, start_time: '10:00', end_time: '11:00', status: 'ACTIVE', is_active: true, created_at: '' } as ClassSchedule);
};
const join = (id: string, studentId: string, classId: string) =>
  db.memberships.set(id, { id, student_id: studentId, schedule_id: classId, joined_date: '2026-09-01', status: 'ACTIVE' } as StudentClassMembership);
const session = (id: string, classId: string, date: string) =>
  db.sessions.set(id, { id, class_id: classId, schedule_id: classId, session_date: date, start_time: '10:00', end_time: '11:00', scheduled_coach_id: 'coach', actual_coach_id: 'coach', status: 'COMPLETED' } as ClassSession);
const present = (sessionId: string, studentId: string) =>
  db.attendance.set(`${sessionId}-${studentId}`, { id: `${sessionId}-${studentId}`, session_id: sessionId, student_id: studentId, status: 'PRESENT', attendance_type: 'REGULAR', marked_at: '', marked_by_user_id: 'coach' } as AttendanceRecord);
const pay = (id: string, studentId: string, date: string, allocations: { month: string; amount_cents: number }[]) =>
  db.studentPayments.set(id, { id, student_id: studentId, amount_cents: allocations.reduce((n, a) => n + a.amount_cents, 0), payment_date: date, method: 'Cash', source: 'MANUAL', allocations, recorded_by_user_id: 'admin', created_at: `${date}T00:00:00Z` } as StudentPayment);

/** Sets up: paid, partly paid, unpaid, credit, and a class with no roll call yet. */
function scenario() {
  addClass('sat'); addClass('sun');
  session('n1', 'sat', '2026-11-07'); session('n2', 'sun', '2026-11-08');
  for (const id of ['paid', 'part', 'none', 'credit']) { addStudent(id); join(`m-${id}`, id, 'sat'); present('n1', id); }
  addStudent('waiting'); join('m-waiting', 'waiting', 'sun'); // class session exists but no roll call
  pay('p1', 'paid', '2026-11-03', [{ month: '2026-11', amount_cents: 24000 }]);
  pay('p2', 'part', '2026-11-04', [{ month: '2026-11', amount_cents: 10000 }]);
  pay('p3', 'credit', '2026-11-05', [{ month: '2026-11', amount_cents: 24000 }, { month: '2026-12', amount_cents: 24000 }]);
  addStudent('test', { full_name: 'ZZ Test Kid' }); join('m-test', 'test', 'sat'); present('n1', 'test');
}

test('each student gets one plain status for the month', () => isolated(() => {
  scenario();
  const status = (id: string) => financeMonthStatus(financeDetail(id, '2026-11')!, '2026-11');
  assert.equal(status('paid'), 'PAID');
  assert.equal(status('part'), 'PARTLY_PAID');
  assert.equal(status('none'), 'UNPAID');
  assert.equal(status('credit'), 'CREDIT');
  assert.equal(status('waiting'), 'NOT_BILLED_YET');
  assert.equal(status('test'), 'NONE');
}));

test('overview totals: billed, collected by payment date, still to collect', () => isolated(() => {
  scenario();
  const details = [...db.students.keys()].map(id => financeDetail(id, '2026-11')!);
  const o = financeOverview('2026-11', details);
  assert.equal(o.billed_cents, 4 * 24000);
  assert.equal(o.billed_students, 4);
  assert.equal(o.collected_cents, 24000 + 10000 + 48000);
  assert.equal(o.payments_count, 3);
  assert.equal(o.still_to_collect_cents, 14000 + 24000);
  assert.deepEqual(o.status_counts, { PAID: 1, PARTLY_PAID: 1, UNPAID: 1, CREDIT: 1, NEEDS_REVIEW: 0, NOT_BILLED_YET: 1 });
  assert.deepEqual(o.by_class, [{ class_name: 'sat', cents: 38000 }]);
  assert.deepEqual(o.to_do.classes_without_roll_call, ['sun']);
  assert.deepEqual(o.ageing.this_month_only, { students: 2, cents: 38000 });
  assert.equal(o.recent_payments[0].payment_date, '2026-11-05');
}));

test('ageing counts earlier unpaid months', () => isolated(() => {
  addClass('sat'); addStudent('late'); join('m', 'late', 'sat');
  session('n1', 'sat', '2026-11-07'); present('n1', 'late');
  session('d1', 'sat', '2026-12-05'); present('d1', 'late');
  session('j1', 'sat', '2027-01-02'); present('j1', 'late');
  const o = financeOverview('2027-01', [financeDetail('late', '2027-01')!]);
  assert.deepEqual(o.ageing.two_plus, { students: 1, cents: 72000 });
  assert.equal(o.still_to_collect_cents, 24000);
  assert.equal(o.total_outstanding_cents, 72000);
}));
