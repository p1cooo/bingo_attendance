/**
 * Standard Date Utilities for Grandmaster Chess Academy
 */

/**
 * Returns today's date in local 'YYYY-MM-DD' format.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's month in local 'YYYY-MM' format.
 */
export function getCurrentMonthString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Format date string (YYYY-MM-DD) into readable format: 'Tuesday, Sep 1, 2026'
 */
export function formatFullDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format date string into short format: 'Tue, Sep 1'
 */
export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Generates an array of 7 days representing the fixed week containing referenceDateStr.
 * startDay: 'SUN' (Sunday to Saturday) or 'MON' (Monday to Sunday).
 */
export function getFixedWeekDays(
  referenceDateStr: string,
  startDay: 'SUN' | 'MON' = 'SUN'
): Array<{
  dateStr: string;
  dayNum: string;
  dayLabel: string;
  monthShort: string;
  isToday: boolean;
  fullLabel: string;
}> {
  const todayStr = getTodayDateString();
  const [y, m, d] = (referenceDateStr || todayStr).split('-').map(Number);
  const refDate = new Date(y, m - 1, d);

  const dayOfWeek = refDate.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday

  let diffToStart = 0;
  if (startDay === 'SUN') {
    diffToStart = -dayOfWeek; // diff to Sunday
  } else {
    diffToStart = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // diff to Monday
  }

  const startDate = new Date(refDate);
  startDate.setDate(refDate.getDate() + diffToStart);

  const days: Array<{
    dateStr: string;
    dayNum: string;
    dayLabel: string;
    monthShort: string;
    isToday: boolean;
    fullLabel: string;
  }> = [];

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthLabels = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  for (let i = 0; i < 7; i++) {
    const target = new Date(startDate);
    target.setDate(startDate.getDate() + i);

    const yr = target.getFullYear();
    const mo = String(target.getMonth() + 1).padStart(2, '0');
    const dy = String(target.getDate()).padStart(2, '0');
    const dateStr = `${yr}-${mo}-${dy}`;

    const isToday = dateStr === todayStr;

    days.push({
      dateStr,
      dayNum: String(target.getDate()),
      dayLabel: dayLabels[target.getDay()],
      monthShort: monthLabels[target.getMonth()],
      isToday,
      fullLabel: `${dayLabels[target.getDay()]}, ${monthLabels[target.getMonth()]} ${target.getDate()}${
        isToday ? ' (Today)' : ''
      }`,
    });
  }

  return days;
}

/**
 * Returns the anchor date (e.g. Sunday) for the week containing referenceDateStr.
 */
export function getWeekStart(referenceDateStr: string, startDay: 'SUN' | 'MON' = 'SUN'): string {
  const [y, m, d] = (referenceDateStr || getTodayDateString()).split('-').map(Number);
  const refDate = new Date(y, m - 1, d);
  const dayOfWeek = refDate.getDay();
  const diffToStart = startDay === 'SUN' ? -dayOfWeek : (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const startDate = new Date(refDate);
  startDate.setDate(refDate.getDate() + diffToStart);
  const yr = startDate.getFullYear();
  const mo = String(startDate.getMonth() + 1).padStart(2, '0');
  const dy = String(startDate.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}`;
}

/**
 * Format a YYYY-MM string to 'Month Year' (e.g. 'September 2026')
 */
export function formatMonthName(monthStr: string): string {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  if (!y || !m) return monthStr;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Generates an array of N days centered around or starting near a reference date.
 */
export function generateDayStrip(referenceDateStr: string, daysBefore = 3, daysAfter = 5): Array<{
  dateStr: string;
  dayNum: string;
  dayLabel: string;
  monthShort: string;
  isToday: boolean;
  fullLabel: string;
}> {
  const todayStr = getTodayDateString();
  const [y, m, d] = (referenceDateStr || todayStr).split('-').map(Number);
  const refDate = new Date(y, m - 1, d);

  const days: Array<{
    dateStr: string;
    dayNum: string;
    dayLabel: string;
    monthShort: string;
    isToday: boolean;
    fullLabel: string;
  }> = [];

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = -daysBefore; i <= daysAfter; i++) {
    const target = new Date(refDate);
    target.setDate(refDate.getDate() + i);

    const yr = target.getFullYear();
    const mo = String(target.getMonth() + 1).padStart(2, '0');
    const dy = String(target.getDate()).padStart(2, '0');
    const dateStr = `${yr}-${mo}-${dy}`;

    const isToday = dateStr === todayStr;

    days.push({
      dateStr,
      dayNum: String(target.getDate()),
      dayLabel: dayLabels[target.getDay()],
      monthShort: monthLabels[target.getMonth()],
      isToday,
      fullLabel: `${dayLabels[target.getDay()]}, ${monthLabels[target.getMonth()]} ${target.getDate()}${isToday ? ' (Today)' : ''}`,
    });
  }

  return days;
}

/**
 * Add or subtract days from a YYYY-MM-DD string.
 */
export function shiftDate(dateStr: string, offsetDays: number): string {
  const [y, m, d] = (dateStr || getTodayDateString()).split('-').map(Number);
  const target = new Date(y, m - 1, d);
  target.setDate(target.getDate() + offsetDays);
  const yr = target.getFullYear();
  const mo = String(target.getMonth() + 1).padStart(2, '0');
  const dy = String(target.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}`;
}
