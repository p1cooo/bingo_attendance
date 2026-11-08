import assert from 'node:assert/strict';
import test from 'node:test';
import { router, planCreditImport } from '../server/routes.js';
import { db } from '../server/db.js';
import { replacementCreditChange, replacementCreditImpact, resetClassReplacementCredits, classEarnsReplacementCredit } from '../server/replacementCredits.js';
import { parseCreditPaste } from '../src/lib/creditPaste.js';
import type { AttendanceRecord, User } from '../src/types.js';

const coachA = { id: 'coach-a-user', role: 'COACH', coach_id: 'coach-a', is_active: true, name: 'Coach A' } as User;
const admin = { id: 'admin-user', role: 'ADMIN', is_active: true, name: 'Admin' } as User;
const keys = ['students', 'classes', 'schedules', 'sessions', 'attendance', 'replacementCredits', 'activityLogs'] as const;

async function isolated(fn: () => Promise<void> | void) {
  const saved = keys.map((key) => (db as any)[key]);
  const save = db.saveToDisk;
  db.saveToDisk = () => {};
  try {
    db.students = new Map([
      ['s1', { id: 's1', student_id: 'STU-0001', full_name: 'Ali', status: 'ACTIVE', created_at: '' } as any],
      ['s2', { id: 's2', student_id: 'STU-0002', full_name: 'Bao', status: 'ACTIVE', created_at: '' } as any],
      ['gone', { id: 'gone', student_id: 'STU-0003', full_name: 'Gone', status: 'INACTIVE', created_at: '' } as any],
      ['walkin', { id: 'walkin', student_id: 'UNREG-ABC', full_name: 'Walk', status: 'ACTIVE', is_unregistered: true, created_at: '' } as any],
    ]);
    db.classes = new Map([
      ['school', { id: 'school', name: 'Selayang School', class_type: 'GROUP', default_coach_id: 'coach-a', is_active: true } as any],
      ['normal', { id: 'normal', name: 'Saturday 930am', class_type: 'GROUP', default_coach_id: 'coach-a', is_active: true } as any],
      ['other', { id: 'other', name: 'Other coach', class_type: 'GROUP', default_coach_id: 'coach-b', is_active: true } as any],
      ['indiv', { id: 'indiv', name: 'Leo Individual', class_type: 'INDIVIDUAL', default_coach_id: 'coach-a', is_active: true } as any],
    ]);
    db.schedules = new Map();
    db.sessions = new Map([
      ['sch-1', { id: 'sch-1', class_id: 'school', schedule_id: 'school', session_date: '2026-10-10', status: 'COMPLETED' } as any],
      ['sch-2', { id: 'sch-2', class_id: 'school', schedule_id: 'school', session_date: '2026-10-17', status: 'COMPLETED' } as any],
      ['nor-1', { id: 'nor-1', class_id: 'normal', schedule_id: 'normal', session_date: '2026-10-10', status: 'COMPLETED' } as any],
    ]);
    const absent = (id: string, session: string, student: string, impact = 1) =>
      [id, { id, session_id: session, student_id: student, status: 'ABSENT', attendance_type: 'REGULAR', marked_at: '2026-10-10T10:00:00Z', marked_by_user_id: 'c', replacement_credit_impact: impact } as AttendanceRecord] as const;
    db.attendance = new Map([absent('a1', 'sch-1', 's1'), absent('a2', 'sch-2', 's1'), absent('a3', 'sch-1', 's2'), absent('a4', 'nor-1', 's2'), absent('a5', 'sch-2', 's2', 0)]);
    const credit = (id: string, student: string, amount: number, reason: string, attendance?: string) =>
      [id, { id, student_id: student, amount, reason, attendance_id: attendance, created_at: '', effective_at: '', idempotency_key: id } as any] as const;
    db.replacementCredits = new Map([
      credit('c1', 's1', 1, 'GROUP_ABSENCE_CREDIT', 'a1'), credit('c2', 's1', 1, 'GROUP_ABSENCE_CREDIT', 'a2'),
      credit('c3', 's2', 1, 'GROUP_ABSENCE_CREDIT', 'a3'), credit('c4', 's2', 1, 'GROUP_ABSENCE_CREDIT', 'a4'),
      credit('c5', 's2', -1, 'REPLACEMENT_BOOKING_DEBIT'), // s2 already used a replacement
    ]);
    db.activityLogs = [];
    await fn();
  } finally {
    keys.forEach((key, index) => { (db as any)[key] = saved[index]; });
    db.saveToDisk = save;
  }
}

