import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { commitPauseDeclaration, commitPauseBillingReview } from '../server/pausePersistence.js';
import { persistAttendanceWithReplacementReconciliation, PauseAttendanceError, AttendanceConflictError, attendanceRecordId } from '../server/replacementCredits.js';
import { db } from '../server/db.js';
import type { StudentPause, ActivityLog } from '../src/types.js';

test('named Firestore emulator serializes pause declarations and keeps audit idempotent', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const app = initializeApp({ projectId: 'bingo-rollout-isolated' }, `pause-test-${crypto.randomUUID()}`);
  const firestore = getFirestore(app, 'bingo-rollout-test');
  const membership = `membership-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const makePause = (id: string, start: string, end: string | null): StudentPause => ({
    id, student_id: 'student', membership_id: membership, schedule_id: 'schedule', class_id: 'class',
    start_date: start, end_date: end, reason: 'EXAMINATION', declared_by_user_id: 'coach', declared_by_name: 'Coach',
    declared_by_role: 'COACH', created_at: now, updated_at: now, history: [{ action: 'DECLARED', at: now, user_id: 'coach' }],
  });
  const makeActivity = (id: string, pauseId: string): ActivityLog => ({ id, actor_user_id: 'coach', actor_user_name: 'Coach', actor_role: 'COACH',
    action: 'STUDENT_PAUSE_DECLARED', entity_type: 'studentPause', entity_id: pauseId, created_at: now });
  try {
    const first = makePause(`pause-${crypto.randomUUID()}`, '2026-10-01', '2026-10-31');
    const overlap = makePause(`pause-${crypto.randomUUID()}`, '2026-10-15', null);
    const results = await Promise.allSettled([
      commitPauseDeclaration(firestore, first, makeActivity(`activity-${first.id}`, first.id)),
      commitPauseDeclaration(firestore, overlap, makeActivity(`activity-${overlap.id}`, overlap.id)),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1,
      results.filter(result => result.status === 'rejected').map(result => String(result.reason)).join('; '));
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    const winner = results[0].status === 'fulfilled' ? first : overlap;
    const repeat = await commitPauseDeclaration(firestore, winner, makeActivity(`retry-${winner.id}`, winner.id));
    assert.equal(repeat.created, false);
    assert.equal((await firestore.collection('studentPauses').where('membership_id', '==', membership).get()).size, 1);
    assert.equal((await firestore.collection('activityLogs').where('entity_id', '==', winner.id).get()).size, 1);
    const lock = await firestore.collection('_student_pause_locks').doc(membership).get();
    assert.equal(lock.data()?.intervals.length, 1);
    await lock.ref.set({ reviews: { '2026-10': winner.id } }, { merge: true });
    const earlier = makePause(`pause-${crypto.randomUUID()}`, '2026-09-01', '2026-09-30');
    await commitPauseDeclaration(firestore, earlier, makeActivity(`activity-${earlier.id}`, earlier.id));
    const preserved = await lock.ref.get();
    assert.equal(preserved.data()?.reviews['2026-10'], winner.id);
    assert.equal(preserved.data()?.intervals.length, 2);
  } finally { await deleteApp(app); }
});

test('attendance transaction rejects a concurrent pause lock and resumes after its end date', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const app = initializeApp({ projectId: 'bingo-rollout-isolated' }, `attendance-pause-${crypto.randomUUID()}`);
  const firestore = getFirestore(app, 'bingo-rollout-test');
  const membership = `membership-${crypto.randomUUID()}`;
  const attendanceId = `attendance-${crypto.randomUUID()}`;
  const previousAttendance = db.attendance;
  const record = { id: attendanceId, student_id: 'student', session_id: 'session', status: 'PRESENT', attendance_type: 'REGULAR',
    marked_at: new Date().toISOString(), marked_by_user_id: 'coach' } as const;
  try {
    db.attendance = new Map();
    await firestore.collection('_student_pause_locks').doc(membership).set({ intervals: [{ id: 'pause', start_date: '2026-10-01', end_date: '2026-10-31' }] });
    await assert.rejects(() => persistAttendanceWithReplacementReconciliation({ attendance: record, classType: 'INDIVIDUAL',
      pauseMembershipIds: [membership], sessionDate: '2026-10-15' }, firestore, async () => {}), PauseAttendanceError);
    assert.equal((await firestore.collection('attendance').doc(attendanceId).get()).exists, false);
    await persistAttendanceWithReplacementReconciliation({ attendance: record, classType: 'INDIVIDUAL',
      pauseMembershipIds: [membership], sessionDate: '2026-11-01' }, firestore, async () => {});
    assert.equal((await firestore.collection('attendance').doc(attendanceId).get()).exists, true);
  } finally { db.attendance = previousAttendance; await deleteApp(app); }
});

test('concurrent attendance submissions keep one document and preserve existing marks', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const app = initializeApp({ projectId: 'bingo-rollout-isolated' }, `attendance-unique-${crypto.randomUUID()}`);
  const firestore = getFirestore(app, 'bingo-rollout-test');
  const previousAttendance = db.attendance;
  const sessionId = `session-${crypto.randomUUID()}`;
  const studentId = `student-${crypto.randomUUID()}`;
  const id = attendanceRecordId(sessionId, studentId);
  const record = { id, session_id: sessionId, student_id: studentId, status: 'PRESENT', attendance_type: 'REGULAR',
    marked_at: new Date().toISOString(), marked_by_user_id: 'coach' } as const;
  try {
    db.attendance = new Map();
    const outcomes = await Promise.allSettled([1, 2].map(() => persistAttendanceWithReplacementReconciliation(
      { attendance: record, classType: 'INDIVIDUAL', expectedMarkedAt: null }, firestore, async () => {})));
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1);
    assert.equal((await firestore.collection('attendance').where('session_id', '==', sessionId).where('student_id', '==', studentId).get()).size, 1);
    await assert.rejects(() => persistAttendanceWithReplacementReconciliation(
      { attendance: { ...record, id: `legacy-${crypto.randomUUID()}` }, classType: 'INDIVIDUAL', expectedMarkedAt: null },
      firestore, async () => {}), AttendanceConflictError);
  } finally { db.attendance = previousAttendance; await deleteApp(app); }
});

test('named Firestore emulator allows only one custom fee review for an enrollment month', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const app = initializeApp({ projectId: 'bingo-rollout-isolated' }, `billing-review-${crypto.randomUUID()}`);
  const firestore = getFirestore(app, 'bingo-rollout-test');
  const membership = `membership-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const makePause = (id: string, start_date: string, end_date: string): StudentPause => ({ id, student_id: 'student', membership_id: membership,
    schedule_id: 'schedule', class_id: 'class', start_date, end_date, reason: 'PERSONAL', declared_by_user_id: 'coach', declared_by_name: 'Coach',
    declared_by_role: 'COACH', created_at: now, updated_at: now, history: [{ action: 'DECLARED', at: now, user_id: 'coach' }] });
  const first = makePause(`pause-${crypto.randomUUID()}`, '2026-10-01', '2026-10-10');
  const second = makePause(`pause-${crypto.randomUUID()}`, '2026-10-20', '2026-10-31');
  try {
    await Promise.all([first, second].map(p => firestore.collection('studentPauses').doc(p.id).set(p)));
    await firestore.collection('_student_pause_locks').doc(membership).set({ intervals: [first, second].map(p => ({ id: p.id, start_date: p.start_date, end_date: p.end_date })) });
    const reviewed = (p: StudentPause) => ({ ...p, updated_at: new Date(Date.now() + 1000).toISOString(),
      billing_reviews: { '2026-10': { amount_cents: 7000, reviewed_by_user_id: 'admin', reviewed_at: now } },
      history: [...p.history, { action: 'BILLING_REVIEWED' as const, at: now, user_id: 'admin' }] });
    const activity = (p: StudentPause): ActivityLog => ({ id: `review-${p.id}`, actor_user_id: 'admin', actor_user_name: 'Admin', actor_role: 'ADMIN',
      action: 'STUDENT_PAUSE_BILLING_REVIEWED', entity_type: 'studentPause', entity_id: p.id, created_at: now });
    const results = await Promise.allSettled([commitPauseBillingReview(firestore, first, reviewed(first), activity(first), '2026-10'),
      commitPauseBillingReview(firestore, second, reviewed(second), activity(second), '2026-10')]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const lock = await firestore.collection('_student_pause_locks').doc(membership).get();
    assert.ok([first.id, second.id].includes(lock.data()?.reviews['2026-10']));
    const activities = await Promise.all([first, second].map(p => firestore.collection('activityLogs').doc(`review-${p.id}`).get()));
    assert.equal(activities.filter(snapshot => snapshot.exists).length, 1);
  } finally { await deleteApp(app); }
});
