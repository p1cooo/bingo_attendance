import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db.js';
import { verifySessionAttendanceAccess } from '../server/auth.js';
import { activityEntry } from '../server/activity.js';
import { router } from '../server/routes.js';
import { OccurrenceError, planOccurrence, applyOccurrenceMode } from '../server/sessionOccurrence.js';
import type { AcademyClass, ClassSession, Coach, User } from '../src/types.js';

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

test('moved occurrence survives a stored-session reload and appears only on its new date', () => {
  const previousClasses = db.classes; const previousSessions = db.sessions;
  try {
    const moved = planOccurrence(original, cls, { session_date: '2026-09-27', start_time: '16:00', end_time: '17:30' }, [original], false);
    db.classes = new Map([[cls.id, cls]]);
    db.sessions = new Map([[moved.id, JSON.parse(JSON.stringify(moved))]]);
    db.ensureSessionsForMonth('2026-09');
    const sessions = [...db.sessions.values()].filter((session) => session.class_id === cls.id);
    assert.deepEqual(sessions.filter((session) => session.session_date === '2026-09-26'), []);
    assert.equal(sessions.filter((session) => session.session_date === '2026-09-27').length, 1);
    assert.equal(sessions.find((session) => session.session_date === '2026-09-27')?.id, original.id);
    assert.equal(cls.start_time, '14:00');
    assert.equal(cls.day_of_week, 6);
  } finally { db.classes = previousClasses; db.sessions = previousSessions; }
});

test('occurrence input rejects invalid local dates and time ranges', () => {
  for (const patch of [{ session_date: '2026-02-30' }, { session_date: '2026-09-27T00:00:00Z' },
    { start_time: '16:00', end_time: '15:00' }, { end_time: '25:00' }]) {
    assert.throws(() => planOccurrence(original, cls, patch, [original], false), (error: unknown) =>
      error instanceof OccurrenceError && error.code === 'INVALID_SESSION_TIME');
  }
});

test('replacement, cancellation and off-day transitions affect one occurrence and can be restored', () => {
  const coaches = new Map([['coach-1', { id: 'coach-1', is_active: true } as Coach],
    ['coach-2', { id: 'coach-2', is_active: true } as Coach], ['coach-3', { id: 'coach-3', is_active: false } as Coach]]);
  const replacement = applyOccurrenceMode(original, { session_type: 'REPLACEMENT_COACH', replacement_coach_id: 'coach-2' }, coaches);
  assert.equal(replacement.replacement_coach_id, 'coach-2');
  assert.equal(replacement.actual_coach_id, 'coach-2');
  assert.equal(applyOccurrenceMode(replacement, { session_type: 'NORMAL' }, coaches).replacement_coach_id, null);
  assert.equal(applyOccurrenceMode(replacement, { session_type: 'NORMAL' }, coaches).actual_coach_id, 'coach-1');
  assert.equal(applyOccurrenceMode(replacement, { session_type: 'NORMAL' }, coaches).status, 'SCHEDULED');
  assert.throws(() => applyOccurrenceMode(original, { session_type: 'REPLACEMENT_COACH' }, coaches), OccurrenceError);
  assert.throws(() => applyOccurrenceMode(original, { session_type: 'REPLACEMENT_COACH', replacement_coach_id: 'coach-3' }, coaches), OccurrenceError);
  for (const mode of ['COACH_CANCELLED', 'PLANNED_OFF_DAY'] as const) {
    const off = applyOccurrenceMode(original, { session_type: mode, cancellation_reason: '5th week', notes: 'Changed by coach' }, coaches);
    assert.equal(off.status, mode);
    assert.equal(off.notes, 'Changed by coach');
    const restored = applyOccurrenceMode(off, { session_type: 'NORMAL' }, coaches);
    assert.equal(restored.status, 'SCHEDULED');
    assert.equal(restored.cancellation_reason, '');
  }
  const completed = { ...original, status: 'COMPLETED' } as ClassSession;
  assert.equal(applyOccurrenceMode(completed, { session_type: 'NORMAL' }, coaches).status, 'COMPLETED');
  assert.equal(original.status, 'SCHEDULED');
  assert.equal(cls.default_coach_id, 'coach-1');
});

