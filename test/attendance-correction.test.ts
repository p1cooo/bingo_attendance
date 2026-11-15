import assert from 'node:assert/strict';
import test from 'node:test';
import { router } from '../server/routes.js';
import { db } from '../server/db.js';
import { academyToday } from '../server/academyDate.js';
import { COACH_CORRECTION_DAYS, coachCorrectionBlocker, earliestCoachCorrectionDate } from '../src/lib/attendanceCorrection.js';

const TODAY = '2026-11-15';

test('coach may change a saved mark for 7 days while no stars reached Bingo Space', () => {
  assert.equal(COACH_CORRECTION_DAYS, 7);
  assert.equal(earliestCoachCorrectionDate(TODAY), '2026-11-08');
  assert.equal(coachCorrectionBlocker({ status: 'ABSENT' }, '2026-11-15', TODAY), null);
  assert.equal(coachCorrectionBlocker({ status: 'ABSENT' }, '2026-11-08', TODAY), null);
  assert.equal(coachCorrectionBlocker({ status: 'PRESENT', portal_sync_status: 'PENDING' }, '2026-11-10', TODAY), null);
  assert.equal(coachCorrectionBlocker({ status: 'PRESENT', portal_sync_status: 'NOT_LINKED' }, '2026-11-10', TODAY), null);
  assert.match(coachCorrectionBlocker({ status: 'ABSENT' }, '2026-11-07', TODAY)!, /up to 7 days/);
  assert.match(coachCorrectionBlocker({ status: 'PRESENT', portal_sync_status: 'SYNCED' }, '2026-11-14', TODAY)!, /already in Bingo Space/);
  assert.match(coachCorrectionBlocker({ status: 'BOOKED' }, '2026-11-14', TODAY)!, /Only a saved/);
  assert.match(coachCorrectionBlocker(undefined, '2026-11-14', TODAY)!, /Only a saved/);
  assert.match(coachCorrectionBlocker({ status: 'ABSENT' }, '2026-11-16', TODAY)!, /future/);
});

function daysAgo(days: number): string {
  const date = new Date(`${academyToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

test('roll call refuses a blocked change before saving anything', async () => {
  const original = [db.sessions, db.attendance, db.students, db.memberships, db.studentPauses, db.classes, db.coaches] as const;
  try {
    db.students = new Map([['s1', { id: 's1', student_id: 'STU-0001', full_name: 'Student One', status: 'ACTIVE' } as any]]);
    db.coaches = new Map([['coach-1', { id: 'coach-1', is_active: true } as any]]);
    db.classes = new Map([['c1', { id: 'c1', class_type: 'GROUP', is_active: true, default_coach_id: 'coach-1' } as any]]);
    db.memberships = new Map();
    db.studentPauses = new Map();
    db.sessions = new Map([
      ['recent', { id: 'recent', class_id: 'c1', session_date: daysAgo(2), status: 'SCHEDULED', scheduled_coach_id: 'coach-1' } as any],
      ['old', { id: 'old', class_id: 'c1', session_date: daysAgo(COACH_CORRECTION_DAYS + 1), status: 'SCHEDULED', scheduled_coach_id: 'coach-1' } as any],
    ]);
    db.attendance = new Map([
      ['a-old', { id: 'a-old', session_id: 'old', student_id: 's1', status: 'ABSENT', attendance_type: 'REGULAR' } as any],
      ['a-synced', { id: 'a-synced', session_id: 'recent', student_id: 's1', status: 'PRESENT', attendance_type: 'REGULAR', base_stars: 5, portal_sync_status: 'SYNCED' } as any],
    ]);
    const layer = (router as any).stack.find((item: any) => item.route?.path === '/sessions/:id/attendance' && item.route.methods.post);
    const handler = layer.route.stack.at(-1).handle;
    const call = async (sessionId: string, body: Record<string, unknown>) => {
      let code = 200; let payload: any;
      const res = { status(value: number) { code = value; return this; }, json(value: any) { payload = value; return this; } };
      await handler({ params: { id: sessionId }, body: { student_id: 's1', ...body }, user: { id: 'u1', role: 'COACH', coach_id: 'coach-1', is_active: true } }, res);
      return { code, payload };
    };

    const tooOld = await call('old', { status: 'PRESENT', correction: true });
    assert.equal(tooOld.code, 409);
    assert.match(tooOld.payload.error, /up to 7 days/);

    const synced = await call('recent', { status: 'ABSENT', correction: true });
    assert.equal(synced.code, 409);
    assert.match(synced.payload.error, /already in Bingo Space/);

    const noFlag = await call('old', { status: 'PRESENT' });
    assert.equal(noFlag.code, 409);
    assert.match(noFlag.payload.error, /Ask an admin/);

    assert.equal(db.attendance.get('a-old')!.status, 'ABSENT');
    assert.equal(db.attendance.get('a-synced')!.status, 'PRESENT');
  } finally {
    [db.sessions, db.attendance, db.students, db.memberships, db.studentPauses, db.classes, db.coaches] = original;
  }
});
