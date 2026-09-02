import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { LogOut, Moon, Sun, Shield, User as UserIcon, Users, ChevronDown, Check, Crown } from 'lucide-react';

interface HeaderProps {
  workspaceTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ workspaceTitle }) => {
  const { user, coachProfile, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-neutral-900/95 backdrop-blur border-b-2 border-slate-900 dark:border-neutral-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Workspace Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-sm tracking-tight border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]">
            <Crown className="w-5 h-5 text-amber-400 dark:text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-slate-900 dark:text-white text-base leading-tight tracking-tight">
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