test('occurrence activity keeps actor, class, occurrence, and before/after details', () => {
  const actor = { id: 'user-coach-1', name: 'Coach One', role: 'COACH', coach_id: 'coach-1' } as User;
  const entry = activityEntry(actor, 'OCCURRENCE_RESCHEDULED', 'session', original.id, {
    classId: cls.id, previous_values: { session_date: original.session_date },
    new_values: { session_date: '2026-09-27' }, notes: 'Parent notified',
  });
  assert.equal(entry.actor_user_id, actor.id);
  assert.equal(entry.actor_role, 'COACH');
  assert.equal(entry.class_id, cls.id);
  assert.equal(entry.entity_id, original.id);
  assert.deepEqual(entry.previous_values, { session_date: '2026-09-26' });
  assert.deepEqual(entry.new_values, { session_date: '2026-09-27' });
  assert.ok(entry.created_at);
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

test('cancelled and planned off-day sessions refuse attendance without changing records', async () => {
  const previousSessions = db.sessions; const previousAttendance = db.attendance;
  try {
    db.attendance = new Map();
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/sessions/:id/attendance' && item.route.methods.post);
    const handler = layer.route.stack.at(-1).handle;
    for (const status of ['COACH_CANCELLED', 'PLANNED_OFF_DAY'] as const) {
      db.sessions = new Map([[original.id, { ...original, status }]]);
      let responseCode = 200;
      const response = { status(code: number) { responseCode = code; return this; }, json() { return this; } };
      await handler({ params: { id: original.id }, user: { id: 'admin', role: 'ADMIN' }, body: { student_id: 'student-1', status: 'ABSENT' } }, response);
      assert.equal(responseCode, 409);
      assert.equal(db.attendance.size, 0);
    }
  } finally { db.sessions = previousSessions; db.attendance = previousAttendance; }
});

test('server rejects conflicting mode and status before any Firestore write', async () => {
  const previousClasses = db.classes; const previousSessions = db.sessions;
  try {
    db.classes = new Map([[cls.id, cls]]);
    db.sessions = new Map([[original.id, original]]);
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/sessions/:id' && item.route.methods.put);
    const handler = layer.route.stack.at(-1).handle;
    let status = 200;
    const response = { status(code: number) { status = code; return this; }, json() { return this; } };
    await handler({ params: { id: original.id }, user: { id: 'coach-user', role: 'COACH', coach_id: 'coach-1' },
      body: { session_type: 'REPLACEMENT_COACH', status: 'PLANNED_OFF_DAY', expected_occurrence_revision: null } }, response);
    assert.equal(status, 400);
  } finally { db.classes = previousClasses; db.sessions = previousSessions; }
});

test('monthly report counts cancellation and planned off-day with no attendance marks', () => {
  const previous = [db.classes, db.sessions, db.attendance, db.coaches, db.students] as const;
  try {
    db.classes = new Map([[cls.id, cls]]);
    db.coaches = new Map([['coach-1', { id: 'coach-1', name: 'One' } as Coach]]);
    db.students = new Map();
    db.attendance = new Map();
    db.sessions = new Map([
      ['cancelled', { ...original, id: 'cancelled', status: 'COACH_CANCELLED', session_type: 'COACH_CANCELLED' }],
      ['off-day', { ...original, id: 'off-day', session_date: '2026-09-27', status: 'PLANNED_OFF_DAY', session_type: 'PLANNED_OFF_DAY' }],
    ]);
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/reports/monthly');
    let body: any;
    layer.route.stack.at(-1).handle({ query: { month: '2026-09' }, user: { role: 'ADMIN' } },
      { json(value: any) { body = value; return this; } });
    assert.equal(body.coaches_summary[0].cancelled_sessions_count, 1);
    assert.equal(body.coaches_summary[0].planned_off_days_count, 1);
    assert.equal(body.coaches_summary[0].total_sessions_taught, 0);
  } finally { [db.classes, db.sessions, db.attendance, db.coaches, db.students] = previous; }
});

test('attendance rejects paused students, unrelated students and invalid marks', async () => {
  const previous = [db.sessions, db.students, db.memberships, db.attendance] as const;
  try {
    db.sessions = new Map([[original.id, original]]);
    db.students = new Map([['student-1', { id: 'student-1' } as any], ['student-2', { id: 'student-2' } as any]]);
    db.memberships = new Map([['membership-1', { student_id: 'student-1', schedule_id: cls.id, status: 'PAUSED' } as any]]);
    db.attendance = new Map();
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/sessions/:id/attendance' && item.route.methods.post);
    const handler = layer.route.stack.at(-1).handle;
    const call = async (student_id: string, status: string) => {
      let code = 200;
      const response = { status(value: number) { code = value; return this; }, json() { return this; } };
      await handler({ params: { id: original.id }, user: { id: 'admin', role: 'ADMIN' },
        body: { student_id, status } }, response);
      return code;
    };
    assert.equal(await call('student-1', 'ABSENT'), 409);
    assert.equal(await call('student-2', 'ABSENT'), 403);
    db.memberships.set('membership-1', { student_id: 'student-1', schedule_id: cls.id, status: 'ACTIVE' } as any);
    assert.equal(await call('student-1', 'NOT_PRESENT'), 400);
    assert.equal(db.attendance.size, 0);
  } finally { [db.sessions, db.students, db.memberships, db.attendance] = previous; }
});

test('attendance route rejects a dated class pause while preserving other enrollments', async () => {
  const previous = [db.sessions, db.students, db.memberships, db.studentPauses, db.attendance] as const;
  try {
    db.sessions = new Map([[original.id, original]]);
    db.students = new Map([['student-1', { id: 'student-1' } as any]]);
    db.memberships = new Map([['membership-1', { id: 'membership-1', student_id: 'student-1', schedule_id: cls.id, status: 'ACTIVE' } as any]]);
    db.studentPauses = new Map([['pause-1', { id: 'pause-1', membership_id: 'membership-1', start_date: '2026-09-01', end_date: '2026-09-30' } as any]]);
    db.attendance = new Map();
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/sessions/:id/attendance' && item.route.methods.post);
    const handler = layer.route.stack.at(-1).handle;
    let status = 200;
    await handler({ params: { id: original.id }, user: { id: 'admin', role: 'ADMIN' }, body: { student_id: 'student-1', status: 'ABSENT' } },
      { status(code: number) { status = code; return this; }, json() { return this; } });
    assert.equal(status, 409);
    assert.equal(db.attendance.size, 0);
  } finally { [db.sessions, db.students, db.memberships, db.studentPauses, db.attendance] = previous; }
});
