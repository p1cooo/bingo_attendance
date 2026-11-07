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
  // A deleted/closed class: the coach must pick one of their own active classes.
  db.classes.get('class-sat')!.is_active = false;
  db.classes.set('class-mine', { id: 'class-mine', name: 'Sunday', default_coach_id: 'coach-a', is_active: true } as any);
  db.classes.set('class-theirs', { id: 'class-theirs', name: 'Monday', default_coach_id: 'coach-b', is_active: true } as any);
  db.schedules.set('sched-mine', { id: 'sched-mine', class_id: 'class-mine', is_active: true, status: 'ACTIVE' } as any);
  db.schedules.set('sched-theirs', { id: 'sched-theirs', class_id: 'class-theirs', is_active: true, status: 'ACTIVE' } as any);
  assert.equal((registrationPlan(coachA, 'walkin-a', {}) as any).code, 'CHOOSE_CLASS');
  assert.deepEqual(registrationPlan(coachA, 'walkin-a', { student_id: 'STU-9999', schedule_ids: ['sched-mine'] }), { student_id: '', schedule_ids: ['sched-mine'] });
  assert.equal((registrationPlan(coachA, 'walkin-a', { schedule_ids: ['sched-theirs'] }) as any).status, 400);
  assert.equal((registrationPlan(coachA, 'walkin-a', { schedule_ids: ['sched-sat'] }) as any).status, 400); // the closed class itself
}));

test('remove (did not join): reason required, recorder or admin only, nothing changes if the save fails', () => isolated(async () => {
  const path = '/students/:id/did-not-join';
  assert.equal((await call(path, 'post', { params: { id: 'walkin-a' }, user: coachA, body: { reason: '' } })).status, 400);
  assert.equal((await call(path, 'post', { params: { id: 'walkin-a' }, user: coachB, body: { reason: 'did not continue' } })).status, 403);
  assert.equal((await call(path, 'post', { params: { id: 'official' }, user: admin, body: { reason: 'did not continue' } })).body.code, 'ALREADY_REGISTERED');
  // No Firestore in tests, so the save fails: the walk-in must be left exactly as it was.
  const failed = await call(path, 'post', { params: { id: 'walkin-a' }, user: coachA, body: { reason: 'did not continue' } });
  assert.equal(failed.status, 503);
  assert.equal(db.students.get('walkin-a')!.status, 'ACTIVE');
  assert.equal(db.students.get('walkin-a')!.did_not_join, undefined);
  assert.equal(db.attendance.size, 2); // attendance is never touched
}));

