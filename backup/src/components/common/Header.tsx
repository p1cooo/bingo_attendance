import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { LogOut, Moon, Sun, Shield, User as UserIcon, Users, ChevronDown, Check, Crown } from 'lucide-react';

interface HeaderProps {
  workspaceTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ workspaceTitle }) => {
  const { user, coachProfile, logout, isAdmin, switchUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);

  const personas = [
    { username: 'admin123', email: 'admin@academy.com', name: 'Admin (admin123)', role: 'Admin', color: '#0f172a', colorName: 'Master Portal' },
    { username: 'coachchuah', email: 'chuah@academy.com', name: 'Coach Chuah (coachchuah)', role: 'Coach', color: '#8b5cf6', colorName: 'Pastel Purple' },
    { username: 'coachtan', email: 'tan@academy.com', name: 'Coach Tan (coachtan)', role: 'Coach', color: '#10b981', colorName: 'Pastel Green' },
    { username: 'coachweiyuan', email: 'weiyuan@academy.com', name: 'FM Wei Yuan (coachweiyuan)', role: 'Coach', color: '#3b82f6', colorName: 'Pastel Blue' },
    { username: 'coachjason', email: 'jason@academy.com', name: 'Jason (coachjason)', role: 'Coach', color: '#f59e0b', colorName: 'Pastel Amber' },
    { username: 'coachsarah', email: 'sarah@academy.com', name: 'Sarah (coachsarah)', role: 'Coach', color: '#ec4899', colorName: 'Pastel Pink' },
  ];

  const isDev = Boolean((import.meta as any).env?.DEV || (import.meta as any).env?.MODE === 'development');
  const showDevSwitcher = isDev || isAdmin;

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-neutral-900/95 backdrop-blur border-b-2 border-slate-900 dark:border-neutral-800 transition-colors">
      {/* Top Fast Switcher Bar (Available in Development / Admin environments) */}
      {showDevSwitcher && (
        <div className="bg-slate-100 dark:bg-neutral-950 border-b border-slate-200 dark:border-neutral-800 px-4 py-1.5 overflow-x-auto scrollbar-none">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="font-black uppercase tracking-wider text-slate-500 text-[10px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {isDev ? 'Dev Account Switcher:' : 'Admin Impersonation Switcher:'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto">
              {personas.map((p) => {
                const isCurrent = user?.email === p.email;
                return (
                  <button
                    key={p.username}
                    type="button"
                    onClick={() => switchUser(p.username)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-bold transition-all text-[11px] flex-shrink-0 cursor-pointer ${
                      isCurrent
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,0.8)]'
                        : 'bg-white dark:bg-neutral-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-neutral-800 border border-slate-300 dark:border-neutral-700'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-slate-900 dark:border-white"
                      style={{ backgroundColor: p.color }}
                    />
                    <span>{p.name}</span>
                    {isCurrent && <Check className="w-3 h-3 text-emerald-400 dark:text-emerald-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Workspace Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm tracking-tight border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]">
            <Crown className="w-5 h-5 text-amber-400 dark:text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-slate-900 dark:text-white text-base leading-tight tracking-tight">
                CHESS ACADEMY
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
        <div className="flex items-center gap-2 sm:gap-3">
          {/* User profile identifier */}
          {user && (
            <div className="flex items-center gap-2.5 py-1.5 px-3 rounded-2xl bg-slate-50 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 text-xs shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.06)]">
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
              <div className="flex flex-col text-left">
                <span className="font-black text-slate-900 dark:text-white leading-tight">
                  {isAdmin ? 'Administrator' : `Coach ${coachProfile?.name || user.name}`}
                </span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  {isAdmin ? 'Admin Root' : coachProfile?.color_name || 'Staff Coach'}
                </span>
              </div>
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
  );
};
