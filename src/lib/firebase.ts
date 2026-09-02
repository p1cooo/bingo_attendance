import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

const configData: Record<string, string | undefined> = (appletConfig as Record<string, string | undefined>) || {};

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || configData.apiKey || '';
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || configData.authDomain || '';
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || configData.projectId || '';
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || configData.storageBucket || '';
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || configData.messagingSenderId || '';
const appId = import.meta.env.VITE_FIREBASE_APP_ID || configData.appId || '';

export const isFirebaseAuthAvailable = Boolean(apiKey && apiKey.length > 5 && projectId);

const firebaseConfig = {
  apiKey: apiKey || 'dummy-api-key-for-init',
  authDomain: authDomain || `${projectId || 'academy'}.firebaseapp.com`,
  projectId: projectId || 'academy',
  storageBucket: storageBucket || '',
  messagingSenderId: messagingSenderId || '',
  appId: appId || '1:123456789:web:abcdef',
};

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const clientAuth: Auth = getAuth(app);
const databaseId = configData.firestoreDatabaseId && configData.firestoreDatabaseId !== '(default)'
  ? configData.firestoreDatabaseId
  : undefined;
export const clientDb: Firestore = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
export default app;


