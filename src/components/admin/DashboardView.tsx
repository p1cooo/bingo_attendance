import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { formatFullDate, getTodayDateString, formatMonthName, getCurrentMonthString } from '../../lib/dateUtils.js';
import { ClassSession } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { CoachBadge } from '../common/CoachBadge.js';
import {
  Calendar,
  Users,
  UserCheck,
  Sparkles,
  ArrowRight,
  Plus,
  Clock,
  CheckCircle2,
  CalendarDays,
  FileText,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
  onOpenAddStudent: () => void;
  onOpenAddCoach: () => void;
  onOpenCreateSchedule: () => void;
  onSelectSession: (sessionId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenAddStudent,
  onOpenAddCoach,
  onOpenCreateSchedule,
  onSelectSession,
}) => {
  const { showToast } = useToast();
  const [stats, setStats] = useState<{
    month: string;
    sessions_this_month: number;
    student_attendances: number;
    replacement_attendances: number;
    today_sessions: ClassSession[];
    total_active_students: number;
    total_active_coaches: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getDashboardStats();
      setStats({
        ...data,
        today_sessions: Array.isArray(data?.today_sessions) ? data.today_sessions.filter(Boolean) : [],
      });
    } catch (err: any) {
      const msg = err.message || 'Failed to load dashboard metrics';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton count={3} type="stat" />
        <LoadingSkeleton count={4} type="card" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-8 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-center space-y-4 shadow-2xs">
        <div className="text-rose-500 font-semibold text-sm">
          {error || 'Unable to display dashboard metrics'}
        </div>
        <p className="text-xs text-neutral-500 max-w-md mx-auto">
          We encountered an issue retrieving the latest operations summary. Click below to retry.
        </p>
        <button
          onClick={loadDashboard}
          className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-colors shadow-2xs cursor-pointer"
        >
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  const currentMonthLabel = formatMonthName(stats.month || getCurrentMonthString());
  const todayLabel = formatFullDate(getTodayDateString());

  return (
    <div className="space-y-8">
      {/* Top Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">
            Academy Overview
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {currentMonthLabel} Operations & Digital Attendance Summary
          </p>
        </div>

        {/* Quick Actions Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="quick-add-student-btn"
            onClick={onOpenAddStudent}
            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Student</span>
          </button>
          <button
            id="quick-add-coach-btn"
            onClick={onOpenAddCoach}
            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Staff / Coach</span>
          </button>
          <button
            id="quick-create-schedule-btn"
            onClick={onOpenCreateSchedule}
            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Schedule</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Cards (Minimal, purposeful, non-hero-cliché) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Sessions this month
            </span>
            <Calendar className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
              {stats.sessions_this_month}
            </span>
            <span className="text-xs text-neutral-500">scheduled</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Student attendances
            </span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
              {stats.student_attendances}
            </span>
            <span className="text-xs text-neutral-500">recorded</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Replacement attendances
            </span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
              {stats.replacement_attendances}
            </span>
            <span className="text-xs text-neutral-500">flexible makeups</span>
          </div>
        </div>
      </div>

      {/* Today's Classes List (Clean, scannable, not cluttered) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Today's Classes
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {todayLabel} · Live Session Attendance
            </p>
          </div>

          <button
            onClick={() => onNavigate('reports')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>View Monthly Report</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800 shadow-2xs overflow-hidden">
          {stats.today_sessions.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              No sessions scheduled for today.
            </div>
          ) : (
            stats.today_sessions.map((sess) => {
              const isCancelled = sess.status === 'COACH_CANCELLED' || sess.status === 'CANCELLED' || sess.session_type === 'COACH_CANCELLED';
              const isOffDay = sess.status === 'PLANNED_OFF_DAY' || sess.status === 'OFF_DAY' || sess.session_type === 'PLANNED_OFF_DAY';
              const isReplacement = !isCancelled && !isOffDay && sess.scheduled_coach_id !== sess.actual_coach_id;
              const coachColor = isCancelled ? '#ef4444' : isOffDay ? '#94a3b8' : (sess.actual_coach?.color || '#3b82f6');
              const markedCount = sess.marked_attendance_count || 0;
              const presentCount = sess.present_count || 0;
              const expectedCount = sess.expected_students_count || 0;

              return (
                <div
                  key={sess.id}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    isCancelled
                      ? 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/60'
                      : isOffDay
                      ? 'bg-neutral-50/40 dark:bg-neutral-900/40 opacity-80'
                      : 'hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3">
                    {/* Pastel Coach Indicator Line */}
                    <div
                      className="w-1.5 h-10 rounded-full flex-shrink-0 self-center"
                      style={{ backgroundColor: coachColor }}
                    />

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                          {sess.start_time} – {sess.end_time}
                        </span>
                        <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                          {sess.class_item?.name}
                        </span>
                        {isCancelled && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                            Coach Cancelled
                          </span>
                        )}
                        {isOffDay && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-200 dark:bg-neutral-800 text-slate-800 dark:text-slate-300 border border-slate-300">
                            Planned Off-Day
                          </span>
                        )}
                        {isReplacement && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Replacement Coach
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                        {isCancelled ? (
                          <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            Reason: {sess.cancellation_reason || 'Coach Unavailable'}
                          </span>
                        ) : isOffDay ? (
                          <span className="text-[11px] text-slate-500">
                            {sess.cancellation_reason || 'Academy Off-Day'}
                          </span>
                        ) : (
                          <>
                            <CoachBadge coach={sess.actual_coach} size="sm" variant="dot" />
                            {isReplacement && (
                              <span className="text-[11px] text-neutral-400">
                                (Sched: Coach {sess.scheduled_coach?.name})
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side: Attendance status and action */}
                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-left sm:text-right">
                      {isCancelled ? (
                        <>
                          <span className="text-xs font-bold text-rose-700 dark:text-rose-300 block">
                            Cancelled Class
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            No Roll Call
                          </span>
                        </>
                      ) : isOffDay ? (
                        <>
                          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 block">
                            Off-Day
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            No Attendance
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-semibold text-neutral-900 dark:text-white block">
                            {presentCount} / {expectedCount} present
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            {markedCount > 0 ? `${markedCount} marked` : 'Not started'}
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => onSelectSession(sess.id)}
                      className="py-1.5 px-3 rounded-lg text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>Inspect</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
