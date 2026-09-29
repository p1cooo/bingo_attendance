import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileRecurringSessions } from '../server/recurringSessions.js';
import { db } from '../server/db.js';
import { router } from '../server/routes.js';
import { planStudentMemberships } from '../server/studentMemberships.js';
import { filterClassPicker, MONDAY_FIRST_DAYS, toggleClassDay } from '../src/lib/classPicker.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ClassMembershipPicker } from '../src/components/student/ClassMembershipPicker.js';
import type { AcademyClass, AttendanceRecord, ClassSchedule, ClassSession, StudentClassMembership } from '../src/types.js';

test('Thursday to Tuesday repairs untouched future occurrences without moving history or exceptions', () => {
  const cls = { id: 'class', day_of_week: 2, start_time: '08:00', end_time: '09:00', default_coach_id: 'coach', is_active: true } as AcademyClass;
  const session = (id: string, date: string, extra: Partial<ClassSession> = {}) =>
    ({ id, class_id: 'class', schedule_id: 'class', session_date: date, start_time: '10:00', end_time: '11:00',
      scheduled_coach_id: 'coach', actual_coach_id: 'coach', status: 'SCHEDULED', session_type: 'NORMAL', ...extra }) as ClassSession;
  const rows = [session('past', '2026-09-24'), session('old', '2026-10-01'), session('marked', '2026-10-08'),
    session('moved', '2026-10-09', { original_session_date: '2026-10-15' }),
    session('replacement', '2026-10-22', { replacement_coach_id: 'other', actual_coach_id: 'other', session_type: 'REPLACEMENT_COACH' }),
    session('tuesday', '2026-10-06')];
  const sessions = new Map(rows.map((row) => [row.id, row]));
  const attendance = [{ session_id: 'past' }, { session_id: 'marked' }] as AttendanceRecord[];
  const changed = reconcileRecurringSessions(cls, sessions, attendance, '2026-09-29');
  assert.deepEqual(changed.removed.map((row) => row.id), ['old']);
  assert.equal(sessions.has('old'), false);
  assert.equal(sessions.get('past')?.start_time, '10:00');
  assert.equal(sessions.get('marked')?.session_date, '2026-10-08');
  assert.equal(sessions.get('moved')?.session_date, '2026-10-09');
  assert.equal(sessions.get('replacement')?.actual_coach_id, 'other');
  assert.equal(sessions.get('tuesday')?.start_time, '08:00');
  const tuesday = '2026-10-06';
  assert.equal([...sessions.values()].filter((row) => row.session_date === tuesday).length, 1);
  const previous = [db.classes, db.sessions] as const;
  try {
    db.classes = new Map([[cls.id, cls]]);
    db.sessions = sessions;
    db.ensureSessionsForMonth('2026-10');
    assert.equal([...db.sessions.values()].filter((row) => row.session_date === '2026-10-13').length, 1);
    assert.equal([...db.sessions.values()].filter((row) => row.session_date === tuesday).length, 1);
    assert.equal(db.sessions.has('old'), false);
  } finally { [db.classes, db.sessions] = previous; }
});

test('membership edits end only managed active rows and never duplicate selections', () => {
  const existing = [{ id: 'own', student_id: 'student', schedule_id: 'one', status: 'ACTIVE' },
    { id: 'other', student_id: 'student', schedule_id: 'foreign', status: 'ACTIVE' }] as StudentClassMembership[];
  const changed = planStudentMemberships('student', ['two', 'two'], existing, new Set(['one', 'two']), '2026-09-29');
  assert.deepEqual(changed.end.map((row) => [row.id, row.status, row.ended_date]), [['own', 'ENDED', '2026-09-29']]);
  assert.deepEqual(changed.add.map((row) => row.schedule_id), ['two']);
  assert.equal(existing[0].status, 'ACTIVE');
  assert.equal(existing[1].status, 'ACTIVE');
  assert.equal(planStudentMemberships('student', ['one'], existing, new Set(['one']), '2026-09-29').add.length, 0);
});

test('class picker combines search, Monday-first, type and coach filters', () => {
  const schedule = (id: string, day: number, time: string, type: 'GROUP' | 'INDIVIDUAL', coach: string) =>
    ({ id, day_of_week: day, start_time: time, is_active: true, status: 'ACTIVE', default_coach_id: coach,
      class_item: { name: `Chess ${id}`, class_type: type } }) as ClassSchedule;
  const schedules = [schedule('Sunday', 0, '09:00', 'GROUP', 'wei'), schedule('late', 6, '18:00', 'GROUP', 'wei'),
    schedule('early', 6, '09:00', 'GROUP', 'wei'), schedule('other', 6, '08:00', 'INDIVIDUAL', 'other'),
    schedule('Monday', 1, '10:00', 'GROUP', 'wei')];
  assert.deepEqual(MONDAY_FIRST_DAYS, [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(filterClassPicker(schedules, { search: '', days: [], type: '', coachId: '' }).map((row) => row.id),
    ['Monday', 'other', 'early', 'late', 'Sunday']);
  assert.deepEqual(filterClassPicker(schedules, { search: 'chess', days: [6], type: 'GROUP', coachId: 'wei' }).map((row) => row.id),
    ['early', 'late']);
  assert.deepEqual(filterClassPicker(schedules, { search: '', days: [1, 6], type: '', coachId: '' }).map((row) => row.id),
    ['Monday', 'other', 'early', 'late']);
  assert.deepEqual(toggleClassDay([1, 6], 1), [6]);
  assert.deepEqual(toggleClassDay([1, 6], 0), [1, 6, 0]);
  assert.deepEqual(filterClassPicker(schedules, { search: '', days: [1, 6], type: 'INDIVIDUAL', coachId: '' }).map((row) => row.id), ['other']);
  const markup = renderToStaticMarkup(createElement(ClassMembershipPicker, { schedules, selected: [], onChange: () => {} }));
  assert.match(markup, /Day: All/);
  assert.match(markup, /Type: All/);
  assert.match(markup, /type="radio"[^>]*checked=""[^>]*>All/);
  assert.doesNotMatch(markup, />Reset</);
});

test('coach cannot edit a student into an unrelated class', async () => {
  const previous = [db.students, db.classes, db.schedules, db.memberships] as const;
  try {
    db.students = new Map([['student', { id: 'student', student_id: 'STU-0001', full_name: 'Student', status: 'ACTIVE' } as any]]);
    db.classes = new Map([['own', { id: 'own', default_coach_id: 'coach-a', is_active: true } as any],
      ['foreign', { id: 'foreign', default_coach_id: 'coach-b', is_active: true } as any]]);
    db.schedules = new Map([['own', { id: 'own', class_id: 'own', is_active: true } as any],
      ['foreign', { id: 'foreign', class_id: 'foreign', is_active: true } as any]]);
    db.memberships = new Map([['m', { id: 'm', student_id: 'student', schedule_id: 'own', status: 'ACTIVE' } as any]]);
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/students/:id' && item.route.methods.put);
    let code = 200;
    await layer.route.stack.at(-1).handle({ params: { id: 'student' }, user: { role: 'COACH', coach_id: 'coach-a' },
      body: { schedule_ids: ['foreign'] } }, { status(value: number) { code = value; return this; }, json() { return this; } });
    assert.equal(code, 400);
    assert.equal(db.memberships.size, 1);
  } finally { [db.students, db.classes, db.schedules, db.memberships] = previous; }
});
