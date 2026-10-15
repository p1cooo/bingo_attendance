import assert from 'node:assert/strict';
import test from 'node:test';
import { coachAttendanceCounts } from '../src/lib/coachAttendanceCounts.js';
import { ClassSession } from '../src/types.js';

const session = (overrides: Partial<ClassSession> = {}): ClassSession => ({
  id: 'session', schedule_id: 'schedule', class_id: 'class', session_date: '2026-10-15',
  start_time: '10:00', end_time: '11:00', scheduled_coach_id: 'coach', actual_coach_id: 'coach', status: 'SCHEDULED',
  enrolled_students: Array.from({ length: 14 }, (_, i) => ({ id: `student-${i}` } as any)),
  attendance_records: [], ...overrides,
});

test('unmarked counts the eligible roster while attendance activation is unset', () => {
  const counts = coachAttendanceCounts(session({ attendance_expected: false }));
  assert.deepEqual(counts, { eligible: 14, present: 0, absent: 0, excused: 0, unmarked: 14 });
});

test('marks, bookings, replacements and pauses stay consistent after a session refresh', () => {
  const current = session({
    enrolled_students: [{ id: 'one' }, { id: 'two' }, { id: 'three' }] as any,
    paused_students: [{ id: 'pause', student_id: 'three', membership_id: 'm3', start_date: '2026-10-01', end_date: null }],
    attendance_records: [
      { student_id: 'one', status: 'PRESENT' },
      { student_id: 'two', status: 'BOOKED' },
      { student_id: 'extra', status: 'LATE' },
    ] as any,
  });
  assert.deepEqual(coachAttendanceCounts(current), { eligible: 3, present: 2, absent: 0, excused: 0, unmarked: 1 });
  current.attendance_records = [...current.attendance_records!, { student_id: 'two', status: 'ABSENT' } as any];
  assert.deepEqual(coachAttendanceCounts(current), { eligible: 3, present: 2, absent: 1, excused: 0, unmarked: 0 });
});

test('approved leave is counted as excused, never unmarked or absent', () => {
  const current = session({ attendance_records: [{ student_id: 'student-0', status: 'EXCUSED' }] as any });
  assert.deepEqual(coachAttendanceCounts(current), { eligible: 14, present: 0, absent: 0, excused: 1, unmarked: 13 });
});

test('off days exempt the roster without marking students absent', () => {
  assert.deepEqual(coachAttendanceCounts(session({ status: 'PLANNED_OFF_DAY' })), { eligible: 14, present: 0, absent: 0, excused: 0, unmarked: 0 });
});
