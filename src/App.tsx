import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { ToastProvider } from './components/common/Toast.js';
import { LoginView } from './components/auth/LoginView.js';
import { CoachWorkspace } from './components/coach/CoachWorkspace.js';
import { AdminWorkspace } from './components/admin/AdminWorkspace.js';

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfdfd] dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-slate-900 dark:border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
            Loading Academy System...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
    return <AdminWorkspace />;
  }

  return <CoachWorkspace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
