import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db.js';
import { financeDetail, isNonBillableStudent, chargesPerLesson, DEFAULT_FEES, FINANCE_START_MONTH } from '../server/finance.js';
import { replacementCreditImpact } from '../server/replacementCredits.js';
import type { AcademyClass, AttendanceRecord, AttendanceStatus, AttendanceType, ClassSchedule, ClassSession, Student, StudentClassMembership, StudentFee, StudentPayment } from '../src/types.js';

const maps = () => [db.students, db.classes, db.schedules, db.memberships, db.sessions, db.attendance, db.studentFees, db.studentPayments, db.studentAdjustments, db.studentPauses, db.membershipBillingReviews] as const;
function isolated(fn: () => void) {
  const saved = maps().map(m => new Map(m as Map<string, any>));
  try { maps().forEach(m => m.clear()); fn(); }
  finally { maps().forEach((m, i) => { m.clear(); for (const [k, v] of saved[i]) (m as Map<string, any>).set(k, v); }); }
}
const addStudent = (id: string, extra: Partial<Student> = {}) => db.students.set(id, { id, student_id: `STU-${id}`, full_name: `Student ${id}`, status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z', ...extra });
const addClass = (id: string, type: 'GROUP' | 'INDIVIDUAL', day = 6) => {
  db.classes.set(id, { id, name: id, class_type: type, day_of_week: day, default_duration_mins: 60, default_capacity: 10, is_active: true, created_at: '' } as AcademyClass);
  db.schedules.set(id, { id, class_id: id, coach_id: 'coach', day_of_week: day, start_time: '10:00', end_time: '11:00', status: 'ACTIVE', is_active: true, created_at: '' } as ClassSchedule);
};
const join = (id: string, studentId: string, classId: string, joined = '2026-09-01', ended?: string) =>
  db.memberships.set(id, { id, student_id: studentId, schedule_id: classId, joined_date: joined, ended_date: ended, status: ended ? 'ENDED' : 'ACTIVE' } as StudentClassMembership);
const session = (id: string, classId: string, date: string, status: ClassSession['status'] = 'COMPLETED') =>
  db.sessions.set(id, { id, class_id: classId, schedule_id: classId, session_date: date, start_time: '10:00', end_time: '11:00', scheduled_coach_id: 'coach', actual_coach_id: 'coach', status } as ClassSession);
const mark = (sessionId: string, studentId: string, status: AttendanceStatus, type: AttendanceType = 'REGULAR') =>
  db.attendance.set(`${sessionId}-${studentId}`, { id: `${sessionId}-${studentId}`, session_id: sessionId, student_id: studentId, status, attendance_type: type, marked_at: '', marked_by_user_id: 'coach' } as AttendanceRecord);
const novSaturdays = ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'];
const nov = (studentId: string) => financeDetail(studentId, '2026-11')!.months.find(m => m.month === '2026-11');

test('Finance starts in November 2026 with automatic default fees', () => {
  assert.equal(FINANCE_START_MONTH, '2026-11');
  assert.deepEqual(DEFAULT_FEES.GROUP, { billing_mode: 'MONTHLY', amount_cents: 24000 });
  assert.deepEqual(DEFAULT_FEES.INDIVIDUAL, { billing_mode: 'PER_SESSION', amount_cents: 8000 });
});

test('group absence creates one replacement credit and keeps RM240 billing', () => {
  assert.equal(replacementCreditImpact({ status: 'ABSENT', attendance_type: 'REGULAR' }, 'GROUP'), 1);
  assert.equal(replacementCreditImpact({ status: 'PRESENT', attendance_type: 'REGULAR' }, 'GROUP'), 0);
  assert.equal(replacementCreditImpact({ status: 'ABSENT', attendance_type: 'REGULAR' }, 'INDIVIDUAL'), 0);
  isolated(() => {
    addStudent('g'); addClass('group', 'GROUP'); join('mg', 'g', 'group');
    novSaturdays.forEach((d, i) => { session(`s${i}`, 'group', d); mark(`s${i}`, 'g', 'ABSENT'); });
    const month = nov('g')!;
    assert.equal(month.charges_cents, 24000);
    assert.equal(month.lines[0].fee_source, 'DEFAULT');
  });
});

test('individual Present and Late each charge RM80; Absent, Excused and Booked do not', () => {
  assert.equal(chargesPerLesson({ status: 'PRESENT', attendance_type: 'REGULAR' }), true);
  assert.equal(chargesPerLesson({ status: 'LATE', attendance_type: 'REGULAR' }), true);
  for (const status of ['ABSENT', 'EXCUSED', 'BOOKED'] as const) assert.equal(chargesPerLesson({ status, attendance_type: 'REGULAR' }), false);
  isolated(() => {
    addStudent('i'); addClass('ind', 'INDIVIDUAL', 1); join('mi', 'i', 'ind');
    const dates = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
    const statuses: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'BOOKED'];
    dates.forEach((d, i) => { session(`i${i}`, 'ind', d); mark(`i${i}`, 'i', statuses[i]); });
    session('cancelled', 'ind', '2026-11-03', 'CANCELLED'); mark('cancelled', 'i', 'PRESENT');
    session('offday', 'ind', '2026-11-04', 'PLANNED_OFF_DAY'); mark('offday', 'i', 'PRESENT');
    const line = nov('i')!.lines[0];
    assert.equal(line.amount_cents, 16000);
    assert.deepEqual(line.dates, ['2026-11-02', '2026-11-09']);
  });
});

test('individual Absent alone does not charge', () => {
  isolated(() => {
    addStudent('a'); addClass('ind', 'INDIVIDUAL', 1); join('ma', 'a', 'ind');
    session('x', 'ind', '2026-11-02'); mark('x', 'a', 'ABSENT');
    assert.equal(financeDetail('a', '2026-11')!.months.find(m => m.month === '2026-11')?.charges_cents ?? 0, 0);
    assert.equal(financeDetail('a', '2026-11')!.outstanding_cents, 0);
  });
});

test('replacement attendance does not create another RM80 charge', () => {
  isolated(() => {
    addStudent('r'); addClass('ind', 'INDIVIDUAL', 1); addClass('other', 'INDIVIDUAL', 3); join('mr', 'r', 'ind');
    session('reg', 'ind', '2026-11-02'); mark('reg', 'r', 'PRESENT');
    session('rep-own', 'ind', '2026-11-09'); mark('rep-own', 'r', 'PRESENT', 'REPLACEMENT');
    session('rep-other', 'other', '2026-11-11'); mark('rep-other', 'r', 'PRESENT', 'REPLACEMENT');
    assert.equal(nov('r')!.charges_cents, 8000);
  });
});

test('test accounts Testing, Testing 123 and STU-9999 are always non-billable', () => {
  assert.equal(isNonBillableStudent({ full_name: 'Testing', student_id: 'STU-0500' }), true);
  assert.equal(isNonBillableStudent({ full_name: '  testing   123 ', student_id: 'STU-0501' }), true);
  assert.equal(isNonBillableStudent({ full_name: 'Real Child', student_id: 'stu-9999' }), true);
  assert.equal(isNonBillableStudent({ full_name: 'Testing Tan', student_id: 'STU-0502' }), false);
  isolated(() => {
    addClass('group', 'GROUP'); addClass('ind', 'INDIVIDUAL', 1); session('i1', 'ind', '2026-11-02');
    for (const [id, extra] of [['t1', { full_name: 'Testing' }], ['t2', { full_name: 'Testing 123' }], ['t3', { student_id: 'STU-9999' }]] as const) {
      addStudent(id, extra); join(`${id}-g`, id, 'group'); join(`${id}-i`, id, 'ind'); mark('i1', id, 'PRESENT');
      db.studentFees.set(`${id}-fee`, { id: `${id}-fee`, student_id: id, membership_id: `${id}-g`, class_id: 'group', class_name: 'group', coach_name: 'c', billing_mode: 'MONTHLY', amount_cents: 30000, effective_month: '2026-11', created_by_user_id: 'admin', created_at: '2026-11-01T00:00:00Z' });
      const detail = financeDetail(id, '2026-11')!;
      assert.equal(detail.non_billable, true);
      assert.equal(detail.outstanding_cents, 0);
      assert.equal(detail.current_charges_cents, 0);
      assert.equal(detail.months.reduce((n, m) => n + m.charges_cents, 0), 0);
    }
  });
});

test('extra test students and test classes never charge', () => {
  for (const s of [{ full_name: 'Faith Fu', student_id: 'STU-9998' }, { full_name: 'Pico', student_id: 'STU-9997' }, { full_name: 'ZZ TEST - CONCURRENT A 20260921', student_id: 'STU-0007' }])
    assert.equal(isNonBillableStudent(s), true);
  isolated(() => {
    addStudent('real');
    for (const [id, name] of [['t1', 'Testing'], ['t2', 'Testing Group'], ['t3', 'Testing V2'], ['t4', 'Testing 123']]) {
      addClass(id, 'GROUP'); db.classes.set(id, { ...db.classes.get(id)!, name }); join(`m-${id}`, 'real', id);
    }
    addClass('ind', 'INDIVIDUAL', 1); db.classes.set('ind', { ...db.classes.get('ind')!, name: 'testing' }); join('m-ind', 'real', 'ind');
    session('x', 'ind', '2026-11-02'); mark('x', 'real', 'PRESENT');
    assert.equal(financeDetail('real', '2026-11')!.outstanding_cents, 0);
    addClass('realgroup', 'GROUP'); join('m-real', 'real', 'realgroup'); session('rg', 'realgroup', '2026-11-07'); mark('rg', 'real', 'PRESENT');
    assert.equal(financeDetail('real', '2026-11')!.outstanding_cents, 24000); // the real class still bills
    assert.equal(financeDetail('real', '2026-11')!.non_billable, false);
  });
});

test('admin override replaces the default; October fees and payments are not carried forward', () => {
  isolated(() => {
    addStudent('o'); addClass('group', 'GROUP'); join('mo', 'o', 'group'); session('og', 'group', '2026-11-07'); mark('og', 'o', 'PRESENT');
    const fee = (id: string, month: string, amount: number): StudentFee => ({ id, student_id: 'o', membership_id: 'mo', class_id: 'group', class_name: 'group', coach_name: 'c', billing_mode: 'MONTHLY', amount_cents: amount, effective_month: month, created_by_user_id: 'admin', created_at: `${month}-01T00:00:00Z` });
    db.studentFees.set('oct', fee('oct', '2026-10', 50000));
    const payment: StudentPayment = { id: 'p-oct', student_id: 'o', payment_date: '2026-10-05', amount_cents: 24000, allocations: [{ month: '2026-10', amount_cents: 24000 }], method: 'Cash', source: 'MANUAL', recorded_by_user_id: 'admin', created_at: '2026-10-05T00:00:00Z' };
    db.studentPayments.set(payment.id, payment);
    let detail = financeDetail('o', '2026-11')!;
    assert.equal(detail.months.some(m => m.month < '2026-11'), false);
    assert.equal(detail.months.find(m => m.month === '2026-11')!.charges_cents, 24000); // default, not the October RM500
    assert.equal(detail.outstanding_cents, 24000); // the October payment does not reduce November
    db.studentFees.set('dec', fee('dec', '2026-12', 0));
    detail = financeDetail('o', '2026-12')!;
    assert.equal(detail.months.find(m => m.month === '2026-12')?.charges_cents ?? 0, 0); // RM0 override (scholarship)
  });
});

test('a group class charges RM240 only from the first roll-call mark of the month', () => {
  isolated(() => {
    addStudent('n'); addClass('group', 'GROUP'); join('mn', 'n', 'group');
    novSaturdays.forEach((d, i) => session(`s${i}`, 'group', d));
    let detail = financeDetail('n', '2026-11')!;
    assert.equal(detail.outstanding_cents, 0); // enrolled, no roll call yet
    assert.equal(detail.pending_finance_review, false);
    for (const status of ['EXCUSED', 'BOOKED'] as const) { mark('s0', 'n', status); assert.equal(financeDetail('n', '2026-11')!.outstanding_cents, 0); }
    mark('s0', 'n', 'PRESENT', 'REPLACEMENT'); // a replacement booking does not start the fee
    assert.equal(financeDetail('n', '2026-11')!.outstanding_cents, 0);
    mark('s1', 'n', 'ABSENT');
    detail = financeDetail('n', '2026-11')!;
    assert.equal(detail.outstanding_cents, 24000); // Absent starts it; still one RM240 for the month
    mark('s2', 'n', 'PRESENT'); mark('s3', 'n', 'LATE');
    assert.equal(financeDetail('n', '2026-11')!.outstanding_cents, 24000);
    // December has no roll call yet: not charged.
    session('d1', 'group', '2026-12-05');
    assert.equal(financeDetail('n', '2026-12')!.months.find(m => m.month === '2026-12')?.charges_cents ?? 0, 0);
  });
});

test('two group classes are each charged RM240', () => {
  isolated(() => {
    addStudent('two'); addClass('g1', 'GROUP', 6); addClass('g2', 'GROUP', 0); join('m1', 'two', 'g1'); join('m2', 'two', 'g2');
    session('a1', 'g1', '2026-11-07'); session('b1', 'g2', '2026-11-08');
    mark('a1', 'two', 'PRESENT');
    assert.equal(nov('two')!.charges_cents, 24000); // roll call only in g1
    mark('b1', 'two', 'ABSENT');
    assert.equal(nov('two')!.charges_cents, 48000);
  });
});

test('a group membership that starts or ends mid-month and misses a class needs an admin-set amount', () => {
  isolated(() => {
    addClass('group', 'GROUP');
    novSaturdays.forEach((d, i) => session(`s${i}`, 'group', d));
    // Joins Wed 4 Nov: first Saturday is 7 Nov, so no class is missed -> full RM240.
    addStudent('early'); join('me', 'early', 'group', '2026-11-04'); mark('s0', 'early', 'PRESENT');
    assert.equal(nov('early')!.charges_cents, 24000);
    assert.equal(nov('early')!.lines[0].partial_month, undefined);
    // Joins 10 Nov: misses 7 Nov -> pending review, not RM240.
    addStudent('late'); join('ml', 'late', 'group', '2026-11-10'); mark('s1', 'late', 'PRESENT');
    let month = nov('late')!;
    assert.equal(month.status, 'Pending Finance Review');
    assert.equal(month.charges_cents, 0);
    assert.deepEqual(month.lines[0].partial_month?.missed_dates, ['2026-11-07']);
    db.membershipBillingReviews.set('r1', { id: 'r1', student_id: 'late', membership_id: 'ml', month: '2026-11', amount_cents: 18000, reason: '3 of 4 classes', created_by_user_id: 'admin', created_at: '2026-11-11T00:00:00Z' });
    db.membershipBillingReviews.set('r2', { id: 'r2', student_id: 'late', membership_id: 'ml', month: '2026-11', amount_cents: 17000, reason: 'Corrected', created_by_user_id: 'admin', created_at: '2026-11-12T00:00:00Z' });
    month = nov('late')!;
    assert.equal(month.charges_cents, 17000); // latest decision wins; both kept
    assert.equal(financeDetail('late', '2026-11')!.partial_month_reviews.length, 2);
    assert.equal(month.status, 'Unpaid');
    // Leaves: removal effective 21 Nov (last roster day 20 Nov) -> pending review.
    addStudent('leaver'); join('mv', 'leaver', 'group', '2026-09-01', '2026-11-20'); mark('s0', 'leaver', 'ABSENT');
    assert.equal(nov('leaver')!.status, 'Pending Finance Review');
    assert.deepEqual(nov('leaver')!.lines[0].partial_month?.attended_dates, ['2026-11-07', '2026-11-14']);
    // Removal effective before the first class of the month -> nothing to bill.
    addStudent('gone'); join('mg', 'gone', 'group', '2026-09-01', '2026-11-05');
    assert.equal(financeDetail('gone', '2026-11')!.months.length, 0);
  });
});
