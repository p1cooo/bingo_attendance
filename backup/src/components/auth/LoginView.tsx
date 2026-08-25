import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { Shield, UserCheck, Lock, User as UserIcon, Moon, Sun, ArrowRight, AlertCircle, Sparkles, Crown, CheckCircle2, KeyRound } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your username (e.g. coachchuah, coachtan, admin123)');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(username.trim(), password || 'password123');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFill = (userVal: string, passVal: string = 'password123') => {
    setUsername(userVal);
    setPassword(passVal);
    setError(null);
  };

  const presetAccounts = [
    {
      id: 'admin',
      username: 'admin123',
      displayName: 'Admin Portal',
      role: 'ADMIN',
      badge: 'Full Operations',
      color: '#0f172a',
      bgClass: 'bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/30',
    },
    {
      id: 'chuah',
      username: 'coachchuah',
      displayName: 'Coach Chuah',
      role: 'COACH',
      badge: 'Pastel Purple',
      color: '#8b5cf6',
      bgClass: 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30',
    },
    {
      id: 'tan',
      username: 'coachtan',
      displayName: 'Coach Tan',
      role: 'COACH',
      badge: 'Pastel Green',
      color: '#10b981',
      bgClass: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30',
    },
    {
      id: 'weiyuan',
      username: 'coachweiyuan',
      displayName: 'Coach Wei Yuan',
      role: 'COACH',
      badge: 'Pastel Blue',
      color: '#3b82f6',
      bgClass: 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30',
    },
    {
      id: 'jason',
      username: 'coachjason',
      displayName: 'Coach Jason',
      role: 'COACH',
      badge: 'Pastel Amber',
      color: '#f59e0b',
      bgClass: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30',
    },
    {
      id: 'sarah',
      username: 'coachsarah',
      displayName: 'Coach Sarah',
      role: 'COACH',
      badge: 'Pastel Pink',
      color: '#ec4899',
      bgClass: 'bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/30',
    },
    {
      id: 'student-1',
      username: 'student_johntan',
      displayName: 'Student John Tan',
      role: 'STUDENT',
      badge: 'STU-0101',
      color: '#0284c7',
      bgClass: 'bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/30',
    },
    {
      id: 'student-2',
      username: 'student_amylim',
      displayName: 'Student Amy Lim',
      role: 'STUDENT',
      badge: 'STU-0102',
      color: '#059669',
      bgClass: 'bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/30',
    },
  ];

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
              CHESS ACADEMY
            </h1>
            <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[9px]">
              Digital Roll Call, Operations & Live Progress Portal
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
          {/* Card */}
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] border-3 border-slate-900 dark:border-neutral-700 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.08)] p-6 sm:p-8 transition-all">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                  Secure Access
                </span>
                <span className="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" /> Auto-Save Active
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-[1.1]">
                Academy Sign In
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                Log in as an administrator or coach. All edits and changes are saved automatically.
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
                    placeholder="e.g. coachchuah, coachtan, or admin123"
                    className="w-full pl-9 pr-3 py-2.5 text-xs font-bold rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:bg-white transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <span className="text-[10px] font-bold text-slate-400">
                    Default: <code className="text-slate-700 dark:text-slate-300 font-mono">password123</code>
                  </span>
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
                    placeholder="password123"
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
                  <span>LOGGING IN...</span>
                ) : (
                  <>
                    <span>SIGN IN TO WORKSPACE</span>
                    <ArrowRight className="w-4 h-4 stroke-[3]" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Access Bar */}
            <div className="mt-6 pt-5 border-t-2 border-slate-900 dark:border-neutral-800">
              <div className="flex items-center justify-between text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>One-Click Quick Logins (Password: password123)</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {presetAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => handleQuickFill(acc.username, 'password123')}
                    className={`p-2.5 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 text-left transition-all shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 flex flex-col gap-1 cursor-pointer ${acc.bgClass}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-slate-900 flex-shrink-0"
                          style={{ backgroundColor: acc.color }}
                        />
                        <span className="text-[11px] font-black text-slate-900 dark:text-white leading-none">
                          {acc.displayName}
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400 truncate">
                      {acc.username}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full text-center py-4 text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 border-t-2 border-slate-900/10 dark:border-neutral-800 uppercase">
        Grandmaster Chess Academy · Production Attendance & Operations Engine
      </div>
    </div>
  );
};
