import type { AcademyClass, ClassSession } from '../src/types.js';

export class OccurrenceError extends Error {
  constructor(message: string, public code: string) { super(message); }
}

export function planOccurrence(
  session: ClassSession,
  cls: AcademyClass | undefined,
  patch: { session_date?: string; start_time?: string; end_time?: string; replacement_coach_id?: string | null; actual_coach_id?: string; session_type?: string; reset_to_regular_schedule?: boolean },
  sessions: Iterable<ClassSession>,
  hasTakenAttendance: boolean,
) {
  const date = patch.reset_to_regular_schedule ? session.original_session_date || session.session_date : patch.session_date ?? session.session_date;
  const start = patch.reset_to_regular_schedule ? session.original_start_time || cls?.start_time || session.start_time : patch.start_time ?? session.start_time;
  const end = patch.reset_to_regular_schedule ? session.original_end_time || cls?.end_time || session.end_time : patch.end_time ?? session.end_time;
  const changingTime = date !== session.session_date || start !== session.start_time || end !== session.end_time;
  const replacing = patch.session_type === 'REPLACEMENT_COACH';
  const clearing = patch.reset_to_regular_schedule || ['NORMAL', 'COACH_CANCELLED', 'PLANNED_OFF_DAY'].includes(patch.session_type || '');
  const desiredReplacement = clearing ? null : replacing
    ? patch.replacement_coach_id || patch.actual_coach_id || null
    : patch.replacement_coach_id !== undefined ? patch.replacement_coach_id : session.replacement_coach_id;
  const changingCoach = (desiredReplacement || null) !== (session.replacement_coach_id || null) ||
    patch.actual_coach_id !== undefined && patch.actual_coach_id !== session.actual_coach_id;
  if (hasTakenAttendance && (changingTime || changingCoach)) {
    throw new OccurrenceError('Attendance already exists for this occurrence. Its date, time, and replacement coach are locked.', 'SESSION_WITH_ATTENDANCE_CANNOT_BE_RESCHEDULED');
  }
  const updated = { ...session };
  if (changingTime) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || end <= start) {
      throw new OccurrenceError('Choose a valid date and time range.', 'INVALID_SESSION_TIME');
    }
    if (date !== session.session_date) {
      const conflict = [...sessions].some((other) => other.id !== session.id && other.class_id === session.class_id &&
        (other.session_date === date || other.original_session_date === date));
      const regularSlot = cls?.day_of_week === new Date(`${date}T00:00:00Z`).getUTCDay() &&
        date !== (session.original_session_date || session.session_date);
      if (conflict || regularSlot) throw new OccurrenceError(`This class already has a regular occurrence on ${date}. Choose another date.`, 'SESSION_DATE_CONFLICT');
      updated.original_session_date ||= session.session_date;
    }
    if (start !== session.start_time || end !== session.end_time) {
      updated.original_start_time ||= session.start_time;
      updated.original_end_time ||= session.end_time;
    }
  }
  updated.session_date = date;
  updated.start_time = start;
  updated.end_time = end;
  if (patch.reset_to_regular_schedule) {
    // Nulls clear prior markers through Firestore's merge-write path.
    updated.original_session_date = null;
    updated.original_start_time = null;
    updated.original_end_time = null;
  }
  return updated;
}
