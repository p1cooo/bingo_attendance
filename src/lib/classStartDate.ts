/**
 * The first day a student is on a class roster (membership joined_date).
 * Roll call only accepts students who had joined by the lesson date, so a student
 * who really started before the day they were added needs an earlier start date.
 * Shared by the server checks and the forms so both use the same limits.
 */

/** Enough to catch up a missed month of roll calls, short enough to catch typos like 2025. */
export const MAX_START_DATE_DAYS_BACK = 62;

export type ClassStartDateResult = { date: string } | { error: string };

const isCalendarDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function earliestClassStartDate(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - MAX_START_DATE_DAYS_BACK);
  return date.toISOString().slice(0, 10);
}

/** Blank means today. Future dates are only allowed for scheduled adds (allowFuture). */
export function parseClassStartDate(value: unknown, today: string, options: { allowFuture?: boolean } = {}): ClassStartDateResult {
  if (value === undefined || value === null || value === '') return { date: today };
  if (typeof value !== 'string' || !isCalendarDate(value)) return { error: 'Choose a valid class start date.' };
  if (!options.allowFuture && value > today) return { error: 'Class start date cannot be in the future.' };
  const earliest = earliestClassStartDate(today);
  if (value < earliest) return { error: `Class start date can be at most ${MAX_START_DATE_DAYS_BACK} days ago (${earliest} or later).` };
  return { date: value };
}
