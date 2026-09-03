import { getFirestoreDb, hasAdminCredentials, firebaseAdminConfigurationError } from './firebaseAdmin.js';
import { db } from './db.js';

let syncPromise: Promise<void> | null = null;

/** Load durable Firestore state once per serverless instance before serving requests. */
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
  })().catch((error) => { syncPromise = null; throw error; });
  return syncPromise;
}

export async function syncDocToFirestore(collectionName: string, docId: string, data: unknown) {
  if (!hasAdminCredentials) throw new Error(firebaseAdminConfigurationError());
  await getFirestoreDb().collection(collectionName).doc(docId).set(data, { merge: true });
}

export async function deleteDocFromFirestore(collectionName: string, docId: string) {
  if (!hasAdminCredentials) throw new Error(firebaseAdminConfigurationError());
  await getFirestoreDb().collection(collectionName).doc(docId).delete();
}
