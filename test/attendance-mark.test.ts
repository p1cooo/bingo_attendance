import assert from 'node:assert/strict';
import test from 'node:test';
import { runAttendanceMark, withAttendanceRecord } from '../src/lib/attendanceMark.js';
import { AttendanceRecord, ClassSession } from '../src/types.js';

const session = { id: 'session-1', attendance_records: [] } as unknown as ClassSession;
const record = (status: 'PRESENT' | 'ABSENT'): AttendanceRecord => ({
  id: 'attendance-1', session_id: 'session-1', student_id: 'student-1',
  attendance_type: 'REGULAR', status, marked_at: '2026-09-28T00:00:00Z', marked_by_user_id: 'coach-1',
});

test('a rapid double click marks once and shows the selected status before save finishes', async () => {
  const pending = new Set<string>();
  let view = session;
  let saveCount = 0;
  let completeSave!: (value: AttendanceRecord) => void;
  const save = () => { saveCount++; return new Promise<AttendanceRecord>((resolve) => { completeSave = resolve; }); };
  const actions = {
    optimistic: () => { view = withAttendanceRecord(view, 'student-1', record('PRESENT')); },
    save,
    commit: (value: AttendanceRecord) => { view = withAttendanceRecord(view, 'student-1', value); },
    rollback: () => { view = withAttendanceRecord(view, 'student-1'); },
  };

  const first = runAttendanceMark(pending, 'student-1', actions);
  assert.equal(view.attendance_records?.[0].status, 'PRESENT');
  assert.equal(pending.has('student-1'), true);
  assert.equal(await runAttendanceMark(pending, 'student-1', actions), false);
  assert.equal(saveCount, 1);
  completeSave(record('PRESENT'));
  assert.equal(await first, true);
  assert.equal(pending.size, 0);
  assert.equal(view.attendance_records?.length, 1);
});

test('failed save restores the prior status and allows a retry', async () => {
  const pending = new Set<string>();
  let view = withAttendanceRecord(session, 'student-1', record('ABSENT'));
  let saveCount = 0;
  const actions = {
    optimistic: () => { view = withAttendanceRecord(view, 'student-1', record('PRESENT')); },
    save: async () => { saveCount++; if (saveCount === 1) throw new Error('Firestore unavailable'); return record('PRESENT'); },
    commit: (value: AttendanceRecord) => { view = withAttendanceRecord(view, 'student-1', value); },
    rollback: () => { view = withAttendanceRecord(view, 'student-1', record('ABSENT')); },
  };

  await assert.rejects(runAttendanceMark(pending, 'student-1', actions), /Firestore unavailable/);
  assert.equal(view.attendance_records?.[0].status, 'ABSENT');
  assert.equal(pending.size, 0);
  assert.equal(await runAttendanceMark(pending, 'student-1', actions), true);
  assert.equal(view.attendance_records?.[0].status, 'PRESENT');
  assert.equal(saveCount, 2);
});
