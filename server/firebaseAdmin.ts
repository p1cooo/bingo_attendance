import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

/** Server-only Firebase Admin bootstrap. Never use an uncredentialed fallback on Vercel. */
const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const databaseId = process.env.FIREBASE_DATABASE_ID?.trim() || '(default)';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();

function formatPrivateKey(value?: string): string | undefined {
  if (!value) return undefined;
  let key = value.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
  return key.replace(/\\n/g, '\n');
}

const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);
let initializationError: Error | undefined;
let adminApp: App | null = null;

if (projectId && clientEmail && privateKey) {
  try {
    adminApp = getApps()[0] || initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  } catch (error) {
    initializationError = error instanceof Error ? error : new Error('Firebase Admin initialization failed');
    console.error('[FirebaseAdmin] Initialization failed:', initializationError.message);
  }
} else {
  initializationError = new Error('Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.');
}

export const hasAdminCredentials = Boolean(adminApp);
export const firebaseAdminConfigurationError = () => initializationError?.message || 'Firebase Admin is not configured.';

export function requireAdminApp(): App {
  if (!adminApp) throw new Error(firebaseAdminConfigurationError());
  return adminApp;
}

export function getFirestoreDb(): Firestore {
  const app = requireAdminApp();
  return databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);
}

export function getAdminAuth(): Auth {
  return getAuth(requireAdminApp());
}

export const adminAuth: Auth | null = adminApp ? getAuth(adminApp) : null;
export { adminApp, projectId, databaseId };
