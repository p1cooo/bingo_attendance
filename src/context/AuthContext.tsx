import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Coach } from '../types.js';
import { api } from '../lib/api.js';

interface AuthContextType {
  user: User | null;
  coachProfile: Coach | null;
  isLoading: boolean;
  login: (usernameOrEmail: string, password?: string) => Promise<void>;
  switchUser: (usernameOrEmail: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isCoach: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [coachProfile, setCoachProfile] = useState<Coach | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function checkAuth() {
      const isExplicitlyLoggedOut = localStorage.getItem('chess_explicit_logout') === 'true';
      const token = api.getToken();

      if (isExplicitlyLoggedOut || !token) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await api.getMe();
        setUser(res.user);
        setCoachProfile(res.coach_profile || null);
      } catch (err) {
        api.setToken(null);
        setUser(null);
        setCoachProfile(null);
      } finally {
        setIsLoading(false);
      }
    }

    checkAuth();
  }, []);

  const login = async (usernameOrEmail: string, password?: string) => {
    setIsLoading(true);
    try {
      localStorage.removeItem('chess_explicit_logout');
      const pass = password || 'password123';
      const res = await api.login(usernameOrEmail, pass);
      setUser(res.user);
      setCoachProfile(res.coach_profile || null);
    } finally {
      setIsLoading(false);
    }
  };

  const switchUser = async (usernameOrEmail: string) => {
    setIsLoading(true);
    try {
      localStorage.removeItem('chess_explicit_logout');
      const pass = 'password123';
      const res = await api.login(usernameOrEmail, pass);
      setUser(res.user);
      setCoachProfile(res.coach_profile || null);
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
      await api.logout();
    } finally {
      setUser(null);
      setCoachProfile(null);
      setIsLoading(false);
    }
  };

  const isAdmin = user?.role === 'ADMIN';
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
