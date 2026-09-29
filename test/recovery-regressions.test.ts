import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import express from 'express';
import { db } from '../server/db.js';
import { router, canManageStudent } from '../server/routes.js';
import { replacementCreditImpact, replacementCreditChange } from '../server/replacementCredits.js';
import { legacyAbsenceRepair } from '../server/legacyAbsenceCredits.js';
import { legacyReplacementDebitRepair } from '../server/legacyReplacementDebits.js';

test('coach scope uses active normal class membership, not replacement attendance', () => {
  const original = [db.classes, db.schedules, db.memberships, db.attendance] as const;
  try {
    db.classes = new Map([['class-1', { id: 'class-1', default_coach_id: 'coach-1', is_active: true } as any]]);
    db.schedules = new Map([['class-1', { id: 'class-1', class_id: 'class-1', coach_id: 'coach-1' } as any]]);
    db.memberships = new Map([['membership-1', { id: 'membership-1', schedule_id: 'class-1', student_id: 'normal', status: 'ACTIVE' } as any]]);
    db.attendance = new Map([['replacement', { id: 'replacement', student_id: 'replacement-only', session_id: 'session-1', attendance_type: 'REPLACEMENT', status: 'PRESENT' } as any]]);
    const coach = { id: 'user-1', role: 'COACH', coach_id: 'coach-1' } as any;
    assert.equal(canManageStudent(coach, 'normal'), true);
    assert.equal(canManageStudent(coach, 'replacement-only'), false);
    db.classes.get('class-1')!.is_active = false;
    assert.equal(canManageStudent(coach, 'normal'), false);
  } finally {
    [db.classes, db.schedules, db.memberships, db.attendance] = original;
  }
});

test('booking does not debit; present debits once in impact model and negative balances are valid', () => {
  assert.equal(replacementCreditImpact({ status: 'BOOKED', attendance_type: 'REPLACEMENT' }, 'GROUP'), 0);
  assert.equal(replacementCreditImpact({ status: 'PRESENT', attendance_type: 'REPLACEMENT' }, 'GROUP'), -1);
  assert.equal(replacementCreditImpact({ status: 'PRESENT', attendance_type: 'REPLACEMENT' }, 'GROUP') - replacementCreditImpact({ status: 'PRESENT', attendance_type: 'REPLACEMENT' }, 'GROUP'), 0);
  assert.equal(0 + replacementCreditImpact({ status: 'PRESENT', attendance_type: 'REPLACEMENT' }, 'GROUP'), -1);
  assert.equal(-1 + replacementCreditImpact({ status: 'PRESENT', attendance_type: 'REPLACEMENT' }, 'GROUP'), -2);
  const booked = { status: 'BOOKED', attendance_type: 'REPLACEMENT' } as any;
  const present = { status: 'PRESENT', attendance_type: 'REPLACEMENT' } as any;
  assert.equal(replacementCreditChange(undefined, booked, 'GROUP').delta, 0);
  assert.deepEqual(replacementCreditChange(booked, present, 'GROUP'), { nextImpact: -1, changed: true, revision: 1, delta: -1 });
  assert.deepEqual(replacementCreditChange({ ...present, replacement_credit_impact: -1, replacement_credit_revision: 1 }, present, 'GROUP'), { nextImpact: -1, changed: false, revision: 1, delta: 0 });
});

test('legacy regular group absences earn one repair credit and never double credit on re-save', () => {
  const absent = { id: 'old-absence', student_id: 'student-1', session_id: 'session-1', status: 'ABSENT', attendance_type: 'REGULAR' } as any;
  const earned = { id: 'old-absence:replacement-credit:1', attendance_id: absent.id, student_id: absent.student_id, amount: 1, reason: 'GROUP_ABSENCE_CREDIT' } as any;
  assert.equal(legacyAbsenceRepair(absent, 'GROUP', []), 'CREATE_CREDIT');
  assert.equal(legacyAbsenceRepair(absent, 'GROUP', [earned]), 'STAMP_IMPACT');
  assert.equal(legacyAbsenceRepair({ ...absent, replacement_credit_impact: 1, replacement_credit_revision: 1 }, 'GROUP', [earned]), 'NONE');
  assert.equal(legacyAbsenceRepair(absent, 'INDIVIDUAL', []), 'NONE');
  assert.equal(legacyAbsenceRepair({ ...absent, attendance_type: 'REPLACEMENT' }, 'GROUP', []), 'NONE');
  assert.equal(legacyAbsenceRepair({ ...absent, status: 'EXCUSED' }, 'GROUP', []), 'NONE');
  assert.equal(legacyAbsenceRepair(absent, 'GROUP', [{ ...earned, amount: -1 }]), 'CONFLICT');
  assert.deepEqual(replacementCreditChange(undefined, absent, 'GROUP'), { nextImpact: 1, changed: true, revision: 1, delta: 1 });
  assert.deepEqual(replacementCreditChange({ ...absent, replacement_credit_impact: 1, replacement_credit_revision: 1 }, absent, 'GROUP'), { nextImpact: 1, changed: false, revision: 1, delta: 0 });
});

