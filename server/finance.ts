import { db } from './db.js';
import { academyMonth } from './academyDate.js';
import { pauseMonthCoverage } from './studentPauses.js';
import { attendanceExpectedOn } from './attendanceGoLive.js';

export const validMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const cents = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
export function validAllocations(input: unknown, amount: number): input is { month: string; amount_cents: number }[] {
  return Array.isArray(input) && input.length > 0 && input.every(a => validMonth(a?.month) && cents(a?.amount_cents)) &&
    new Set(input.map(a => a.month)).size === input.length && input.reduce((n, a) => n + a.amount_cents, 0) === amount;
}
const nextMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return `${y + (m === 12 ? 1 : 0)}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`; };
const monthEnd = (month: string) => `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}`;
const nonBillable = new Set(['CANCELLED', 'COACH_CANCELLED', 'OFF_DAY', 'PLANNED_OFF_DAY']);

export function configuredGoLiveDate(): string | null {
  const date = process.env.ACADEMY_GO_LIVE_DATE;
  if (!date) return null;
  if (!validDate(date)) throw new Error('ACADEMY_GO_LIVE_DATE must be a valid YYYY-MM-DD date.');
  if (!date.endsWith('-01')) throw new Error('ACADEMY_GO_LIVE_DATE must start a billing month until a partial-month baseline policy is approved.');
  return date;
}

export function financeDetail(studentId: string, through = academyMonth()) {
  const student = db.students.get(studentId);
  if (!student) return null;
  const memberships = [...db.memberships.values()].filter(m => m.student_id === studentId);
  const fees = [...db.studentFees.values()].filter(f => f.student_id === studentId).sort((a, b) => a.effective_month.localeCompare(b.effective_month) || a.created_at.localeCompare(b.created_at));
  const payments = [...db.studentPayments.values()].filter(p => p.student_id === studentId).sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at));
  const adjustments = [...db.studentAdjustments.values()].filter(a => a.student_id === studentId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const goLiveDate = configuredGoLiveDate();
  const first = [...fees.map(f => f.effective_month), ...payments.flatMap(p => p.allocations.map(a => a.month)), ...adjustments.map(a => a.month)].filter(validMonth).sort()[0] || through;
  const startMonth = goLiveDate && first < goLiveDate.slice(0, 7) ? goLiveDate.slice(0, 7) : first;
  const final = [through, ...payments.flatMap(p => p.allocations.map(a => a.month)), ...adjustments.map(a => a.month)].filter(validMonth).sort().at(-1) || through;
  const sessions = [...db.sessions.values()];
  const attendance = [...db.attendance.values()].filter(a => a.student_id === studentId);
  // A recorded absence still represents a class that took place. Excused and merely booked dates do not bill.
  const billableSessionIds = new Set(attendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE' || a.status === 'ABSENT').map(a => a.session_id));
  const months: Array<{month: string; lines: Array<{membership_id: string; class_name: string; coach_name: string; mode: string; unit_cents: number; dates: string[]; amount_cents: number; pending_finance_review?: boolean; pre_go_live_dates?: string[]}>; charges_cents: number; paid_cents: number; adjustments_cents: number; outstanding_cents: number; status: string}> = [];
  for (let month = startMonth, count = 0; month <= final && count < 240; month = nextMonth(month), count++) {
    const lines = [] as typeof months[number]['lines'];
    for (const membership of memberships) {
      if (membership.joined_date > monthEnd(month) || (membership.ended_date && membership.ended_date < `${month}-01`) || (membership.status === 'PAUSED' && month >= academyMonth()) || (student.status === 'INACTIVE' && month > academyMonth())) continue;
      const schedule = db.schedules.get(membership.schedule_id);
      const cls = db.classes.get(schedule?.class_id || membership.schedule_id);
      const applicable = fees.filter(f => f.membership_id === membership.id && f.effective_month <= month).at(-1);
      if (!applicable) continue;
      const related = sessions.filter(s => s.session_date.startsWith(month) && (!goLiveDate || s.session_date >= goLiveDate) && (s.schedule_id === membership.schedule_id || s.class_id === (schedule?.class_id || membership.schedule_id)) && !nonBillable.has(s.status) && !nonBillable.has(s.session_type || '') && s.session_date >= membership.joined_date && (!membership.ended_date || s.session_date <= membership.ended_date));
      const dates = related.map(s => s.session_date).sort();
      const billable = related.filter(s => attendanceExpectedOn(s.session_date) && billableSessionIds.has(s.id));
      const quantity = applicable.billing_mode === 'MONTHLY' ? 1 : billable.length;
      const coverage = pauseMonthCoverage(db.studentPauses.values(), membership.id, month);
      const review = [...db.studentPauses.values()].filter(p => p.membership_id === membership.id && p.billing_reviews?.[month]).at(-1)?.billing_reviews?.[month];
      // Earlier October lessons may have happened without electronic roll-call.
      // Their charge cannot be inferred from missing attendance; leave the balance provisional.
      const preGoLiveDates = applicable.billing_mode === 'PER_SESSION' && coverage !== 'FULL'
        ? related.filter(s => !attendanceExpectedOn(s.session_date)).map(s => s.session_date).sort() : [];
      const pending_finance_review = !review && (coverage === 'PARTIAL' || preGoLiveDates.length > 0);
      const amount_cents = coverage === 'FULL' ? 0 : review ? review.amount_cents : coverage === 'PARTIAL' ? 0 : applicable.amount_cents * quantity;
      if (amount_cents || dates.length || coverage !== 'NONE' || pending_finance_review) lines.push({ membership_id: membership.id, class_name: applicable.class_name || cls?.name || 'Class', coach_name: applicable.coach_name || db.coaches.get(schedule?.coach_id || '')?.name || 'Coach', mode: applicable.billing_mode, unit_cents: applicable.amount_cents, dates: applicable.billing_mode === 'MONTHLY' ? dates : billable.map(s => s.session_date).sort(), amount_cents, pending_finance_review, pre_go_live_dates: preGoLiveDates });
    }
    const charges_cents = lines.reduce((sum, line) => sum + line.amount_cents, 0);
    const paid_cents = payments.reduce((sum, payment) => sum + payment.allocations.filter(a => a.month === month).reduce((n, a) => n + a.amount_cents, 0), 0);
    const adjustments_cents = adjustments.filter(a => a.month === month).reduce((sum, a) => sum + a.amount_cents, 0);
    const outstanding_cents = charges_cents - paid_cents - adjustments_cents;
    if (charges_cents || paid_cents || adjustments_cents || lines.some(line => line.pending_finance_review)) months.push({month, lines, charges_cents, paid_cents, adjustments_cents, outstanding_cents, status: lines.some(line => line.pending_finance_review) ? 'Pending Finance Review' : charges_cents === 0 ? 'Credit / advance' : outstanding_cents <= 0 ? 'Paid' : paid_cents || adjustments_cents ? 'Partially paid' : 'Unpaid'});
  }
  // A later paid month cannot conceal an earlier unpaid billing month.
  let paid_until: string | null = null;
  for (const item of months) {
    if (item.charges_cents <= 0) continue;
    if (item.outstanding_cents > 0) break;
    paid_until = item.month;
  }
  return { student, fees, payments, adjustments, months, paid_until, last_payment: payments[0]?.payment_date || null,
    outstanding_cents: months.reduce((sum, item) => sum + item.outstanding_cents, 0),
    pending_finance_review: months.some(item => item.status === 'Pending Finance Review'),
    current_charges_cents: months.find(item => item.month === academyMonth())?.charges_cents || 0 };
}
