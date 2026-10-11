import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { ActivityLog, ClassSession } from '../src/types.js';
import { removeUndefinedValues } from './firestoreSync.js';

/** Compare-and-swap the occurrence and its audit entry in one Firestore transaction. */
export async function commitOccurrence(firestore: Firestore, session: ClassSession,
  activity: ActivityLog, expectedRevision: string | null,
  requireUnmarked: boolean): Promise<{ kind: 'saved'; session: ClassSession } | { kind: 'stale' } | { kind: 'marked' }> {
  const updated = { ...session, occurrence_revision: crypto.randomUUID() };
  return firestore.runTransaction(async (transaction) => {
    const ref = firestore.collection('sessions').doc(session.id);
    const current = await transaction.get(ref);
    if (!current.exists || (current.data()?.occurrence_revision || null) !== expectedRevision) return { kind: 'stale' } as const;
    if (requireUnmarked) {
      const marks = await transaction.get(firestore.collection('attendance').where('session_id', '==', session.id));
      if (marks.docs.some((document) => document.data().status !== 'BOOKED')) return { kind: 'marked' } as const;
    }
    transaction.set(ref, removeUndefinedValues(updated), { merge: true });
    transaction.set(firestore.collection('activityLogs').doc(activity.id), removeUndefinedValues(activity));
    transaction.set(firestore.collection('_system').doc('academy'),
      { revision: `${new Date().toISOString()}:${crypto.randomUUID()}` }, { merge: true });
    return { kind: 'saved', session: updated } as const;
  });
}
