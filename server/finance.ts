import { db } from './db.js';
import { academyMonth } from './academyDate.js';
import { pauseMonthCoverage } from './studentPauses.js';
import { attendanceExpectedOn } from './attendanceGoLive.js';
import type { AttendanceRecord, ClassType, Student, StudentClassMembership } from '../src/types.js';

export const validMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const cents = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
/** Fee overrides and partial-month amounts may be RM0 (e.g. a scholarship). */
export const nonNegativeCents = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function validAllocations(input: unknown, amount: number): input is { month: string; amount_cents: number }[] {
  return Array.isArray(input) && input.length > 0 && input.every(a => validMonth(a?.month) && cents(a?.amount_cents)) &&
    new Set(input.map(a => a.month)).size === input.length && input.reduce((n, a) => n + a.amount_cents, 0) === amount;
}
const nextMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return `${y + (m === 12 ? 1 : 0)}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`; };
const monthEnd = (month: string) => `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()).padStart(2, '0')}`;
const nonBillable = new Set(['CANCELLED', 'COACH_CANCELLED', 'OFF_DAY', 'PLANNED_OFF_DAY']);

/**
 * Finance begins in November 2026. Earlier fees, balances, payments and
 * charges are deliberately not carried forward.
 */
export const FINANCE_START_MONTH = '2026-11';

/** Automatic fees used when an admin has not set an override for a class membership. */
export const DEFAULT_FEES: Record<ClassType, { billing_mode: 'MONTHLY' | 'PER_SESSION'; amount_cents: number }> = {
  GROUP: { billing_mode: 'MONTHLY', amount_cents: 24000 },
  INDIVIDUAL: { billing_mode: 'PER_SESSION', amount_cents: 8000 },
};

const normaliseName = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const TEST_STUDENT_NAMES = new Set(['testing', 'testing 123']);
const TEST_STUDENT_NAME_PREFIXES = ['zz test'];
const TEST_STUDENT_IDS = new Set(['STU-9999', 'STU-9998', 'STU-9997']);
const TEST_CLASS_NAMES = new Set(['testing', 'testing 123', 'testing group', 'testing v2']);
/** Test accounts are never billed. */
export function isNonBillableStudent(student: Pick<Student, 'full_name' | 'student_id'>): boolean {
  const name = normaliseName(student.full_name);
  return TEST_STUDENT_NAMES.has(name) || TEST_STUDENT_NAME_PREFIXES.some(prefix => name.startsWith(prefix)) ||
    TEST_STUDENT_IDS.has(String(student.student_id || '').trim().toUpperCase());
}
/** Test classes never create charges for any student enrolled in them. */
export function isNonBillableClass(cls: { name?: string } | undefined | null): boolean {
  return Boolean(cls) && TEST_CLASS_NAMES.has(normaliseName(cls!.name));
}

/**
 * Per-lesson classes charge only for a regular lesson the student attended.
 * Absent, excused and booked marks do not charge; replacement lessons never charge.
 */
export function chargesPerLesson(record: Pick<AttendanceRecord, 'status' | 'attendance_type'>): boolean {
  return record.attendance_type !== 'REPLACEMENT' && (record.status === 'PRESENT' || record.status === 'LATE');
}

export function configuredGoLiveDate(): string | null {
  const date = process.env.ACADEMY_GO_LIVE_DATE;
  if (!date) return null;
  if (!validDate(date)) throw new Error('ACADEMY_GO_LIVE_DATE must be a valid YYYY-MM-DD date.');
  if (!date.endsWith('-01')) throw new Error('ACADEMY_GO_LIVE_DATE must start a billing month until a partial-month baseline policy is approved.');
  return date;
}

/** First billable date: the later of the Finance start and any configured go-live date. */
export function financeStartDate(): string {
  const goLive = configuredGoLiveDate();
  const start = `${FINANCE_START_MONTH}-01`;
  return goLive && goLive > start ? goLive : start;
}

const inMembership = (membership: StudentClassMembership, date: string) =>
  date >= membership.joined_date && (!membership.ended_date || date <= membership.ended_date);

