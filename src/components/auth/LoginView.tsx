import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import {
  Lock,
  User as UserIcon,
  Moon,
  Sun,
  ArrowRight,
  AlertCircle,
  Crown,
  Eye,
  EyeOff,
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your email address or username.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your email and password.');
    } finally {
      setIsSubmitting(false);
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
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border-3 border-slate-900 dark:border-neutral-700 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.08)] p-6 sm:p-8 transition-all">
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.1]">
                Academy Sign In
              </h2>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1.5">
                Sign in with your Firebase account credentials
              </p>
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
                  Email Address or Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    id="login-username-input"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. whcagallery@gmail.com"
                    className="w-full pl-9 pr-3 py-2.5 text-xs font-bold rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:bg-white transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="login-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 text-xs font-bold rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:bg-white transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                id="sign-in-submit-btn"
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3 px-4 rounded-2xl text-xs font-black uppercase tracking-widest bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] transition-all active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Signing In...</span>
                ) : (
                  <>
                    <span>Sign In to Portal</span>
                    <ArrowRight className="w-4 h-4 stroke-[3]" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full text-center py-4 text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 border-t-2 border-slate-900/10 dark:border-neutral-800">
        © 2026 Bingo Chess Academy. All Rights Reserved.
      </div>
    </div>
  );
};
