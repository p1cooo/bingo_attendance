import type { AcademyClass, AttendanceRecord, ClassSession } from '../src/types.js';

export function reconcileRecurringSessions(
  cls: AcademyClass,
  sessions: Map<string, ClassSession>,
  attendance: Iterable<AttendanceRecord>,
  today: string,
  month?: string,
): { updated: ClassSession[]; removed: ClassSession[] } {
  if (!cls.is_active) return { updated: [], removed: [] };
  const attended = new Set(Array.from(attendance, (record) => record.session_id));
  const updated: ClassSession[] = [];
  const removed: ClassSession[] = [];
  for (const session of sessions.values()) {
    if (session.class_id !== cls.id && session.schedule_id !== cls.id) continue;
    if (session.session_date <= today || month && !session.session_date.startsWith(month)) continue;
    if (session.status !== 'SCHEDULED' || session.session_type && session.session_type !== 'NORMAL' ||
      session.original_session_date || session.original_start_time || session.original_end_time ||
      session.replacement_coach_id || session.actual_coach_id !== session.scheduled_coach_id || attended.has(session.id)) continue;
    const day = new Date(`${session.session_date}T00:00:00Z`).getUTCDay();
    if (day !== (cls.day_of_week ?? 6)) {
      sessions.delete(session.id);
      removed.push(session);
      continue;
    }
    const start = cls.start_time || '09:30';
    const end = cls.end_time || '11:00';
    const coach = cls.default_coach_id || session.default_coach_id || session.scheduled_coach_id;
    if (session.start_time !== start || session.end_time !== end || session.scheduled_coach_id !== coach) {
      const next = { ...session, start_time: start, end_time: end, default_coach_id: coach,
        scheduled_coach_id: coach, actual_coach_id: coach };
      sessions.set(session.id, next);
      updated.push(next);
    }
  }
  return { updated, removed };
}
