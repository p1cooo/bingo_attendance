import { firestore } from './firebaseAdmin.js';
import { db } from './db.js';

export async function initializeFirestoreSync() {
  console.log('[Firestore] Initializing Firestore synchronization...');
  try {
    const coachesSnapshot = await firestore.collection('coaches').limit(1).get();
    
    if (coachesSnapshot.empty) {
      console.log('[Firestore] Database is empty; retaining the clean production state.');
    } else {
      console.log('[Firestore] Found existing Firestore records. Syncing latest data from Firestore to local cache...');
      
      // Load Coaches
      const coachesSnap = await firestore.collection('coaches').get();
      coachesSnap.forEach((doc) => db.coaches.set(doc.id, doc.data() as any));

      // Load Users
      const usersSnap = await firestore.collection('users').get();
      usersSnap.forEach((doc) => db.users.set(doc.id, doc.data() as any));

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
      const auditSnap = await firestore.collection('auditLogs').orderBy('timestamp', 'desc').limit(500).get();
      if (!auditSnap.empty) {
        db.auditLogs = auditSnap.docs.map((d) => d.data() as any);
      }

      // Load Notification Logs
      const notifSnap = await firestore.collection('notificationLogs').orderBy('timestamp', 'desc').limit(500).get();
      if (!notifSnap.empty) {
        db.notificationLogs = notifSnap.docs.map((d) => d.data() as any);
      }

      console.log(`[Firestore] Sync complete: ${db.students.size} students, ${db.sessions.size} sessions, ${db.attendance.size} attendance records.`);
    }
  } catch (err) {
    console.error('[Firestore] Firestore sync encountered an issue, running with local persistence backup:', err);
  }
}

export async function syncDocToFirestore(collectionName: string, docId: string, data: any) {
  try {
    await firestore.collection(collectionName).doc(docId).set(data, { merge: true });
  } catch (err) {
    console.error(`[Firestore] Error saving document to ${collectionName}/${docId}:`, err);
  }
}

export async function deleteDocFromFirestore(collectionName: string, docId: string) {
  try {
    await firestore.collection(collectionName).doc(docId).delete();
  } catch (err) {
    console.error(`[Firestore] Error deleting document from ${collectionName}/${docId}:`, err);
  }
}
