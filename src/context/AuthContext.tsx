import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { User, Coach } from '../types.js';
import { api } from '../lib/api.js';
import { clientAuth, clientDb, isFirebaseAuthAvailable } from '../lib/firebase.js';

interface AuthContextType {
  user: User | null;
  coachProfile: Coach | null;
  isLoading: boolean;
  login: (usernameOrEmail: string, password?: string) => Promise<void>;
  switchUser: (usernameOrEmail: string) => Promise<void>;
  logout: () => Promise<void>;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isCoach: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [coachProfile, setCoachProfile] = useState<Coach | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Synchronize session on initial load and handle auth state changes
  useEffect(() => {
    let isMounted = true;

    async function checkExistingAuth() {
      const isExplicitlyLoggedOut = localStorage.getItem('chess_explicit_logout') === 'true';
      const token = api.getToken();

      if (isExplicitlyLoggedOut || !token) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const res = await api.getMe();
        if (isMounted) {
          setUser(res.user);
          setCoachProfile(res.coach_profile || null);
        }
      } catch (err) {
        api.setToken(null);
        if (isMounted) {
          setUser(null);
          setCoachProfile(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    checkExistingAuth();

    // Listen to Firebase client auth & token refresh events if available
    let unsubscribe = () => {};
    if (isFirebaseAuthAvailable) {
      try {
        unsubscribe = onIdTokenChanged(
          clientAuth,
          async (fbUser: FirebaseUser | null) => {
            const isExplicitlyLoggedOut = localStorage.getItem('chess_explicit_logout') === 'true';
            if (fbUser && !isExplicitlyLoggedOut) {
              try {
                const idToken = await fbUser.getIdToken();
                api.setToken(idToken);
                try {
                  const res = await api.syncFirebaseSession(idToken);
                  if (isMounted) {
                    setUser(res.user);
                    setCoachProfile(res.coach_profile || null);
                  }
                } catch (syncErr) {
                  // Fallback: read directly from Firestore client doc
                  try {
                    const userDoc = await getDoc(doc(clientDb, 'users', fbUser.uid));
                    if (userDoc.exists() && isMounted) {
                      setUser(userDoc.data() as User);
                    }
                  } catch (docErr) {
                    console.warn('[AuthContext] Firestore direct read note:', docErr);
                  }
                }
              } catch (err) {
                console.warn('[AuthContext] Firebase onIdTokenChanged sync note:', err);
              }
            }
          },
          (error) => {
            console.warn('[AuthContext] Firebase onIdTokenChanged error:', error);
          }
        );
      } catch (err) {
        console.warn('[AuthContext] Could not initialize Firebase auth listener:', err);
      }
    }

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const login = async (usernameOrEmail: string, password?: string) => {
    localStorage.removeItem('chess_explicit_logout');
    const pass = password || '';
    const input = usernameOrEmail.trim();

    if (!input) {
      throw new Error('Please enter your username or email address.');
    }

    let targetEmail = input;

    // 1. If user entered a username instead of an email, resolve to the registered email address
    if (!input.includes('@')) {
      // Check known quick mappings
      if (input.toLowerCase() === 'weihaosuper') {
        targetEmail = 'twyuan07@gmail.com';
      }

      // Try API resolve account
      try {
        const account = await api.resolveAccount(input);
        if (account && account.email) {
          targetEmail = account.email;
        }
      } catch (err) {
        console.warn('[Auth] Account resolution fallback for input:', input);
      }

      // Try Firestore client lookup by username
      if (targetEmail === input && isFirebaseAuthAvailable) {
        try {
          const q = query(collection(clientDb, 'users'), where('username', '==', input.toLowerCase()));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const foundData = snap.docs[0].data();
            if (foundData.email) {
              targetEmail = foundData.email;
            }
          }
        } catch (queryErr) {
          console.warn('[Auth] Firestore username query fallback note:', queryErr);
        }
      }

      // If still unresolved without an @, default to standard email domain
      if (!targetEmail.includes('@')) {
        targetEmail = `${input.toLowerCase()}@academy.com`;
      }
    }

    // 2. Authenticate using Firebase Authentication
    let firebaseSuccess = false;
    let firebaseAuthErrorMsg: string | null = null;

    if (isFirebaseAuthAvailable && pass) {
      try {
        const userCredential = await signInWithEmailAndPassword(clientAuth, targetEmail, pass);

        if (userCredential && userCredential.user) {
          const idToken = await userCredential.user.getIdToken();
          api.setToken(idToken);

          // Try syncing with backend
          try {
            const session = await api.syncFirebaseSession(idToken);
            setUser(session.user);
            setCoachProfile(session.coach_profile || null);
            firebaseSuccess = true;
          } catch (syncErr) {
            console.warn('[Auth] Backend sync failed, loading from Firestore client directly:', syncErr);
            // Direct Firestore fallback
            try {
              const userSnap = await getDoc(doc(clientDb, 'users', userCredential.user.uid));
              if (userSnap.exists()) {
                const userData = userSnap.data() as User;
                setUser(userData);
                firebaseSuccess = true;
              } else {
                const isSuperAdmin =
                  targetEmail.includes('weihao') ||
                  targetEmail === 'twyuan07@gmail.com' ||
                  targetEmail === 'whcagallery@gmail.com' ||
                  targetEmail === 'weihaosuper@academy.com' ||
                  targetEmail.includes('super');
                const directUser: User = {
                  id: userCredential.user.uid,
                  username: input.includes('@') ? input.split('@')[0] : input,
                  email: targetEmail,
                  name: userCredential.user.displayName || (isSuperAdmin ? 'Wei Hao (Super Admin)' : 'Academy User'),
                  role: isSuperAdmin ? 'SUPER_ADMIN' : 'COACH',
                  is_active: true,
                  created_at: new Date().toISOString(),
                };
                setUser(directUser);
                firebaseSuccess = true;
              }
            } catch (fsErr) {
              console.error('[Auth] Firestore client profile load error:', fsErr);
            }
          }
        }
      } catch (fbAuthError: any) {
        console.warn('[Auth] Client Firebase Auth signIn note:', fbAuthError?.code, fbAuthError?.message);
        if (fbAuthError.code === 'auth/wrong-password' || fbAuthError.code === 'auth/invalid-credential') {
          firebaseAuthErrorMsg = 'Incorrect password. Please verify your password and try again.';
        } else if (fbAuthError.code === 'auth/user-not-found') {
          firebaseAuthErrorMsg = `Account "${input}" not found in Firebase. Please initialize Super Admin or check your username.`;
        } else if (fbAuthError.code === 'auth/too-many-requests') {
          firebaseAuthErrorMsg = 'Too many failed attempts. Access temporarily locked. Please try again in a few minutes.';
        } else if (fbAuthError.code === 'auth/network-request-failed') {
          firebaseAuthErrorMsg = 'Network error connecting to Firebase. Please check your internet connection.';
        }
      }
    }

    // 3. Fallback to API login endpoint if Firebase didn't succeed
    if (!firebaseSuccess) {
      try {
        const res = await api.login(input, pass);
        setUser(res.user);
        setCoachProfile(res.coach_profile || null);
      } catch (apiErr: any) {
        if (firebaseAuthErrorMsg) {
          throw new Error(firebaseAuthErrorMsg);
        }
        throw new Error(apiErr.message || 'Authentication failed. Please verify your credentials.');
      }
    }
  };

  const switchUser = async (usernameOrEmail: string) => {
    localStorage.removeItem('chess_explicit_logout');
    await login(usernameOrEmail);
  };

  const logout = async () => {
    localStorage.setItem('chess_explicit_logout', 'true');
    if (isFirebaseAuthAvailable) {
      try {
        await signOut(clientAuth);
      } catch (e) {
        // Ignore client auth signOut error
      }
    }
    await api.logout();
    setUser(null);
    setCoachProfile(null);
  };

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const isCoach = user?.role === 'COACH';

  return (
    <AuthContext.Provider
      value={{
        user,
        coachProfile,
        isLoading,
        login,
        switchUser,
        logout,
        isSuperAdmin,
        isAdmin,
        isCoach,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

