import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { ClassSession, Coach, SessionStatus, SessionType } from '../../types.js';
import { useToast } from './Toast.js';
import { Modal } from './Modal.js';

interface OccurrenceEditorProps {
  session: ClassSession;
  coaches: Coach[];
  onClose: () => void;
  onSaved: (session: ClassSession) => Promise<void> | void;
}

export const OccurrenceEditor: React.FC<OccurrenceEditorProps> = ({ session: editingSession, coaches, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editForm, setEditForm] = useState(() => ({
    session_type: (sessionMode(editingSession)) as SessionType,
    replacement_coach_id: editingSession.replacement_coach_id || '',
    status: editingSession.status as SessionStatus,
    cancellation_reason: editingSession.cancellation_reason || '',
    notes: editingSession.notes || '',
    session_date: editingSession.session_date,
    start_time: editingSession.start_time,
    end_time: editingSession.end_time,
  }));
  const defaultCoachForEditing = editingSession.default_coach || editingSession.scheduled_coach;
  const occurrenceLocked = Boolean(editingSession.marked_attendance_count);
  const occurrenceMoved = Boolean(editingSession.original_session_date && editingSession.original_session_date !== editingSession.session_date ||
    editingSession.original_start_time && editingSession.original_start_time !== editingSession.start_time || editingSession.replacement_coach_id);
  const isEditingOccurrence = true;

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editForm.session_type === 'REPLACEMENT_COACH' && !editForm.replacement_coach_id) {
      showToast('Select an active replacement coach', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const updated = await api.updateSession(editingSession.id, {
        expected_occurrence_revision: editingSession.occurrence_revision || null,
        session_type: editForm.session_type,
        replacement_coach_id: editForm.session_type === 'REPLACEMENT_COACH' ? editForm.replacement_coach_id : null,
        status: editForm.session_type === 'COACH_CANCELLED' ? 'COACH_CANCELLED' : editForm.session_type === 'PLANNED_OFF_DAY' ? 'PLANNED_OFF_DAY' : editForm.status,
        cancellation_reason: editForm.cancellation_reason,
        notes: editForm.notes,
        session_date: editForm.session_date,
        start_time: editForm.start_time,
        end_time: editForm.end_time,
      });
      await onSaved(updated);
      onClose();
      showToast('Session occurrence updated', 'success');
    } catch (error: any) { showToast(error.message || 'Could not update occurrence', 'error'); }
    finally { setIsSubmitting(false); }
  };

  const handleResetOccurrence = async () => {
    setIsSubmitting(true);
    try {
      const updated = await api.updateSession(editingSession.id, { reset_to_regular_schedule: true,
        expected_occurrence_revision: editingSession.occurrence_revision || null });
      await onSaved(updated);
      onClose();
      showToast('Regular schedule restored', 'success');
    } catch (error: any) { showToast(error.message || 'Could not reset occurrence', 'error'); }
    finally { setIsSubmitting(false); }
  };

  return <Modal isOpen onClose={onClose} title={`Session Occurrence: ${editingSession.session_date}`} maxWidth="lg">
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

            {occurrenceLocked && <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">Attendance has been taken. Date, time, and replacement coach are locked.</p>}
            {isEditingOccurrence && (
              <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 space-y-3">
                <div>
                  <div className="text-xs font-black uppercase text-sky-900 dark:text-sky-200">Reschedule this occurrence</div>
                  <p className="mt-1 text-[11px] text-sky-700 dark:text-sky-300">
                    This changes only this occurrence. The recurring class remains unchanged.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label className="block text-[11px] font-bold text-sky-900 dark:text-sky-200">
                    New date
                    <input
                      type="date"
                      disabled={occurrenceLocked}
                      required
                      value={editForm.session_date}
                      onChange={(e) => setEditForm({ ...editForm, session_date: e.target.value })}
                      className="mt-1 w-full px-3 py-2 text-xs font-bold bg-white dark:bg-neutral-800 border border-sky-300 dark:border-sky-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="block text-[11px] font-bold text-sky-900 dark:text-sky-200">
                    Start time
                    <input
                      type="time"
                      disabled={occurrenceLocked}
                      required
                      value={editForm.start_time}
                      onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                      className="mt-1 w-full px-3 py-2 text-xs font-bold bg-white dark:bg-neutral-800 border border-sky-300 dark:border-sky-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </label>
                  <label className="block text-[11px] font-bold text-sky-900 dark:text-sky-200">
                    End time
                    <input
                      type="time"
                      disabled={occurrenceLocked}
                      required
                      value={editForm.end_time}
                      onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                      className="mt-1 w-full px-3 py-2 text-xs font-bold bg-white dark:bg-neutral-800 border border-sky-300 dark:border-sky-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </label>
                </div>
                {occurrenceMoved && !occurrenceLocked && <button type="button" onClick={handleResetOccurrence} disabled={isSubmitting} className="rounded-xl border border-sky-700 px-3 py-2 text-xs font-black text-sky-900">Reset to regular schedule</button>}
              </div>
            )}

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
                    disabled={occurrenceLocked}
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
                    disabled={occurrenceLocked}
                    name="session_type"
                    checked={editForm.session_type === 'REPLACEMENT_COACH'}
                    onChange={() =>
                      setEditForm({
                        ...editForm,
                        session_type: 'REPLACEMENT_COACH',
                        replacement_coach_id:
                          editForm.replacement_coach_id ||
                          coaches.find((c) => c.is_active && c.id !== (editingSession.default_coach_id || editingSession.scheduled_coach_id))?.id ||
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
                    disabled={occurrenceLocked}
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
                    disabled={occurrenceLocked}
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
                  required
                  value={editForm.replacement_coach_id}
                  disabled={occurrenceLocked}
                  onChange={(e) => setEditForm({ ...editForm, replacement_coach_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-white dark:bg-neutral-800 border-2 border-indigo-300 dark:border-indigo-700 rounded-xl text-slate-900 dark:text-white"
                >
                  <option value="">Select a coach</option>
                  {coaches.filter((c) => c.is_active && c.id !== (editingSession.default_coach_id || editingSession.scheduled_coach_id)).map((c) => (
                    <option key={c.id} value={c.id}>
                      Coach {c.name.replace(/^Coach\s+/i, '')}
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
                Change Notes
              </label>
              <textarea
                rows={2}
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Optional notes for coaches/admin..."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-neutral-800">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => onClose()}
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
  </Modal>;
};

function sessionMode(session: ClassSession): SessionType {
  if (session.status === 'COACH_CANCELLED' || session.status === 'CANCELLED') return 'COACH_CANCELLED';
  if (session.status === 'PLANNED_OFF_DAY' || session.status === 'OFF_DAY') return 'PLANNED_OFF_DAY';
  if (session.replacement_coach_id) return 'REPLACEMENT_COACH';
  return session.session_type || 'NORMAL';
}
