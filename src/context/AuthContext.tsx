import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { User, Coach } from '../types.js';
import { api } from '../lib/api.js';
import { clientAuth, isFirebaseAuthAvailable } from '../lib/firebase.js';

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
                const res = await api.syncFirebaseSession(idToken);
                if (isMounted) {
                  setUser(res.user);
                  setCoachProfile(res.coach_profile || null);
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
    setIsLoading(true);
    try {
      localStorage.removeItem('chess_explicit_logout');
      const pass = password || '';
      const input = usernameOrEmail.trim();

      let targetEmail = input;

      // 1. If user entered a username instead of an email, resolve to the registered email address
      if (!input.includes('@')) {
        try {
          const account = await api.resolveAccount(input);
          if (account && account.email) {
            targetEmail = account.email;
          }
        } catch (err) {
          console.warn('[Auth] Account resolution fallback for input:', input);
        }
      }

      // 2. Authenticate using Firebase Authentication
      let firebaseSuccess = false;
      if (isFirebaseAuthAvailable) {
        try {
          const userCredential = await signInWithEmailAndPassword(clientAuth, targetEmail, pass);

          if (userCredential && userCredential.user) {
            const idToken = await userCredential.user.getIdToken();
            api.setToken(idToken);
            const session = await api.syncFirebaseSession(idToken);
            setUser(session.user);
            setCoachProfile(session.coach_profile || null);
            firebaseSuccess = true;
          }
        } catch (fbAuthError: any) {
          console.warn('[Auth] Client Firebase Auth signIn failed, trying API session fallback:', fbAuthError?.message);
        }
      }

      // 3. Fallback to API login endpoint
      if (!firebaseSuccess) {
        const res = await api.login(input, pass);
        setUser(res.user);
        setCoachProfile(res.coach_profile || null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchUser = async (usernameOrEmail: string) => {
    setIsLoading(true);
    try {
      localStorage.removeItem('chess_explicit_logout');
      await login(usernameOrEmail);
    } catch (err) {
      console.error('Error switching user:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      localStorage.setItem('chess_explicit_logout', 'true');
      if (isFirebaseAuthAvailable) {
        try {
          await signOut(clientAuth);
        } catch (e) {
          // Ignore client auth signOut error
        }
      }
      await api.logout();
    } finally {
      setUser(null);
      setCoachProfile(null);
      setIsLoading(false);
    }
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

