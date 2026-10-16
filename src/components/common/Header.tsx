import React, { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { clientAuth } from '../../lib/firebase.js';
import { useToast } from './Toast.js';
import { Modal } from './Modal.js';
import { LogOut, Moon, Sun, Shield, User as UserIcon, Users, ChevronDown, Check, Crown, KeyRound } from 'lucide-react';

interface HeaderProps {
  workspaceTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ workspaceTitle }) => {
  const { user, coachProfile, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const closePasswordForm = () => {
    setChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('Choose a different password from your current one.');
      return;
    }

    const firebaseUser = clientAuth.currentUser;
    if (!firebaseUser?.email) {
      setPasswordError('Your sign-in session is unavailable. Sign out and sign in again, then retry.');
      return;
    }

    setSavingPassword(true);
    try {
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, currentPassword));
      await updatePassword(firebaseUser, newPassword);
      closePasswordForm();
      showToast('Password changed successfully.', 'success');
    } catch (error) {
      const code = error instanceof FirebaseError ? error.code : '';
      setPasswordError(
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Current password is incorrect.'
          : code === 'auth/weak-password'
            ? 'Choose a stronger new password.'
            : code === 'auth/too-many-requests'
              ? 'Too many attempts. Please try again later.'
              : 'Could not change your password. Please try again.'
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <><header className="sticky top-0 z-30 bg-white/95 dark:bg-neutral-900/95 backdrop-blur border-b-2 border-slate-900 dark:border-neutral-800 transition-colors">
      <div className={`max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 ${isAdmin ? 'h-16' : 'min-h-16 py-2 sm:py-0'}`}>
        {/* Brand & Workspace Title */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm tracking-tight border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]">
            <Crown className="w-5 h-5 text-amber-400 dark:text-amber-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-black text-slate-900 dark:text-white text-xs sm:text-base leading-tight tracking-tight whitespace-nowrap">
                BINGO CHESS ACADEMY
              </h1>
              {workspaceTitle && (
                <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-neutral-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-neutral-700">
                  {workspaceTitle}
                </span>
              )}
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 tracking-wider uppercase hidden sm:block">
              {isAdmin ? 'Administration & Operations Master Portal' : 'Grandmaster Attendance & Class Portal'}
            </p>
          </div>
        </div>

        {/* Right side: User pill, Theme toggle, Logout */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* User profile identifier */}
          {user && (
            <div role="group" aria-label={isAdmin ? 'Administrator profile' : `Coach ${coachProfile?.name || user.name} profile`} className={`flex items-center gap-2.5 rounded-2xl bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 text-xs shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.06)] ${isAdmin ? 'py-1.5 px-3' : 'p-2 sm:py-1.5 sm:px-3'}`} title={isAdmin ? 'Administrator' : `Coach ${coachProfile?.name || user.name}`}>
              {isAdmin ? (
                <div className="w-5 h-5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-black text-[10px]">
                  AD
                </div>
              ) : (
                <div
                  className="w-4 h-4 rounded-full border border-slate-900 flex-shrink-0"
                  style={{ backgroundColor: coachProfile?.color || '#3b82f6' }}
                />
              )}
              <div className={`${isAdmin ? 'flex' : 'hidden sm:flex'} flex-col text-left`}>
                <span className="font-black text-slate-900 dark:text-white leading-tight">
                  {isAdmin ? 'Administrator' : `Coach ${coachProfile?.name || user.name}`}
                </span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  {isAdmin ? 'Admin Root' : 'Change password'}
                </span>
              </div>
              {user.role === 'COACH' && (
                <button type="button" onClick={() => setChangingPassword(true)} aria-label="Change password" title="Change password" className="rounded-lg p-1 text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-neutral-700">
                  <KeyRound className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Theme Toggle */}
          <button
            id="theme-toggle-btn"
            onClick={toggleTheme}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-700 transition-colors shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-0.5 active:translate-y-0.5 text-xs font-black"
            title={theme === 'light' ? 'Click to switch to Dark Mode' : 'Click to switch to Light Mode'}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? (
              <>
                <Sun className="w-4 h-4 text-amber-500 fill-amber-400" />
                <span className="hidden sm:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-sky-400 fill-sky-400" />
                <span className="hidden sm:inline">Dark</span>
              </>
            )}
          </button>

          {/* Logout Button */}
          <button
            id="logout-btn"
            onClick={logout}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-2xl text-xs font-black text-slate-900 dark:text-white hover:bg-rose-50 dark:hover:bg-rose-950/40 border-2 border-slate-900 dark:border-neutral-700 hover:border-rose-600 transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)] active:translate-x-0.5 active:translate-y-0.5"
            title="Sign out of system"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline uppercase text-[10px] tracking-wider">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
    <Modal isOpen={changingPassword} onClose={() => { if (!savingPassword) closePasswordForm(); }} title="Change password" subtitle="Enter your current password to secure your account." maxWidth="md">
      <form onSubmit={handleChangePassword} className="space-y-4">
        <div>
          <label htmlFor="coach-current-password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Current password</label>
          <input id="coach-current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="w-full rounded-xl border-2 border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-slate-900 dark:text-white" />
        </div>
        <div>
          <label htmlFor="coach-new-password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">New password</label>
          <input id="coach-new-password" type="password" autoComplete="new-password" required minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="w-full rounded-xl border-2 border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-slate-900 dark:text-white" />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">At least 6 characters.</p>
        </div>
        <div>
          <label htmlFor="coach-confirm-password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Confirm new password</label>
          <input id="coach-confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-xl border-2 border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-slate-900 dark:text-white" />
        </div>
        {passwordError && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-300">{passwordError}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={closePasswordForm} disabled={savingPassword} className="rounded-xl border-2 border-slate-300 dark:border-neutral-700 px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={savingPassword} className="rounded-xl bg-slate-900 dark:bg-white px-4 py-2 text-sm font-bold text-white dark:text-slate-900 disabled:opacity-50">{savingPassword ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </Modal></>
  );
};
