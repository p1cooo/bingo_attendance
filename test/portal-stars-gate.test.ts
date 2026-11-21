import assert from 'node:assert/strict';
import test from 'node:test';
import { router } from '../server/routes.js';
import { db } from '../server/db.js';
import { academyToday } from '../server/academyDate.js';
import { STARS_NEED_BINGO_SPACE, STARS_NEED_OFFICIAL_STUDENT, starsBlockedReason } from '../server/portalStarsGate.js';

test('stars need a Bingo Space account; walk-ins never get stars; Space outages do not block', () => {
  assert.equal(starsBlockedReason({ student_id: 'STU-0001' }, 'REGISTERED'), null);
  assert.equal(starsBlockedReason({ student_id: 'STU-0001' }, 'UNKNOWN'), null);
  assert.equal(starsBlockedReason({ student_id: 'STU-0001' }, 'NOT_REGISTERED'), STARS_NEED_BINGO_SPACE);
  assert.equal(starsBlockedReason({ student_id: 'UNREG-ABC123' }, 'REGISTERED'), STARS_NEED_OFFICIAL_STUDENT);
  assert.equal(starsBlockedReason({ student_id: 'STU-0002', is_unregistered: true }, 'UNKNOWN'), STARS_NEED_OFFICIAL_STUDENT);
});

function withSheet(spaceStatuses: Record<string, boolean> | 'down') {
  const original = [db.sessions, db.attendance, db.students, db.memberships, db.studentPauses, db.classes, db.coaches, db.schedules] as const;
  const oldFetch = global.fetch;
  const oldUrl = process.env.PORTAL_BRIDGE_URL;
  const oldSecret = process.env.ATTENDANCE_BRIDGE_SECRET;
  const bridgeCalls: string[] = [];
  process.env.PORTAL_BRIDGE_URL = 'https://space.example.test';
  process.env.ATTENDANCE_BRIDGE_SECRET = 'test-only-secret';
  db.students = new Map([
    ['s1', { id: 's1', student_id: 'STU-0001', full_name: 'Student One', status: 'ACTIVE' } as any],
    ['walk', { id: 'walk', student_id: 'UNREG-ABC123', full_name: 'Walk In', status: 'ACTIVE', is_unregistered: true } as any],
  ]);
  db.coaches = new Map([['coach-1', { id: 'coach-1', is_active: true } as any]]);
  db.classes = new Map([['c1', { id: 'c1', class_type: 'GROUP', is_active: true, default_coach_id: 'coach-1' } as any]]);
  db.schedules = new Map();
  db.memberships = new Map();
  db.studentPauses = new Map();
  db.sessions = new Map([['today', { id: 'today', class_id: 'c1', session_date: academyToday(), status: 'SCHEDULED', scheduled_coach_id: 'coach-1' } as any]]);
  // BOOKED rows put both students on the sheet without needing a class membership.
  db.attendance = new Map([
    ['a1', { id: 'a1', session_id: 'today', student_id: 's1', status: 'BOOKED', attendance_type: 'REGULAR' } as any],
    ['a2', { id: 'a2', session_id: 'today', student_id: 'walk', status: 'BOOKED', attendance_type: 'REGULAR' } as any],
  ]);
  global.fetch = (async (url: string, options: any) => {
    bridgeCalls.push(String(url));
    if (spaceStatuses === 'down') throw new Error('Space unreachable');
    const body = JSON.parse(options.body);
    const statuses = Object.fromEntries(body.student_ids.map((code: string) => [code, spaceStatuses[code]]));
    return new Response(JSON.stringify({ statuses }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const restore = () => {
    [db.sessions, db.attendance, db.students, db.memberships, db.studentPauses, db.classes, db.coaches, db.schedules] = original;
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.PORTAL_BRIDGE_URL; else process.env.PORTAL_BRIDGE_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.ATTENDANCE_BRIDGE_SECRET; else process.env.ATTENDANCE_BRIDGE_SECRET = oldSecret;
  };
  return { bridgeCalls, restore };
}

const coach = { id: 'u1', role: 'COACH', coach_id: 'coach-1', is_active: true };

function handlerFor(path: string, method: 'get' | 'post') {
  const layer = (router as any).stack.find((item: any) => item.route?.path === path && item.route.methods[method]);
  return layer.route.stack.at(-1).handle;
}

async function call(handler: any, sessionId: string, body: Record<string, unknown> = {}) {
  let code = 200; let payload: any;
  const res = {
    status(value: number) { code = value; return this; },
    json(value: any) { payload = value; return this; },
    setHeader() { return this; },
  };
  await handler({ params: { id: sessionId }, body, user: coach }, res);
  return { code, payload };
}

test('roll call refuses new stars for a student without a Bingo Space account, before saving', async () => {
  const sheet = withSheet({ 'STU-0001': false });
  try {
    const result = await call(handlerFor('/sessions/:id/attendance', 'post'), 'today', { student_id: 's1', status: 'PRESENT', base_stars: 5 });
    assert.equal(result.code, 409);
    assert.equal(result.payload.code, 'STARS_NEED_BINGO_SPACE');
    assert.match(result.payload.error, /No Bingo Space account yet/);
    assert.deepEqual(sheet.bridgeCalls, ['https://space.example.test/integration/attendance/account-statuses']);
    assert.equal(db.attendance.get('a1')!.status, 'BOOKED');
  } finally { sheet.restore(); }
});

test('roll call refuses stars for a walk-in without asking Bingo Space', async () => {
  const sheet = withSheet({});
  try {
    const result = await call(handlerFor('/sessions/:id/attendance', 'post'), 'today', { student_id: 'walk', status: 'PRESENT', base_stars: 3 });
    assert.equal(result.code, 409);
    assert.match(result.payload.error, /Walk-in student/);
    assert.deepEqual(sheet.bridgeCalls, []);
    assert.equal(db.attendance.get('a2')!.status, 'BOOKED');
  } finally { sheet.restore(); }
});

test('sheet statuses: one Space call for official students, walk-ins not registered', async () => {
  const sheet = withSheet({ 'STU-0001': true });
  try {
    const result = await call(handlerFor('/sessions/:id/portal-statuses', 'get'), 'today');
    assert.equal(result.code, 200);
    assert.deepEqual(result.payload.statuses, { s1: 'REGISTERED', walk: 'NOT_REGISTERED' });
    assert.equal(sheet.bridgeCalls.length, 1);
  } finally { sheet.restore(); }
});

test('sheet statuses fall back to UNKNOWN when Bingo Space is down (stars stay open)', async () => {
  const sheet = withSheet('down');
  try {
    const result = await call(handlerFor('/sessions/:id/portal-statuses', 'get'), 'today');
    assert.equal(result.code, 200);
    assert.deepEqual(result.payload.statuses, { s1: 'UNKNOWN', walk: 'NOT_REGISTERED' });
  } finally { sheet.restore(); }
});