/** Weekday dates for a month when its occurrences have not been generated yet. */
function weekdayDates(month: string, dayOfWeek: number | undefined): string[] {
  if (dayOfWeek === undefined || dayOfWeek === null) return [];
  const dates: string[] = [];
  for (let d = new Date(`${month}-01T00:00:00Z`); d.toISOString().slice(0, 7) === month; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === dayOfWeek) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

type FinanceLine = {
  membership_id: string; class_name: string; coach_name: string; mode: string; unit_cents: number; dates: string[]; amount_cents: number;
  fee_source: 'DEFAULT' | 'OVERRIDE';
  pending_finance_review?: boolean; pre_go_live_dates?: string[];
  /** Group membership joined or ended partway through the month and missed scheduled classes. */
  partial_month?: { joined_date: string; ended_date?: string; attended_dates: string[]; missed_dates: string[]; decision?: { amount_cents: number; reason: string; by: string; at: string } };
};

export function financeDetail(studentId: string, through = academyMonth()) {
  const student = db.students.get(studentId);
  if (!student) return null;
  const non_billable = isNonBillableStudent(student);
  const memberships = [...db.memberships.values()].filter(m => m.student_id === studentId);
  // October (pre-Finance) fee versions are not carried forward.
  const fees = [...db.studentFees.values()].filter(f => f.student_id === studentId && f.effective_month >= FINANCE_START_MONTH).sort((a, b) => a.effective_month.localeCompare(b.effective_month) || a.created_at.localeCompare(b.created_at));
  const payments = [...db.studentPayments.values()].filter(p => p.student_id === studentId).sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at));
  const adjustments = [...db.studentAdjustments.values()].filter(a => a.student_id === studentId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const reviews = [...db.membershipBillingReviews.values()].filter(r => r.student_id === studentId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const startDate = financeStartDate();
  const startMonth = startDate.slice(0, 7);
  const final = [through, ...payments.flatMap(p => p.allocations.map(a => a.month)), ...adjustments.map(a => a.month)].filter(validMonth).sort().at(-1) || through;
  const sessions = [...db.sessions.values()].filter(s => s.session_date >= startDate);
  const attendance = [...db.attendance.values()].filter(a => a.student_id === studentId);
  const chargedSessionIds = new Set(attendance.filter(chargesPerLesson).map(a => a.session_id));
  const months: Array<{month: string; lines: FinanceLine[]; charges_cents: number; paid_cents: number; adjustments_cents: number; outstanding_cents: number; status: string}> = [];
  for (let month = startMonth, count = 0; month <= final && count < 240; month = nextMonth(month), count++) {
    const lines: FinanceLine[] = [];
    const first = `${month}-01`, last = monthEnd(month);
    for (const membership of non_billable ? [] : memberships) {
      if (membership.joined_date > last || (membership.ended_date && membership.ended_date < first) || (membership.ended_date && membership.ended_date < membership.joined_date) || (membership.status === 'PAUSED' && month >= academyMonth()) || (student.status === 'INACTIVE' && month > academyMonth())) continue;
      const schedule = db.schedules.get(membership.schedule_id);
      const cls = db.classes.get(schedule?.class_id || membership.schedule_id);
      if (isNonBillableClass(cls)) continue;
      const override = fees.filter(f => f.membership_id === membership.id && f.effective_month <= month).at(-1);
      const classType: ClassType = cls?.class_type === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'GROUP';
      const applicable = override ? { billing_mode: override.billing_mode, amount_cents: override.amount_cents } : DEFAULT_FEES[classType];
      const classSessions = sessions.filter(s => s.session_date >= first && s.session_date <= last && (s.schedule_id === membership.schedule_id || s.class_id === (schedule?.class_id || membership.schedule_id)) && !nonBillable.has(s.status) && !nonBillable.has(s.session_type || ''));
      const related = classSessions.filter(s => inMembership(membership, s.session_date));
      const dates = related.map(s => s.session_date).sort();
      const charged = related.filter(s => attendanceExpectedOn(s.session_date) && chargedSessionIds.has(s.id));
      const coverage = pauseMonthCoverage(db.studentPauses.values(), membership.id, month);
      const pauseReview = [...db.studentPauses.values()].filter(p => p.membership_id === membership.id && p.billing_reviews?.[month]).at(-1)?.billing_reviews?.[month];
      // Earlier lessons may have happened without electronic roll-call.
      // Their charge cannot be inferred from missing attendance; leave the balance provisional.
      const preGoLiveDates = applicable.billing_mode === 'PER_SESSION' && coverage !== 'FULL'
        ? related.filter(s => !attendanceExpectedOn(s.session_date)).map(s => s.session_date).sort() : [];

      // A group membership that starts or ends inside this month and misses a
      // scheduled class needs an admin-set amount instead of the full monthly fee.
      let partial: FinanceLine['partial_month'];
      if (applicable.billing_mode === 'MONTHLY' && (membership.joined_date > first || (membership.ended_date && membership.ended_date < last))) {
        const scheduled = classSessions.length ? [...new Set(classSessions.map(s => s.session_date))].sort()
          : weekdayDates(month, schedule?.day_of_week ?? cls?.day_of_week).filter(d => d >= startDate);
        const attended = scheduled.filter(d => inMembership(membership, d));
        const missed = scheduled.filter(d => !inMembership(membership, d));
        if (!attended.length) continue; // No class of this month falls inside the membership.
        if (missed.length) {
          const decision = reviews.filter(r => r.membership_id === membership.id && r.month === month).at(-1);
          partial = { joined_date: membership.joined_date, ended_date: membership.ended_date, attended_dates: attended, missed_dates: missed,
            decision: decision && { amount_cents: decision.amount_cents, reason: decision.reason, by: decision.created_by_name || decision.created_by_user_id, at: decision.created_at } };
        }
      }

      const quantity = applicable.billing_mode === 'MONTHLY' ? 1 : charged.length;
      let amount_cents: number;
      let pending_finance_review = false;
      if (coverage === 'FULL') amount_cents = 0;
      else if (partial) { amount_cents = partial.decision?.amount_cents ?? 0; pending_finance_review = !partial.decision; }
      else if (pauseReview) amount_cents = pauseReview.amount_cents;
      else if (coverage === 'PARTIAL') { amount_cents = 0; pending_finance_review = true; }
      else { amount_cents = applicable.amount_cents * quantity; pending_finance_review = preGoLiveDates.length > 0; }
      if (amount_cents || dates.length || coverage !== 'NONE' || pending_finance_review || partial) lines.push({ membership_id: membership.id, class_name: override?.class_name || cls?.name || 'Class', coach_name: override?.coach_name || db.coaches.get(schedule?.coach_id || '')?.name || 'Coach', mode: applicable.billing_mode, unit_cents: applicable.amount_cents, fee_source: override ? 'OVERRIDE' : 'DEFAULT', dates: applicable.billing_mode === 'MONTHLY' ? dates : charged.map(s => s.session_date).sort(), amount_cents, pending_finance_review, pre_go_live_dates: preGoLiveDates, partial_month: partial });
    }
    const charges_cents = lines.reduce((sum, line) => sum + line.amount_cents, 0);
    const paid_cents = payments.reduce((sum, payment) => sum + payment.allocations.filter(a => a.month === month).reduce((n, a) => n + a.amount_cents, 0), 0);
    const adjustments_cents = adjustments.filter(a => a.month === month).reduce((sum, a) => sum + a.amount_cents, 0);
    const outstanding_cents = charges_cents - paid_cents - adjustments_cents;
    if (charges_cents || paid_cents || adjustments_cents || lines.some(line => line.pending_finance_review || line.partial_month)) months.push({month, lines, charges_cents, paid_cents, adjustments_cents, outstanding_cents, status: lines.some(line => line.pending_finance_review) ? 'Pending Finance Review' : charges_cents === 0 ? (non_billable ? 'Non-billable' : 'Credit / advance') : outstanding_cents <= 0 ? 'Paid' : paid_cents || adjustments_cents ? 'Partially paid' : 'Unpaid'});
  }
  // A later paid month cannot conceal an earlier unpaid billing month.
  let paid_until: string | null = null;
  for (const item of months) {
    if (item.charges_cents <= 0) continue;
    if (item.outstanding_cents > 0) break;
    paid_until = item.month;
  }
  return { student, non_billable, fees, payments, adjustments, partial_month_reviews: reviews, months, paid_until, last_payment: payments[0]?.payment_date || null,
    outstanding_cents: months.reduce((sum, item) => sum + item.outstanding_cents, 0),
    pending_finance_review: months.some(item => item.status === 'Pending Finance Review'),
    current_charges_cents: months.find(item => item.month === academyMonth())?.charges_cents || 0 };
}