test('advance replacement at zero credit debits once; later group absence restores zero', () => {
  const booked = { id: 'replacement-1', student_id: 'student-1', session_id: 'session-1', status: 'BOOKED', attendance_type: 'REPLACEMENT' } as any;
  const present = { ...booked, status: 'PRESENT' };
  const first = replacementCreditChange(booked, present, 'GROUP');
  assert.equal(first.delta, -1);
  const savedPresent = { ...present, replacement_credit_impact: first.nextImpact, replacement_credit_revision: first.revision };
  assert.equal(replacementCreditChange(savedPresent, savedPresent, 'GROUP').delta, 0);
  assert.equal(replacementCreditChange(savedPresent, { ...savedPresent, replacement_note: 'edited' }, 'GROUP').delta, 0);
  const absence = { id: 'absence-1', student_id: 'student-1', session_id: 'session-2', status: 'ABSENT', attendance_type: 'REGULAR' } as any;
  const earned = replacementCreditChange(undefined, absence, 'GROUP');
  assert.equal(earned.delta, 1);
  assert.equal(first.delta + earned.delta, 0);
  assert.equal(replacementCreditChange({ ...absence, replacement_credit_impact: 1, replacement_credit_revision: 1 }, absence, 'GROUP').delta, 0);
});

test('historical replacement debit repair is idempotent and rejects ambiguous history', () => {
  const present = { id: 'old-replacement', student_id: 'student-1', session_id: 'session-1', status: 'PRESENT', attendance_type: 'REPLACEMENT' } as any;
  const debit = { id: 'old-replacement:replacement-credit:1', attendance_id: present.id, student_id: present.student_id, session_id: present.session_id, amount: -1, reason: 'REPLACEMENT_ATTENDED_DEBIT' } as any;
  assert.equal(legacyReplacementDebitRepair(present, []), 'CREATE_DEBIT');
  assert.equal(legacyReplacementDebitRepair(present, [debit]), 'STAMP_IMPACT');
  const repaired = { ...present, replacement_credit_impact: -1, replacement_credit_revision: 1 };
  assert.equal(legacyReplacementDebitRepair(repaired, [debit]), 'NONE');
  assert.equal(replacementCreditChange(repaired, repaired, 'GROUP').delta, 0);
  assert.equal(legacyReplacementDebitRepair(repaired, []), 'CREATE_DEBIT');
  assert.equal(legacyReplacementDebitRepair(present, [{ ...debit, student_id: 'other' }]), 'CONFLICT');
  assert.equal(legacyReplacementDebitRepair(present, [debit, debit]), 'CONFLICT');
  assert.equal(legacyReplacementDebitRepair({ ...repaired, replacement_credit_revision: 2 }, []), 'CONFLICT');
  assert.equal(legacyReplacementDebitRepair({ ...present, status: 'BOOKED' }, []), 'NONE');
});

test('signed portal progress is JSON, rejects invalid requests, and preserves archived class history', async () => {
  const original = [db.students, db.classes, db.sessions, db.attendance, db.replacementCredits] as const;
  const oldSecret = process.env.ATTENDANCE_BRIDGE_SECRET;
  process.env.ATTENDANCE_BRIDGE_SECRET = 'test-only-bridge-secret';
  const app = express();
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test port');
    const url = 'http://127.0.0.1:' + address.port + '/api/integration/portal/progress/';
    db.students = new Map([['student-1', { id: 'student-1', student_id: 'STU-0003', full_name: 'Fixture', status: 'ACTIVE' } as any]]);
    db.classes = new Map([['class-1', { id: 'class-1', name: 'Historical Class', class_type: 'GROUP', is_active: false } as any]]);
    db.sessions = new Map([['session-1', { id: 'session-1', class_id: 'class-1', session_date: '2026-08-12' } as any]]);
    db.attendance = new Map([
      ['present', { id: 'present', session_id: 'session-1', student_id: 'student-1', status: 'PRESENT', attendance_type: 'REGULAR' } as any],
      ['booked', { id: 'booked', session_id: 'session-1', student_id: 'student-1', status: 'BOOKED', attendance_type: 'REPLACEMENT' } as any],
    ]);
    db.replacementCredits = new Map([['negative', { id: 'negative', student_id: 'student-1', amount: -2 } as any]]);
    assert.equal(db.getPopulatedStudent('student-1')?.attendance_summary?.total_sessions, 1);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signed = (time: string, signature: string) => ({ 'X-Attendance-Timestamp': time, 'X-Attendance-Signature': signature });
    const sign = (time: string) => crypto.createHmac('sha256', process.env.ATTENDANCE_BRIDGE_SECRET!).update(time + '.').digest('hex');
    assert.equal((await fetch(url + 'STU-0003', { headers: signed(timestamp, 'x') })).status, 401);
    assert.equal((await fetch(url + 'STU-0003', { headers: signed('0', sign('0')) })).status, 401);
    assert.equal((await fetch(url + 'STU-9998', { headers: signed(timestamp, sign(timestamp)) })).status, 404);
    const response = await fetch(url + 'STU-0003', { headers: signed(timestamp, sign(timestamp)) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /json/);
    const body = await response.json() as any;
    assert.equal(body.replacement_credits, -2);
    assert.deepEqual(body.records, [{ event_id: 'attendance:present', date: '2026-08-12', class_name: 'Historical Class', status: 'present', attendance_type: 'REGULAR' }]);
  } finally {
    server.close();
    [db.students, db.classes, db.sessions, db.attendance, db.replacementCredits] = original;
    if (oldSecret === undefined) delete process.env.ATTENDANCE_BRIDGE_SECRET;
    else process.env.ATTENDANCE_BRIDGE_SECRET = oldSecret;
  }
});

