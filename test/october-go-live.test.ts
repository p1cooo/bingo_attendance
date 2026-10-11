import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db.js';
import { attendanceExpectedOn, configuredAttendanceGoLiveDate } from '../server/attendanceGoLive.js';
import { configuredGoLiveDate, financeDetail } from '../server/finance.js';
import { getAccountantReport } from '../server/accountantExport.js';
import type { StudentPause } from '../src/types.js';

test('October billing and electronic attendance use independent date boundaries', () => {
  const oldBilling = process.env.ACADEMY_GO_LIVE_DATE;
  const oldAttendance = process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE;
  try {
    process.env.ACADEMY_GO_LIVE_DATE = '2026-10-01';
    process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE = '2026-10-15';
    assert.equal(configuredGoLiveDate(), '2026-10-01');
    assert.equal(configuredAttendanceGoLiveDate(), '2026-10-15');
    assert.equal(attendanceExpectedOn('2026-10-14'), false);
    assert.equal(attendanceExpectedOn('2026-10-15'), true);
    assert.equal(attendanceExpectedOn('2026-11-01'), true);
    process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE = '2026-02-30';
    assert.throws(() => attendanceExpectedOn('2026-10-15'), /valid YYYY-MM-DD/);
    delete process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE;
    assert.equal(configuredAttendanceGoLiveDate(), null);
    assert.equal(attendanceExpectedOn('2026-10-15'), false);
    delete process.env.ACADEMY_GO_LIVE_DATE;
    assert.equal(attendanceExpectedOn('2026-10-15'), true);
  } finally {
    if (oldBilling === undefined) delete process.env.ACADEMY_GO_LIVE_DATE; else process.env.ACADEMY_GO_LIVE_DATE = oldBilling;
    if (oldAttendance === undefined) delete process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE; else process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE = oldAttendance;
  }
});

