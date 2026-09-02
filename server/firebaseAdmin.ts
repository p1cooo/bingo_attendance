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
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

function formatPrivateKey(rawKey?: string): string | undefined {
  if (!rawKey) return undefined;
  let key = rawKey.trim();

  // If user pasted whole service account JSON into the private key environment variable
  if (key.startsWith('{') && key.endsWith('}')) {
    try {
      const parsed = JSON.parse(key);
      if (parsed.private_key) {
        key = parsed.private_key;
      }
    } catch {
      // Ignore JSON parse error
    }
  }

  // Strip wrapping single or double quotes
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'")) ||
    (key.startsWith('`') && key.endsWith('`'))
  ) {
    key = key.slice(1, -1).trim();
  }

  // Replace literal '\n' sequences with real newlines
  key = key.replace(/\\n/g, '\n');

  // Ensure standard PEM structure
  if (!key.includes('BEGIN PRIVATE KEY') && !key.includes('BEGIN RSA PRIVATE KEY')) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
  }

  return key;
}

const privateKey = formatPrivateKey(rawPrivateKey);

let adminApp: App;

if (getApps().length === 0) {
  let initialized = false;
  if (clientEmail && privateKey && projectId) {
    try {
      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });
      initialized = true;
    } catch (certError) {
      console.warn('[FirebaseAdmin] Failed to initialize with cert credentials, attempting fallback:', certError);
    }
  }

  if (!initialized) {
    try {
      adminApp = initializeApp({ projectId });
    } catch (fallbackError) {
      console.warn('[FirebaseAdmin] Fallback initialization error, creating bare default app:', fallbackError);
      adminApp = initializeApp();
    }
  }
} else {
  adminApp = getApps()[0];
}

export const hasAdminCredentials = Boolean(clientEmail && privateKey && projectId);

let firestoreInstance: Firestore | null = null;
export function getFirestoreDb(): Firestore | null {
  if (!firestoreInstance) {
    try {
      if (hasAdminCredentials) {
        firestoreInstance =
          databaseId && databaseId !== '(default)'
            ? getFirestore(adminApp, databaseId)
            : getFirestore(adminApp);
      }
    } catch (err) {
      console.warn('[FirebaseAdmin] Firestore initialization note:', err);
    }
  }
  return firestoreInstance;
}

export const firestore: Firestore = new Proxy({} as Firestore, {
  get(target, prop, receiver) {
    const db = getFirestoreDb();
    if (!db) {
      // Graceful no-op stub if no server-side credentials
      if (prop === 'collection') {
        return () => ({
          get: async () => ({ empty: true, docs: [], forEach: () => {} }),
          doc: () => ({
            set: async () => {},
            get: async () => ({ exists: false, data: () => null }),
            delete: async () => {},
          }),
          orderBy: () => ({
            limit: () => ({
              get: async () => ({ empty: true, docs: [] }),
            }),
          }),
        });
      }
      return undefined;
    }
    const value = Reflect.get(db, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(db);
    }
    return value;
  },
});

export const adminAuth: Auth = getAuth(adminApp);
export { adminApp, projectId, databaseId };


