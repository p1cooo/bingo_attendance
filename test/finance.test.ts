import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db.js';
import { financeDetail, validAllocations } from '../server/finance.js';

test('payment allocations reconcile exactly once per month', () => {
  assert.equal(validAllocations([{ month: '2026-10', amount_cents: 20000 }, { month: '2026-11', amount_cents: 22000 }], 42000), true);
  assert.equal(validAllocations([{ month: '2026-10', amount_cents: 20000 }], 42000), false);
  assert.equal(validAllocations([{ month: '2026-10', amount_cents: 20000 }, { month: '2026-10', amount_cents: 22000 }], 42000), false);
  assert.equal(validAllocations([{ month: '2026-13', amount_cents: 42000 }], 42000), false);
});
import type { Student, AcademyClass, ClassSchedule, StudentClassMembership, ClassSession, AttendanceRecord, StudentFee, StudentPayment } from '../src/types.js';

test('group fees, per-class attendance, partial and multi-month payments, credits, and fee history', () => {
  const maps = [db.students, db.classes, db.schedules, db.memberships, db.sessions, db.attendance, db.studentFees, db.studentPayments, db.studentAdjustments] as const;
  const saved = maps.map(m => new Map(m as Map<string, any>));
  try {
    maps.forEach(m => m.clear());
    const student: Student = { id: 's1', student_id: 'STU-0001', full_name: 'Alex', status: 'ACTIVE', created_at: '2026-01-01T00:00:00Z' };
    db.students.set(student.id, student);
    for (const [id, type] of [['group', 'GROUP'], ['individual', 'INDIVIDUAL']] as const) {
      db.classes.set(id, { id, name: id, class_type: type, default_duration_mins: 60, default_capacity: 10, is_active: true, created_at: '' } as AcademyClass);
      db.schedules.set(id, { id, class_id: id, coach_id: 'coach', day_of_week: 1, start_time: '10:00', end_time: '11:00', status: 'ACTIVE', is_active: true, created_at: '' } as ClassSchedule);
      db.memberships.set(id, { id, student_id: student.id, schedule_id: id, joined_date: '2026-01-01', status: 'ACTIVE' } as StudentClassMembership);
    }
    const fee = (id: string, month: string, amount: number): StudentFee => ({ id: `${id}-${month}`, student_id: 's1', membership_id: id, class_id: id, class_name: id, coach_name: 'Coach', billing_mode: id === 'group' ? 'MONTHLY' : 'PER_SESSION', amount_cents: amount, effective_month: month, created_by_user_id: 'admin', created_at: `${month}-01T00:00:00Z` });
    db.studentFees.set('g-jan', fee('group', '2026-01', 18000));
    db.studentFees.set('g-mar', fee('group', '2026-03', 20000));
    db.studentFees.set('i-jan', fee('individual', '2026-01', 8000));
    const session = (id: string, date: string, status = 'COMPLETED') => db.sessions.set(id, { id, class_id: 'individual', schedule_id: 'individual', session_date: date, start_time: '10:00', end_time: '11:00', scheduled_coach_id: 'coach', actual_coach_id: 'coach', status } as ClassSession);
    session('jan-1', '2026-01-05'); session('jan-2', '2026-01-12'); session('jan-off', '2026-01-19', 'PLANNED_OFF_DAY'); session('feb-moved', '2026-02-04');
    for (const id of ['jan-1', 'jan-2', 'jan-off', 'feb-moved']) db.attendance.set(id, { id, session_id: id, student_id: 's1', status: 'PRESENT', attendance_type: 'REGULAR', marked_at: '', marked_by_user_id: 'coach' } as AttendanceRecord);
    db.attendance.set('duplicate-record', { id: 'duplicate-record', session_id: 'jan-1', student_id: 's1', status: 'PRESENT', attendance_type: 'REGULAR', marked_at: '', marked_by_user_id: 'coach' } as AttendanceRecord);
    const jan = financeDetail('s1', '2026-01')!;
    assert.equal(jan.months[0].charges_cents, 34000); // 180 monthly + 80 x 2; off-day excluded
    assert.equal(jan.months[0].lines.find(l => l.mode === 'MONTHLY')?.amount_cents, 18000);
    assert.equal(jan.months[0].lines.find(l => l.mode === 'PER_SESSION')?.dates.length, 2);
    const payment = (id: string, date: string, allocations: { month: string; amount_cents: number }[]): StudentPayment => ({ id, student_id: 's1', payment_date: date, amount_cents: allocations.reduce((n, a) => n + a.amount_cents, 0), allocations, method: 'Cash', source: 'MANUAL', recorded_by_user_id: 'admin', created_at: `${date}T00:00:00Z` });
    db.studentPayments.set('p1', payment('p1', '2026-01-10', [{ month: '2026-01', amount_cents: 20000 }]));
    assert.equal(financeDetail('s1', '2026-01')!.months[0].outstanding_cents, 14000);
    assert.equal(financeDetail('s1', '2026-01')!.paid_until, null);
    db.studentPayments.set('p2', payment('p2', '2026-02-10', [{ month: '2026-01', amount_cents: 14000 }, { month: '2026-02', amount_cents: 10000 }]));
    let detail = financeDetail('s1', '2026-03')!;
    assert.equal(detail.paid_until, '2026-01');
    assert.equal(detail.last_payment, '2026-02-10');
    assert.equal(detail.months.find(m => m.month === '2026-02')!.charges_cents, 26000); // moved individual class
    assert.equal(detail.months.find(m => m.month === '2026-03')!.charges_cents, 20000);
    assert.equal(detail.months.find(m => m.month === '2026-01')!.charges_cents, 34000); // old fee unchanged
    db.studentAdjustments.set('a1', { id: 'a1', student_id: 's1', month: '2026-02', amount_cents: 3000, type: 'DISCOUNT', reason: 'Sibling', created_by_user_id: 'admin', created_at: '' });
    db.studentPayments.set('p3', payment('p3', '2026-02-14', [{ month: '2026-02', amount_cents: 13000 }, { month: '2026-03', amount_cents: 20000 }]));
    detail = financeDetail('s1', '2026-03')!;
    assert.equal(detail.paid_until, '2026-03');
    assert.equal(detail.outstanding_cents, 0);
    assert.equal(detail.months.find(m => m.month === '2026-02')!.adjustments_cents, 3000);
    db.studentPayments.set('advance', payment('advance', '2026-03-20', [{ month: '2026-04', amount_cents: 20000 }]));
    detail = financeDetail('s1', '2026-04')!;
    assert.equal(detail.months.find(m => m.month === '2026-04')!.charges_cents, 20000);
    assert.equal(detail.paid_until, '2026-04');
    db.studentPayments.delete('advance');
    db.memberships.set('group', { ...db.memberships.get('group')!, status: 'ENDED', ended_date: '2026-03-31' });
    db.memberships.set('individual', { ...db.memberships.get('individual')!, status: 'ENDED', ended_date: '2026-03-31' });
    db.studentPayments.set('advance', payment('advance', '2026-03-20', [{ month: '2026-04', amount_cents: 5000 }]));
    detail = financeDetail('s1', '2026-04')!;
    assert.equal(detail.months.find(m => m.month === '2026-04')!.charges_cents, 0);
    assert.equal(detail.months.find(m => m.month === '2026-04')!.outstanding_cents, -5000);
    assert.equal(detail.paid_until, '2026-03');
  } finally { maps.forEach((m, i) => { m.clear(); for (const [key, value] of saved[i]) (m as Map<string, any>).set(key, value); }); }
});
