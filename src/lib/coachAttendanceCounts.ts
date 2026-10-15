import { ClassSession } from '../types.js';

/** Roll-call counts describe the visible eligible roster, even when saving is locked. */
export function coachAttendanceCounts(session: ClassSession) {
  const exempt = ['COACH_CANCELLED', 'CANCELLED', 'PLANNED_OFF_DAY', 'OFF_DAY'];
  const noRollCall = exempt.includes(session.status) || exempt.includes(session.session_type || '');
  const paused = new Set(session.paused_students?.map((item) => item.student_id) || []);
  const records = new Map(session.attendance_records?.map((item) => [item.student_id, item]) || []);
  const roster = new Set(session.enrolled_students?.map((item) => item.id) || []);
  session.attendance_records?.forEach((item) => roster.add(item.student_id));
  const eligible = [...roster].filter((id) => !paused.has(id));
  const present = eligible.filter((id) => ['PRESENT', 'LATE'].includes(records.get(id)?.status || '')).length;
  const absent = eligible.filter((id) => records.get(id)?.status === 'ABSENT').length;
  const excused = eligible.filter((id) => records.get(id)?.status === 'EXCUSED').length;
  return { eligible: eligible.length, present, absent, excused, unmarked: noRollCall ? 0 : eligible.length - present - absent - excused };
}
