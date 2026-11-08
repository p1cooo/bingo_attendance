/**
 * Day-first (dd/mm/yyyy) date helpers. The browser's own date box follows the
 * computer's language setting, so a US-style PC reads 01/11/2026 as 11 January.
 * These helpers always read day first, whatever the computer setting.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SEPARATED = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2}|\d{4})$/;
const DIGITS_ONLY = /^(\d{2})(\d{2})(\d{4})$/;
const TWO_DIGIT_YEAR_BASE = 2000;

const pad = (n: number) => String(n).padStart(2, '0');

const toIso = (day: number, month: number, year: number): string | null => {
  if (month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** "1/11/2026", "01-11-26", "01.11.2026" or "01112026" → "2026-11-01"; anything else → null. */
export function parseDmy(input: string): string | null {
  const text = input.trim();
  const match = SEPARATED.exec(text) || DIGITS_ONLY.exec(text);
  if (!match) return null;
  const [, d, m, y] = match;
  const year = y.length === 2 ? TWO_DIGIT_YEAR_BASE + Number(y) : Number(y);
  return toIso(Number(d), Number(m), year);
}

/** "2026-11-01" → "01/11/2026"; invalid → "". */
export function formatDmy(iso: string | null | undefined): string {
  const match = iso ? ISO_DATE.exec(iso) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/** "2026-11-01" → "Sun 1 Nov 2026"; invalid → "". */
export function longDateLabel(iso: string | null | undefined): string {
  if (!iso || !ISO_DATE.test(iso)) return '';
  return new Intl.DateTimeFormat('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`)).replace(/,/g, '');
}

export type DmyCheck = { iso: string; error?: undefined } | { iso: null; error: string };

/** Parse and check a typed date. `max` (ISO) blocks later dates, e.g. no future payments. */
export function checkDmy(input: string, max?: string): DmyCheck {
  if (!input.trim()) return { iso: null, error: 'Enter a date as dd/mm/yyyy.' };
  const iso = parseDmy(input);
  if (!iso) return { iso: null, error: 'Not a real date. Use dd/mm/yyyy, e.g. 01/11/2026.' };
  if (max && iso > max) return { iso: null, error: `Date can't be after ${longDateLabel(max)}.` };
  return { iso };
}

/** ISO date `days` before `iso`. */
export function isoDaysBefore(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
