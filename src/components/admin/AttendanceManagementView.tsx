import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import {
  AttendanceRecord,
  Coach,
  AcademyClass,
  ClassSession,
  AttendanceStatus,
  AttendanceAuditLog,
} from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { Modal } from '../common/Modal.js';
import { CoachBadge } from '../common/CoachBadge.js';
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  History,
  Edit2,
  FileCheck,
  AlertCircle,
  Filter,
  Calendar,
  CalendarDays,
  Users,
  ChevronRight,
  Sparkles,
  RotateCcw,
  Info,
} from 'lucide-react';

interface AttendanceManagementViewProps {
  initialSessionId?: string | null;
  onClearInitialSession?: () => void;
}

export const AttendanceManagementView: React.FC<AttendanceManagementViewProps> = ({
  initialSessionId,
  onClearInitialSession,
}) => {
  const { showToast } = useToast();

  const [viewMode, setViewMode] = useState<'SESSIONS' | 'RECORDS'>(
    initialSessionId ? 'RECORDS' : 'SESSIONS'
  );
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (Structural API queries vs In-Memory Instant Filters)
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedCoachId, setSelectedCoachId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [search, setSearch] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId || null);

  // Correction Modal
  const [correctingRecord, setCorrectingRecord] = useState<AttendanceRecord | null>(null);
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('PRESENT');
  const [auditReason, setAuditReason] = useState('');
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);

  // Audit Logs Modal
  const [auditLogs, setAuditLogs] = useState<AttendanceAuditLog[]>([]);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  const loadData = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const [sessionsRes, recRes, coachRes, classRes] = await Promise.all([
        api.getSessions({
          month: selectedMonth,
          date: selectedDate || undefined,
          coach_id: selectedCoachId || undefined,
          class_id: selectedClassId || undefined,
        }),
        api.getAttendanceRecords({
          session_id: currentSessionId || undefined,
          month: selectedMonth,
          date: selectedDate || undefined,
          coach_id: selectedCoachId || undefined,
          class_id: selectedClassId || undefined,
        }),
        api.getCoaches(),
        api.getClasses(),
      ]);
      setSessions(sessionsRes);
      setRecords(recRes);
      setCoaches(coachRes);
      setClasses(classRes);
    } catch (err: any) {
      showToast(err.message || 'Failed to load attendance management data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Only refetch when structural database scope changes (month, date, coach, class, sessionId)
  // Searching and status filtering are performed smoothly in memory to prevent DOM remounting / reload bugs!
  useEffect(() => {
    loadData(records.length === 0);
  }, [
    currentSessionId,
    selectedMonth,
    selectedDate,
    selectedCoachId,
    selectedClassId,
  ]);

  // Instant in-memory search & filter for records (0ms delay, zero DOM flicker, zero page refresh)
  const filteredRecords = useMemo(() => {
    let result = records;
    if (selectedStatus) {
      result = result.filter((r) => r.status === selectedStatus);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => {
        const studentName = r.student?.full_name?.toLowerCase() || '';
        const studentId = r.student?.student_id?.toLowerCase() || '';
        const className = r.session?.class_item?.name?.toLowerCase() || '';
        const coachName = r.session?.actual_coach?.name?.toLowerCase() || '';
        const repNote = r.replacement_note?.toLowerCase() || '';
        return (
          studentName.includes(q) ||
          studentId.includes(q) ||
          className.includes(q) ||
          coachName.includes(q) ||
          repNote.includes(q)
        );
      });
    }
    return result;
  }, [records, search, selectedStatus]);

  // Instant in-memory search for sessions
  const filteredSessions = useMemo(() => {
    let result = sessions;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((s) => {
        const className = s.class_item?.name?.toLowerCase() || '';
        const coachName = s.actual_coach?.name?.toLowerCase() || '';
        const location = s.room_location?.toLowerCase() || '';
        const date = s.session_date?.toLowerCase() || '';
        return (
          className.includes(q) ||
          coachName.includes(q) ||
          location.includes(q) ||
          date.includes(q)
        );
      });
    }
    return result;
  }, [sessions, search]);

  const handleResetFilters = () => {
    setSelectedDate('');
    setSelectedCoachId('');
    setSelectedClassId('');
    setSelectedStatus('');
    setSearch('');
    setCurrentSessionId(null);
    if (onClearInitialSession) onClearInitialSession();
  };

  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setViewMode('RECORDS');
  };

  const handleOpenCorrection = (record: AttendanceRecord) => {
    setCorrectingRecord(record);
    setNewStatus(record.status);
    setAuditReason('');
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingRecord) return;
    if (!auditReason.trim()) {
      showToast('Audit reason is strictly mandatory for attendance corrections', 'error');
      return;
    }

    setIsSavingCorrection(true);
    try {
      await api.correctAttendance(correctingRecord.id, {
        status: newStatus,
        audit_reason: auditReason,
      });

      showToast('✓ Attendance record corrected and audit log recorded', 'success');
      setCorrectingRecord(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to correct attendance', 'error');
    } finally {
      setIsSavingCorrection(false);
    }
  };

  const handleViewAuditLogs = async () => {
    try {
      const logs = await api.getAuditLogs();
      setAuditLogs(logs);
      setIsAuditModalOpen(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to load audit logs', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Attendance & Roll Call Operations
            </h2>
            <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              Audit-Backed Operations
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
            Session-level roll call status, student check-ins, and mandatory audit log corrections
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* View Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-neutral-800 p-1 rounded-2xl border-2 border-slate-900 dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.06)]">
            <button
              onClick={() => setViewMode('SESSIONS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'SESSIONS'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>SESSION OVERVIEW</span>
            </button>
            <button
              onClick={() => setViewMode('RECORDS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'RECORDS'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>STUDENT LOGS</span>
            </button>
          </div>

          <button
            onClick={handleViewAuditLogs}
            className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-2xl text-xs font-black bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-900 dark:text-white border-2 border-slate-900 dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.06)] transition-all active:translate-x-0.5 active:translate-y-0.5"
          >
            <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Audit Trail</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-3xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Month / Date */}
          <div className="flex gap-2">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          {/* Specific Date */}
          <div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          {/* Coach filter */}
          <div>
            <select
              value={selectedCoachId}
              onChange={(e) => setSelectedCoachId(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="">All Teaching Coaches</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  Coach {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search student */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student name or ID..."
              className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
          </div>

          {/* Reset Filters */}
          <div className="flex items-center">
            <button
              onClick={handleResetFilters}
              className="w-full py-2 px-3 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800 border-2 border-slate-300 dark:border-neutral-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>

        {currentSessionId && (
          <div className="flex items-center justify-between p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 text-xs">
            <span className="font-bold text-indigo-900 dark:text-indigo-200">
              Filtering records for inspected session: <span className="font-mono">{currentSessionId}</span>
            </span>
            <button
              onClick={() => {
                setCurrentSessionId(null);
                if (onClearInitialSession) onClearInitialSession();
              }}
              className="font-black text-indigo-700 dark:text-indigo-300 hover:underline"
            >
              Clear Session Filter ✕
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-4">
          <LoadingSkeleton count={4} type="card" />
        </div>
      ) : viewMode === 'SESSIONS' ? (
        /* ============================================================ */
        /* 1. SESSION-LEVEL OVERVIEW (High-level Academy Sessions)       */
        /* ============================================================ */
        <div className="space-y-4">
          {filteredSessions.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
              <p className="text-xs font-bold text-slate-400">No training sessions found matching your criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredSessions.map((sess) => {
                const isCancelled = sess.status === 'COACH_CANCELLED' || sess.status === 'CANCELLED' || sess.session_type === 'COACH_CANCELLED';
                const isOffDay = sess.status === 'PLANNED_OFF_DAY' || sess.status === 'OFF_DAY' || sess.session_type === 'PLANNED_OFF_DAY';
                const coachColor = isCancelled ? '#ef4444' : isOffDay ? '#94a3b8' : (sess.actual_coach?.color || '#3b82f6');
                const isReplacement = !isCancelled && !isOffDay && sess.scheduled_coach_id !== sess.actual_coach_id;
                const markedCount = sess.marked_attendance_count || 0;
                const presentCount = sess.present_count || 0;
                const expectedCount = sess.expected_students_count || 0;

                let statusBadge = {
                  text: 'Not Marked',
                  bgClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-neutral-800 dark:text-slate-300',
                };
                if (isCancelled) {
                  statusBadge = {
                    text: 'Coach Cancelled',
                    bgClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/70 dark:text-rose-200',
                  };
                } else if (isOffDay) {
                  statusBadge = {
                    text: 'Planned Off-Day',
                    bgClass: 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-neutral-800 dark:text-slate-300',
                  };
                } else if (markedCount > 0 && markedCount < expectedCount) {
                  statusBadge = {
                    text: `In Progress (${markedCount}/${expectedCount})`,
                    bgClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200',
                  };
                } else if (markedCount > 0 && markedCount >= expectedCount) {
                  statusBadge = {
                    text: `Marked (${presentCount} Present)`,
                    bgClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200',
                  };
                }

                return (
                  <div
                    key={sess.id}
                    className={`border-2 border-slate-900 dark:border-neutral-700 rounded-3xl p-5 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] flex flex-col justify-between relative overflow-hidden transition-all ${
                      isCancelled
                        ? 'bg-rose-50/40 dark:bg-rose-950/10'
                        : isOffDay
                        ? 'bg-slate-50/50 dark:bg-neutral-900/60 opacity-80'
                        : 'bg-white dark:bg-neutral-900'
                    }`}
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-2"
                      style={{ backgroundColor: coachColor }}
                    />

                    <div>
                      {/* Top Date & Status Badges */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-[11px] font-black text-slate-900 dark:text-white">
                          📅 {sess.session_date}
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${statusBadge.bgClass}`}
                        >
                          {statusBadge.text}
                        </span>
                      </div>

                      {/* Class Title */}
                      <h3 className={`text-base font-black tracking-tight ${isCancelled ? 'text-rose-950 dark:text-rose-200' : 'text-slate-900 dark:text-white'}`}>
                        {sess.class_item?.name || 'Chess Class'}
                      </h3>

                      {/* Time & Room */}
                      <div className="mt-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {sess.start_time} – {sess.end_time}
                        </span>
                        {sess.room_location && <span>• {sess.room_location}</span>}
                      </div>

                      {/* Cancellation Notice Banner */}
                      {isCancelled && (
                        <div className="mt-3 p-2.5 rounded-xl bg-rose-100/70 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs font-bold text-rose-800 dark:text-rose-300 flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-black block">Class Cancelled by Coach</span>
                            <span className="text-[11px] font-medium opacity-90">{sess.cancellation_reason || 'Coach is unavailable for this session.'}</span>
                          </div>
                        </div>
                      )}

                      {/* Off-day Notice Banner */}
                      {isOffDay && (
                        <div className="mt-3 p-2.5 rounded-xl bg-slate-100 dark:bg-neutral-800 border border-slate-300 dark:border-neutral-700 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <Info className="w-4 h-4 text-slate-500 shrink-0" />
                          <span className="text-[11px]">{sess.cancellation_reason || 'Scheduled Academy off-day'}</span>
                        </div>
                      )}

                      {/* Coach Info */}
                      {!isCancelled && !isOffDay && (
                        <div className="mt-3 p-2 rounded-xl bg-slate-50 dark:bg-neutral-800/60 border border-slate-200 dark:border-neutral-700 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-slate-900"
                              style={{ backgroundColor: coachColor }}
                            />
                            <span className="font-black text-slate-800 dark:text-slate-200">
                              Coach {sess.actual_coach?.name || 'Assigned'}
                            </span>
                          </div>
                          {isReplacement && (
                            <span className="text-[9px] font-black uppercase text-amber-700 dark:text-amber-300">
                              Replacement
                            </span>
                          )}
                        </div>
                      )}

                      {/* Students Stats */}
                      <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                        <span>Expected: {expectedCount} students</span>
                        {isCancelled ? (
                          <span className="font-black text-rose-600 dark:text-rose-400">
                            No Roll Call
                          </span>
                        ) : isOffDay ? (
                          <span className="text-slate-400">
                            Off-Day
                          </span>
                        ) : (
                          <span className="font-black text-emerald-600 dark:text-emerald-400">
                            {presentCount} Present
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-800 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSelectSession(sess.id)}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-black transition-colors flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] cursor-pointer ${
                          isCancelled
                            ? 'bg-rose-900 hover:bg-rose-800 text-white'
                            : isOffDay
                            ? 'bg-slate-700 hover:bg-slate-600 text-white'
                            : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900'
                        }`}
                      >
                        <span>{isCancelled ? 'Inspect Cancelled Session' : isOffDay ? 'Inspect Off-Day Session' : 'Inspect Student Records'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ============================================================ */
        /* 2. STUDENT RECORDS TABLE (Drill-down & Audit Corrections)     */
        /* ============================================================ */
        <div className="bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-700 rounded-3xl shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-neutral-800 border-b-2 border-slate-900 dark:border-neutral-700 font-black uppercase text-[10px] text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Class</th>
                  <th className="py-3 px-4">Teaching Coach</th>
                  <th className="py-3 px-4 text-center">Type</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Admin Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs font-bold text-slate-400">
                      No student attendance records match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => {
                    const isPresent = rec.status === 'PRESENT' || rec.status === 'LATE';
                    const isReplacement = rec.attendance_type === 'REPLACEMENT';

                    return (
                      <tr
                        key={rec.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-neutral-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                          {rec.session?.session_date || rec.marked_at?.slice(0, 10) || '2026-08'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          <div>{rec.student?.full_name || 'Student'}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {rec.student?.student_id}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300">
                          {rec.session?.class_item?.name || 'Class'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-600 dark:text-slate-300">
                          {rec.session?.actual_coach?.name
                            ? `Coach ${rec.session.actual_coach.name}`
                            : 'Coach'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isReplacement ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border border-amber-300">
                              Replacement
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400">Regular</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isPresent ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              {rec.status}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-300">
                              <XCircle className="w-3 h-3" />
                              {rec.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleOpenCorrection(rec)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 transition-colors"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Correct</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance Record Correction Modal */}
      {correctingRecord && (
        <Modal
          isOpen={!!correctingRecord}
          onClose={() => setCorrectingRecord(null)}
          title="Administrative Attendance Correction"
        >
          <form onSubmit={handleSaveCorrection} className="space-y-4">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-xs">
              <div className="font-bold text-slate-900 dark:text-white">
                Student: {correctingRecord.student?.full_name} ({correctingRecord.student?.student_id})
              </div>
              <div className="text-slate-500 text-[11px] mt-0.5">
                Session: {correctingRecord.session?.session_date} • {correctingRecord.session?.class_item?.name}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                New Attendance Status *
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as AttendanceStatus)}
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white focus:outline-none"
              >
                <option value="PRESENT">PRESENT (Attended on time)</option>
                <option value="LATE">LATE (Attended with delay)</option>
                <option value="ABSENT">ABSENT (Did not attend)</option>
                <option value="EXCUSED">EXCUSED (Prior leave approved)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Audit Reason (Mandatory) *
              </label>
              <textarea
                required
                rows={3}
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                placeholder="State the reason for this manual change (e.g. Parent informed late sick leave, Coach misclick)..."
                className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-900 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t-2 border-slate-900 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => setCorrectingRecord(null)}
                className="py-2 px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingCorrection}
                className="py-2 px-5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
              >
                {isSavingCorrection ? 'Saving...' : 'Save & Log Audit'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Audit Log Modal */}
      {isAuditModalOpen && (
        <Modal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          title="Attendance Modification Audit Trail"
        >
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No administrative audit records found.</p>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between font-black text-slate-900 dark:text-white">
                    <span>
                      {log.old_status} → {log.new_status}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {log.changed_at?.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                    Modified by {log.user?.name || 'Administrator'}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 text-[11px] italic">
                    "{log.reason}"
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
