import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let firebaseConfig: any = {};
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error('Error reading firebase-applet-config.json:', err);
  }
}

const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'gen-lang-client-0937442942';
const databaseId = process.env.FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)';

let adminApp: App;
if (getApps().length === 0) {
  adminApp = initializeApp({
    projectId: projectId,
  });
} else {
  adminApp = getApps()[0];
}

// In standard Firestore SDK, if databaseId is '(default)', passing it or undefined connects to default db.
export const firestore: Firestore = databaseId && databaseId !== '(default)'
  ? getFirestore(adminApp, databaseId)
  : getFirestore(adminApp);

export const adminAuth: Auth = getAuth(adminApp);
export { adminApp, projectId, databaseId };
