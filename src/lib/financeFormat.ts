/** Shared money / month formatting for the Finance screens. */
export const money = (cents: number): string => `RM${(cents / 100).toFixed(2)}`;

export const monthLabel = (month?: string | null): string => month
  ? new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
  : '—';

export const shortMonthLabel = (month: string): string =>
  new Intl.DateTimeFormat('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

/** "240" or "240.50" → cents; anything else → NaN. */
export const amountToCents = (value: string): number => /^-?\d+(\.\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value.trim()) * 100) : NaN;

export const centsToAmount = (cents: number): string => (cents / 100).toFixed(2);

const LAST_PAYMENT_DATE_KEY = 'finance:lastPaymentDate';

/** Last payment date used this browser session (handy when keying in a pile of receipts from one day). */
export function readLastPaymentDate(): string | null {
  try { return sessionStorage.getItem(LAST_PAYMENT_DATE_KEY); } catch { return null; }
}

export function rememberLastPaymentDate(iso: string): void {
  try { sessionStorage.setItem(LAST_PAYMENT_DATE_KEY, iso); } catch { /* storage blocked: the date just isn't remembered */ }
}
