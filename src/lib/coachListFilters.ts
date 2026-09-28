import { AcademyClass, ClassType, Student } from '../types.js';

export const WEEK_DAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
] as const;

export type CoachStudentRow = Pick<Student, 'id' | 'full_name' | 'student_id'> & {
  replacement_credits: number;
  portal_account_status: 'REGISTERED' | 'NOT_REGISTERED' | 'UNKNOWN';
  normal_class_days: number[];
};

export type CreditFilter = 'ALL' | 'POSITIVE' | 'NEGATIVE';
export type LinkFilter = 'ALL' | 'REGISTERED' | 'NOT_REGISTERED';

export function filterCoachStudents(
  students: CoachStudentRow[],
  filters: { query: string; credit: CreditFilter; link: LinkFilter; days: number[] },
): CoachStudentRow[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return students.filter((student) =>
    (!query || student.full_name.toLocaleLowerCase().includes(query) || student.student_id.toLocaleLowerCase().includes(query)) &&
    (filters.credit === 'ALL' || (filters.credit === 'POSITIVE' ? student.replacement_credits > 0 : student.replacement_credits < 0)) &&
    (filters.link === 'ALL' || student.portal_account_status === filters.link) &&
    (!filters.days.length || filters.days.some((day) => (student.normal_class_days || []).includes(day)))
  );
}

const dayRank = (day?: number) => day === undefined ? 7 : (day + 6) % 7;
const timeMinutes = (time?: string) => {
  const [hour, minute] = (time || '').split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : Number.POSITIVE_INFINITY;
};

export function filterAndSortCoachClasses(
  classes: AcademyClass[],
  filters: { query: string; type: ClassType | 'ALL'; days: number[] },
): AcademyClass[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return classes.filter((cls) =>
    (!query || cls.name.toLocaleLowerCase().includes(query)) &&
    (filters.type === 'ALL' || cls.class_type === filters.type) &&
    (!filters.days.length || (cls.day_of_week !== undefined && filters.days.includes(cls.day_of_week)))
  ).sort((a, b) => dayRank(a.day_of_week) - dayRank(b.day_of_week) ||
    timeMinutes(a.start_time) - timeMinutes(b.start_time) || a.name.localeCompare(b.name));
}
