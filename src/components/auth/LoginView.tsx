import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { api } from '../../lib/api.js';
import {
  Shield,
  UserCheck,
  Lock,
  User as UserIcon,
  Moon,
  Sun,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Crown,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initial Provisioning State
  const [isProvisioned, setIsProvisioned] = useState<boolean | null>(null);
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);
  const [provisionPassword, setProvisionPassword] = useState('');
  const [showProvisionPassword, setShowProvisionPassword] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);

  useEffect(() => {
    async function checkProvision() {
      try {
        const res = await api.getProvisionStatus();
        setIsProvisioned(res.isProvisioned);
      } catch (e) {
        setIsProvisioned(true); // default to true if error
      }
    }
    checkProvision();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your username (e.g. weihaosuper, coachwei, coachchuah)');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProvisionSuperAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provisionPassword || provisionPassword.length < 6) {
      setProvisionError('Password must be at least 6 characters');
      return;
    }

    setProvisionError(null);
    setIsProvisioning(true);

    try {
      await api.provisionSuperAdmin({
        username: 'weihaosuper',
        email: 'weihaosuper@academy.com',
        displayName: 'Wei Hao (Super Admin)',
        password: provisionPassword,
      });

      setIsProvisioned(true);
      setIsProvisionModalOpen(false);

      // Immediately log in with the new credentials
      await login('weihaosuper', provisionPassword);
    } catch (err: any) {
      setProvisionError(err.message || 'Failed to provision Super Admin account.');
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#fdfdfd] dark:bg-neutral-950 transition-colors font-sans">
      {/* Top Bar with theme toggle */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-black text-xs border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]">
            <Crown className="w-5 h-5 text-amber-400 dark:text-amber-500" />
          </div>
          <div>
            <h1 className="font-black text-base tracking-tighter text-slate-900 dark:text-white">
              BINGO CHESS ACADEMY
            </h1>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[9px]">
              FROM ZERO TO HERO
            </p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 transition-colors shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          title="Toggle theme"
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Login Box */}
      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-lg">
          {/* One-Time Super Admin Provision Banner if unprovisioned */}
          {isProvisioned === false && (
            <div className="mb-4 p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 shadow-[4px_4px_0px_0px_rgba(245,158,11,1)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-2xl bg-amber-500 text-slate-950">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-950 dark:text-amber-200">
                    Initial Setup Required
                  </h4>
                  <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                    Provision the Super Admin account (<strong>weihaosuper</strong>).
                  </p>
                </div>
              </div>
              <button
                id="open-provision-modal-btn"
                onClick={() => setIsProvisionModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-black tracking-tight border-2 border-slate-900 dark:border-white shadow-xs hover:bg-slate-800 transition-all cursor-pointer whitespace-nowrap"
              >
                Provision Now
              </button>
            </div>
          )}

          {/* Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border-3 border-slate-900 dark:border-neutral-700 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.08)] p-6 sm:p-8 transition-all">
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.1]">
                Academy Sign In
              </h2>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-600 flex items-start gap-2.5 text-rose-900 dark:text-rose-200 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(225,29,72,1)]">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Username or Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    id="login-username-input"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="w-full pl-9 pr-3 py-2.5 text-xs font-bold rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:bg-white transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Account Password
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="login-password-input"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 text-xs font-bold rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:bg-white transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  />
                </div>
              </div>

              <button
                id="sign-in-submit-btn"
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-3 py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] transition-all active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Signing In...</span>
                ) : (
                  <>
                    <span>Sign In to Workspace</span>
                    <ArrowRight className="w-4 h-4 stroke-[3]" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* PROVISION SUPER ADMIN MODAL */}
      {isProvisionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-neutral-900 border-3 border-slate-900 dark:border-white rounded-3xl max-w-md w-full p-6 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.15)] space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-100 dark:border-neutral-800">
              <div className="p-2 rounded-2xl bg-amber-500 text-slate-950">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Provision Super Admin</h3>
                <p className="text-xs text-slate-500">Account: <strong>weihaosuper</strong></p>
              </div>
            </div>

            {provisionError && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-500 text-rose-900 dark:text-rose-200 text-xs font-bold">
                {provisionError}
              </div>
            )}

            <form onSubmit={handleProvisionSuperAdmin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Username
                </label>
                <input
                  type="text"
                  disabled
                  value="weihaosuper"
                  className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-neutral-800 border-2 border-slate-300 dark:border-neutral-700 rounded-2xl text-xs font-mono font-bold text-slate-600 dark:text-slate-300"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Set Initial Password *
                </label>
                <div className="relative">
                  <input
                    id="provision-password-input"
                    type={showProvisionPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Enter secure password (min 6 characters)"
                    value={provisionPassword}
                    onChange={(e) => setProvisionPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl text-xs font-bold text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowProvisionPassword(!showProvisionPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showProvisionPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsProvisionModalOpen(false)}
                  className="px-4 py-2 rounded-2xl text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  id="submit-provision-btn"
                  type="submit"
                  disabled={isProvisioning}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500 text-slate-950 font-black text-xs border-2 border-slate-900 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:bg-amber-400 transition-all active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                >
                  {isProvisioning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Provision & Sign In</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="w-full text-center py-4 text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 border-t-2 border-slate-900/10 dark:border-neutral-800">
        © 2026 Bingo Chess Academy. All Rights Reserved.
      </div>
    </div>
  );
};

