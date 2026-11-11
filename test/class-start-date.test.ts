import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db.js';
import { planMembershipAdd, planStudentMemberships } from '../server/studentMemberships.js';
import { MAX_START_DATE_DAYS_BACK, earliestClassStartDate, parseClassStartDate } from '../src/lib/classStartDate.js';
import type { AcademyClass, ClassSchedule, ClassSession } from '../src/types.js';

const TODAY = '2026-11-11';

test('blank class start date means today', () => {
  assert.deepEqual(parseClassStartDate(undefined, TODAY), { date: TODAY });
  assert.deepEqual(parseClassStartDate('', TODAY), { date: TODAY });
});

test('a past start date inside the window is kept (Liam: added 8 Nov, attended 1 Nov)', () => {
  assert.deepEqual(parseClassStartDate('2026-11-01', TODAY), { date: '2026-11-01' });
  assert.equal(earliestClassStartDate(TODAY), '2026-09-10');
  assert.deepEqual(parseClassStartDate('2026-09-10', TODAY), { date: '2026-09-10' });
});

test('typos, too-old and future dates are refused with a plain reason', () => {
  assert.ok('error' in parseClassStartDate('2026-02-30', TODAY));
  assert.ok('error' in parseClassStartDate('01/11/2026', TODAY));
  assert.ok('error' in parseClassStartDate(20261101, TODAY));
  const tooOld = parseClassStartDate('2025-11-01', TODAY);
  assert.ok('error' in tooOld && tooOld.error.includes(`${MAX_START_DATE_DAYS_BACK} days`));
  const future = parseClassStartDate('2026-11-12', TODAY);
  assert.ok('error' in future && future.error.includes('future'));
  // Scheduled adds from roll call may start later.
  assert.deepEqual(parseClassStartDate('2026-11-12', TODAY, { allowFuture: true }), { date: '2026-11-12' });
});

test('a back-dated add puts the student on that earlier lesson, so roll call accepts the tick', () => {
  const maps = [db.students, db.classes, db.schedules, db.memberships, db.sessions, db.attendance, db.studentPauses] as const;
  const saved = maps.map((m) => new Map(m as Map<string, unknown>));
  try {
    maps.forEach((m) => m.clear());
    db.classes.set('sun', { id: 'sun', name: 'Sunday 830am-10am', class_type: 'GROUP', day_of_week: 0, default_coach_id: 'coach', default_duration_mins: 90, default_capacity: 10, is_active: true, created_at: '' } as AcademyClass);
    db.schedules.set('sun', { id: 'sun', class_id: 'sun', coach_id: 'coach', day_of_week: 0, start_time: '08:30', end_time: '10:00', status: 'ACTIVE', is_active: true, created_at: '' } as ClassSchedule);
    db.students.set('liam', { id: 'liam', student_id: 'STU-0074', full_name: 'Liam', status: 'ACTIVE', created_at: '' });
    db.sessions.set('s1', { id: 's1', class_id: 'sun', schedule_id: 'sun', session_date: '2026-11-01', start_time: '08:30', end_time: '10:00', scheduled_coach_id: 'coach', actual_coach_id: 'coach', status: 'SCHEDULED' } as ClassSession);
    const roster = () => db.getPopulatedSession('s1')!.enrolled_students!.map((s) => s.id);

    const today = planMembershipAdd({ studentIds: ['liam'], scheduleId: 'sun', classId: 'sun', effectiveDate: '2026-11-08', memberships: [] });
    today.add.forEach((m) => db.memberships.set(m.id, m));
    assert.deepEqual(roster(), [], 'joined 8 Nov: not on the 1 Nov sheet, so the screen no longer offers a tick that would fail');

    db.memberships.clear();
    const backdated = planMembershipAdd({ studentIds: ['liam'], scheduleId: 'sun', classId: 'sun', effectiveDate: '2026-11-01', memberships: [] });
    backdated.add.forEach((m) => db.memberships.set(m.id, m));
    assert.deepEqual(roster(), ['liam']);
  } finally {
    maps.forEach((m, i) => { m.clear(); for (const [k, v] of saved[i]) (m as Map<string, unknown>).set(k, v); });
  }
});

test('editing a student: a newly ticked class gets the chosen start date, a removed class still ends today', () => {
  const existing = [{ id: 'm-old', student_id: 'stu', schedule_id: 'sat', joined_date: '2026-09-01', status: 'ACTIVE' as const }];
  const plan = planStudentMemberships('stu', ['sun'], existing, new Set(['sat', 'sun']), TODAY, '2026-11-01');
  assert.equal(plan.add.length, 1);
  assert.equal(plan.add[0].schedule_id, 'sun');
  assert.equal(plan.add[0].joined_date, '2026-11-01');
  assert.equal(plan.end[0].ended_date, TODAY);
  // Without a start date the old behaviour (today) is kept.
  assert.equal(planStudentMemberships('stu', ['sun'], existing, new Set(['sat', 'sun']), TODAY).add[0].joined_date, TODAY);
});
