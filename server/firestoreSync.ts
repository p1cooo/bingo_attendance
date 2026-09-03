import { getFirestoreDb, hasAdminCredentials, firebaseAdminConfigurationError } from './firebaseAdmin.js';
import { db } from './db.js';

let syncPromise: Promise<void> | null = null;

/** Firestore rejects undefined values; optional fields are omitted instead. */
function removeUndefinedValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeUndefinedValues);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, removeUndefinedValues(child)])
    );
  }
  return value;
}

/**
 * Refresh durable Firestore state before every request. Vercel keeps several
 * warm instances alive; caching this map indefinitely made each instance show
 * a different, stale view after another instance performed a write.
 */
export function initializeFirestoreSync(): Promise<void> {
  if (!hasAdminCredentials) return Promise.reject(new Error(firebaseAdminConfigurationError()));
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const firestore = getFirestoreDb();
    const collections = ['users', 'coaches', 'parents', 'students', 'classes', 'schedules', 'memberships', 'sessions', 'attendance'] as const;
    const targets = [db.users, db.coaches, db.parents, db.students, db.classes, db.schedules, db.memberships, db.sessions, db.attendance] as const;
    await Promise.all(collections.map(async (name, index) => {
      const snapshot = await firestore.collection(name).get();
      const target = targets[index];
      target.clear();
      snapshot.forEach((document) => target.set(document.id, document.data() as never));
    }));
    const [auditSnapshot, notificationSnapshot] = await Promise.all([
      firestore.collection('auditLogs').orderBy('timestamp', 'desc').limit(500).get(),
      firestore.collection('notificationLogs').orderBy('timestamp', 'desc').limit(500).get(),
    ]);
    db.auditLogs = auditSnapshot.docs.map((document) => document.data() as never);
    db.notificationLogs = notificationSnapshot.docs.map((document) => document.data() as never);
    console.log(`[Firestore] Sync complete: ${db.users.size} users, ${db.coaches.size} coaches, ${db.students.size} students.`);
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

export async function syncDocToFirestore(collectionName: string, docId: string, data: unknown) {
  if (!hasAdminCredentials) throw new Error(firebaseAdminConfigurationError());
  await getFirestoreDb().collection(collectionName).doc(docId).set(removeUndefinedValues(data), { merge: true });
}

export async function deleteDocFromFirestore(collectionName: string, docId: string) {
  if (!hasAdminCredentials) throw new Error(firebaseAdminConfigurationError());
  await getFirestoreDb().collection(collectionName).doc(docId).delete();
}
