import assert from 'node:assert/strict';
import test from 'node:test';
import { addRosterStudents, filterRosterCandidates, toggleRosterStudent, type RosterCandidate } from '../src/lib/classRoster.js';
import { db } from '../server/db.js';
import { router } from '../server/routes.js';

const candidates: RosterCandidate[] = [
  { id: 'a', full_name: 'Alice Tan', student_id: 'STU-0001', already_in_class: false, assigned_elsewhere: false },
  { id: 'b', full_name: 'Ben Lim', student_id: 'STU-0002', already_in_class: false, assigned_elsewhere: true },
  { id: 'c', full_name: 'Cara Ng', student_id: 'STU-0003', already_in_class: true, assigned_elsewhere: false },
];

test('roster displays eligible students without search and filters by name or STU-ID', () => {
  assert.deepEqual(filterRosterCandidates(candidates, '').map((row) => row.id), ['a', 'b']);
  assert.deepEqual(filterRosterCandidates(candidates, 'alice').map((row) => row.id), ['a']);
  assert.deepEqual(filterRosterCandidates(candidates, 'stu-0002').map((row) => row.id), ['b']);
});

test('checkbox selection toggles multiple students and bulk action skips existing memberships', async () => {
  const selected = toggleRosterStudent(toggleRosterStudent([], 'a'), 'b');
  assert.deepEqual(selected, ['a', 'b']);
  assert.deepEqual(toggleRosterStudent(selected, 'a'), ['b']);
  const called: string[] = [];
  const result = await addRosterStudents(candidates, [...selected, 'c'], async (student) => { called.push(student.id); });
  assert.deepEqual(called, ['a', 'b']);
  assert.deepEqual(result, { added: ['a', 'b'], failed: 0 });
  assert.deepEqual(await addRosterStudents(candidates, [], async () => { throw Error('should not add'); }), { added: [], failed: 0 });
});

test('student-search endpoint returns all eligible students on open and excludes enrolled students', () => {
  const previous = [db.students, db.classes, db.schedules, db.memberships] as const;
  try {
    db.students = new Map(candidates.map((student) => [student.id, { ...student, status: 'ACTIVE' } as any]));
    db.classes = new Map([['class', { id: 'class', is_active: true, default_coach_id: 'coach' } as any]]);
    db.schedules = new Map([['class', { id: 'class', class_id: 'class' } as any]]);
    db.memberships = new Map([['membership', { id: 'membership', student_id: 'c', schedule_id: 'class', status: 'ACTIVE' } as any]]);
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/classes/:id/student-search');
    let rows: RosterCandidate[] = [];
    layer.route.stack.at(-1).handle({ params: { id: 'class' }, query: {}, user: { role: 'COACH', coach_id: 'coach' } },
      { json(value: RosterCandidate[]) { rows = value; return this; } });
    assert.deepEqual(rows.map((row) => row.id), ['a', 'b']);
    assert.deepEqual(rows.map((row) => row.already_in_class), [false, false]);
  } finally { [db.students, db.classes, db.schedules, db.memberships] = previous; }
});
