import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { router } from '../server/routes.js';
import { db } from '../server/db.js';
import { managePortalAccount } from '../server/portalBridge.js';

test('linked account reads obey normal class scope and the existing signed bridge', async () => {
  const original = [db.students, db.classes, db.schedules, db.memberships, db.attendance] as const;
  const oldFetch = global.fetch;
  const oldUrl = process.env.PORTAL_BRIDGE_URL;
  const oldSecret = process.env.ATTENDANCE_BRIDGE_SECRET;
  let bridgeCalls = 0;
  try {
    process.env.PORTAL_BRIDGE_URL = 'https://space.example.test';
    process.env.ATTENDANCE_BRIDGE_SECRET = 'test-only-secret';
    db.students = new Map([
      ['own', { id: 'own', student_id: 'STU-0001', full_name: 'Own', status: 'ACTIVE' } as any],
      ['other', { id: 'other', student_id: 'STU-0002', full_name: 'Other', status: 'ACTIVE' } as any],
      ['replacement', { id: 'replacement', student_id: 'STU-0003', full_name: 'Replacement', status: 'ACTIVE' } as any],
    ]);
    db.classes = new Map([
      ['own-class', { id: 'own-class', default_coach_id: 'coach-1', is_active: true } as any],
      ['other-class', { id: 'other-class', default_coach_id: 'coach-2', is_active: true } as any],
    ]);
    db.schedules = new Map([
      ['own-class', { id: 'own-class', class_id: 'own-class', status: 'ACTIVE' } as any],
      ['other-class', { id: 'other-class', class_id: 'other-class', status: 'ACTIVE' } as any],
    ]);
    db.memberships = new Map([
      ['m1', { student_id: 'own', schedule_id: 'own-class', status: 'ACTIVE' } as any],
      ['m2', { student_id: 'other', schedule_id: 'other-class', status: 'ACTIVE' } as any],
    ]);
    db.attendance = new Map([['replacement-mark', { student_id: 'replacement', status: 'PRESENT', attendance_type: 'REPLACEMENT' } as any]]);
    global.fetch = (async (url, options) => {
      bridgeCalls++;
      assert.equal(String(url), 'https://space.example.test/integration/attendance/account-metadata');
      const payload = String(options?.body);
      const headers = options?.headers as Record<string, string>;
      assert.equal(headers['X-Attendance-Signature'], crypto.createHmac('sha256', 'test-only-secret').update(`${headers['X-Attendance-Timestamp']}.${payload}`).digest('hex'));
      return new Response(JSON.stringify({ linked: true, username: 'chess_student', stars: 42 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/students/:id/portal-account' && item.route.methods.get);
    const handler = layer.route.stack.at(-1).handle;
    const call = async (id: string, role: string, coachId?: string) => {
      let code = 200; let body: any;
      const response = { status(value: number) { code = value; return this; }, json(value: any) { body = value; return this; } };
      await handler({ params: { id }, user: { id: 'actor', role, coach_id: coachId } }, response);
      return { code, body };
    };
    assert.deepEqual(await call('own', 'COACH', 'coach-1'), { code: 200, body: { linked: true, username: 'chess_student', stars: 42 } });
    assert.equal((await call('other', 'COACH', 'coach-1')).code, 403);
    assert.equal((await call('replacement', 'COACH', 'coach-1')).code, 403);
    assert.equal((await call('other', 'ADMIN')).code, 200);
    assert.equal(bridgeCalls, 2);
  } finally {
    [db.students, db.classes, db.schedules, db.memberships, db.attendance] = original;
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.PORTAL_BRIDGE_URL; else process.env.PORTAL_BRIDGE_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.ATTENDANCE_BRIDGE_SECRET; else process.env.ATTENDANCE_BRIDGE_SECRET = oldSecret;
  }
});

test('bridge forwards only linked ID and requested account fields; duplicate username is explicit', async () => {
  const oldFetch = global.fetch;
  const oldUrl = process.env.PORTAL_BRIDGE_URL;
  const oldSecret = process.env.ATTENDANCE_BRIDGE_SECRET;
  try {
    process.env.PORTAL_BRIDGE_URL = 'https://space.example.test';
    process.env.ATTENDANCE_BRIDGE_SECRET = 'test-only-secret';
    global.fetch = (async (_url, options) => {
      assert.deepEqual(JSON.parse(String(options?.body)), { student_id: 'STU-0001', username: 'new_name' });
      return new Response(JSON.stringify({ errors: { username: ['This username is already taken.'] } }), { status: 422 });
    }) as typeof fetch;
    await assert.rejects(managePortalAccount('STU-0001', 'username', { username: 'new_name' }), /already taken/);
    global.fetch = (async (_url, options) => {
      assert.deepEqual(JSON.parse(String(options?.body)), {
        student_id: 'STU-0001', new_password: 'eightchars', new_password_confirmation: 'eightchars',
      });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;
    assert.deepEqual(await managePortalAccount('STU-0001', 'password-reset', {
      new_password: 'eightchars', new_password_confirmation: 'eightchars',
    }), { success: true });
  } finally {
    global.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.PORTAL_BRIDGE_URL; else process.env.PORTAL_BRIDGE_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.ATTENDANCE_BRIDGE_SECRET; else process.env.ATTENDANCE_BRIDGE_SECRET = oldSecret;
  }
});
