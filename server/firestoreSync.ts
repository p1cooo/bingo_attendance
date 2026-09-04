import { getFirestoreDb, hasAdminCredentials, firebaseAdminConfigurationError } from './firebaseAdmin.js';
import { db } from './db.js';

let syncPromise: Promise<void> | null = null;
let hasLoadedDurableState = false;
let lastDurableRevision: string | null = null;

const STATE_COLLECTION = '_system';
const STATE_DOCUMENT = 'academy';

// The academy administrator confirmed that these are accidental duplicates of
// the retained Wei Yuan coach record. Keeping this migration here makes the
// merge atomic from the application's perspective and, importantly, moves all
// durable relationships before deleting either duplicate document.
const RETAINED_WEI_YUAN_COACH_ID = 'coach-1788405881961';
const DUPLICATE_WEI_YUAN_COACH_IDS = new Set([
  'coach-1788405870935',
  'coach-1788407563025',
]);
let weiYuanMergePromise: Promise<void> | null = null;

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

/**
 * One-time, idempotent data repair for the confirmed duplicate Wei Yuan
 * profiles. References are transferred first, so historic attendance,
 * schedules, classes, and replacement assignments remain intact.
 */
export function mergeConfirmedWeiYuanDuplicateCoaches(): Promise<void> {
  if (!hasAdminCredentials) return Promise.reject(new Error(firebaseAdminConfigurationError()));
  if (weiYuanMergePromise) return weiYuanMergePromise;

  weiYuanMergePromise = (async () => {
    const firestore = getFirestoreDb();
    const retainedRef = firestore.collection('coaches').doc(RETAINED_WEI_YUAN_COACH_ID);
    const retainedSnapshot = await retainedRef.get();
    if (!retainedSnapshot.exists) {
      throw new Error('The retained Wei Yuan coach profile was not found; duplicate merge was not applied.');
    }

    const duplicateSnapshots = await Promise.all(
      [...DUPLICATE_WEI_YUAN_COACH_IDS].map((coachId) => firestore.collection('coaches').doc(coachId).get())
    );
    const existingDuplicates = duplicateSnapshots.filter((snapshot) => snapshot.exists);
    const needsNameNormalization = retainedSnapshot.data()?.name !== 'Wei Yuan';
    if (existingDuplicates.length === 0 && !needsNameNormalization) return;

    // The user-facing title supplies "Coach" itself. Store the name once to
    // avoid displays such as "Coach Coach Wei Yuan" after the merge.
    const writer = firestore.bulkWriter();
    if (needsNameNormalization) writer.update(retainedRef, { name: 'Wei Yuan' });

    if (existingDuplicates.length > 0) {
      const references: Array<{ collection: string; fields: string[] }> = [
        { collection: 'users', fields: ['coach_id'] },
        { collection: 'classes', fields: ['default_coach_id'] },
        { collection: 'schedules', fields: ['coach_id', 'default_coach_id'] },
        { collection: 'sessions', fields: ['default_coach_id', 'scheduled_coach_id', 'actual_coach_id', 'replacement_coach_id'] },
      ];

      let transferredReferences = 0;
      for (const { collection, fields } of references) {
        const snapshot = await firestore.collection(collection).get();
        snapshot.forEach((document) => {
          const data = document.data() as Record<string, unknown>;
          const updates: Record<string, string> = {};
          fields.forEach((field) => {
            if (DUPLICATE_WEI_YUAN_COACH_IDS.has(String(data[field] ?? ''))) {
              updates[field] = RETAINED_WEI_YUAN_COACH_ID;
            }
          });
          if (Object.keys(updates).length > 0) {
            writer.update(document.ref, updates);
            transferredReferences += 1;
          }
        });
      }

      existingDuplicates.forEach((document) => writer.delete(document.ref));
      console.log(`[Firestore] Merging ${existingDuplicates.length} duplicate Wei Yuan coach profiles and ${transferredReferences} references.`);
    }

    writer.set(firestore.collection(STATE_COLLECTION).doc(STATE_DOCUMENT), {
      revision: new Date().toISOString(),
    }, { merge: true });
    await writer.close();

    // Reload this warm instance too; other instances see the revision change
    // on their next request.
    hasLoadedDurableState = false;
    lastDurableRevision = null;
    await initializeFirestoreSync();
  })().finally(() => { weiYuanMergePromise = null; });

  return weiYuanMergePromise;
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
