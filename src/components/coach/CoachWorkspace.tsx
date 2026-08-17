import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../common/Toast.js';
import { api } from '../../lib/api.js';
import { ClassSession } from '../../types.js';
import { CoachAttendanceScreen } from './CoachAttendanceScreen.js';
import { Header } from '../common/Header.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { EmptyState } from '../common/EmptyState.js';
import {
  Calendar,
  Clock,
  Users,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  Sparkles,
  MapPin,
  ChevronLeft,
} from 'lucide-react';

export const CoachWorkspace: React.FC = () => {
  const { user, coachProfile } = useAuth();
  const { showToast } = useToast();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('2026-08-16'); // Sunday
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate 7-day strip around the current selected week (Aug 15 - Aug 21, 2026)
  const weekDays = [
    { label: 'Sat', dayNum: '15', dateStr: '2026-08-15', full: 'Saturday, Aug 15' },
    { label: 'Sun', dayNum: '16', dateStr: '2026-08-16', full: 'Sunday, Aug 16 (Today)' },
    { label: 'Mon', dayNum: '17', dateStr: '2026-08-17', full: 'Monday, Aug 17' },
    { label: 'Tue', dayNum: '18', dateStr: '2026-08-18', full: 'Tuesday, Aug 18' },
    { label: 'Wed', dayNum: '19', dateStr: '2026-08-19', full: 'Wednesday, Aug 19' },
    { label: 'Thu', dayNum: '20', dateStr: '2026-08-20', full: 'Thursday, Aug 20' },
    { label: 'Fri', dayNum: '21', dateStr: '2026-08-21', full: 'Friday, Aug 21' },
    { label: 'Sat', dayNum: '22', dateStr: '2026-08-22', full: 'Saturday, Aug 22' },
    { label: 'Sun', dayNum: '23', dateStr: '2026-08-23', full: 'Sunday, Aug 23' },
    { label: 'Sat (5th)', dayNum: '29', dateStr: '2026-08-29', full: 'Saturday, Aug 29 (Off)' },
  ];

  const fetchTodaySessions = async () => {
    try {
      setLoading(true);
      const data = await api.getSessions({
        date: selectedDate,
        my_classes_only: true,
      });
      setSessions(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load classes', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodaySessions();
  }, [selectedDate, user?.id]);

  // If a session is active, show the CoachAttendanceScreen
  if (activeSessionId) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 transition-colors">
        <Header workspaceTitle="Coach Portal" />
        <CoachAttendanceScreen
          sessionId={activeSessionId}
          onBack={() => {
            setActiveSessionId(null);
            fetchTodaySessions();
          }}
        />
      </div>
    );
  }

  const coachDisplayName = coachProfile?.name || user?.name || 'Coach';
  const coachColor = coachProfile?.color || '#3b82f6';
  const coachColorName = coachProfile?.color_name || 'Pastel Blue';

  // Compute daily totals
  const totalStudents = sessions.reduce((acc, s) => acc + (s.expected_students_count || 0), 0);
  const totalMarked = sessions.reduce((acc, s) => acc + (s.marked_attendance_count || 0), 0);
  const totalPresent = sessions.reduce((acc, s) => acc + (s.present_count || 0), 0);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 transition-colors pb-16">
      <Header workspaceTitle="Coach Roll Call" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Welcome Coach Bento Hero */}
        <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 sm:p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] relative overflow-hidden">
          {/* Coach Color Accent Strip */}
          <div
            className="absolute top-0 left-0 right-0 h-2"
            style={{ backgroundColor: coachColor }}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full border border-slate-900"
                  style={{ backgroundColor: coachColor }}
                />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {coachColorName} Lead Coach
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Welcome, Coach {coachDisplayName}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Live Attendance Roll Call & Instant Telegram Broadcast Gateway
              </p>
            </div>

            {/* Micro Stats Bento */}
            <div className="flex items-center gap-2.5">
              <div className="bg-[#f0f9ff] dark:bg-sky-950/40 border-2 border-slate-900 dark:border-neutral-700 px-3.5 py-2 rounded-2xl text-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                <span className="block text-[9px] font-black uppercase text-sky-800 dark:text-sky-300">
                  My Sessions
                </span>
                <span className="text-base font-black text-slate-900 dark:text-white">
                  {sessions.length}
                </span>
              </div>
              <div className="bg-[#ecfdf5] dark:bg-emerald-950/40 border-2 border-slate-900 dark:border-neutral-700 px-3.5 py-2 rounded-2xl text-center shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
                <span className="block text-[9px] font-black uppercase text-emerald-800 dark:text-emerald-300">
                  Students Present
                </span>
                <span className="text-base font-black text-emerald-700 dark:text-emerald-300">
                  {totalPresent}/{totalStudents}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Horizontal Week Strip Date Navigation */}
        <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Select Training Date
            </span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-2.5 py-1 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {weekDays.map((wd) => {
              const isSelected = selectedDate === wd.dateStr;
              return (
                <button
                  key={wd.dateStr}
                  onClick={() => setSelectedDate(wd.dateStr)}
                  className={`flex flex-col items-center justify-center min-w-[62px] py-2 px-2.5 rounded-2xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] scale-[1.03]'
                      : 'bg-slate-50 dark:bg-neutral-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-neutral-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-80">
                    {wd.label}
                  </span>
                  <span className="text-base font-black leading-tight">{wd.dayNum}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Classes List */}
        {loading ? (
          <LoadingSkeleton count={3} type="card" />
        ) : sessions.length === 0 ? (
          <EmptyState
            title="No scheduled training sessions for this date"
            description="You have no assigned chess classes or replacement sessions on this date. Select another day on the calendar strip above."
            icon={CalendarDays}
          />
        ) : (
          <div className="space-y-4">
            {sessions.map((sess) => {
              const sessionCoachColor = sess.actual_coach?.color || '#3b82f6';
              const isReplacement = sess.scheduled_coach_id !== sess.actual_coach_id;

              const markedCount = sess.marked_attendance_count || 0;
              const presentCount = sess.present_count || 0;
              const expectedCount = sess.expected_students_count || 0;

              // Status classification: Not Marked, In Progress, Marked
              let statusBadge = {
                text: 'Not Marked',
                bgClass: 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-400 border-slate-300',
              };

              if (markedCount > 0 && markedCount < expectedCount) {
                statusBadge = {
                  text: `In Progress (${markedCount}/${expectedCount})`,
                  bgClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300',
                };
              } else if (markedCount > 0 && markedCount >= expectedCount) {
                statusBadge = {
                  text: `Marked (${presentCount} Present)`,
                  bgClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300',
                };
              }

              return (
                <div
                  key={sess.id}
                  id={`session-card-${sess.id}`}
                  className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-700 p-5 sm:p-6 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] relative overflow-hidden transition-all"
                >
                  {/* Coach Color Left Edge Stripe */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2.5"
                    style={{ backgroundColor: sessionCoachColor }}
                  />

                  <div className="pl-3 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="space-y-2">
                      {/* Time & Badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white border border-slate-300 dark:border-neutral-700">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            {sess.start_time} – {sess.end_time}
                          </span>
                        </div>

                        {sess.room_location && (
                          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{sess.room_location}</span>
                          </div>
                        )}

                        {isReplacement && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200">
                            <Sparkles className="w-3 h-3" />
                            Replacement Duty
                          </span>
                        )}

                        {sess.status === 'OFF_DAY' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-200">
                            5th-Week Off Day
                          </span>
                        )}
                      </div>

                      {/* Class Title */}
                      <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                        {sess.class_item?.name || 'Chess Training Class'}
                      </h3>

                      {/* Coach & Enrolled Student Count */}
                      <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400 font-medium">
                        <span className="flex items-center gap-1 font-bold">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>{expectedCount} chess students rostered</span>
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 font-bold">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-slate-900"
                            style={{ backgroundColor: sessionCoachColor }}
                          />
                          Coach {sess.actual_coach?.name || 'Assigned'}
                        </span>
                      </div>
                    </div>

                    {/* Action Button & Status */}
                    <div className="flex flex-col sm:items-end gap-2.5 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-neutral-800">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-black px-3 py-1 rounded-full border ${statusBadge.bgClass}`}
                      >
                        {statusBadge.text}
                      </span>

                      <button
                        id={`take-attendance-btn-${sess.id}`}
                        onClick={() => setActiveSessionId(sess.id)}
                        disabled={sess.status === 'OFF_DAY' || sess.status === 'CANCELLED'}
                        className="py-2.5 px-5 rounded-2xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] transition-all active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                      >
                        <span>{markedCount > 0 ? 'Open Attendance Sheet' : 'Take Roll Call'}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
