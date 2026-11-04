import assert from 'node:assert/strict';
import test from 'node:test';
import { db, membershipCurrent } from '../server/db.js';
import { planMembershipAdd, planMembershipEnd } from '../server/studentMemberships.js';
import type { AcademyClass, AttendanceRecord, ClassSchedule, ClassSession, StudentClassMembership } from '../src/types.js';

const maps = () => [db.students, db.classes, db.schedules, db.memberships, db.sessions, db.attendance, db.studentPauses] as const;
function isolated(fn: () => void) {
  const saved = maps().map(m => new Map(m as Map<string, any>));
  try { maps().forEach(m => m.clear()); fn(); }
  finally { maps().forEach((m, i) => { m.clear(); for (const [k, v] of saved[i]) (m as Map<string, any>).set(k, v); }); }
}
function setup() {
  for (const id of ['group', 'other']) {
    db.classes.set(id, { id, name: id, class_type: 'GROUP', day_of_week: 6, default_coach_id: 'coach', default_duration_mins: 60, default_capacity: 10, is_active: true, created_at: '' } as AcademyClass);
    db.schedules.set(id, { id, class_id: id, coach_id: 'coach', day_of_week: 6, start_time: '10:00', end_time: '11:00', status: 'ACTIVE', is_active: true, created_at: '' } as ClassSchedule);
  }
  for (const id of ['a', 'b']) db.students.set(id, { id, student_id: `STU-${id}`, full_name: id, status: 'ACTIVE', created_at: '' });
  for (const date of ['2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'])
    db.sessions.set(date, { id: date, class_id: 'group', schedule_id: 'group', session_date: date, start_time: '10:00', end_time: '11:00', scheduled_coach_id: 'coach', actual_coach_id: 'coach', status: 'SCHEDULED' } as ClassSession);
}
const roster = (date: string) => db.getPopulatedSession(date)!.enrolled_students!.map(s => s.id).sort();
const apply = (rows: StudentClassMembership[]) => rows.forEach(m => db.memberships.set(m.id, m));

test('dated add puts the student on rosters only from the effective date', () => {
  isolated(() => {
    setup();
    const plan = planMembershipAdd({ studentIds: ['a', 'a'], scheduleId: 'group', classId: 'group', effectiveDate: '2026-11-10', memberships: db.memberships.values() });
    assert.equal(plan.add.length, 1);
    assert.equal(plan.add[0].joined_date, '2026-11-10');
    apply(plan.add);
    assert.deepEqual(roster('2026-11-07'), []);
    assert.deepEqual(roster('2026-11-14'), ['a']);
    assert.deepEqual(roster('2026-11-28'), ['a']);
    assert.equal(membershipCurrent(plan.add[0], '2026-11-04'), false);
    assert.equal(membershipCurrent(plan.add[0], '2026-11-10'), true);
    // Re-adding overlapping dates is refused; another class is flagged for confirmation.
    const again = planMembershipAdd({ studentIds: ['a'], scheduleId: 'group', classId: 'group', effectiveDate: '2026-11-20', memberships: db.memberships.values() });
    assert.deepEqual(again.alreadyInClass, ['a']);
    assert.equal(again.add.length, 0);
    const other = planMembershipAdd({ studentIds: ['a', 'b'], scheduleId: 'other', classId: 'other', effectiveDate: '2026-11-20', memberships: db.memberships.values() });
    assert.deepEqual(other.otherClasses, [{ student_id: 'a', schedule_ids: ['group'] }]);
    assert.equal(other.add.length, 2);
  });
});

test('dated removal affects only roster dates from the effective date and keeps history', () => {
  isolated(() => {
    setup();
    db.memberships.set('m', { id: 'm', student_id: 'a', schedule_id: 'group', joined_date: '2026-09-01', status: 'ACTIVE' });
    db.memberships.set('keep', { id: 'keep', student_id: 'a', schedule_id: 'other', joined_date: '2026-09-01', status: 'ACTIVE' });
    const marked = (sessionId: string, status: 'PRESENT' | 'ABSENT'): AttendanceRecord => ({ id: `${sessionId}-a`, session_id: sessionId, student_id: 'a', status, attendance_type: 'REGULAR', marked_at: '2026-11-01T00:00:00Z', marked_by_user_id: 'coach', replacement_credit_impact: status === 'ABSENT' ? 1 : 0 });
    const history = [marked('2026-10-31', 'ABSENT'), marked('2026-11-07', 'PRESENT'), marked('2026-11-28', 'PRESENT')];
    history.forEach(r => db.attendance.set(r.id, r));
    const before = JSON.stringify([...db.attendance.values()]);

    const ended = planMembershipEnd({ studentId: 'a', scheduleId: 'group', classId: 'group', effectiveDate: '2026-11-21', memberships: db.memberships.values() });
    assert.equal(ended.length, 1);
    assert.equal(ended[0].ended_date, '2026-11-20'); // removal date is the first day off the roster
    apply(ended);

    assert.deepEqual(roster('2026-10-31'), ['a']);
    assert.deepEqual(roster('2026-11-14'), ['a']);
    assert.deepEqual(roster('2026-11-21'), []);
    assert.deepEqual(roster('2026-11-28'), []);
    // Attendance is untouched, including a record already saved after the removal date.
    assert.equal(JSON.stringify([...db.attendance.values()]), before);
    assert.equal(db.getPopulatedSession('2026-10-31')!.attendance_records!.length, 1);
    assert.equal(db.getPopulatedSession('2026-11-28')!.attendance_records!.length, 1);
    // Only this class membership changed.
    assert.equal(db.memberships.get('keep')!.status, 'ACTIVE');
    assert.equal(db.memberships.get('keep')!.ended_date, undefined);
    // A scheduled removal still counts in the class list until its last day.
    assert.equal(membershipCurrent(db.memberships.get('m')!, '2026-11-20'), true);
    assert.equal(membershipCurrent(db.memberships.get('m')!, '2026-11-21'), false);
    // Removing again from a later date finds nothing; an earlier date shortens it.
    assert.equal(planMembershipEnd({ studentId: 'a', scheduleId: 'group', classId: 'group', effectiveDate: '2026-11-25', memberships: db.memberships.values() }).length, 0);
    assert.equal(planMembershipEnd({ studentId: 'a', scheduleId: 'group', classId: 'group', effectiveDate: '2026-11-14', memberships: db.memberships.values() })[0].ended_date, '2026-11-13');
  });
});

test('removal effective today drops the student from today onward; a future join can be cancelled', () => {
  isolated(() => {
    setup();
    db.memberships.set('f', { id: 'f', student_id: 'b', schedule_id: 'group', joined_date: '2026-11-14', status: 'ACTIVE' });
    const cancelled = planMembershipEnd({ studentId: 'b', scheduleId: 'group', classId: 'group', effectiveDate: '2026-11-07', memberships: db.memberships.values() });
    apply(cancelled);
    for (const d of ['2026-11-07', '2026-11-14', '2026-11-28']) assert.deepEqual(roster(d), []);
    // Legacy immediate removals (ended_date = today) leave the class list at once.
    assert.equal(membershipCurrent({ id: 'x', student_id: 'a', schedule_id: 'group', joined_date: '2026-01-01', ended_date: '2026-11-04', status: 'ENDED' }, '2026-11-04'), false);
  });
});
