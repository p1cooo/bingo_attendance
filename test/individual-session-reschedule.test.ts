import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db.js';

test('a moved individual session keeps its recurring slot occupied', () => {
  const previousClasses = db.classes;
  const previousSessions = db.sessions;
  try {
    db.classes = new Map([['class-test', {
      id: 'class-test', name: 'Test', class_type: 'INDIVIDUAL', day_of_week: 4,
      start_time: '09:30', end_time: '11:00', default_duration_mins: 90,
      default_capacity: 1, is_active: true, created_at: '2026-09-01T00:00:00.000Z',
    }]]);
    db.sessions = new Map([['session-test', {
      id: 'session-test', schedule_id: 'class-test', class_id: 'class-test',
      session_date: '2026-09-25', original_session_date: '2026-09-24',
      start_time: '09:30', end_time: '11:00', scheduled_coach_id: 'coach-test',
      actual_coach_id: 'coach-test', status: 'SCHEDULED',
    }]]);

    const generated = db.ensureSessionsForMonth('2026-09');
    assert.equal(generated.some((session) => session.session_date === '2026-09-24'), false);
    assert.equal(db.sessions.get('session-test')?.session_date, '2026-09-25');
  } finally {
    db.classes = previousClasses;
    db.sessions = previousSessions;
  }
});