test('pre-launch lessons remain scheduled without invented attendance; October billing is provisional where lesson delivery is unknown', () => {
  const keys = ['students', 'memberships', 'schedules', 'classes', 'sessions', 'attendance', 'studentFees', 'studentPayments', 'studentAdjustments', 'studentPauses', 'coaches'] as const;
  const previous = keys.map(key => db[key]);
  const oldBilling = process.env.ACADEMY_GO_LIVE_DATE;
  const oldAttendance = process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE;
  try {
    process.env.ACADEMY_GO_LIVE_DATE = '2026-10-01';
    process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE = '2026-10-15';
    db.students = new Map([['student', { id: 'student', full_name: 'Fixture Student', status: 'ACTIVE' } as any]]);
    db.coaches = new Map([['coach', { id: 'coach', name: 'Fixture Coach' } as any]]);
    db.memberships = new Map([
      ['group-m', { id: 'group-m', student_id: 'student', schedule_id: 'group', joined_date: '2026-10-01', status: 'ACTIVE' } as any],
      ['individual-m', { id: 'individual-m', student_id: 'student', schedule_id: 'individual', joined_date: '2026-10-01', status: 'ACTIVE' } as any],
    ]);
    db.schedules = new Map([['group', { id: 'group', class_id: 'group', coach_id: 'coach' } as any], ['individual', { id: 'individual', class_id: 'individual', coach_id: 'coach' } as any]]);
    db.classes = new Map([['group', { id: 'group', name: 'Group', class_type: 'GROUP', default_coach_id: 'coach' } as any],
      ['individual', { id: 'individual', name: 'Individual', class_type: 'INDIVIDUAL', default_coach_id: 'coach' } as any]]);
    db.sessions = new Map([
      ['group-pre', { id: 'group-pre', schedule_id: 'group', class_id: 'group', session_date: '2026-10-10', start_time: '09:00', end_time: '10:00', status: 'SCHEDULED', scheduled_coach_id: 'coach', actual_coach_id: 'coach' } as any],
      ['individual-pre', { id: 'individual-pre', schedule_id: 'individual', class_id: 'individual', session_date: '2026-10-14', start_time: '09:00', end_time: '10:00', status: 'SCHEDULED', scheduled_coach_id: 'coach', actual_coach_id: 'coach' } as any],
      ['individual-live', { id: 'individual-live', schedule_id: 'individual', class_id: 'individual', session_date: '2026-10-15', start_time: '09:00', end_time: '10:00', status: 'SCHEDULED', scheduled_coach_id: 'coach', actual_coach_id: 'coach' } as any],
      ['individual-nov', { id: 'individual-nov', schedule_id: 'individual', class_id: 'individual', session_date: '2026-11-05', start_time: '09:00', end_time: '10:00', status: 'SCHEDULED', scheduled_coach_id: 'coach', actual_coach_id: 'coach' } as any],
    ]);
    db.attendance = new Map([['live-mark', { id: 'live-mark', student_id: 'student', session_id: 'individual-live', status: 'PRESENT', attendance_type: 'REGULAR' } as any],
      ['nov-mark', { id: 'nov-mark', student_id: 'student', session_id: 'individual-nov', status: 'PRESENT', attendance_type: 'REGULAR' } as any]]);
    db.studentFees = new Map([['group-fee', { id: 'group-fee', student_id: 'student', membership_id: 'group-m', billing_mode: 'MONTHLY', amount_cents: 20000, effective_month: '2026-10', created_at: '2026-09-01' } as any],
      ['individual-fee', { id: 'individual-fee', student_id: 'student', membership_id: 'individual-m', billing_mode: 'PER_SESSION', amount_cents: 5000, effective_month: '2026-10', created_at: '2026-09-01' } as any]]);
    db.studentPayments = new Map(); db.studentAdjustments = new Map(); db.studentPauses = new Map();

    const pre = db.getPopulatedSession('individual-pre')!;
    const live = db.getPopulatedSession('individual-live')!;
    assert.equal(pre.attendance_expected, false);
    assert.equal(pre.marked_attendance_count, 0);
    assert.equal(pre.status, 'SCHEDULED');
    assert.equal(live.attendance_expected, true);
    assert.equal(live.marked_attendance_count, 1);
    assert.deepEqual([...db.sessions.keys()], ['group-pre', 'individual-pre', 'individual-live', 'individual-nov']);

    const oct = financeDetail('student', '2026-10')!.months[0];
    assert.equal(oct.month, '2026-10');
    assert.equal(oct.lines.find(line => line.membership_id === 'group-m')?.amount_cents, 20000);
    const individual = oct.lines.find(line => line.membership_id === 'individual-m')!;
    assert.equal(individual.amount_cents, 5000);
    assert.deepEqual(individual.pre_go_live_dates, ['2026-10-14']);
    assert.equal(individual.pending_finance_review, true);
    assert.equal(oct.status, 'Pending Finance Review');
    assert.equal(financeDetail('student', '2026-11')!.months.find(month => month.month === '2026-11')?.charges_cents, 25000);
    assert.equal(getAccountantReport('2026-10')[0]?.sessions.length, 1);

    const pause: StudentPause = { id: 'pause', student_id: 'student', membership_id: 'group-m', schedule_id: 'group', class_id: 'group', start_date: '2026-10-01', end_date: '2026-10-31', reason: 'EXAMINATION', declared_by_user_id: 'coach', declared_by_name: 'Fixture Coach', declared_by_role: 'COACH', created_at: '2026-10-01', updated_at: '2026-10-01', history: [] };
    db.studentPauses.set('pause', pause);
    assert.equal(financeDetail('student', '2026-10')!.months[0].lines.find(line => line.membership_id === 'group-m')?.amount_cents, 0);
    pause.start_date = '2026-10-12';
    assert.equal(financeDetail('student', '2026-10')!.months[0].lines.find(line => line.membership_id === 'group-m')?.pending_finance_review, true);
  } finally {
    keys.forEach((key, index) => (db[key] as any) = previous[index]);
    if (oldBilling === undefined) delete process.env.ACADEMY_GO_LIVE_DATE; else process.env.ACADEMY_GO_LIVE_DATE = oldBilling;
    if (oldAttendance === undefined) delete process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE; else process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE = oldAttendance;
  }
});
