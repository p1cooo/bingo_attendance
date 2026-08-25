import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || "AIzaSyC20tVYwrlvg3xjyXqJGFtoLvTgIWV3y-s",
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0937442942.firebaseapp.com",
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0937442942",
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0937442942.firebasestorage.app",
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "966698072559",
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || "1:966698072559:web:73d37c0479835711d79e1a",
};

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const clientAuth: Auth = getAuth(app);
export const clientDb: Firestore = getFirestore(app);
export default app;