const handler = (path: string, method: 'get' | 'post' | 'put') =>
  (router as any).stack.find((item: any) => item.route?.path === path && item.route.methods[method]).route.stack.at(-1).handle;
async function call(path: string, method: 'get' | 'post' | 'put', req: any) {
  let status = 200; let body: any;
  await handler(path, method)(req, { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } });
  return { status, body };
}

test('a class with replacements off gives no credit for an absence; replacement bookings still use a credit', () => {
  const absence = { status: 'ABSENT', attendance_type: 'REGULAR' } as const;
  assert.equal(replacementCreditImpact(absence, 'GROUP'), 1);
  assert.equal(replacementCreditImpact(absence, 'GROUP', false), 0);
  assert.equal(replacementCreditImpact({ status: 'BOOKED', attendance_type: 'REPLACEMENT' }, 'GROUP', false), -1);
  assert.equal(classEarnsReplacementCredit({}), true);
  assert.equal(classEarnsReplacementCredit({ replacements_allowed: false }), false);
});

test('a reset absence cannot be reversed twice when it is later edited', () => {
  const previous = { id: 'a1', status: 'ABSENT', attendance_type: 'REGULAR', replacement_credit_impact: 1, replacement_credit_revision: 1 } as AttendanceRecord;
  const reset = replacementCreditChange(previous, previous, 'GROUP', false);
  assert.deepEqual([reset.nextImpact, reset.delta, reset.revision], [0, -1, 2]);
  const stamped = { ...previous, replacement_credit_impact: 0, replacement_credit_revision: 2 };
  assert.equal(replacementCreditChange(stamped, { ...stamped, status: 'PRESENT' }, 'GROUP', false).delta, 0);
});

test('switching a class off takes back only that class\'s credits, flags students who used replacements, and is safe to re-run', () => isolated(async () => {
  const calls: any[] = [];
  // Stand-in for the Firestore transaction: stamp the attendance and add the reversal, like the real one.
  const persist = async (input: any) => {
    calls.push(input);
    if (input.attendance.id === 'fail-me') throw new Error('offline');
    db.attendance.set(input.attendance.id, { ...input.attendance, replacement_credit_impact: 0 });
    db.replacementCredits.set(`${input.attendance.id}:rev`, { id: `${input.attendance.id}:rev`, student_id: input.attendance.student_id, amount: -1, reason: 'REVERSAL', created_at: '', effective_at: '', idempotency_key: 'x' } as any);
    return { attendance: input.attendance, commitments: [] };
  };
  const result = await resetClassReplacementCredits('school', persist as any);
  assert.deepEqual(calls.map((c) => c.attendance.id).sort(), ['a1', 'a2', 'a3']); // not a4 (normal class) or a5 (already 0)
  assert.ok(calls.every((c) => c.earnsCredit === false));
  assert.equal(result.removed, 3);
  const ali = result.students.find((s) => s.student_id === 's1')!;
  const bao = result.students.find((s) => s.student_id === 's2')!;
  assert.deepEqual([ali.removed, ali.balance_after, ali.had_replacements], [2, 0, false]);
  assert.deepEqual([bao.removed, bao.balance_after, bao.had_replacements], [1, 0, true]); // keeps the normal-class credit, minus the used one
  calls.length = 0;
  assert.equal((await resetClassReplacementCredits('school', persist as any)).removed, 0);
  assert.equal(calls.length, 0);
}));

