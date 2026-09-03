import { getFirestoreDb, hasAdminCredentials, firebaseAdminConfigurationError } from './firebaseAdmin.js';
import { db } from './db.js';

let syncPromise: Promise<void> | null = null;
let hasLoadedDurableState = false;
let lastDurableRevision: string | null = null;

const STATE_COLLECTION = '_system';
const STATE_DOCUMENT = 'academy';

async function markDurableStateChanged(): Promise<void> {
  await getFirestoreDb().collection(STATE_COLLECTION).doc(STATE_DOCUMENT).set({
    revision: new Date().toISOString(),
  }, { merge: true });
}

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
 * First request on an instance loads durable state. Later requests read a tiny
 * revision document; a full reload happens only if another instance wrote data.
 * This keeps Vercel instances consistent without downloading historic sessions
 * and attendance on every page request.
 */
export function initializeFirestoreSync(): Promise<void> {
  if (!hasAdminCredentials) return Promise.reject(new Error(firebaseAdminConfigurationError()));
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const firestore = getFirestoreDb();
    const stateSnapshot = await firestore.collection(STATE_COLLECTION).doc(STATE_DOCUMENT).get();
    const revision = stateSnapshot.exists ? String(stateSnapshot.data()?.revision || '') : null;
    if (hasLoadedDurableState && revision === lastDurableRevision) return;
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
    hasLoadedDurableState = true;
    lastDurableRevision = revision;
    console.log(`[Firestore] Sync complete: ${db.users.size} users, ${db.coaches.size} coaches, ${db.students.size} students.`);
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

export async function syncDocToFirestore(collectionName: string, docId: string, data: unknown) {
  if (!hasAdminCredentials) throw new Error(firebaseAdminConfigurationError());
  await getFirestoreDb().collection(collectionName).doc(docId).set(removeUndefinedValues(data), { merge: true });
  await markDurableStateChanged();
}

export async function deleteDocFromFirestore(collectionName: string, docId: string) {
  if (!hasAdminCredentials) throw new Error(firebaseAdminConfigurationError());
  await getFirestoreDb().collection(collectionName).doc(docId).delete();
  await markDurableStateChanged();
}
