import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
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

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  firebaseConfig.projectId ||
  'gen-lang-client-0937442942';

const databaseId =
  process.env.FIREBASE_DATABASE_ID ||
  firebaseConfig.firestoreDatabaseId ||
  '(default)';

const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

// Support both standard multi-line keys and escaped \n strings from Vercel / CI env vars
if (privateKey) {
  // Strip enclosing quotes if present from environment copy-pastes
  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
}

let adminApp: App;

if (getApps().length === 0) {
  if (clientEmail && privateKey && projectId) {
    // Explicit service account credential provided (recommended for Vercel / serverless)
    adminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  } else if (projectId) {
    // Application Default Credentials (GCP / Cloud Run / Local emulator)
    adminApp = initializeApp({ projectId });
  } else {
    adminApp = initializeApp();
  }
} else {
  adminApp = getApps()[0];
}

// In Firestore Admin SDK, if databaseId is '(default)', passing it or undefined connects to default db.
export const firestore: Firestore =
  databaseId && databaseId !== '(default)'
    ? getFirestore(adminApp, databaseId)
    : getFirestore(adminApp);

export const adminAuth: Auth = getAuth(adminApp);
export { adminApp, projectId, databaseId };

