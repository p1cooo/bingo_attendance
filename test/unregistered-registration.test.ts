import assert from 'node:assert/strict';
import test from 'node:test';
import { router, registrationPlan, unregisteredStudentOrigin } from '../server/routes.js';
import { db } from '../server/db.js';
import type { User } from '../src/types.js';

const coachA = { id: 'coach-a-user', role: 'COACH', coach_id: 'coach-a', is_active: true, name: 'Coach A' } as User;
const coachB = { id: 'coach-b-user', role: 'COACH', coach_id: 'coach-b', is_active: true, name: 'Coach B' } as User;
const admin = { id: 'admin-user', role: 'ADMIN', is_active: true, name: 'Admin' } as User;

const keys = ['students', 'parents', 'classes', 'schedules', 'sessions', 'attendance', 'memberships', 'activityLogs', 'auditLogs'] as const;
async function isolated(fn: () => Promise<void> | void) {
  const saved = keys.map((key) => (db as any)[key]);
  const save = db.saveToDisk;
  db.saveToDisk = () => {}; // never write the local database file from a test
  try {
    db.students = new Map([
      // recorded by coach A (new field)
      ['walkin-a', { id: 'walkin-a', student_id: 'UNREG-AAAA', full_name: 'Walk In A', status: 'ACTIVE', is_unregistered: true, recorded_by_user_id: coachA.id, parent_id: 'parent-a', created_at: '' } as any],
      // older record: no field, only the roll-call audit entry says coach B recorded it
      ['walkin-b', { id: 'walkin-b', student_id: 'UNREG-BBBB', full_name: 'Walk In B', status: 'ACTIVE', is_unregistered: true, created_at: '' } as any],
      ['official', { id: 'official', student_id: 'STU-0001', full_name: 'Official', status: 'ACTIVE', created_at: '' } as any],
    ]);
    db.parents = new Map([['parent-a', { id: 'parent-a', name: "Walk In A's Parent", phone: '012-345 6789', created_at: '' } as any]]);
    db.classes = new Map([['class-sat', { id: 'class-sat', name: 'Saturday 130pm-3pm', default_coach_id: 'coach-a', is_active: true } as any]]);
    db.schedules = new Map([['sched-sat', { id: 'sched-sat', class_id: 'class-sat', is_active: true, status: 'ACTIVE' } as any]]);
    db.sessions = new Map([['session-1', { id: 'session-1', schedule_id: 'sched-sat', class_id: 'class-sat', session_date: '2026-11-07', status: 'SCHEDULED' } as any]]);
    db.attendance = new Map([
      ['att-a', { id: 'att-a', session_id: 'session-1', student_id: 'walkin-a', status: 'PRESENT', attendance_type: 'REGULAR', marked_by_user_id: coachA.id } as any],
      ['att-b', { id: 'att-b', session_id: 'session-1', student_id: 'walkin-b', status: 'PRESENT', attendance_type: 'REGULAR', marked_by_user_id: coachA.id } as any],
    ]);
    db.memberships = new Map();
    db.activityLogs = [];
    db.auditLogs = [{ id: 'audit-b', student_id: 'walkin-b', changed_by_user_id: coachB.id, reason: 'Unregistered student recorded (UNREG-BBBB)' } as any];
    await fn();
  } finally {
    keys.forEach((key, index) => { (db as any)[key] = saved[index]; });
    db.saveToDisk = save;
  }
}

const handler = (path: string, method: 'get' | 'post') =>
  (router as any).stack.find((item: any) => item.route?.path === path && item.route.methods[method]).route.stack.at(-1).handle;
async function call(path: string, method: 'get' | 'post', req: any) {
  let status = 200; let body: any;
  await handler(path, method)(req, { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } });
  return { status, body };
}

test('recorder is found from the new field, or the roll-call audit entry for older walk-ins', () => isolated(() => {
  assert.equal(unregisteredStudentOrigin('walkin-a').recordedBy, coachA.id);
  assert.equal(unregisteredStudentOrigin('walkin-b').recordedBy, coachB.id);
  assert.deepEqual(unregisteredStudentOrigin('walkin-a').scheduleIds, ['sched-sat']);
}));

test('coaches list only the unregistered students they recorded; admins list all', () => isolated(async () => {
  const mine = await call('/students/unregistered', 'get', { user: coachA });
  assert.deepEqual(mine.body.map((row: any) => row.id), ['walkin-a']);
  assert.equal(mine.body[0].class_name, 'Saturday 130pm-3pm');
  assert.equal(mine.body[0].parent_phone, '012-345 6789');
  assert.equal(mine.body[0].class_active, true);
  const theirs = await call('/students/unregistered', 'get', { user: coachB });
  assert.deepEqual(theirs.body.map((row: any) => row.id), ['walkin-b']);
  const all = await call('/students/unregistered', 'get', { user: admin });
  assert.deepEqual(all.body.map((row: any) => row.id).sort(), ['walkin-a', 'walkin-b']);
}));

test('coach registration: automatic STU code, class locked to the walk-in class, recorder only', () => isolated(() => {
  // A coach cannot choose the STU number or a different class.
  assert.deepEqual(registrationPlan(coachA, 'walkin-a', { student_id: 'STU-9999', schedule_ids: ['other'] }), { student_id: '', schedule_ids: ['sched-sat'] });
  assert.equal((registrationPlan(coachA, 'walkin-b', {}) as any).status, 403); // recorded by coach B
  assert.equal((registrationPlan(coachA, 'official', {}) as any).code, 'ALREADY_REGISTERED');
  // Admins keep their choices, and default to the walk-in class.
  assert.deepEqual(registrationPlan(admin, 'walkin-b', { student_id: 'STU-0777', schedule_ids: ['sched-sat'] }), { student_id: 'STU-0777', schedule_ids: ['sched-sat'] });
  assert.deepEqual(registrationPlan(admin, 'walkin-b', {}), { student_id: undefined, schedule_ids: ['sched-sat'] });
  // A closed class blocks coach registration instead of silently enrolling nowhere.
  db.classes.get('class-sat')!.is_active = false;
  assert.equal((registrationPlan(coachA, 'walkin-a', {}) as any).code, 'TRIAL_CLASS_INACTIVE');
}));

test('registration that cannot reach the database leaves the student, parent and classes unchanged', () => isolated(async () => {
  // No Firestore in tests, so the STU reservation fails like a real outage would.
  const result = await call('/students/:id/convert-registered', 'post', { params: { id: 'walkin-a' }, user: coachA, body: { full_name: 'Walk In A Renamed', parent_name: 'Mum' } });
  assert.ok(result.status >= 400, `expected a failure, got ${result.status}`);
  const student = db.students.get('walkin-a')!;
  assert.equal(student.is_unregistered, true);
  assert.equal(student.student_id, 'UNREG-AAAA');
  assert.equal(student.full_name, 'Walk In A');
  assert.equal(db.parents.get('parent-a')!.name, "Walk In A's Parent");
  assert.equal(db.memberships.size, 0);
}));

test('Bingo Space links cannot be made for an unregistered student', () => isolated(async () => {
  const result = await call('/students/:id/portal-invite', 'post', { params: { id: 'walkin-a' }, user: admin });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'UNREGISTERED_STUDENT');
}));
