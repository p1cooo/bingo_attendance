import assert from 'node:assert/strict';
import test from 'node:test';
import { AttendanceSaves, shouldWarnOnUnload } from '../src/lib/attendanceSaves.js';
import type { AttendanceRecord, ClassSession } from '../src/types.js';

const record = (studentId: string): AttendanceRecord => ({
  id: `attendance-${studentId}`, session_id: 'session-1', student_id: studentId,
  status: 'PRESENT', attendance_type: 'REGULAR', marked_at: '2026-09-29T00:00:00Z', marked_by_user_id: 'coach-1',
});
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('one optimistic mark stays pending through navigation and completes globally', async () => {
  const saves = new AttendanceSaves();
  let finish!: (value: { attendance_record: AttendanceRecord }) => void;
  const mark = { sessionId: 'session-1', studentId: 'a', studentName: 'A', optimisticRecord: record('a'),
    save: () => new Promise<{ attendance_record: AttendanceRecord }>((resolve) => { finish = resolve; }) };
  assert.equal(saves.submit(mark), true);
  assert.equal(saves.submit(mark), false);
  assert.equal(saves.getSnapshot().pending, 1);
  assert.equal(shouldWarnOnUnload(saves.getSnapshot()), true);
  // A freshly mounted page can still show the optimistic status.
  const fetched = { id: 'session-1', attendance_records: [] } as unknown as ClassSession;
  assert.equal(saves.overlay(fetched).attendance_records?.[0].status, 'PRESENT');
  finish({ attendance_record: record('a') }); await tick();
  assert.deepEqual(saves.getSnapshot(), { pending: 0, saved: 1, failedNames: [] });
  assert.equal(shouldWarnOnUnload(saves.getSnapshot()), false);
  assert.equal(saves.overlay({ ...fetched, attendance_records: [{ ...record('a'), status: 'ABSENT', marked_at: '2026-09-30T00:00:00Z' }] }).attendance_records?.[0].status, 'ABSENT');
});

test('14 rapid marks use one aggregate state; one failure retries without resending 13 successes', async () => {
  const saves = new AttendanceSaves();
  const complete: Array<(value: { attendance_record: AttendanceRecord }) => void> = [];
  const reject: Array<(error: Error) => void> = [];
  const calls = Array(14).fill(0);
  for (let i = 0; i < 14; i++) {
    const studentId = `student-${i}`;
    saves.submit({ sessionId: 'session-1', studentId, studentName: `Student ${i}`, optimisticRecord: record(studentId),
      save: () => { calls[i]++; return new Promise((resolve, rejectSave) => {
        complete[i] = resolve; reject[i] = rejectSave;
      }); },
    });
  }
  assert.equal(saves.getSnapshot().pending, 14);
  for (let i = 0; i < 13; i++) complete[i]({ attendance_record: record(`student-${i}`) });
  reject[13](new Error('Firestore unavailable')); await tick();
  assert.deepEqual(saves.getSnapshot(), { pending: 0, saved: 13, failedNames: ['Student 13'] });
  assert.equal(saves.overlay({ id: 'session-1', attendance_records: [] } as unknown as ClassSession).attendance_records?.length, 13);
  assert.equal(shouldWarnOnUnload(saves.getSnapshot()), false);
  saves.retryFailed();
  assert.equal(saves.getSnapshot().pending, 1);
  assert.deepEqual(calls, [...Array(13).fill(1), 2]);
  complete[13]({ attendance_record: record('student-13') }); await tick();
  assert.deepEqual(saves.getSnapshot(), { pending: 0, saved: 14, failedNames: [] });
});

test('unload warning is attached only while a real write is pending', async () => {
  const priorWindow = (globalThis as any).window;
  const events: string[] = [];
  (globalThis as any).window = {
    addEventListener: (name: string) => events.push(`add:${name}`),
    removeEventListener: (name: string) => events.push(`remove:${name}`),
  };
  try {
    const saves = new AttendanceSaves();
    let finish!: (value: { attendance_record: AttendanceRecord }) => void;
    assert.deepEqual(events, []);
    saves.submit({ sessionId: 'session-1', studentId: 'a', studentName: 'A', optimisticRecord: record('a'),
      save: () => new Promise((resolve) => { finish = resolve; }) });
    assert.deepEqual(events, ['add:beforeunload']);
    finish({ attendance_record: record('a') }); await tick();
    assert.deepEqual(events, ['add:beforeunload', 'remove:beforeunload']);
  } finally { (globalThis as any).window = priorWindow; }
});
