import type { StudentPause, StudentClassMembership, ClassSchedule, User } from '../src/types.js';
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function pauseOnDate(pauses: Iterable<StudentPause>, membershipId: string, date: string): StudentPause | undefined {
  return [...pauses].find(p => p.membership_id === membershipId && p.start_date <= date && (!p.end_date || date <= p.end_date));
}

export function overlapsPause(pauses: Iterable<Pick<StudentPause, 'id' | 'membership_id' | 'start_date' | 'end_date'>>, membershipId: string, start: string, end: string | null, exceptId?: string): boolean {
  return [...pauses].some(p => p.membership_id === membershipId && p.id !== exceptId &&
    p.start_date <= (end || '9999-12-31') && start <= (p.end_date || '9999-12-31'));
}

export function pauseMonthCoverage(pauses: Iterable<StudentPause>, membershipId: string, month: string): 'NONE' | 'FULL' | 'PARTIAL' {
  const start = `${month}-01`;
  const end = `${month}-${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()}`;
  const relevant = [...pauses].filter(p => p.membership_id === membershipId && p.start_date <= end && (!p.end_date || p.end_date >= start));
  if (!relevant.length) return 'NONE';
  const covered = new Set<string>();
  for (let day = 1; day <= Number(end.slice(-2)); day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    if (relevant.some(p => p.start_date <= date && (!p.end_date || date <= p.end_date))) covered.add(date);
  }
  return covered.size === Number(end.slice(-2)) ? 'FULL' : 'PARTIAL';
}

export function validatePauseDates(start: unknown, end: unknown): boolean {
  return validDate(start) && (end === null || validDate(end) && end >= start);
}

export function canManagePause(user: User, membership?: StudentClassMembership, schedule?: ClassSchedule): boolean {
  return Boolean(membership && schedule && membership.schedule_id === schedule.id &&
    (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || Boolean(user.coach_id &&
      [schedule.coach_id, schedule.default_coach_id].includes(user.coach_id))));
}
