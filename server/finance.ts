import { db } from './db.js';
import { academyMonth } from './academyDate.js';
import { pauseMonthCoverage, pauseOnDate } from './studentPauses.js';
import { attendanceExpectedOn } from './attendanceGoLive.js';
import type { AttendanceRecord, ClassFee, ClassType, Student, StudentClassMembership } from '../src/types.js';

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

/** All class fee records for a class, oldest first (same order rule as student overrides). */
export function classFeeHistory(classId: string): ClassFee[] {
  return [...db.classFees.values()].filter(f => f.class_id === classId && f.effective_month >= FINANCE_START_MONTH)
    .sort((a, b) => a.effective_month.localeCompare(b.effective_month) || a.created_at.localeCompare(b.created_at));
}
/** The class fee in force for a month: the latest record at or before that month, if any. */
export function classFeeFor(classId: string, month: string): ClassFee | undefined {
  return classFeeHistory(classId).filter(f => f.effective_month <= month).at(-1);
}

const normaliseName =(value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const TEST_STUDENT_NAMES = new Set(['testing', 'testing 123']);
const TEST_STUDENT_NAME_PREFIXES = ['zz test', 'test student', 'test walk-in'];
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

/**
 * A group class's monthly fee starts at the student's first regular roll-call
 * mark in that class that month. Absent counts (it still earns a replacement
 * credit); excused, booked and replacement attendance do not.
 */
export function startsMonthlyCharge(record: Pick<AttendanceRecord, 'status' | 'attendance_type'>): boolean {
  return record.attendance_type !== 'REPLACEMENT' && (record.status === 'PRESENT' || record.status === 'LATE' || record.status === 'ABSENT');
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

/** Trial (walk-in) sessions are billed from this date; earlier ones are left alone (owner decision 2026-11-07). */
export const TRIAL_FEE_START_DATE = '2026-11-01';
/** A trial fee decision is stored as a billing review keyed to the attendance mark. */
export const trialReviewKey = (attendanceId: string) => `trial:${attendanceId}`;

/**
 * Attendance marks that were trial (walk-in) sessions: every mark while a
 * student is unregistered, and the marks stamped at registration afterwards.
 * Only Present/Late sessions are charged; the admin sets each amount.
 */
export function trialAttendance(student: Student): AttendanceRecord[] {
  const stamped = student.is_unregistered ? null : new Set(student.trial_attendance_ids || []);
  if (stamped && !stamped.size) return [];
  return [...db.attendance.values()].filter(a => a.student_id === student.id && (!stamped || stamped.has(a.id)) &&
    a.attendance_type !== 'REPLACEMENT' && (a.status === 'PRESENT' || a.status === 'LATE'));
}

/**
 * The class dates of a membership in a month: generated sessions (cancelled and
 * off days excluded) plus the regular weekday after the last generated session.
 */
export function membershipClassDates(membership: StudentClassMembership, month: string): string[] {
  const first = `${month}-01`, last = monthEnd(month);
  const schedule = db.schedules.get(membership.schedule_id);
  const classId = schedule?.class_id || membership.schedule_id;
  const inMonth = [...db.sessions.values()].filter(s => s.session_date >= first && s.session_date <= last && (s.schedule_id === membership.schedule_id || s.class_id === classId));
  const held = inMonth.filter(s => !nonBillable.has(s.status) && !nonBillable.has(s.session_type || '')).map(s => s.session_date);
  const latest = inMonth.map(s => s.session_date).sort().at(-1);
  const upcoming = weekdayDates(month, schedule?.day_of_week ?? db.classes.get(classId)?.day_of_week).filter(d => !latest || d > latest);
  return [...new Set([...held, ...upcoming])].filter(d => inMembership(membership, d)).sort();
}

/**
 * How a pause affects a month, judged by the student's class dates (owner decision 2026-11-08):
 * no class inside the pause = normal fee; every class paused = RM0; some classes paused = admin sets the fee.
 */
export function pauseCoverageForMonth(membership: StudentClassMembership, month: string): { coverage: 'NONE' | 'FULL' | 'PARTIAL'; class_dates: string[]; paused_dates: string[] } {
  const calendar = pauseMonthCoverage(db.studentPauses.values(), membership.id, month);
  if (calendar !== 'PARTIAL') return { coverage: calendar, class_dates: [], paused_dates: [] };
  const class_dates = membershipClassDates(membership, month);
  const paused_dates = class_dates.filter(d => pauseOnDate(db.studentPauses.values(), membership.id, d));
  const coverage = !paused_dates.length ? 'NONE' : paused_dates.length === class_dates.length ? 'FULL' : 'PARTIAL';
  return { coverage, class_dates, paused_dates };
}

type FinanceLine = {
  membership_id: string; class_name: string; coach_name: string; mode: string; unit_cents: number; dates: string[]; amount_cents: number;
  /** Trial (walk-in) session: the admin sets the amount. */
  trial?: { attendance_id: string; date: string; decision?: { amount_cents: number; reason: string; by: string; at: string } };
  fee_source: 'DEFAULT' | 'CLASS' | 'OVERRIDE';
  /** Group class with no roll call yet this month: not charged. */
  awaiting_first_roll_call?: boolean;
  pending_finance_review?: boolean; pre_go_live_dates?: string[];
  /** Group membership joined or ended partway through the month and missed scheduled classes. */
  /** Pause covering only some of this month's classes: the admin sets the month fee. */
  pause?: { class_dates: string[]; paused_dates: string[]; decided: boolean };
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
  const rollCallSessionIds = new Set(attendance.filter(startsMonthlyCharge).map(a => a.session_id));
  const trials = trialAttendance(student);
  const trialStart = startDate > TRIAL_FEE_START_DATE ? startDate : TRIAL_FEE_START_DATE;
  const months: Array<{month: string; lines: FinanceLine[]; charges_cents: number; paid_cents: number; adjustments_cents: number; outstanding_cents: number; status: string}> = [];
  for (let month = startMonth, count = 0; month <= final && count < 240; month = nextMonth(month), count++) {
    const lines: FinanceLine[] = [];
    const first = `${month}-01`, last = monthEnd(month);
    for (const record of non_billable ? [] : trials) {
      const session = db.sessions.get(record.session_id);
      if (!session || session.session_date < first || session.session_date > last || session.session_date < trialStart) continue;
      if (nonBillable.has(session.status) || nonBillable.has(session.session_type || '')) continue;
      const cls = db.classes.get(session.class_id);
      if (isNonBillableClass(cls)) continue;
      const review = reviews.filter(r => r.membership_id === trialReviewKey(record.id)).at(-1);
      const decision = review && { amount_cents: review.amount_cents, reason: review.reason, by: review.created_by_name || review.created_by_user_id, at: review.created_at };
      lines.push({ membership_id: trialReviewKey(record.id), class_name: cls?.name || 'Class', coach_name: db.coaches.get(session.actual_coach_id || session.scheduled_coach_id || '')?.name || 'Coach',
        mode: 'TRIAL', unit_cents: 0, fee_source: 'DEFAULT', dates: [session.session_date], amount_cents: decision?.amount_cents ?? 0,
        pending_finance_review: !decision, trial: { attendance_id: record.id, date: session.session_date, decision } });
    }
    for (const membership of non_billable ? [] : memberships) {
      if (membership.joined_date > last || (membership.ended_date && membership.ended_date < first) || (membership.ended_date && membership.ended_date < membership.joined_date) || (membership.status === 'PAUSED' && month >= academyMonth()) || (student.status === 'INACTIVE' && month > academyMonth())) continue;
      const schedule = db.schedules.get(membership.schedule_id);
      const cls = db.classes.get(schedule?.class_id || membership.schedule_id);
      if (isNonBillableClass(cls)) continue;
      const override = fees.filter(f => f.membership_id === membership.id && f.effective_month <= month).at(-1);
      const classType: ClassType = cls?.class_type === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'GROUP';
      // Priority: the student's own override, then the class fee, then the default.
      const classFee = override || !cls ? undefined : classFeeFor(cls.id, month);
      const applicable = override ? { billing_mode: override.billing_mode, amount_cents: override.amount_cents }
        : classFee ? { billing_mode: DEFAULT_FEES[classType].billing_mode, amount_cents: classFee.amount_cents } : DEFAULT_FEES[classType];
      const feeSource: FinanceLine['fee_source'] = override ? 'OVERRIDE' : classFee ? 'CLASS' : 'DEFAULT';
      const classSessions = sessions.filter(s => s.session_date >= first && s.session_date <= last && (s.schedule_id === membership.schedule_id || s.class_id === (schedule?.class_id || membership.schedule_id)) && !nonBillable.has(s.status) && !nonBillable.has(s.session_type || ''));
      const related = classSessions.filter(s => inMembership(membership, s.session_date));
      const dates = related.map(s => s.session_date).sort();
      const charged = related.filter(s => attendanceExpectedOn(s.session_date) && chargedSessionIds.has(s.id));
      const pauseInfo = pauseCoverageForMonth(membership, month);
      // Per-lesson classes already charge only lessons attended, so a pause never needs a review there.
      const coverage = applicable.billing_mode === 'PER_SESSION' && pauseInfo.coverage === 'PARTIAL' ? 'NONE' : pauseInfo.coverage;
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
      // Until the first roll call of the month, a group class is not charged
      // and needs no review. An admin's explicit amount still applies.
      const awaitingFirstRollCall = applicable.billing_mode === 'MONTHLY' && !related.some(s => rollCallSessionIds.has(s.id));
      let amount_cents: number;
      let pending_finance_review = false;
      if (coverage === 'FULL') amount_cents = 0;
      else if (awaitingFirstRollCall && !partial?.decision && !pauseReview) { amount_cents = 0; partial = undefined; }
      else if (partial) { amount_cents = partial.decision?.amount_cents ?? 0; pending_finance_review = !partial.decision; }
      else if (pauseReview) amount_cents = pauseReview.amount_cents;
      else if (coverage === 'PARTIAL') { amount_cents = 0; pending_finance_review = true; }
      else { amount_cents = applicable.amount_cents * quantity; pending_finance_review = preGoLiveDates.length > 0; }
      if (amount_cents || dates.length || coverage !== 'NONE' || pending_finance_review || partial) lines.push({ membership_id: membership.id, class_name: override?.class_name || cls?.name || 'Class', coach_name: override?.coach_name || db.coaches.get(schedule?.coach_id || '')?.name || 'Coach', mode: applicable.billing_mode, unit_cents: applicable.amount_cents, fee_source: feeSource, dates: applicable.billing_mode === 'MONTHLY' ? dates : charged.map(s => s.session_date).sort(), amount_cents, pending_finance_review, pre_go_live_dates: preGoLiveDates, partial_month: partial, pause: coverage === 'PARTIAL' ? { class_dates: pauseInfo.class_dates, paused_dates: pauseInfo.paused_dates, decided: Boolean(pauseReview) } : undefined, awaiting_first_roll_call: awaitingFirstRollCall && coverage !== 'FULL' && amount_cents === 0 && !pending_finance_review });
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
  return { student, non_billable, fees, payments, adjustments, partial_month_reviews: reviews.filter(r => !r.membership_id.startsWith('trial:')), months, paid_until, last_payment: payments[0]?.payment_date || null,
    outstanding_cents: months.reduce((sum, item) => sum + item.outstanding_cents, 0),
    pending_finance_review: months.some(item => item.status === 'Pending Finance Review'),
    current_charges_cents: months.find(item => item.month === academyMonth())?.charges_cents || 0 };
}

export type FinanceMonthStatus = 'PAID' | 'PARTLY_PAID' | 'UNPAID' | 'CREDIT' | 'NEEDS_REVIEW' | 'NOT_BILLED_YET' | 'NONE';
type Detail = NonNullable<ReturnType<typeof financeDetail>>;

/** True when the student has a class membership that runs during the month and is not paused. */
function activeMembershipsIn(studentId: string, month: string): StudentClassMembership[] {
  const first = `${month}-01`, last = monthEnd(month);
  return [...db.memberships.values()].filter(m => m.student_id === studentId && m.joined_date <= last &&
    (!m.ended_date || m.ended_date >= first) && !(m.status === 'PAUSED' && month >= academyMonth()));
}
const hasActiveMembershipIn = (studentId: string, month: string) => activeMembershipsIn(studentId, month).length > 0;

/**
 * One plain status per student for a month, used by the Finance overview and
 * the Student payments filter. Credit means the student's total balance is
 * below zero (paid ahead) and nothing is owed for this month.
 */
export function financeMonthStatus(detail: Detail, month: string): FinanceMonthStatus {
  if (detail.non_billable) return 'NONE';
  const item = detail.months.find(m => m.month === month);
  if (item?.lines.some(line => line.pending_finance_review)) return 'NEEDS_REVIEW';
  if (item && item.charges_cents > 0) {
    if (item.outstanding_cents <= 0) return detail.outstanding_cents < 0 ? 'CREDIT' : 'PAID';
    return item.paid_cents || item.adjustments_cents ? 'PARTLY_PAID' : 'UNPAID';
  }
  if (detail.outstanding_cents < 0) return 'CREDIT';
  if (detail.student.status === 'ACTIVE' && !detail.student.is_unregistered && hasActiveMembershipIn(detail.student.id, month)) return 'NOT_BILLED_YET';
  return 'NONE';
}

/** Students shown in Finance: walk-ins only when they have a trial to bill. */
export function financeStudentDetails(): Detail[] {
  return [...db.students.values()].map(s => financeDetail(s.id)!).filter(d => d && (!d.student.is_unregistered || d.months.length > 0));
}

/** Month dashboard for Finance → Overview. Amounts in cents. */
export function financeOverview(month: string, details: Detail[] = financeStudentDetails()) {
  const status_counts: Record<Exclude<FinanceMonthStatus, 'NONE'>, number> = { PAID: 0, PARTLY_PAID: 0, UNPAID: 0, CREDIT: 0, NEEDS_REVIEW: 0, NOT_BILLED_YET: 0 };
  const ageing = { this_month_only: { students: 0, cents: 0 }, one_behind: { students: 0, cents: 0 }, two_plus: { students: 0, cents: 0 } };
  const to_do = { partial_months: 0, trial_sessions: 0, other_reviews: 0, classes_without_roll_call: [] as string[] };
  const byClass = new Map<string, number>();
  const awaiting = new Set<string>();
  let billed_cents = 0, billed_students = 0, month_outstanding_cents = 0, total_outstanding_cents = 0, collected_cents = 0, payments_count = 0;
  const payments: { student_id: string; student_name: string; student_code: string; amount_cents: number; method: string; payment_date: string; created_at: string }[] = [];

  for (const detail of details) {
    for (const p of detail.payments) {
      payments.push({ student_id: detail.student.id, student_name: detail.student.full_name, student_code: detail.student.student_id, amount_cents: p.amount_cents, method: p.method, payment_date: p.payment_date, created_at: p.created_at });
      if (p.payment_date.slice(0, 7) === month) { collected_cents += p.amount_cents; payments_count++; }
    }
    const status = financeMonthStatus(detail, month);
    if (status !== 'NONE') status_counts[status]++;
    if (status === 'NOT_BILLED_YET') for (const m of activeMembershipsIn(detail.student.id, month)) {
      const cls = db.classes.get(db.schedules.get(m.schedule_id)?.class_id || m.schedule_id);
      if (cls && cls.class_type !== 'INDIVIDUAL' && !isNonBillableClass(cls)) awaiting.add(cls.name);
    }
    if (detail.non_billable) continue;
    if (detail.outstanding_cents > 0) total_outstanding_cents += detail.outstanding_cents;
    const item = detail.months.find(m => m.month === month);
    if (item) {
      if (item.charges_cents > 0) { billed_cents += item.charges_cents; billed_students++; }
      if (item.outstanding_cents > 0) {
        month_outstanding_cents += item.outstanding_cents;
        const charged = item.lines.filter(line => line.amount_cents > 0);
        const total = charged.reduce((n, line) => n + line.amount_cents, 0);
        for (const line of charged) byClass.set(line.class_name, (byClass.get(line.class_name) || 0) + Math.round(item.outstanding_cents * line.amount_cents / total));
      }
      for (const line of item.lines) {
        if (!line.pending_finance_review) continue;
        if (line.trial) to_do.trial_sessions++;
        else if (line.partial_month) to_do.partial_months++;
        else to_do.other_reviews++;
      }
    }
    // How late: unpaid billed months before the chosen month.
    const owing = detail.months.filter(m => m.month <= month && m.charges_cents > 0 && m.outstanding_cents > 0);
    if (!owing.length) continue;
    const earlier = owing.filter(m => m.month < month).length;
    const cents = owing.reduce((n, m) => n + m.outstanding_cents, 0);
    const bucket = earlier === 0 ? ageing.this_month_only : earlier === 1 ? ageing.one_behind : ageing.two_plus;
    bucket.students++; bucket.cents += cents;
  }
  to_do.classes_without_roll_call = [...awaiting].sort();
  return {
    month, billed_cents, billed_students, collected_cents, payments_count,
    still_to_collect_cents: month_outstanding_cents, total_outstanding_cents,
    status_counts, ageing, to_do,
    by_class: [...byClass].map(([class_name, cents]) => ({ class_name, cents })).sort((a, b) => b.cents - a.cents).slice(0, 5),
    recent_payments: payments.sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.created_at.localeCompare(a.created_at)).slice(0, 8),
  };
}