test('switch route: own group classes only, and nothing changes if the save fails', () => isolated(async () => {
  const path = '/classes/:id/replacements';
  assert.equal((await call(path, 'put', { params: { id: 'other' }, user: coachA, body: { allowed: false } })).status, 403);
  assert.equal((await call(path, 'put', { params: { id: 'indiv' }, user: coachA, body: { allowed: false } })).status, 400);
  assert.equal((await call(path, 'put', { params: { id: 'school' }, user: coachA, body: { allowed: 'no' } })).status, 400);
  const failed = await call(path, 'put', { params: { id: 'school' }, user: coachA, body: { allowed: false } }); // no Firestore in tests
  assert.equal(failed.status, 503);
  assert.equal(db.classes.get('school')!.replacements_allowed, undefined);
  assert.equal(db.attendance.get('a1')!.replacement_credit_impact, 1);
}));

test('import preview: sets the balance to the declared total and catches bad rows', () => isolated(() => {
  const rows = planCreditImport([
    { student_id: 'stu-0001', credits: '5', note: 'Coach A' }, // current 2 -> +3
    { student_id: 'STU-0002', credits: 0 },                     // current 1 -> -1
    { student_id: 'STU-9999', credits: 1 },
    { student_id: 'STU-0003', credits: 1 },
    { student_id: 'UNREG-ABC', credits: 1 },
    { student_id: 'STU-0001', credits: 2 },
    { student_id: '', credits: 'two' },
  ]);
  // STU-0001 is listed twice, so it is an error (and changes nothing); STU-0002 goes 1 -> 0.
  assert.deepEqual([rows[0].current, rows[0].declared, rows[0].change], [2, 5, 0]);
  assert.match(rows[0].errors.join(), /more than once/);
  assert.deepEqual([rows[1].current, rows[1].declared, rows[1].change], [1, 0, -1]);
  assert.deepEqual(rows[1].errors, []);
  assert.match(rows[2].errors.join(), /No student/);
  assert.match(rows[3].errors.join(), /inactive/);
  assert.match(rows[4].errors.join(), /Unregistered/);
  assert.match(rows[6].errors.join(), /Missing STU ID/);
  assert.match(rows[6].errors.join(), /whole number/);
  const ok = planCreditImport([{ student_id: 'STU-0001', credits: '5' }]);
  assert.deepEqual([ok[0].change, ok[0].errors], [3, []]);
}));

test('import commit: refuses errors and bad ids; unchanged students are skipped; failures are reported, not hidden', () => isolated(async () => {
  const path = '/admin/replacement-credits/import/commit';
  assert.equal((await call(path, 'post', { user: admin, body: { batch_id: 'x', rows: [{ student_id: 'STU-0001', credits: 2 }] } })).status, 400);
  assert.equal((await call(path, 'post', { user: admin, body: { batch_id: 'batch-12345', rows: [{ student_id: 'STU-9999', credits: 2 }] } })).status, 400);
  const result = await call(path, 'post', { user: admin, body: { batch_id: 'batch-12345', rows: [{ student_id: 'STU-0001', credits: 2 }, { student_id: 'STU-0002', credits: 4 }] } });
  assert.equal(result.status, 200);
  assert.equal(result.body.results.find((r: any) => r.student_code === 'STU-0001').status, 'NO_CHANGE');
  assert.equal(result.body.results.find((r: any) => r.student_code === 'STU-0002').status, 'FAILED'); // no Firestore in tests
  assert.equal(result.body.failed, 1);
}));

test('pasted rows from Excel or Sheets are read, with or without a header', () => {
  assert.deepEqual(parseCreditPaste('STU ID\tCredits\tNote\nSTU-0001\t3\tfrom Sept\nSTU-0002\t0\n'), [
    { student_id: 'STU-0001', credits: '3', note: 'from Sept' }, { student_id: 'STU-0002', credits: '0', note: '' }]);
  assert.deepEqual(parseCreditPaste('STU-0005, 2, coach note, more'), [{ student_id: 'STU-0005', credits: '2', note: 'coach note  more' }]);
});
