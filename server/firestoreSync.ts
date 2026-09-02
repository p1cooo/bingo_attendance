import { firestore, hasAdminCredentials } from './firebaseAdmin.js';
import { db } from './db.js';

export async function initializeFirestoreSync() {
  if (!hasAdminCredentials) {
    console.log('[Firestore] Running in standalone / client-sync mode (no service account env credentials). Local memory and disk persistence active.');
    return;
  }

  console.log('[Firestore] Initializing Firestore synchronization...');
  try {
    // Load Users
    const usersSnap = await firestore.collection('users').get();
    usersSnap.forEach((doc) => db.users.set(doc.id, doc.data() as any));

    // Load Coaches
    const coachesSnap = await firestore.collection('coaches').get();
    coachesSnap.forEach((doc) => db.coaches.set(doc.id, doc.data() as any));

    // Load Parents
    const parentsSnap = await firestore.collection('parents').get();
    parentsSnap.forEach((doc) => db.parents.set(doc.id, doc.data() as any));

    // Load Students
    const studentsSnap = await firestore.collection('students').get();
    studentsSnap.forEach((doc) => db.students.set(doc.id, doc.data() as any));

    // Load Classes
    const classesSnap = await firestore.collection('classes').get();
    classesSnap.forEach((doc) => db.classes.set(doc.id, doc.data() as any));

    // Load Schedules
    const schedulesSnap = await firestore.collection('schedules').get();
    schedulesSnap.forEach((doc) => db.schedules.set(doc.id, doc.data() as any));

    // Load Memberships
    const membershipsSnap = await firestore.collection('memberships').get();
    membershipsSnap.forEach((doc) => db.memberships.set(doc.id, doc.data() as any));

    // Load Sessions
    const sessionsSnap = await firestore.collection('sessions').get();
    sessionsSnap.forEach((doc) => db.sessions.set(doc.id, doc.data() as any));

    // Load Attendance
    const attendanceSnap = await firestore.collection('attendance').get();
    attendanceSnap.forEach((doc) => db.attendance.set(doc.id, doc.data() as any));

    // Load Audit Logs
    try {
      const auditSnap = await firestore.collection('auditLogs').orderBy('timestamp', 'desc').limit(500).get();
      if (!auditSnap.empty) {
        db.auditLogs = auditSnap.docs.map((d) => d.data() as any);
      }
    } catch {
      // Index might be building, fallback
    }

    // Load Notification Logs
    try {
      const notifSnap = await firestore.collection('notificationLogs').orderBy('timestamp', 'desc').limit(500).get();
      if (!notifSnap.empty) {
        db.notificationLogs = notifSnap.docs.map((d) => d.data() as any);
      }
    } catch {
      // Index might be building, fallback
    }

    console.log(`[Firestore] Sync complete: ${db.users.size} users, ${db.coaches.size} coaches, ${db.students.size} students, ${db.sessions.size} sessions.`);
  } catch (err) {
    console.error('[Firestore] Firestore sync encountered an issue, running with local persistence backup:', err);
  }
}

export async function syncDocToFirestore(collectionName: string, docId: string, data: any) {
  if (!hasAdminCredentials) return;
  try {
    await firestore.collection(collectionName).doc(docId).set(data, { merge: true });
  } catch (err) {
    console.error(`[Firestore] Error saving document to ${collectionName}/${docId}:`, err);
  }
}

export async function deleteDocFromFirestore(collectionName: string, docId: string) {
  if (!hasAdminCredentials) return;
  try {
    await firestore.collection(collectionName).doc(docId).delete();
  } catch (err) {
    console.error(`[Firestore] Error deleting document from ${collectionName}/${docId}:`, err);
  }
}
