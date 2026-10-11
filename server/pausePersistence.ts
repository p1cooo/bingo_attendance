import type { Firestore } from 'firebase-admin/firestore';
import type { ActivityLog, StudentPause } from '../src/types.js';
import { overlapsPause } from './studentPauses.js';
import { removeUndefinedValues } from './firestoreSync.js';

/** The per-membership lock makes overlapping declarations serializable, including concurrent requests. */
export async function commitPauseDeclaration(firestore: Firestore, pause: StudentPause, activity: ActivityLog): Promise<{ pause: StudentPause; created: boolean }> {
  return firestore.runTransaction(async tx => {
    const lockRef = firestore.collection('_student_pause_locks').doc(pause.membership_id);
    const pauseRef = firestore.collection('studentPauses').doc(pause.id);
    const [lockDoc, existing] = await Promise.all([tx.get(lockRef), tx.get(pauseRef)]);
    if (existing.exists) {
      const prior = existing.data() as StudentPause;
      if (prior.membership_id !== pause.membership_id || prior.start_date !== pause.start_date || prior.end_date !== pause.end_date || prior.reason !== pause.reason || (prior.note || '') !== (pause.note || '')) throw new Error('IDEMPOTENCY_CONFLICT');
      return { pause: prior, created: false };
    }
    const intervals = (lockDoc.data()?.intervals || []) as Array<{ id: string; start_date: string; end_date: string | null }>;
    if (overlapsPause(intervals.map(item => ({ ...item, membership_id: pause.membership_id })), pause.membership_id, pause.start_date, pause.end_date)) throw new Error('OVERLAPPING_PAUSE');
    tx.set(lockRef, { ...lockDoc.data(), intervals: [...intervals, { id: pause.id, start_date: pause.start_date, end_date: pause.end_date }] });
    tx.create(pauseRef, pause);
    tx.create(firestore.collection('activityLogs').doc(activity.id), removeUndefinedValues(activity) as FirebaseFirestore.DocumentData);
    return { pause, created: true };
  });
}

/** A custom fee is unique per enrollment and month, even across separate pauses. */
export async function commitPauseBillingReview(firestore: Firestore, previous: StudentPause, updated: StudentPause,
  activity: ActivityLog, month: string): Promise<void> {
  await firestore.runTransaction(async tx => {
    const pauseRef = firestore.collection('studentPauses').doc(previous.id);
    const lockRef = firestore.collection('_student_pause_locks').doc(previous.membership_id);
    const [current, lock] = await Promise.all([tx.get(pauseRef), tx.get(lockRef)]);
    if (!current.exists || (current.data() as StudentPause).updated_at !== previous.updated_at ||
      lock.data()?.reviews?.[month] && lock.data()?.reviews?.[month] !== previous.id) throw new Error('STALE_PAUSE');
    tx.set(pauseRef, updated);
    tx.set(lockRef, { ...lock.data(), reviews: { ...lock.data()?.reviews, [month]: previous.id } });
    tx.create(firestore.collection('activityLogs').doc(activity.id), removeUndefinedValues(activity) as FirebaseFirestore.DocumentData);
  });
}
