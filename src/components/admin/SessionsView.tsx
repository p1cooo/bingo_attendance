import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { ClassSession, Coach, AcademyClass, SessionStatus, SessionType } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { Modal } from '../common/Modal.js';
import { CustomDatePicker } from '../common/CustomDatePicker.js';
import { SessionRollCallView } from './SessionRollCallView.js';
import {
  getTodayDateString,
  getFixedWeekDays,
  getWeekStart,
  shiftDate,
  formatFullDate,
} from '../../lib/dateUtils.js';
import {
  Calendar,
  Clock,
  UserCheck,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Edit2,
  CalendarDays,
  MapPin,
  RefreshCw,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShieldCheck,
  AlertTriangle,
  Layers,
  LayoutGrid,
  List,
} from 'lucide-react';

interface SessionsViewProps {
  initialSessionId?: string | null;
  onClearInitialSession?: () => void;
  onInspectSession?: (sessionId: string) => void;
}

export const SessionsView: React.FC<SessionsViewProps> = ({
  initialSessionId,
  onClearInitialSession,
  onInspectSession,
}) => {
  const { showToast } = useToast();

  const [inspectingSessionId, setInspectingSessionId] = useState<string | null>(initialSessionId || null);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync initialSessionId if provided by parent (e.g. from Dashboard click)
  useEffect(() => {
    if (initialSessionId) {
      setInspectingSessionId(initialSessionId);
    }
  }, [initialSessionId]);

  // Active Date & View Mode
  const todayStr = getTodayDateString();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [weekAnchorDate, setWeekAnchorDate] = useState<string>(() => getWeekStart(todayStr, 'SUN'));
  const [viewMode, setViewMode] = useState<'DAY' | 'MONTH'>('DAY');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => todayStr.substring(0, 7));

  // Additional Filters
  const [selectedCoachId, setSelectedCoachId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
    session_type: 'NORMAL' as SessionType,
    replacement_coach_id: '',
    status: 'SCHEDULED' as SessionStatus,
    cancellation_reason: '',
    notes: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const queryParams: any = {
        coach_id: selectedCoachId,
        class_id: selectedClassId,
        status: selectedStatus,
      };

      if (viewMode === 'DAY') {
        queryParams.date = selectedDate;
      } else {
        queryParams.month = selectedMonth;
      }

      const [sessRes, coachRes, classRes] = await Promise.all([
        api.getSessions(queryParams),
        api.getCoaches(),
        api.getClasses(),
      ]);
      setSessions(sessRes);
      setCoaches(coachRes);
      setClasses(classRes);
    } catch (err: any) {
      showToast(err.message || 'Failed to load calendar sessions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate, viewMode, selectedMonth, selectedCoachId, selectedClassId, selectedStatus]);

  const handleOpenEdit = (session: ClassSession) => {
    setEditingSession(session);
    setEditForm({
      session_type:
        session.session_type ||
        (session.status === 'COACH_CANCELLED'
          ? 'COACH_CANCELLED'
          : session.status === 'PLANNED_OFF_DAY' || session.status === 'OFF_DAY'
          ? 'PLANNED_OFF_DAY'
          : session.replacement_coach_id
          ? 'REPLACEMENT_COACH'
          : 'NORMAL'),
      replacement_coach_id: session.replacement_coach_id || session.actual_coach_id || '',
      status: session.status,
      cancellation_reason: session.cancellation_reason || '',
      notes: session.notes || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;

    try {
      setIsSubmitting(true);
      await api.updateSession(editingSession.id, {
        session_type: editForm.session_type,
        replacement_coach_id:
          editForm.session_type === 'REPLACEMENT_COACH' ? editForm.replacement_coach_id : null,
        actual_coach_id:
          editForm.session_type === 'REPLACEMENT_COACH'
            ? editForm.replacement_coach_id
            : editingSession.default_coach_id || editingSession.scheduled_coach_id,
        status:
          editForm.session_type === 'COACH_CANCELLED'
            ? 'COACH_CANCELLED'
            : editForm.session_type === 'PLANNED_OFF_DAY'
            ? 'PLANNED_OFF_DAY'
            : editForm.status,
        cancellation_reason: editForm.cancellation_reason,
        notes: editForm.notes,
      });

      showToast('✓ Session schedule updated successfully', 'success');
      setEditingSession(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update session', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const defaultCoachForEditing = editingSession?.default_coach || editingSession?.scheduled_coach;

  // Fixed 7-day strip (Sunday to Saturday) containing the current weekAnchorDate
  const dayStrip = getFixedWeekDays(weekAnchorDate, 'SUN');

  const handleSelectDay = (dateStr: string) => {
    setSelectedDate(dateStr);
  };

  const handleShiftDay = (offset: number) => {
    const newDate = shiftDate(selectedDate, offset);
    setSelectedDate(newDate);
    // If the shifted day is outside current week strip, shift week anchor too
    const newWeekStart = getWeekStart(newDate, 'SUN');
    if (newWeekStart !== weekAnchorDate) {
      setWeekAnchorDate(newWeekStart);
    }
  };

  const handleShiftWeek = (offsetWeeks: number) => {
    const newWeekAnchor = shiftDate(weekAnchorDate, offsetWeeks * 7);
    setWeekAnchorDate(newWeekAnchor);
    setSelectedDate(newWeekAnchor);
  };

  const handleJumpToday = () => {
    setSelectedDate(todayStr);
    setWeekAnchorDate(getWeekStart(todayStr, 'SUN'));
  };

  const handleCustomDateSelect = (newDate: string) => {
    setSelectedDate(newDate);
    setWeekAnchorDate(getWeekStart(newDate, 'SUN'));
  };

  // If inspecting a specific session roll call, render dedicated inspector
  if (inspectingSessionId) {
    return (
      <SessionRollCallView
        sessionId={inspectingSessionId}
        onBack={() => {
          setInspectingSessionId(null);
          if (onClearInitialSession) onClearInitialSession();
          loadData();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-3xl border-2 border-slate-900 dark:border-neutral-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Operations Timetable
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">
              {viewMode === 'DAY'
                ? formatFullDate(selectedDate)
                : `${selectedMonth} Monthly Overview`}
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            Academy Sessions
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Monitor concrete daily chess sessions, manage coach substitutions, and track real-time attendance roll calls.
          </p>
        </div>

        {/* View Switcher: Day vs Month */}
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-2xl bg-slate-100 dark:bg-neutral-800 border-2 border-slate-900 dark:border-neutral-700 flex items-center gap-1">
            <button
              id="view-mode-day-btn"
              type="button"
              onClick={() => setViewMode('DAY')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                viewMode === 'DAY'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Day Timetable</span>
            </button>
            <button
              id="view-mode-month-btn"
              type="button"
              onClick={() => setViewMode('MONTH')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                viewMode === 'MONTH'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Month Overview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Date Navigation Strip (When in DAY view) */}
      {viewMode === 'DAY' && (
        <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Prev Week Button */}
              <button
                id="prev-week-btn"
                type="button"
                onClick={() => handleShiftWeek(-1)}
                className="px-2.5 py-2 rounded-xl border-2 border-slate-300 dark:border-neutral-700 hover:border-slate-900 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                title="Previous Week"
              >
                <ChevronsLeft className="w-4 h-4" />
                <span className="hidden md:inline">Prev Week</span>
              </button>

              {/* Prev Day Button */}
              <button
                id="prev-day-btn"
                type="button"
                onClick={() => handleShiftDay(-1)}
                className="p-2 rounded-xl border-2 border-slate-900 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-900 dark:text-white transition shadow-2xs cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Today Button */}
              <button
                id="today-btn"
                type="button"
                onClick={handleJumpToday}
                className={`px-3.5 py-2 rounded-xl text-xs font-black border-2 transition-all cursor-pointer ${
                  selectedDate === todayStr
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-2xs'
                    : 'bg-white dark:bg-neutral-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-neutral-700 hover:bg-slate-50'
                }`}
              >
                Today
              </button>

              {/* Next Day Button */}
              <button
                id="next-day-btn"
                type="button"
                onClick={() => handleShiftDay(1)}
                className="p-2 rounded-xl border-2 border-slate-900 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-900 dark:text-white transition shadow-2xs cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Next Week Button */}
              <button
                id="next-week-btn"
                type="button"
                onClick={() => handleShiftWeek(1)}
                className="px-2.5 py-2 rounded-xl border-2 border-slate-300 dark:border-neutral-700 hover:border-slate-900 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                title="Next Week"
              >
                <span className="hidden md:inline">Next Week</span>
                <ChevronsRight className="w-4 h-4" />
              </button>

              <span className="text-sm font-black text-slate-900 dark:text-white ml-2">
                {formatFullDate(selectedDate)}
              </span>
            </div>

            {/* Custom Date Picker Popup */}
            <div>
              <CustomDatePicker
                value={selectedDate}
                onChange={handleCustomDateSelect}
                buttonLabel="Select Date"
              />
            </div>
          </div>

          {/* 7-Day Fixed Quick Strip (Sun - Sat) */}
          <div className="grid grid-cols-7 gap-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
            {dayStrip.map((item) => {
              const isSelected = item.dateStr === selectedDate;
              return (
                <button
                  key={item.dateStr}
                  type="button"
                  onClick={() => handleSelectDay(item.dateStr)}
                  className={`flex flex-col items-center py-2.5 px-1 rounded-2xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] scale-[1.02]'
                      : item.isToday
                      ? 'bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border-amber-400 dark:border-amber-600'
                      : 'bg-slate-50 dark:bg-neutral-800/50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-neutral-700 hover:border-slate-400'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-80">
                    {item.dayLabel}
                  </span>
                  <span className="text-base font-black leading-none my-0.5">
                    {item.dayNum}
                  </span>
                  {item.isToday && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Month Selector Strip (When in MONTH view) */}
      {viewMode === 'MONTH' && (
        <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Active Month:
            </span>
            <span className="text-sm font-black text-slate-900 dark:text-white">
              {selectedMonth}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const [y, m] = selectedMonth.split('-').map(Number);
                const prevDate = new Date(y, m - 2, 1);
                setSelectedMonth(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`);
              }}
              className="p-2 rounded-xl border-2 border-slate-900 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-900 dark:text-white transition shadow-xs cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setSelectedMonth(getTodayDateString().substring(0, 7))}
              className="px-3 py-1.5 rounded-xl text-xs font-black border-2 border-slate-900 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-slate-50 cursor-pointer"
            >
              This Month
            </button>

            <button
              type="button"
              onClick={() => {
                const [y, m] = selectedMonth.split('-').map(Number);
                const nextDate = new Date(y, m, 1);
                setSelectedMonth(`${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`);
              }}
              className="p-2 rounded-xl border-2 border-slate-900 dark:border-neutral-700 hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-900 dark:text-white transition shadow-xs cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-slate-900/10 dark:border-neutral-800 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Coach Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
              Filter by Coach
            </label>
            <select
              value={selectedCoachId}
              onChange={(e) => setSelectedCoachId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Coaches</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  Coach: {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Class Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
              Filter by Class
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Classes</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
              Filter by Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="COMPLETED">Completed</option>
              <option value="COACH_CANCELLED">Coach Cancelled</option>
              <option value="PLANNED_OFF_DAY">Planned Off-Day (5th Week)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <LoadingSkeleton count={4} />
      ) : sessions.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border-2 border-dashed border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-slate-500">
          No calendar sessions scheduled for {viewMode === 'DAY' ? selectedDate : selectedMonth}.
        </div>
      ) : viewMode === 'DAY' ? (
        /* DAY TIMETABLE VIEW (CARD-BASED) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((sess) => {
            const isCancelled =
              sess.status === 'COACH_CANCELLED' ||
              sess.status === 'CANCELLED' ||
              sess.session_type === 'COACH_CANCELLED';
            const isOffDay =
              sess.status === 'PLANNED_OFF_DAY' ||
              sess.status === 'OFF_DAY' ||
              sess.session_type === 'PLANNED_OFF_DAY';
            const defaultCoach = sess.default_coach || sess.scheduled_coach;
            const actualCoach = sess.teaching_coach || sess.actual_coach || defaultCoach;
            const isReplacement =
              !isCancelled &&
              !isOffDay &&
              (sess.session_type === 'REPLACEMENT_COACH' ||
                (sess.replacement_coach_id && sess.replacement_coach_id !== defaultCoach?.id));

            const coachColor = actualCoach?.color || defaultCoach?.color || '#3b82f6';
            const venueName = sess.room_location || sess.class_item?.room_location || 'Main Hall';
            const presentCount = sess.present_count || 0;
            const expectedCount = sess.expected_students_count || 0;

            return (
              <div
                key={sess.id}
                className={`rounded-3xl border-2 border-slate-900 dark:border-neutral-700 p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] relative overflow-hidden transition-all bg-white dark:bg-neutral-900 flex flex-col justify-between gap-4 ${
                  isCancelled
                    ? 'bg-rose-50/40 dark:bg-rose-950/20'
                    : isOffDay
                    ? 'bg-slate-50/50 dark:bg-neutral-900/50 opacity-80'
                    : ''
                }`}
              >
                {/* Coach Color Left Stripe */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-2.5"
                  style={{ backgroundColor: coachColor }}
                />

                <div className="pl-3 space-y-3">
                  {/* Top Bar: Time & Venue Badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-white border border-slate-300 dark:border-neutral-700">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>
                          {sess.start_time} – {sess.end_time}
                        </span>
                      </div>

                      <div className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>Venue: {venueName}</span>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {isCancelled ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                        Cancelled
                      </span>
                    ) : isOffDay ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-200 text-slate-800 dark:bg-neutral-800 dark:text-slate-300 border border-slate-300 dark:border-neutral-700">
                        Off-Day
                      </span>
                    ) : isReplacement ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700">
                        Replacement Coach
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                        Scheduled
                      </span>
                    )}
                  </div>

                  {/* Class Name */}
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                      {sess.class_item?.name || 'Chess Class'}
                    </h3>
                  </div>

                  {/* Coach Assignment Info */}
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-full border border-slate-900/30"
                        style={{ backgroundColor: coachColor }}
                      />
                      <span className="font-bold text-slate-900 dark:text-white">
                        Coach {actualCoach?.name || defaultCoach?.name || 'Unassigned'}
                      </span>
                      {isReplacement && (
                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">
                          (Sub for {defaultCoach?.name})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Attendance Stats Pill */}
                  {!isCancelled && !isOffDay && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{presentCount} / {expectedCount} Checked In</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pl-3 pt-3 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(sess)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800 border border-slate-300 dark:border-neutral-700 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Substitute / Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInspectingSessionId(sess.id);
                      if (onInspectSession) onInspectSession(sess.id);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Inspect Roll Call</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MONTH OVERVIEW VIEW (TABLE) */
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-neutral-800/80 border-b-2 border-slate-900 dark:border-neutral-700 text-slate-600 dark:text-slate-400 font-black uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Class & Venue</th>
                  <th className="py-3.5 px-4">Default Coach</th>
                  <th className="py-3.5 px-4">Teaching Coach</th>
                  <th className="py-3.5 px-4">Session Status</th>
                  <th className="py-3.5 px-4 text-center">Attendance</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {sessions.map((sess) => {
                  const isCancelled =
                    sess.status === 'COACH_CANCELLED' ||
                    sess.status === 'CANCELLED' ||
                    sess.session_type === 'COACH_CANCELLED';
                  const isOffDay =
                    sess.status === 'PLANNED_OFF_DAY' ||
                    sess.status === 'OFF_DAY' ||
                    sess.session_type === 'PLANNED_OFF_DAY';
                  const defaultCoach = sess.default_coach || sess.scheduled_coach;
                  const actualCoach = sess.teaching_coach || sess.actual_coach || defaultCoach;
                  const isReplacement =
                    !isCancelled &&
                    !isOffDay &&
                    (sess.session_type === 'REPLACEMENT_COACH' ||
                      (sess.replacement_coach_id && sess.replacement_coach_id !== defaultCoach?.id));

                  const presentCount = sess.present_count || 0;
                  const expectedCount = sess.expected_students_count || 0;

                  return (
                    <tr
                      key={sess.id}
                      className={`transition-colors ${
                        isCancelled
                          ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/70 dark:hover:bg-rose-950/30'
                          : isOffDay
                          ? 'bg-slate-50/50 dark:bg-neutral-900/40 hover:bg-slate-50 dark:hover:bg-neutral-800/50 opacity-85'
                          : 'hover:bg-slate-50/70 dark:hover:bg-neutral-800/40'
                      }`}
                    >
                      {/* Date & Time */}
                      <td className="py-3.5 px-4">
                        <div className="font-black text-slate-900 dark:text-white">
                          {sess.session_date}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>
                            {sess.start_time} – {sess.end_time}
                          </span>
                        </div>
                      </td>

                      {/* Class & Venue */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {sess.class_item?.name || 'Class'}
                        </span>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          Venue: {sess.room_location || sess.class_item?.room_location || 'Main Hall'}
                        </div>
                      </td>

                      {/* Default Coach */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black text-white shrink-0"
                            style={{ backgroundColor: defaultCoach?.color || '#3b82f6' }}
                          >
                            {(defaultCoach?.name || 'C').substring(0, 1)}
                          </div>
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            Coach {defaultCoach?.name || 'Unassigned'}
                          </span>
                        </div>
                      </td>

                      {/* Teaching Coach */}
                      <td className="py-3.5 px-4">
                        {isCancelled ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold text-xs">
                            None (Cancelled)
                          </span>
                        ) : isOffDay ? (
                          <span className="text-slate-400 font-medium text-xs">
                            None (Off-Day)
                          </span>
                        ) : isReplacement ? (
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black text-white shrink-0"
                              style={{ backgroundColor: actualCoach?.color || '#8b5cf6' }}
                            >
                              {(actualCoach?.name || 'R').substring(0, 1)}
                            </div>
                            <div>
                              <span className="font-bold text-indigo-700 dark:text-indigo-300">
                                Coach {actualCoach?.name}
                              </span>
                              <span className="block text-[9px] font-black uppercase text-indigo-600">
                                Replacement
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 text-xs">
                            Same as Default
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isCancelled
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                              : isOffDay
                              ? 'bg-slate-200 text-slate-800 dark:bg-neutral-800 dark:text-slate-300'
                              : sess.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              : 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          }`}
                        >
                          {isCancelled
                            ? 'Cancelled'
                            : isOffDay
                            ? 'Off-Day'
                            : sess.status === 'COMPLETED'
                            ? 'Completed'
                            : 'Scheduled'}
                        </span>
                      </td>

                      {/* Attendance */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-mono font-bold text-xs">
                          {presentCount} / {expectedCount}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(sess)}
                            className="p-1.5 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 cursor-pointer"
                            title="Edit Session / Substitution"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setInspectingSessionId(sess.id);
                              if (onInspectSession) onInspectSession(sess.id);
                            }}
                            className="p-1.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 cursor-pointer"
                            title="Inspect Attendance"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EDIT / SUBSTITUTION MODAL */}
      <Modal
        isOpen={!!editingSession}
        onClose={() => setEditingSession(null)}
        title={`Session Substitution & Status: ${editingSession?.session_date}`}
        size="lg"
      >
        {editingSession && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                <span>{editingSession.class_item?.name}</span>
                <span>{editingSession.start_time} – {editingSession.end_time}</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                <span>Default Coach: <strong>Coach {defaultCoachForEditing?.name}</strong></span>
                <span>Venue: <strong>{editingSession.room_location || editingSession.class_item?.room_location || 'Main Hall'}</strong></span>
              </div>
            </div>

            {/* Session Type Picker */}
            <div className="space-y-2">
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                Session Mode / Substitution Assignment
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  className={`flex items-start gap-2.5 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                    editForm.session_type === 'NORMAL'
                      ? 'border-slate-900 dark:border-white bg-slate-100 dark:bg-neutral-800'
                      : 'border-slate-200 dark:border-neutral-700 hover:bg-slate-50/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="session_type"
                    checked={editForm.session_type === 'NORMAL'}
                    onChange={() =>
                      setEditForm({
                        ...editForm,
                        session_type: 'NORMAL',
                        status: 'SCHEDULED',
                      })
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Normal Session
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Taught by Default Coach ({defaultCoachForEditing?.name})
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                    editForm.session_type === 'REPLACEMENT_COACH'
                      ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-neutral-700 hover:bg-slate-50/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="session_type"
                    checked={editForm.session_type === 'REPLACEMENT_COACH'}
                    onChange={() =>
                      setEditForm({
                        ...editForm,
                        session_type: 'REPLACEMENT_COACH',
                        replacement_coach_id:
                          editForm.replacement_coach_id ||
                          coaches.find((c) => c.id !== defaultCoachForEditing?.id)?.id ||
                          coaches[0]?.id ||
                          '',
                        status: 'SCHEDULED',
                      })
                    }
                    className="mt-0.5 text-indigo-600"
                  />
                  <div>
                    <div className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                      Replacement Coach
                    </div>
                    <div className="text-[10px] text-indigo-700 dark:text-indigo-300">
                      Substitute coach for this single session only
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                    editForm.session_type === 'COACH_CANCELLED'
                      ? 'border-rose-600 dark:border-rose-400 bg-rose-50/50 dark:bg-rose-950/30'
                      : 'border-slate-200 dark:border-neutral-700 hover:bg-slate-50/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="session_type"
                    checked={editForm.session_type === 'COACH_CANCELLED'}
                    onChange={() =>
                      setEditForm({
                        ...editForm,
                        session_type: 'COACH_CANCELLED',
                        status: 'COACH_CANCELLED',
                        cancellation_reason: editForm.cancellation_reason || 'Coach sick / unavailable',
                      })
                    }
                    className="mt-0.5 text-rose-600"
                  />
                  <div>
                    <div className="text-xs font-bold text-rose-950 dark:text-rose-200">
                      Coach Cancelled
                    </div>
                    <div className="text-[10px] text-rose-700 dark:text-rose-300">
                      Session cancelled due to coach unavailability
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                    editForm.session_type === 'PLANNED_OFF_DAY'
                      ? 'border-slate-900 dark:border-white bg-slate-100 dark:bg-neutral-800'
                      : 'border-slate-200 dark:border-neutral-700 hover:bg-slate-50/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="session_type"
                    checked={editForm.session_type === 'PLANNED_OFF_DAY'}
                    onChange={() =>
                      setEditForm({
                        ...editForm,
                        session_type: 'PLANNED_OFF_DAY',
                        status: 'PLANNED_OFF_DAY',
                        cancellation_reason:
                          editForm.cancellation_reason || 'Academy 5th week off-day / holiday',
                      })
                    }
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      Planned Off-Day
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Academy holiday or 5th week scheduled off-day
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* If Replacement Coach selected */}
            {editForm.session_type === 'REPLACEMENT_COACH' && (
              <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 space-y-2">
                <label className="block text-xs font-black uppercase text-indigo-900 dark:text-indigo-200">
                  Select Substitute Replacement Coach *
                </label>
                <select
                  value={editForm.replacement_coach_id}
                  onChange={(e) => setEditForm({ ...editForm, replacement_coach_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-white dark:bg-neutral-800 border-2 border-indigo-300 dark:border-indigo-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      Coach {c.name} {c.id === defaultCoachForEditing?.id ? '(Default Coach)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                  ℹ️ Teaching credit will go to this replacement coach for this occurrence. The class's recurring default coach remains Coach {defaultCoachForEditing?.name}.
                </p>
              </div>
            )}

            {/* If Cancelled or Off-Day selected */}
            {(editForm.session_type === 'COACH_CANCELLED' || editForm.session_type === 'PLANNED_OFF_DAY') && (
              <div>
                <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Cancellation / Off-Day
                </label>
                <input
                  type="text"
                  value={editForm.cancellation_reason}
                  onChange={(e) => setEditForm({ ...editForm, cancellation_reason: e.target.value })}
                  placeholder="e.g. Coach sick leave, or 5th Saturday off-day"
                  className="w-full px-3.5 py-2 text-xs font-bold bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                Admin Notes
              </label>
              <textarea
                rows={2}
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Optional notes for coaches..."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-neutral-800">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setEditingSession(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black rounded-xl border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] cursor-pointer"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
