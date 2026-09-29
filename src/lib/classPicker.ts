import type { ClassSchedule } from '../types.js';

export type ClassPickerFilters = { search: string; days: number[]; type: '' | 'GROUP' | 'INDIVIDUAL'; coachId: string };

export const MONDAY_FIRST_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export const toggleClassDay = (days: number[], day: number) =>
  days.includes(day) ? days.filter((value) => value !== day) : [...days, day];

export function filterClassPicker(schedules: ClassSchedule[], filters: ClassPickerFilters) {
  const query = filters.search.trim().toLowerCase();
  return schedules.filter((schedule) => schedule.is_active && schedule.status === 'ACTIVE' &&
    (!filters.days.length || filters.days.includes(schedule.day_of_week)) &&
    (!filters.type || schedule.class_item?.class_type === filters.type) &&
    (!filters.coachId || (schedule.default_coach_id || schedule.coach_id) === filters.coachId) &&
    (!query || (schedule.class_item?.name || '').toLowerCase().includes(query)))
    .sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7) ||
      a.start_time.localeCompare(b.start_time) || (a.class_item?.name || '').localeCompare(b.class_item?.name || ''));
}
