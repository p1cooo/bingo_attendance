import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db.js';
import { verifySessionAttendanceAccess } from '../server/auth.js';
import { router } from '../server/routes.js';
import { OccurrenceError, planOccurrence } from '../server/sessionOccurrence.js';
import type { AcademyClass, ClassSession, User } from '../src/types.js';

const cls = { id: 'group-class', name: 'Chess', class_type: 'GROUP', day_of_week: 6,
  start_time: '14:00', end_time: '15:30', default_coach_id: 'coach-1', is_active: true } as AcademyClass;
const original = { id: 'occurrence-1', class_id: cls.id, schedule_id: cls.id, session_date: '2026-09-26',
  start_time: '14:00', end_time: '15:30', scheduled_coach_id: 'coach-1', actual_coach_id: 'coach-1',
  status: 'SCHEDULED' } as ClassSession;

test('group occurrence date, time, and combined changes keep class identity and recurring timetable', () => {
  const date = planOccurrence(original, cls, { session_date: '2026-09-27' }, [original], false);
  assert.equal(date.original_session_date, '2026-09-26');
  assert.equal(date.start_time, '14:00');
  const time = planOccurrence(original, cls, { start_time: '16:00', end_time: '17:30' }, [original], false);
  assert.equal(time.session_date, '2026-09-26');
  assert.equal(time.original_start_time, '14:00');
  const both = planOccurrence(original, cls, { session_date: '2026-09-27', start_time: '16:00', end_time: '17:30' }, [original], false);
  assert.equal(both.class_id, cls.id);
  assert.equal(both.original_session_date, original.session_date);
  assert.equal(both.original_start_time, original.start_time);
  assert.equal(cls.start_time, '14:00');
  assert.equal(cls.day_of_week, 6);
});

test('moving an occurrence does not regenerate the original; reset restores the same ID', () => {
  const previousClasses = db.classes; const previousSessions = db.sessions;
  try {
    const moved = planOccurrence(original, cls, { session_date: '2026-09-27', start_time: '16:00', end_time: '17:30' }, [original], false);
    db.classes = new Map([[cls.id, cls]]);
    db.sessions = new Map([[moved.id, moved]]);
    assert.equal(db.ensureSessionsForMonth('2026-09').some((session) => session.session_date === original.session_date), false);
    const reset = planOccurrence(moved, cls, { reset_to_regular_schedule: true }, [moved], false);
    assert.equal(reset.id, original.id);
    assert.equal(reset.class_id, original.class_id);
    assert.equal(reset.session_date, original.session_date);
    assert.equal(reset.start_time, original.start_time);
    assert.equal(reset.original_session_date, null);
    db.sessions.set(reset.id, reset);
    assert.equal(db.ensureSessionsForMonth('2026-09').some((session) => session.session_date === original.session_date), false);
  } finally { db.classes = previousClasses; db.sessions = previousSessions; }
});

test('attendance locks date, time, and replacement coach; regular-slot collisions are rejected', () => {
  assert.throws(() => planOccurrence(original, cls, { session_date: '2026-09-27' }, [original], true), (error: unknown) => error instanceof OccurrenceError && error.code === 'SESSION_WITH_ATTENDANCE_CANNOT_BE_RESCHEDULED');
  assert.throws(() => planOccurrence(original, cls, { start_time: '16:00' }, [original], true), OccurrenceError);
  assert.throws(() => planOccurrence(original, cls, { replacement_coach_id: 'coach-2' }, [original], true), OccurrenceError);
  assert.throws(() => planOccurrence(original, cls, { session_type: 'REPLACEMENT_COACH', actual_coach_id: 'coach-2' }, [original], true), OccurrenceError);
  assert.throws(() => planOccurrence(original, cls, { session_date: '2026-10-03' }, [original], false), (error: unknown) => error instanceof OccurrenceError && error.code === 'SESSION_DATE_CONFLICT');
});

test('normal coach can manage occurrence; substitute can mark it without permanent student access', async () => {
  const previousClasses = db.classes; const previousSessions = db.sessions;
  try {
    db.classes = new Map([[cls.id, cls]]);
    db.sessions = new Map([[original.id, { ...original, replacement_coach_id: 'coach-2', actual_coach_id: 'coach-2' }]]);
    const coach = (id: string) => ({ id: `user-${id}`, role: 'COACH', coach_id: id } as User);
    assert.equal(verifySessionAttendanceAccess(original.id, coach('coach-2')), true);
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/sessions/:id' && item.route.methods.put);
    const handler = layer.route.stack.at(-1).handle;
    let status = 200;
    const response = { status(code: number) { status = code; return this; }, json() { return this; } };
    await handler({ params: { id: original.id }, user: coach('coach-2'), body: { session_date: '2026-09-27' } }, response);
    assert.equal(status, 403);
  } finally { db.classes = previousClasses; db.sessions = previousSessions; }
});
