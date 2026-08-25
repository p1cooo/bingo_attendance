import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { useToast } from '../common/Toast.js';
import { api } from '../../lib/api.js';
import { Student, AttendanceRecord, ClassSession } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import {
  Crown,
  Calendar,
  UserCheck,
  Clock,
  LogOut,
  Moon,
  Sun,
  Award,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BookOpen,
  CalendarDays,
  ShieldCheck,
} from 'lucide-react';

export const StudentWorkspace: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  const [student, setStudent] = useState<Student | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStudentData() {
      try {
        setLoading(true);
        const [profile, recs] = await Promise.all([
          api.getStudentProfile(),
          api.getAttendanceRecords({ student_search: user?.name || '' }),
        ]);
        setStudent(profile);
        setAttendances(recs);
      } catch (err: any) {
        showToast(err.message || 'Failed to load student portal data', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadStudentData();
  }, [user]);

  const summary = student?.attendance_summary || {
    total_sessions: attendances.length,
    present_count: attendances.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length,
    replacement_count: attendances.filter((a) => a.attendance_type === 'REPLACEMENT').length,
    rate_percent:
      attendances.length > 0
        ? Math.round(
            (attendances.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length /
              attendances.length) *
              100
          )
        : 100,
  };

  return (
    <div className="min-h-screen bg-[#fcfcfd] dark:bg-neutral-950 text-slate-900 dark:text-white transition-colors font-sans pb-16">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md border-b-2 border-slate-900 dark:border-neutral-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-black text-xs border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.1)]">
              <Crown className="w-5 h-5 text-amber-400 dark:text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
                  CHESS ACADEMY
                </span>
                <span className="bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300 dark:border-sky-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                  Student Portal
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Personal Timetable & Attendance Record
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 transition-colors shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
              title="Toggle theme"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-900 dark:text-white text-xs font-black shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] transition-transform active:translate-x-0.5 active:translate-y-0.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {loading ? (
          <div className="space-y-6">
            <LoadingSkeleton count={3} type="stat" />
            <LoadingSkeleton count={4} type="card" />
          </div>
        ) : (
          <>
            {/* Student Profile Identity Card */}
            <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 sm:p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-black bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-2.5 py-0.5 rounded-full shadow-2xs">
                    {student?.student_id || 'STU-0101'}
                  </span>
                  <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {student?.full_name || user?.name}
                  </h1>
                  {student?.nick_name && (
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      ({student.nick_name})
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-3 flex-wrap">
                  {student?.school && <span>🏫 {student.school}</span>}
                  {student?.parent && (
                    <span>
                      👨‍👩‍👧 {student.parent.name} ({student.parent_relation || 'Parent'})
                    </span>
                  )}
                  <span className="text-emerald-600 dark:text-emerald-400 font-black">
                    ● Enrolled Active
                  </span>
                </div>
              </div>

              {/* Attendance Score Chip */}
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-neutral-800/80 border-2 border-slate-900 dark:border-neutral-700 p-3.5 rounded-2xl shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                <div>
                  <div className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    Attendance Rate
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {summary.rate_percent}%
                  </div>
                </div>
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border-2 border-slate-900 ${
                    summary.rate_percent >= 85
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Quick Metrics Bento */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-[#f0f9ff] dark:bg-sky-950/30 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-800 dark:text-sky-300">
                  Enrolled Classes
                </span>
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {student?.enrolled_schedules?.length || 0}
                </div>
              </div>

              <div className="bg-[#ecfdf5] dark:bg-emerald-950/30 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Sessions Present
                </span>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
                  {summary.present_count}
                </div>
              </div>

              <div className="bg-[#fff7ed] dark:bg-amber-950/30 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Replacements / Makeups
                </span>
                <div className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1">
                  {summary.replacement_count}
                </div>
              </div>

              <div className="bg-[#fdf4ff] dark:bg-purple-950/30 border-2 border-slate-900 dark:border-neutral-700 rounded-2xl p-4 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-800 dark:text-purple-300">
                  Total Logged
                </span>
                <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {summary.total_sessions}
                </div>
              </div>
            </div>

            {/* Enrolled Classes & Timetable Section */}
            <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 sm:p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                    My Enrolled Classes & Schedule
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Permanent recurring weekly training slots
                  </p>
                </div>
                <CalendarDays className="w-5 h-5 text-slate-400" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {student?.enrolled_schedules && student.enrolled_schedules.length > 0 ? (
                  student.enrolled_schedules.map((cls) => (
                    <div
                      key={cls.id}
                      className="p-4 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50/50 dark:bg-neutral-800/40 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-black text-sm text-slate-900 dark:text-white">
                            {cls.class_name || cls.name}
                          </span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                            {cls.day_name}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {cls.start_time} – {cls.end_time}
                          </span>
                        </div>
                        {cls.room_location && (
                          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mt-1">
                            📍 {cls.room_location}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-neutral-700 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-slate-900"
                            style={{ backgroundColor: cls.coach?.color || '#3b82f6' }}
                          />
                          <span className="font-black text-slate-800 dark:text-slate-200">
                            Coach {cls.coach?.name || 'Assigned'}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          Active Member
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs font-bold text-slate-400 col-span-2">
                    No class enrollments found.
                  </div>
                )}
              </div>
            </div>

            {/* Attendance History Records */}
            <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 sm:p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                    Attendance History & Past Sessions
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Verified session check-ins recorded by academy coaches
                  </p>
                </div>
                <UserCheck className="w-5 h-5 text-slate-400" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-neutral-800 border-b-2 border-slate-900 dark:border-neutral-700 font-black uppercase text-[10px] text-slate-600 dark:text-slate-400">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Class</th>
                      <th className="py-3 px-4">Coach</th>
                      <th className="py-3 px-4 text-center">Type</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                    {attendances.length > 0 ? (
                      attendances.map((rec) => {
                        const isPresent = rec.status === 'PRESENT' || rec.status === 'LATE';
                        const isReplacement = rec.attendance_type === 'REPLACEMENT';

                        return (
                          <tr key={rec.id} className="hover:bg-slate-50/50 dark:hover:bg-neutral-800/40">
                            <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                              {rec.session?.session_date || '2026-08'}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                              {rec.session?.class_item?.name || 'Group Training'}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-600 dark:text-slate-300">
                              {rec.session?.actual_coach?.name
                                ? `Coach ${rec.session.actual_coach.name}`
                                : 'Coach'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isReplacement ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-300">
                                  Replacement
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400">Regular</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {isPresent ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Present
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-300">
                                  <XCircle className="w-3 h-3" />
                                  Absent
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-xs font-bold text-slate-400">
                          No past attendance records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
