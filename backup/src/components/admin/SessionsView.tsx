import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../common/Toast.js';
import { ClassSession, Coach, AcademyClass, SessionStatus, SessionType } from '../../types.js';
import { LoadingSkeleton } from '../common/LoadingSkeleton.js';
import { Modal } from '../common/Modal.js';
import { CoachBadge } from '../common/CoachBadge.js';
import {
  Calendar,
  Clock,
  UserCheck,
  Sparkles,
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
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface SessionsViewProps {
  onInspectSession: (sessionId: string) => void;
}

export const SessionsView: React.FC<SessionsViewProps> = ({ onInspectSession }) => {
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [classes, setClasses] = useState<AcademyClass[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('2026-08');
  const [selectedDate, setSelectedDate] = useState('');
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
      const [sessRes, coachRes, classRes] = await Promise.all([
        api.getSessions({
          month: selectedMonth,
          date: selectedDate,
          coach_id: selectedCoachId,
          class_id: selectedClassId,
          status: selectedStatus,
        }),
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
  }, [selectedMonth, selectedDate, selectedCoachId, selectedClassId, selectedStatus]);

  const handleOpenEdit = (session: ClassSession) => {
    setEditingSession(session);
    setEditForm({
      session_type: session.session_type || (session.status === 'COACH_CANCELLED' ? 'COACH_CANCELLED' : session.status === 'PLANNED_OFF_DAY' || session.status === 'OFF_DAY' ? 'PLANNED_OFF_DAY' : session.replacement_coach_id ? 'REPLACEMENT_COACH' : 'NORMAL'),
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
        replacement_coach_id: editForm.session_type === 'REPLACEMENT_COACH' ? editForm.replacement_coach_id : null,
        actual_coach_id: editForm.session_type === 'REPLACEMENT_COACH' ? editForm.replacement_coach_id : editingSession.default_coach_id || editingSession.scheduled_coach_id,
        status: editForm.session_type === 'COACH_CANCELLED' ? 'COACH_CANCELLED' : editForm.session_type === 'PLANNED_OFF_DAY' ? 'PLANNED_OFF_DAY' : editForm.status,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-6 rounded-3xl border-2 border-slate-900 dark:border-neutral-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Concrete Occurrences
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {sessions.length} sessions in {selectedMonth}
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            Calendar Sessions
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Every date occurrence belongs to the class's <strong className="text-slate-900 dark:text-white font-bold">Default Coach</strong>. If a coach is absent, assign a <strong className="text-indigo-600 dark:text-indigo-400">Replacement Coach</strong> for that single session without modifying the recurring class structure.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3.5 py-2 text-xs font-black bg-slate-100 dark:bg-neutral-800 border-2 border-slate-900 dark:border-white rounded-xl text-slate-900 dark:text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
          />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-slate-900 dark:border-neutral-800 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.05)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Specific Date */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
              Date Filter
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
            />
          </div>

          {/* Coach Filter */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">
              Coach
            </label>
            <select
              value={selectedCoachId}
              onChange={(e) => setSelectedCoachId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
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
              Class
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
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
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-white"
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

      {/* Sessions Table */}
      {loading ? (
        <LoadingSkeleton count={5} type="row" />
      ) : sessions.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border-2 border-dashed border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs text-slate-500">
          No calendar sessions found matching your filters for {selectedMonth}.
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border-2 border-slate-900 dark:border-neutral-800 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-neutral-800/80 border-b-2 border-slate-900 dark:border-neutral-700 text-slate-600 dark:text-slate-400 font-black uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Class</th>
                  <th className="py-3.5 px-4">Default Coach</th>
                  <th className="py-3.5 px-4">Teaching Coach</th>
                  <th className="py-3.5 px-4">Session Status</th>
                  <th className="py-3.5 px-4 text-center">Attendance</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {sessions.map((sess) => {
                  const isCancelled = sess.status === 'COACH_CANCELLED' || sess.status === 'CANCELLED' || sess.session_type === 'COACH_CANCELLED';
                  const isOffDay = sess.status === 'PLANNED_OFF_DAY' || sess.status === 'OFF_DAY' || sess.session_type === 'PLANNED_OFF_DAY';
                  const defaultCoach = sess.default_coach || sess.scheduled_coach;
                  const actualCoach = sess.teaching_coach || sess.actual_coach || defaultCoach;
                  const isReplacement = !isCancelled && !isOffDay && (sess.session_type === 'REPLACEMENT_COACH' || (sess.replacement_coach_id && sess.replacement_coach_id !== defaultCoach?.id));

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
                          <span>{sess.start_time} – {sess.end_time}</span>
                        </div>
                      </td>

                      {/* Class */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {sess.class_item?.name || 'Class'}
                        </span>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {sess.class_item?.room_location || 'Chess Hall'}
                        </div>
                      </td>

                      {/* Default Coach */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black text-white shrink-0"
                            style={{ backgroundColor: defaultCoach?.color || '#3b82f6' }}
                          >
                            {defaultCoach?.name?.charAt(0) || 'C'}
                          </div>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Coach {defaultCoach?.name || 'Assigned'}
                          </span>
                        </div>
                      </td>

                      {/* Teaching Coach */}
                      <td className="py-3.5 px-4">
                        {isCancelled ? (
                          <span className="text-slate-400 italic text-[11px]">No Coach (Cancelled)</span>
                        ) : isOffDay ? (
                          <span className="text-slate-400 italic text-[11px]">Off-Day</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black text-white shrink-0"
                                style={{ backgroundColor: actualCoach?.color || '#3b82f6' }}
                              >
                                {actualCoach?.name?.charAt(0) || 'C'}
                              </div>
                              <span className="font-bold text-slate-900 dark:text-white">
                                Coach {actualCoach?.name}
                              </span>
                            </div>

                            {isReplacement && (
                              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                Replacement
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isCancelled ? (
                          <div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              Coach Cancelled
                            </span>
                            {sess.cancellation_reason && (
                              <div className="text-[10px] text-rose-600 dark:text-rose-400 truncate max-w-[140px] mt-0.5">
                                {sess.cancellation_reason}
                              </div>
                            )}
                          </div>
                        ) : isOffDay ? (
                          <div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-slate-300 border border-slate-200 dark:border-neutral-700">
                              Planned Off-Day
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black ${
                              sess.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            }`}
                          >
                            {sess.status === 'COMPLETED' ? 'Completed' : 'Scheduled'}
                          </span>
                        )}
                      </td>

                      {/* Attendance */}
                      <td className="py-3.5 px-4 text-center">
                        {isOffDay || isCancelled ? (
                          <span className="text-slate-400 text-[11px]">—</span>
                        ) : (
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {presentCount} / {expectedCount}
                            </span>
                            <span className="text-[10px] text-slate-400 block">present</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onInspectSession(sess.id)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-600 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
                            title="Take or Inspect Attendance"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(sess)}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                            title="Assign Replacement Coach or Mark Exception"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
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

      {/* Edit Session Exception Modal */}
      <Modal
        isOpen={!!editingSession}
        onClose={() => !isSubmitting && setEditingSession(null)}
        title={editingSession ? `Session: ${editingSession.session_date} (${editingSession.class_item?.name})` : 'Edit Session'}
      >
        {editingSession && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 text-xs">
              <div className="text-[10px] font-black uppercase text-slate-500">
                Class & Default Coach
              </div>
              <div className="font-black text-slate-900 dark:text-white text-sm mt-0.5">
                {editingSession.class_item?.name}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Permanent Default Coach:{' '}
                <strong className="text-slate-900 dark:text-white font-bold">
                  Coach {defaultCoachForEditing?.name || 'Assigned'}
                </strong>
              </div>
            </div>

            {/* Session Type Exception Selector */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1.5">
                Session Type & Coach Assignment
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  className={`flex items-start gap-2.5 p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                    editForm.session_type === 'NORMAL'
                      ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-neutral-800'
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
                        replacement_coach_id: editForm.replacement_coach_id || coaches.find((c) => c.id !== defaultCoachForEditing?.id)?.id || coaches[0]?.id || '',
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
                        cancellation_reason: editForm.cancellation_reason || 'Academy 5th week off-day / holiday',
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
                  ℹ️ Coach credit and teaching attendance will go to this replacement coach for this session. The Class's default coach remains Coach {defaultCoachForEditing?.name}.
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
                  placeholder="e.g. Coach Chuah sick leave, or 5th Saturday off-day"
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
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black rounded-xl border-2 border-slate-900 dark:border-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
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
