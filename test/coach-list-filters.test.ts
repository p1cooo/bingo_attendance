import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAndSortCoachClasses, filterCoachStudents, WEEK_DAYS, CoachStudentRow } from '../src/lib/coachListFilters.js';
import { AcademyClass } from '../src/types.js';
import { getFixedWeekDays, getWeekStart } from '../src/lib/dateUtils.js';
import { readFileSync } from 'node:fs';

const students: CoachStudentRow[] = [
  { id: 'one', full_name: 'Alice Tan', student_id: 'STU-0003', replacement_credits: 2, portal_account_status: 'REGISTERED', normal_class_days: [1, 4] },
  { id: 'two', full_name: 'Ben Lim', student_id: 'STU-0004', replacement_credits: -2, portal_account_status: 'NOT_REGISTERED', normal_class_days: [2] },
  { id: 'three', full_name: 'Celine Wong', student_id: 'STU-0005', replacement_credits: 0, portal_account_status: 'UNKNOWN', normal_class_days: [0] },
];
const studentFilter = (overrides: Partial<Parameters<typeof filterCoachStudents>[1]> = {}) =>
  filterCoachStudents(students, { query: '', credit: 'ALL', link: 'ALL', days: [], ...overrides }).map((student) => student.id);

test('student name and Attendance ID searches are case insensitive', () => {
  assert.deepEqual(studentFilter({ query: 'aLiCe' }), ['one']);
  assert.deepEqual(studentFilter({ query: ' stu-0004 ' }), ['two']);
});

test('credit chips distinguish positive, negative, and zero balances', () => {
  assert.deepEqual(studentFilter({ credit: 'POSITIVE' }), ['one']);
  assert.deepEqual(studentFilter({ credit: 'NEGATIVE' }), ['two']);
  assert.deepEqual(studentFilter(), ['one', 'two', 'three']);
});

test('link chips exclude unknown status rather than guessing', () => {
  assert.deepEqual(studentFilter({ link: 'REGISTERED' }), ['one']);
  assert.deepEqual(studentFilter({ link: 'NOT_REGISTERED' }), ['two']);
});

test('student days use any normal membership and combine with search and other filters', () => {
  assert.deepEqual(studentFilter({ days: [4] }), ['one']);
  assert.deepEqual(studentFilter({ days: [4, 2] }), ['one', 'two']);
  assert.deepEqual(studentFilter({ query: 'STU-0003', credit: 'POSITIVE', link: 'REGISTERED', days: [4] }), ['one']);
  assert.deepEqual(studentFilter({ query: 'STU-0003', days: [2] }), []);
});

const classes = [
  { id: 'sun', name: 'Sunday Group', class_type: 'GROUP', day_of_week: 0, start_time: '09:00' },
  { id: 'mon-late', name: 'Monday Group Late', class_type: 'GROUP', day_of_week: 1, start_time: '16:00' },
  { id: 'tue', name: 'Tuesday Individual', class_type: 'INDIVIDUAL', day_of_week: 2, start_time: '08:00' },
  { id: 'mon-early', name: 'Monday Group Early', class_type: 'GROUP', day_of_week: 1, start_time: '09:30' },
] as AcademyClass[];
const classFilter = (overrides: Partial<Parameters<typeof filterAndSortCoachClasses>[1]> = {}) =>
  filterAndSortCoachClasses(classes, { query: '', type: 'ALL', days: [], ...overrides }).map((cls) => cls.id);

test('classes search by name and filter by scheduled day and type together', () => {
  assert.deepEqual(classFilter({ query: 'tuesday' }), ['tue']);
  assert.deepEqual(classFilter({ days: [1] }), ['mon-early', 'mon-late']);
  assert.deepEqual(classFilter({ type: 'GROUP' }), ['mon-early', 'mon-late', 'sun']);
  assert.deepEqual(classFilter({ type: 'INDIVIDUAL' }), ['tue']);
  assert.deepEqual(classFilter({ query: 'monday', days: [1], type: 'GROUP' }), ['mon-early', 'mon-late']);
});

test('Monday is first; classes on a day sort from earliest time', () => {
  assert.deepEqual(WEEK_DAYS.map((day) => day.short), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.deepEqual(classFilter(), ['mon-early', 'mon-late', 'tue', 'sun']);
  assert.equal(getWeekStart('2026-10-04'), '2026-09-28');
  assert.deepEqual(getFixedWeekDays('2026-10-04').map((day) => day.dayLabel), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
});

test('Bingo row action keeps the existing student details handler', () => {
  const view = readFileSync(new URL('../src/components/coach/CoachStudentsView.tsx', import.meta.url), 'utf8');
  assert.match(view, /<button onClick=\{\(\) => openStudent\(student\.id\)\}[^>]*>Bingo<\/button>/);
});