test('a walk-in marked did not join drops off the lists but keeps attendance', () => isolated(async () => {
  db.students.set('walkin-a', { ...db.students.get('walkin-a')!, status: 'INACTIVE', did_not_join: { reason: 'x', at: '', by_user_id: coachA.id } });
  assert.deepEqual((await call('/students/unregistered', 'get', { user: coachA })).body, []);
  assert.ok(!(await call('/students/unregistered', 'get', { user: admin })).body.some((row: any) => row.id === 'walkin-a'));
  assert.ok(db.attendance.has('att-a'));
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

test('trial fees: each Present walk-in session from 1 Nov needs an admin amount; Absent, October and test students are not billed', () => isolated(async () => {
  const { financeDetail } = await import('../server/finance.js');
  const saved = [db.studentFees, db.studentPayments, db.studentAdjustments, db.membershipBillingReviews, db.studentPauses] as const;
  try {
    db.studentFees = new Map(); db.studentPayments = new Map(); db.studentAdjustments = new Map(); db.membershipBillingReviews = new Map(); db.studentPauses = new Map();
    db.sessions.set('session-oct', { id: 'session-oct', schedule_id: 'sched-sat', class_id: 'class-sat', session_date: '2026-10-10', status: 'COMPLETED' } as any);
    db.sessions.set('session-2', { id: 'session-2', schedule_id: 'sched-sat', class_id: 'class-sat', session_date: '2026-11-14', status: 'SCHEDULED' } as any);
    db.attendance.set('att-a-oct', { id: 'att-a-oct', session_id: 'session-oct', student_id: 'walkin-a', status: 'PRESENT', attendance_type: 'REGULAR' } as any);
    db.attendance.set('att-a-absent', { id: 'att-a-absent', session_id: 'session-2', student_id: 'walkin-a', status: 'ABSENT', attendance_type: 'REGULAR' } as any);
    const lines = () => financeDetail('walkin-a', '2026-11')!.months.flatMap((m) => m.lines).filter((l: any) => l.trial);
    assert.deepEqual(lines().map((l: any) => l.trial.date), ['2026-11-07']); // only the Present November session
    assert.equal(lines()[0].pending_finance_review, true);
    assert.equal(financeDetail('walkin-a', '2026-11')!.pending_finance_review, true);
    // Admin sets RM50: it becomes the charge.
    db.membershipBillingReviews.set('r1', { id: 'r1', student_id: 'walkin-a', membership_id: 'trial:att-a', month: '2026-11', amount_cents: 5000, reason: '', created_by_user_id: 'admin-user', created_at: '2026-11-08T00:00:00Z' });
    assert.equal(lines()[0].amount_cents, 5000);
    assert.equal(lines()[0].pending_finance_review, false);
    // Trial decisions are not shown as partial-month decisions.
    assert.equal(financeDetail('walkin-a', '2026-11')!.partial_month_reviews.length, 0);
    // Removing (did not join) keeps the trial fee.
    db.students.set('walkin-a', { ...db.students.get('walkin-a')!, status: 'INACTIVE', did_not_join: { reason: 'x', at: '', by_user_id: coachA.id } });
    assert.equal(lines()[0].amount_cents, 5000);
    // After registration only the stamped trial marks stay trials.
    db.students.set('walkin-a', { ...db.students.get('walkin-a')!, status: 'ACTIVE', is_unregistered: false, trial_attendance_ids: ['att-a'] });
    db.attendance.set('att-a-later', { id: 'att-a-later', session_id: 'session-2', student_id: 'walkin-a', status: 'PRESENT', attendance_type: 'REGULAR' } as any);
    assert.deepEqual(lines().map((l: any) => l.trial.attendance_id), ['att-a']);
    // "ZZ Test" students are never billed.
    db.students.set('walkin-b', { ...db.students.get('walkin-b')!, full_name: 'ZZ Test Walk In' });
    assert.equal(financeDetail('walkin-b', '2026-11')!.months.length, 0);
    // The Finance list shows walk-ins only when they have a trial session to bill.
    db.students.set('walkin-b', { ...db.students.get('walkin-b')!, full_name: 'Walk In B' });
    db.attendance.delete('att-b');
    const list = await call('/finance/students', 'get', { user: admin });
    assert.ok(list.body.students.some((row: any) => row.student.id === 'walkin-a'));
    assert.ok(!list.body.students.some((row: any) => row.student.id === 'walkin-b'));
  } finally { [db.studentFees, db.studentPayments, db.studentAdjustments, db.membershipBillingReviews, db.studentPauses] = saved; }
}));

test('trial fee route: RM0 needs a reason, and only real trial sessions can be priced', () => isolated(async () => {
  const path = '/finance/students/:id/trial-fee';
  const key = 'abcdef12-3456';
  assert.equal((await call(path, 'post', { params: { id: 'walkin-a' }, user: admin, body: { attendance_id: 'att-a', amount_cents: 0, reason: '', idempotency_key: key } })).status, 400);
  assert.match((await call(path, 'post', { params: { id: 'walkin-a' }, user: admin, body: { attendance_id: 'nope', amount_cents: 5000, idempotency_key: key } })).body.error, /not a billable trial/);
  assert.equal((await call(path, 'post', { params: { id: 'walkin-a' }, user: admin, body: { attendance_id: 'att-a', amount_cents: -1, idempotency_key: key } })).status, 400);
}));