test('coach API handlers scope students and classes and restrict academy search to class assignment', async () => {
  const original = [db.students, db.classes, db.schedules, db.memberships, db.attendance] as const;
  const handler = (path: string, method = 'get') => {
    const layer = (router as any).stack.find((item: any) => item.route?.path === path && item.route.methods[method]);
    assert.ok(layer, 'route exists: ' + path);
    return layer.route.stack.at(-1).handle;
  };
  const call = async (path: string, params: any = {}, query: any = {}) => {
    let code = 200;
    let body: any;
    const res = { status(value: number) { code = value; return this; }, json(value: any) { body = value; return this; } };
    await handler(path)({ params, query, user: { id: 'user-1', role: 'COACH', coach_id: 'coach-1' } }, res);
    return { code, body };
  };
  try {
    db.students = new Map([
      ['own', { id: 'own', student_id: 'STU-0003', full_name: 'Own Student', status: 'ACTIVE' } as any],
      ['other', { id: 'other', student_id: 'STU-0004', full_name: 'Other Student', status: 'ACTIVE' } as any],
    ]);
    db.classes = new Map([
      ['own-class', { id: 'own-class', name: 'Own Class', default_coach_id: 'coach-1', day_of_week: 2, is_active: true } as any],
      ['other-class', { id: 'other-class', name: 'Other Class', default_coach_id: 'coach-2', day_of_week: 0, is_active: true } as any],
    ]);
    db.schedules = new Map([
      ['own-class', { id: 'own-class', class_id: 'own-class', coach_id: 'coach-1' } as any],
      ['other-class', { id: 'other-class', class_id: 'other-class', coach_id: 'coach-2' } as any],
    ]);
    db.memberships = new Map([
      ['m1', { id: 'm1', student_id: 'own', schedule_id: 'own-class', status: 'ACTIVE' } as any],
      ['m2', { id: 'm2', student_id: 'other', schedule_id: 'other-class', status: 'ACTIVE' } as any],
      ['m3', { id: 'm3', student_id: 'own', schedule_id: 'other-class', status: 'ACTIVE' } as any],
    ]);
    db.attendance = new Map();
    const students = await call('/students');
    assert.equal(students.code, 200);
    assert.deepEqual(students.body.map((student: any) => student.student_id), ['STU-0003']);
    assert.deepEqual(students.body[0].normal_class_days, [2]);
    assert.equal((await call('/students/:id', { id: 'other' })).code, 403);
    assert.deepEqual((await call('/classes')).body.map((cls: any) => cls.id), ['own-class']);
    assert.equal((await call('/classes/:id', { id: 'other-class' })).code, 403);
    assert.deepEqual((await call('/classes/:id/student-search', { id: 'own-class' }, { search: 'o' })).body, []);
    const search = await call('/classes/:id/student-search', { id: 'own-class' }, { search: 'student' });
    assert.equal(search.code, 200);
    assert.deepEqual(search.body.map((student: any) => Object.keys(student).sort()), [
      ['already_in_class', 'assigned_elsewhere', 'full_name', 'id', 'student_id'],
      ['already_in_class', 'assigned_elsewhere', 'full_name', 'id', 'student_id'],
    ]);
    assert.equal(search.body.find((student: any) => student.id === 'own').already_in_class, true);
    assert.equal(search.body.find((student: any) => student.id === 'other').assigned_elsewhere, true);
    assert.equal((await call('/classes/:id/student-search', { id: 'other-class' }, { search: 'student' })).code, 403);
    db.students.set('replacement-only', { id: 'replacement-only', student_id: 'STU-0005', full_name: 'Replacement Only', status: 'ACTIVE' } as any);
    db.attendance.set('replacement', { id: 'replacement', student_id: 'replacement-only', session_id: 'own-session', status: 'PRESENT', attendance_type: 'REPLACEMENT' } as any);
    assert.deepEqual((await call('/students')).body.map((student: any) => student.student_id), ['STU-0003']);
  } finally {
    [db.students, db.classes, db.schedules, db.memberships, db.attendance] = original;
  }
});
