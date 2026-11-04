import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../server/db.js';
import { adminDeleteBlockers, coachUndoBlockers, studentRecords } from '../server/studentDeletion.js';
import type { AttendanceRecord, ReplacementCredit, StudentClassMembership, StudentPause, User } from '../src/types.js';

const maps = () => [db.students, db.memberships, db.attendance, db.replacementCredits, db.replacementAdvanceCommitments, db.studentPauses, db.studentFees, db.studentPayments, db.studentAdjustments, db.membershipBillingReviews] as const;
function isolated(fn: () => void) {
  const saved = maps().map(m => new Map(m as Map<string, any>));
  try { maps().forEach(m => m.clear()); fn(); }
  finally { maps().forEach((m, i) => { m.clear(); for (const [k, v] of saved[i]) (m as Map<string, any>).set(k, v); }); }
}
const coach = { id: 'coach-user', role: 'COACH', coach_id: 'c1', is_active: true, name: 'Coach' } as User;
const ownClass = (scheduleId: string) => scheduleId === 'mine';
const fresh = () => {
  db.students.set('s', { id: 's', student_id: 'STU-0500', full_name: 'Typo Name', status: 'ACTIVE', created_at: '2026-11-05T00:00:00Z' });
  db.memberships.set('m', { id: 'm', student_id: 's', schedule_id: 'mine', joined_date: '2026-11-05', status: 'ACTIVE' } as StudentClassMembership);
};
const undo = (overrides: Partial<Parameters<typeof coachUndoBlockers>[0]> = {}) =>
  coachUndoBlockers({ user: coach, studentId: 's', createdByUserId: 'coach-user', portal: 'NOT_REGISTERED', canManageSchedule: ownClass, ...overrides });

test('a coach can undo a student they just created with no history', () => {
  isolated(() => { fresh(); assert.deepEqual(undo(), []); });
});

test('coach undo is refused for other creators, history, Bingo Space accounts or other coaches\' classes', () => {
  isolated(() => {
    fresh();
    assert.match(undo({ createdByUserId: 'someone-else' }).join(' '), /Only the coach who created/);
    assert.match(undo({ createdByUserId: null }).join(' '), /Only the coach who created/); // imported before creation logging
    assert.match(undo({ portal: 'REGISTERED' }).join(' '), /Bingo Space account/);
    assert.match(undo({ portal: 'UNKNOWN' }).join(' '), /could not be checked/);
    db.memberships.set('m2', { id: 'm2', student_id: 's', schedule_id: 'theirs', joined_date: '2026-11-05', status: 'ACTIVE' } as StudentClassMembership);
    assert.match(undo().join(' '), /another coach's class/);
    db.memberships.delete('m2');
    db.attendance.set('a', { id: 'a', session_id: 'x', student_id: 's', status: 'ABSENT', attendance_type: 'REGULAR', marked_at: '', marked_by_user_id: 'coach-user' } as AttendanceRecord);
    assert.match(undo().join(' '), /Attendance has already been recorded/);
    db.attendance.clear();
    db.replacementCredits.set('c', { id: 'c', student_id: 's', amount: 1, reason: 'GROUP_ABSENCE_CREDIT', created_at: '', effective_at: '', idempotency_key: 'c' } as ReplacementCredit);
    assert.match(undo().join(' '), /Replacement credits/);
    db.replacementCredits.clear();
    db.studentPauses.set('p', { id: 'p', student_id: 's', membership_id: 'm' } as StudentPause);
    assert.match(undo().join(' '), /pause/);
    db.studentPauses.clear();
    db.studentAdjustments.set('adj', { id: 'adj', student_id: 's', month: '2026-11', amount_cents: 100, type: 'CREDIT', reason: 'x', created_by_user_id: 'a', created_at: '' });
    assert.match(undo().join(' '), /Finance records/);
  });
});

test('admin delete is blocked only by Finance records and covers all Attendance history', () => {
  isolated(() => {
    fresh();
    db.attendance.set('a', { id: 'a', session_id: 'x', student_id: 's', status: 'PRESENT', attendance_type: 'REGULAR', marked_at: '', marked_by_user_id: 'u' } as AttendanceRecord);
    db.attendance.set('other', { id: 'other', session_id: 'x', student_id: 'someone', status: 'PRESENT', attendance_type: 'REGULAR', marked_at: '', marked_by_user_id: 'u' } as AttendanceRecord);
    db.replacementCredits.set('c', { id: 'c', student_id: 's', amount: 1, reason: 'GROUP_ABSENCE_CREDIT', created_at: '', effective_at: '', idempotency_key: 'c' } as ReplacementCredit);
    db.studentPauses.set('p', { id: 'p', student_id: 's', membership_id: 'm' } as StudentPause);
    assert.deepEqual(adminDeleteBlockers('s'), []);
    const records = studentRecords('s');
    assert.deepEqual([records.memberships.length, records.attendance.length, records.credits.length, records.pauses.length], [1, 1, 1, 1]);
    db.membershipBillingReviews.set('r', { id: 'r', student_id: 's', membership_id: 'm', month: '2026-11', amount_cents: 0, reason: 'x', created_by_user_id: 'a', created_at: '' });
    assert.match(adminDeleteBlockers('s').join(' '), /Finance records/);
  });
});
