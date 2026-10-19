import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import { adminAuth, getFirestoreDb, hasAdminCredentials } from './firebaseAdmin.js';
import {
  authenticateUser,
  requireAdmin,
  requireSuperAdmin,
  requireCoachOrAdmin,
  verifySessionAttendanceAccess,
  AuthenticatedRequest,
} from './auth.js';
import {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceType,
  AcademyClass,
  ClassSchedule,
  ClassSession,
  MonthlyReportItem,
  MonthlyStudentReportItem,
  NotificationLog,
  Student,
  User,
  Coach,
  Parent,
} from '../src/types.js';
import { dispatchTelegramNotification } from './telegram.js';
import { notificationService } from './notifications/NotificationService.js';
import { validateBulkImport, commitBulkImport } from './bulkImport.js';
import { generateClassScheduleDocx } from './exportDocx.js';
import { generateAccountantPdf, generateAccountantWorkbook } from './accountantExport.js';
import { syncDocToFirestore, deleteDocFromFirestore, markFirestoreStateChanged, publishFirestoreRevision, removeUndefinedValues, initializeFirestoreSync } from './firestoreSync.js';
import { awardPortalStars, getPortalLink, managePortalAccount, portalAccountStatuses, syncPortalCoachLinksForStudent } from './portalBridge.js';
import { isFormalStudentCode, nextUnusedStudentCode, normaliseStudentCode } from './studentIds.js';
import { academyMonth, academyToday } from './academyDate.js';
import { recordActivity, activityEntry } from './activity.js';
import { OccurrenceError, planOccurrence, applyOccurrenceMode } from './sessionOccurrence.js';
import { commitOccurrence } from './occurrencePersistence.js';
import { reconcileRecurringSessions } from './recurringSessions.js';
import { planStudentMemberships } from './studentMemberships.js';
import { createReplacementCredit, persistAttendanceWithReplacementReconciliation, replacementCreditBalance, ReplacementCreditError, PauseAttendanceError, AttendanceConflictError, attendanceRecordId } from './replacementCredits.js';
import { attendanceTiming } from './attendanceTiming.js';
import { ReplacementAdvanceCommitment, ReplacementCredit } from '../src/types.js';
import { financeDetail, validMonth, validDate, cents, validAllocations } from './finance.js';
import { pauseOnDate, pauseMonthCoverage, validatePauseDates, canManagePause } from './studentPauses.js';
import type { StudentFee, StudentPayment, StudentAdjustment } from '../src/types.js';
import type { StudentPause, PauseReason } from '../src/types.js';
import { commitPauseDeclaration, commitPauseBillingReview } from './pausePersistence.js';
import { attendanceExpectedOn, replacementBookingEnabled } from './attendanceGoLive.js';

export const router = Router();

const pauseReasons = new Set<PauseReason>(['EXAMINATION', 'HOLIDAY_TRAVEL', 'MEDICAL_HEALTH', 'PERSONAL', 'OTHER']);
const pauseLock = (membershipId: string) => getFirestoreDb().collection('_student_pause_locks').doc(membershipId);
const pauseAccess = (user: User, membershipId: string) => {
  const membership = db.memberships.get(membershipId);
  const schedule = membership && db.schedules.get(membership.schedule_id);
  return canManagePause(user, membership, schedule);
};

router.get('/student-pauses', authenticateUser, requireCoachOrAdmin, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const studentId = String(req.query.student_id || '');
  const pauses = [...db.studentPauses.values()].filter(p => (!studentId || p.student_id === studentId) && pauseAccess(user, p.membership_id))
    .map(p => ({ ...p, class_name: db.classes.get(p.class_id)?.name || p.class_id }));
  res.json({ pauses, finance_notifications: user.role === 'COACH' ? [] : pauses.filter(p => p.declared_by_role === 'COACH').map(p => ({ pause_id: p.id, student_id: p.student_id, created_at: p.created_at, action: 'REVIEW_PAUSE_BILLING' })) });
});

router.post('/memberships/:id/pauses', authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res) => {
  const membership = db.memberships.get(req.params.id);
  const user = req.user!;
  if (!membership || !pauseAccess(user, membership.id)) return res.status(403).json({ error: 'Enrollment is not assigned to this coach.' });
  const schedule = db.schedules.get(membership.schedule_id)!;
  const id = String(req.body.idempotency_key || '');
  const start = req.body.start_date;
  const end = req.body.end_date ?? null;
  const reason = req.body.reason as PauseReason;
  const note = String(req.body.note || '').trim();
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(id) || !validatePauseDates(start, end) || start < membership.joined_date || membership.status !== 'ACTIVE' ||
    membership.ended_date && start > membership.ended_date || !pauseReasons.has(reason) || note.length > 500) return res.status(400).json({ error: 'Choose a valid enrollment, pause period, reason, and request key.' });
  const now = new Date().toISOString();
  const attendanceConflicts = [...db.attendance.values()].filter(record => {
    const session = db.sessions.get(record.session_id);
    return record.student_id === membership.student_id && record.status !== 'BOOKED' && session &&
      (session.schedule_id === membership.schedule_id || session.class_id === schedule.class_id) && session.session_date >= start && (!end || session.session_date <= end);
  }).map(record => record.id);
  const pause: StudentPause = { id, student_id: membership.student_id, membership_id: membership.id, schedule_id: schedule.id, class_id: schedule.class_id,
    start_date: start, end_date: end, reason, note, declared_by_user_id: user.id, declared_by_name: user.name, declared_by_role: user.role,
    created_at: now, updated_at: now, attendance_conflict_ids: attendanceConflicts, history: [{ action: 'DECLARED', at: now, user_id: user.id }] };
  const activity = activityEntry(user, 'STUDENT_PAUSE_DECLARED', 'studentPause', id, { classId: schedule.class_id, summary: membership.student_id,
    new_values: { start_date: start, end_date: end, reason, note } });
  try {
    const result = await commitPauseDeclaration(getFirestoreDb(), pause, activity);
    db.studentPauses.set(id, result.pause);
    if (result.created) db.activityLogs.unshift(activity);
    await publishFirestoreRevision(); db.saveToDisk();
    return res.status(result.created ? 201 : 200).json(result.pause);
  } catch (error) { return res.status(String(error).includes('OVERLAPPING_PAUSE') || String(error).includes('IDEMPOTENCY_CONFLICT') ? 409 : 503).json({ error: String(error).includes('OVERLAPPING_PAUSE') ? 'Pause dates overlap an existing pause.' : String(error).includes('IDEMPOTENCY_CONFLICT') ? 'Request key was already used.' : 'Pause could not be saved.' }); }
});

router.post('/student-pauses/:id/resume', authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res) => {
  const pause = db.studentPauses.get(req.params.id);
  if (!pause || !pauseAccess(req.user!, pause.membership_id)) return res.status(403).json({ error: 'Pause is not assigned to this user.' });
  const date = req.body.resume_date;
  if (!validDate(date) || date <= pause.start_date || date > academyToday()) return res.status(400).json({ error: 'Choose a valid resumption date after the pause began.' });
  const end = new Date(`${date}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1);
  const endDate = end.toISOString().slice(0, 10);
  if (pause.end_date && pause.end_date <= endDate) return res.status(409).json({ error: 'Pause has already ended.' });
  const now = new Date().toISOString();
  const updated: StudentPause = { ...pause, end_date: endDate, resumed_at: now, resumed_by_user_id: req.user!.id, updated_at: now,
    history: [...pause.history, { action: 'RESUMED', at: now, user_id: req.user!.id, details: date }] };
  const activity = activityEntry(req.user!, 'STUDENT_PAUSE_RESUMED', 'studentPause', pause.id, { classId: pause.class_id, summary: pause.student_id, new_values: { resume_date: date } });
  try {
    await getFirestoreDb().runTransaction(async tx => {
      const ref = getFirestoreDb().collection('studentPauses').doc(pause.id);
      const lockRef = pauseLock(pause.membership_id);
      const [current, lock] = await Promise.all([tx.get(ref), tx.get(lockRef)]);
      if (!current.exists || (current.data() as StudentPause).updated_at !== pause.updated_at) throw new Error('STALE_PAUSE');
      const intervals = (lock.data()?.intervals || []) as Array<{ id: string; start_date: string; end_date: string | null }>;
      tx.set(ref, updated);
      tx.set(lockRef, { ...lock.data(), intervals: intervals.map(item => item.id === pause.id ? { ...item, end_date: endDate } : item) });
      tx.create(getFirestoreDb().collection('activityLogs').doc(activity.id), removeUndefinedValues(activity) as FirebaseFirestore.DocumentData);
    });
    db.studentPauses.set(pause.id, updated);
    db.activityLogs.unshift(activity);
    await publishFirestoreRevision(); db.saveToDisk(); return res.json(updated);
  } catch { return res.status(409).json({ error: 'Pause changed concurrently or could not be resumed.' }); }
});

router.post('/student-pauses/:id/billing-review', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const pause = db.studentPauses.get(req.params.id);
  const month = req.body.month;
  const amount = req.body.amount_cents;
  const monthEnd = validMonth(month) ? `${month}-${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()}` : '';
  if (!pause || !validMonth(month) || !Number.isSafeInteger(amount) || amount < 0 || pause.start_date > monthEnd || pause.end_date && pause.end_date < `${month}-01` ||
    pauseMonthCoverage(db.studentPauses.values(), pause.membership_id, month) !== 'PARTIAL') return res.status(400).json({ error: 'Choose a partially paused month and a custom fee of RM0 or more.' });
  if ([...db.studentPauses.values()].some(other => other.id !== pause.id && other.membership_id === pause.membership_id && other.billing_reviews?.[month])) return res.status(409).json({ error: 'This enrollment and month already have a review on another pause.' });
  const now = new Date().toISOString();
  const updated: StudentPause = { ...pause, billing_reviews: { ...pause.billing_reviews, [month]: { amount_cents: amount, reviewed_by_user_id: req.user!.id, reviewed_at: now } },
    updated_at: now, history: [...pause.history, { action: 'BILLING_REVIEWED', at: now, user_id: req.user!.id, details: `${month}:${amount}` }] };
  const activity = activityEntry(req.user!, 'STUDENT_PAUSE_BILLING_REVIEWED', 'studentPause', pause.id, { classId: pause.class_id, summary: pause.student_id, new_values: { month, amount_cents: amount } });
  try {
    await commitPauseBillingReview(getFirestoreDb(), pause, updated, activity, month);
    db.studentPauses.set(pause.id, updated);
    db.activityLogs.unshift(activity);
    await publishFirestoreRevision(); db.saveToDisk(); return res.json(updated);
  } catch { return res.status(409).json({ error: 'Pause changed concurrently or review could not be saved.' }); }
});

router.get('/finance/students', authenticateUser, requireAdmin, (_req, res) => {
  const students = [...db.students.values()].filter(s => !s.is_unregistered).map(s => {
    const detail = financeDetail(s.id)!;
    return { student: s, outstanding_cents: detail.outstanding_cents, current_charges_cents: detail.current_charges_cents, pending_finance_review: detail.pending_finance_review, paid_until: detail.paid_until, last_payment: detail.last_payment };
  });
  res.json({ students });
});

router.get('/finance/students/:id', authenticateUser, requireAdmin, (req, res) => {
  const detail = financeDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Student not found.' });
  res.json({ ...detail, memberships: [...db.memberships.values()].filter(m => m.student_id === req.params.id).map(m => {
    const schedule = db.schedules.get(m.schedule_id);
    const cls = db.classes.get(schedule?.class_id || m.schedule_id);
    return { ...m, class_name: cls?.name || 'Class', class_type: cls?.class_type || 'GROUP', coach_name: db.coaches.get(schedule?.coach_id || cls?.default_coach_id || '')?.name || 'Coach' };
  }) });
});

router.post('/finance/students/:id/fees', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const student = db.students.get(req.params.id);
  const membership = db.memberships.get(String(req.body.membership_id));
  const amount = cents(req.body.amount_cents);
  const month = req.body.effective_month;
  if (!student || !membership || membership.student_id !== student.id || !amount || !validMonth(month) || month < membership.joined_date.slice(0, 7)) return res.status(400).json({ error: 'Choose a valid enrollment, fee, and effective month.' });
  const schedule = db.schedules.get(membership.schedule_id);
  const cls = db.classes.get(schedule?.class_id || membership.schedule_id);
  if (!cls) return res.status(400).json({ error: 'Class is unavailable.' });
  if (month < academyMonth() && [...db.studentPayments.values()].some(p => p.student_id === student.id && p.allocations.some(a => a.month >= month))) return res.status(409).json({ error: 'Past billed periods with payments are locked. Use a current-period adjustment.' });
  const fee: StudentFee = { id: crypto.randomUUID(), student_id: student.id, membership_id: membership.id, class_id: cls.id, class_name: cls.name, coach_name: db.coaches.get(schedule?.coach_id || cls.default_coach_id || '')?.name || 'Coach', billing_mode: cls.class_type === 'GROUP' ? 'MONTHLY' : 'PER_SESSION', amount_cents: amount, effective_month: month, created_by_user_id: req.user!.id, created_by_name: req.user!.name, created_at: new Date().toISOString() };
  try { await syncDocToFirestore('studentFees', fee.id, fee, false); db.studentFees.set(fee.id, fee); await publishFirestoreRevision(); db.saveToDisk(); res.status(201).json(fee); }
  catch (error) { res.status(503).json({ error: 'Fee could not be saved.' }); }
});

router.post('/finance/students/:id/payments', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const student = db.students.get(req.params.id);
  const amount = cents(req.body.amount_cents);
  const allocations = req.body.allocations;
  const id = String(req.body.idempotency_key || '');
  if (!student || !amount || !validDate(req.body.payment_date) || !validAllocations(allocations, amount) || !/^[a-zA-Z0-9-]{8,100}$/.test(id)) return res.status(400).json({ error: 'Enter a valid payment and allocate its full amount to distinct months.' });
  const method = String(req.body.method || '').trim();
  if (!method || method.length > 60) return res.status(400).json({ error: 'Payment method is required.' });
  const payment: StudentPayment = { id, student_id: student.id, amount_cents: amount, payment_date: req.body.payment_date, method, source: 'MANUAL', reference: String(req.body.reference || '').slice(0, 100), notes: String(req.body.notes || '').slice(0, 500), allocations, recorded_by_user_id: req.user!.id, recorded_by_name: req.user!.name, created_at: new Date().toISOString() };
  try {
    const ref = getFirestoreDb().collection('studentPayments').doc(id);
    const created = await getFirestoreDb().runTransaction(async tx => {
      const existing = await tx.get(ref);
      if (existing.exists) return existing.data() as StudentPayment;
      tx.create(ref, payment);
      return payment;
    });
    if (created.student_id !== student.id || created.amount_cents !== payment.amount_cents || created.payment_date !== payment.payment_date || JSON.stringify(created.allocations) !== JSON.stringify(payment.allocations)) return res.status(409).json({ error: 'Payment key was already used for a different payment.' });
    db.studentPayments.set(id, created);
    await publishFirestoreRevision();
    db.saveToDisk();
    res.status(created === payment ? 201 : 200).json(created);
  } catch { res.status(503).json({ error: 'Payment could not be saved. Retry with the same form.' }); }
});

router.post('/finance/students/:id/adjustments', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const id = String(req.body.idempotency_key || '');
  if (!db.students.has(req.params.id) || !validMonth(req.body.month) || !['DISCOUNT', 'CREDIT', 'WAIVER', 'CORRECTION'].includes(req.body.type) || !Number.isSafeInteger(req.body.amount_cents) || req.body.amount_cents === 0 || (req.body.amount_cents < 0 && req.body.type !== 'CORRECTION') || String(req.body.reason || '').trim().length < 3 || !/^[a-zA-Z0-9-]{8,100}$/.test(id)) return res.status(400).json({ error: 'Enter a valid period, amount, type, and reason.' });
  const adjustment: StudentAdjustment = { id, student_id: req.params.id, month: req.body.month, amount_cents: req.body.amount_cents, type: req.body.type, reason: String(req.body.reason).trim().slice(0, 500), created_by_user_id: req.user!.id, created_by_name: req.user!.name, created_at: new Date().toISOString() };
  try {
    const ref = getFirestoreDb().collection('studentAdjustments').doc(id);
    const created = await getFirestoreDb().runTransaction(async tx => {
      const existing = await tx.get(ref);
      if (existing.exists) return existing.data() as StudentAdjustment;
      tx.create(ref, adjustment);
      return adjustment;
    });
    if (created.student_id !== adjustment.student_id || created.month !== adjustment.month || created.amount_cents !== adjustment.amount_cents || created.type !== adjustment.type || created.reason !== adjustment.reason) return res.status(409).json({ error: 'Adjustment key was already used for a different record.' });
    db.studentAdjustments.set(id, created);
    await publishFirestoreRevision(); db.saveToDisk(); res.status(created === adjustment ? 201 : 200).json(created);
  }
  catch { res.status(503).json({ error: 'Adjustment could not be saved.' }); }
});

const isAdmin = (user: User) => user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
const canManageClass = (user: User, classId: string) => isAdmin(user) || Boolean(user.coach_id && db.classes.get(classId)?.default_coach_id === user.coach_id);
const canManageSchedule = (user: User, scheduleId: string) => isAdmin(user) || Boolean(user.coach_id && [db.schedules.get(scheduleId)?.coach_id, db.schedules.get(scheduleId)?.default_coach_id].includes(user.coach_id));
export const canManageStudent = (user: User, studentId: string) => isAdmin(user) || Array.from(db.memberships.values()).some((membership) => {
  const schedule = db.schedules.get(membership.schedule_id);
  return membership.student_id === studentId && membership.status === 'ACTIVE' && Boolean(schedule && db.classes.get(schedule.class_id)?.is_active && canManageClass(user, schedule.class_id));
});
// Credential access needs a current recurring assignment. Replacement bookings
// and temporary session coaches never grant it.
export const canManageStudentCredentials = (user: User, studentId: string) => {
  if (!user.is_active) return false;
  if (isAdmin(user)) return true;
  if (user.role !== 'COACH' || !user.coach_id || !db.coaches.get(user.coach_id)?.is_active ||
      db.students.get(studentId)?.status !== 'ACTIVE') return false;
  const today = academyToday();
  return Array.from(db.memberships.values()).some((membership) => {
    if (membership.student_id !== studentId || membership.status !== 'ACTIVE' ||
        membership.joined_date > today || (membership.ended_date && membership.ended_date <= today)) return false;
    const schedule = db.schedules.get(membership.schedule_id);
    const cls = schedule && db.classes.get(schedule.class_id);
    return Boolean(schedule?.is_active && schedule.status === 'ACTIVE' && cls?.is_active &&
      cls.default_coach_id === user.coach_id);
  });
};
// Bingo Space verifies its teacher account and synced link locally, then asks
// Attendance to confirm the coach's current recurring class assignment.
router.post('/integration/portal/credential-scope', async (req, res) => {
  const secret = process.env.PORTAL_CREDENTIAL_SECRET;
  const timestamp = String(req.header('X-Credential-Timestamp') || '');
  const nonce = String(req.header('X-Credential-Nonce') || '');
  const signature = String(req.header('X-Credential-Signature') || '');
  const age = Number(timestamp);
  if (!secret || secret.length < 32 || secret === process.env.ATTENDANCE_BRIDGE_SECRET ||
      !/^\d+$/.test(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - age) > 60 ||
      !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return res.sendStatus(401);
  const path = 'integration/portal/credential-scope';
  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${nonce}.${path}.${body}`).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return res.sendStatus(401);
  const studentCode = req.body?.student_id;
  const email = req.body?.coach_email;
  if (typeof studentCode !== 'string' || !/^STU-[A-Za-z0-9-]{1,60}$/.test(studentCode) ||
      typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.sendStatus(422);
  try { await initializeFirestoreSync(); }
  catch { return res.status(503).json({ allowed: false }); }
  const matching = Array.from(db.users.values()).filter((user) =>
    user.email.trim().toLowerCase() === email.trim().toLowerCase() && user.role === 'COACH' && user.is_active);
  const student = Array.from(db.students.values()).find((entry) => entry.student_id === studentCode);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ allowed: matching.length === 1 && !!student && canManageStudentCredentials(matching[0], student.id) });
});
const refreshCredentialScope = async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try { await initializeFirestoreSync(); next(); }
  catch { res.status(503).json({ error: 'Current class authorization is unavailable.' }); }
};
async function persistMutation(records: Array<[string, string, unknown]>, revisionOnly = false) {
  await Promise.all(records.map(([collection, id, value]) => syncDocToFirestore(collection, id, value, false)));
  await (revisionOnly ? publishFirestoreRevision() : markFirestoreStateChanged());
}

async function occupiedStudentCodes(): Promise<Set<string>> {
  const used = new Set(Array.from(db.students.values(), (student) => normaliseStudentCode(student.student_id)));
  const durableStudents = await getFirestoreDb().collection('students').get();
  durableStudents.forEach((document) => used.add(normaliseStudentCode(document.data().student_id)));
  return used;
}

/**
 * A reservation is the durable uniqueness guard across simultaneous Vercel
 * requests.  Existing students are included above because they predate this
 * guard; newly allocated codes are reserved before their student is saved.
 */
async function reserveStudentCode(requestedCode: unknown, usedCodes: Set<string>): Promise<string> {
  const requested = normaliseStudentCode(requestedCode);
  if (requested && !isFormalStudentCode(requested)) throw new Error('Student ID must use the format STU-0001.');
  const code = requested || nextUnusedStudentCode(usedCodes);
  if (usedCodes.has(code)) throw new Error(`Student ID ${code} is already in use`);

  const reservation = getFirestoreDb().collection('_student_code_reservations').doc(code);
  try {
    await getFirestoreDb().runTransaction(async (transaction) => {
      if ((await transaction.get(reservation)).exists) throw new Error(`Student ID ${code} is already in use`);
      transaction.set(reservation, { student_id: code, created_at: new Date().toISOString() });
    });
  } catch (error) {
    if (requested) throw error;
    usedCodes.add(code);
    return reserveStudentCode('', usedCodes);
  }
  usedCodes.add(code);
  return code;
}

// Auto-persist on successful mutating requests (POST, PUT, DELETE, PATCH)
router.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        db.saveToDisk();
      }
    });
  }
  next();
});

// Private, read-only portal endpoint. It deliberately accepts only the
// immutable STU code and returns no profile, roster, or balance data.
router.get('/integration/portal/progress/:studentCode', (req, res) => {
  const secret = process.env.ATTENDANCE_BRIDGE_SECRET || '';
  const timestamp = String(req.header('X-Attendance-Timestamp') || '');
  const signature = String(req.header('X-Attendance-Signature') || '');
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).digest('hex');
  if (!secret || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || signature.length !== expected.length) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return res.status(401).json({ error: 'Unauthorized' });
  const student = Array.from(db.students.values()).find((item) => item.student_id === req.params.studentCode);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const records = Array.from(db.attendance.values())
    .filter((record) => record.student_id === student.id && record.status !== 'BOOKED')
    .map((record) => {
      const session = db.sessions.get(record.session_id);
      const classItem = session ? db.classes.get(session.class_id) : undefined;
      return session ? {
        event_id: `attendance:${record.id}`,
        date: session.session_date,
        class_name: classItem?.name,
        status: record.status === 'PRESENT' || record.status === 'LATE' ? 'present' : 'absent',
        attendance_type: record.attendance_type,
      } : null;
    }).filter(Boolean).sort((a: any, b: any) => b.date.localeCompare(a.date));
  return res.json({ records, replacement_credits: replacementCreditBalance(student.id) });
});

// ============================================================
// 1. AUTHENTICATION ENDPOINTS
// ============================================================

/**
 * Resolves a username, student ID, coach alias, or email input to the registered Firebase account email.
 * This does NOT verify or handle passwords, keeping credentials secure and handled by Firebase Auth.
 */
router.post('/auth/resolve-account', (req, res) => {
  const { input } = req.body;
  const loginInput = String(input || '').trim();

  if (!loginInput) {
    return res.status(400).json({ error: 'Username or email is required' });
  }

  const user = db.findUserByLogin(loginInput);

  if (!user) {
    return res.status(404).json({
      error: `Account "${loginInput}" not found. Please verify your username or email address.`,
    });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'This user account is inactive' });
  }

  return res.json({
    success: true,
    email: user.email,
    name: user.name,
    role: user.role,
    userId: user.id,
  });
});

/**
 * Synchronizes client-side Firebase Auth sessions with backend database profile.
 * Verifies the Firebase ID Token using Firebase Admin SDK.
 */
router.use('/auth/firebase-session', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  return res.json({
    token: req.headers.authorization!.slice(7).trim(),
    user,
    coach_profile: user.coach_id ? db.coaches.get(user.coach_id) : undefined,
    student_profile: user.student_id ? db.getPopulatedStudent(user.student_id) : undefined,
  });
});

// ============================================================
// SUPER ADMIN PROVISIONING & ACCOUNT MANAGEMENT ENDPOINTS
// ============================================================

/**
 * Checks whether an initial Super Admin account has been provisioned.
 */
router.get('/admin/provision-status', (req, res) => {
  const hasSuperAdmin = Array.from(db.users.values()).some((u) => u.role === 'SUPER_ADMIN');
  return res.json({
    isProvisioned: hasSuperAdmin,
    defaultUsername: null,
  });
});

/**
 * Secure one-time initial provisioning of a Super Admin.
 * Only accessible if no SUPER_ADMIN exists in the database.
 * Directly creates credentials in Firebase Auth and avoids plaintext storage.
 */
router.post('/admin/provision-superadmin', async (req, res) => {
  const existingSuperAdmin = Array.from(db.users.values()).find((u) => u.role === 'SUPER_ADMIN');
  if (existingSuperAdmin) {
    return res.status(403).json({
      error: 'Forbidden: Super Admin has already been provisioned. Log in with your credentials.',
    });
  }

  const {
    password,
    username,
    email,
    displayName,
  } = req.body;

  if (!username || !email || !displayName || !password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Username, email, display name, and a password of at least 6 characters are required.' });
  }

  const cleanUsername = String(username).trim().toLowerCase();
  const cleanEmail = String(email).trim().toLowerCase();

  if (!hasAdminCredentials || !adminAuth) {
    return res.status(503).json({ error: 'Firebase Admin is not configured; Super Admin provisioning is unavailable.', code: 'FIREBASE_ADMIN_UNAVAILABLE' });
  }

  let fbUserUid = '';
  let fbSuccess = false;

  // 1. Attempt Firebase Authentication synchronization
  try {
    if (typeof adminAuth.getUserByEmail === 'function') {
      try {
        const existingFbUser = await adminAuth.getUserByEmail(cleanEmail);
        if (existingFbUser && existingFbUser.uid) {
          fbUserUid = existingFbUser.uid;
          await adminAuth.updateUser(existingFbUser.uid, {
            password,
            displayName: displayName || 'Super Admin',
            disabled: false,
          });
          fbSuccess = true;
        }
      } catch (notFoundErr: any) {
        // If user does not exist in Firebase Auth, create them
        try {
          const newFbUser = await adminAuth.createUser({
            email: cleanEmail,
            password,
            displayName: displayName || 'Super Admin',
          });
          if (newFbUser && newFbUser.uid) {
            fbUserUid = newFbUser.uid;
            fbSuccess = true;
          }
        } catch (createErr: any) {
          console.warn('[Provision] Firebase Admin createUser note:', createErr?.message);
        }
      }

      if (fbSuccess) {
        try {
          await adminAuth.setCustomUserClaims(fbUserUid, { role: 'SUPER_ADMIN' });
        } catch (claimErr: any) {
          console.warn('[Provision] Custom claims note:', claimErr?.message);
        }
      }
    }
  } catch (authErr: any) {
    console.error('[Provision] Firebase Admin Auth sync failed:', authErr?.message);
    return res.status(502).json({ error: 'Firebase Authentication could not create the Super Admin account.', code: 'FIREBASE_AUTH_WRITE_FAILED' });
  }

  if (!fbSuccess || !fbUserUid) {
    return res.status(502).json({ error: 'Firebase Authentication could not create the Super Admin account.', code: 'FIREBASE_AUTH_WRITE_FAILED' });
  }

  // 2. Save user to database and sync to Firestore
  try {
    const superAdminUser: User = {
      id: fbUserUid,
      username: cleanUsername,
      email: cleanEmail,
      name: displayName || 'Super Admin',
      role: 'SUPER_ADMIN',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    db.users.set(superAdminUser.id, superAdminUser);
    try {
      db.saveToDisk();
    } catch (diskErr) {
      console.warn('[Provision] Save to disk note:', diskErr);
    }

    await syncDocToFirestore('users', superAdminUser.id, superAdminUser);

    return res.json({
      success: true,
      message: 'Super Admin account provisioned successfully. You may now log in.',
      user: {
        id: superAdminUser.id,
        username: superAdminUser.username,
        email: superAdminUser.email,
        name: superAdminUser.name,
        role: superAdminUser.role,
      },
    });
  } catch (err: any) {
    console.error('[Provision] Error saving Super Admin:', err);
    return res.status(500).json({ error: err.message || 'Failed to provision Super Admin account.' });
  }
});

/**
 * List all registered user accounts with linked profile information.
 * Accessible to Administrators and Super Administrators.
 */
router.get('/admin/users', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const usersList = Array.from(db.users.values()).map((user) => {
    const coach = user.coach_id ? db.coaches.get(user.coach_id) : undefined;
    const student = user.student_id ? db.getPopulatedStudent(user.student_id) : undefined;
    return {
      ...user,
      coach_profile: coach,
      student_profile: student,
    };
  });

  return res.json({ users: usersList });
});

/**
 * Create a new user account (Coach, Staff, Student, or Admin).
 * Uses Firebase Admin SDK to register credentials without storing plaintext passwords.
 * Accessible to Administrators and Super Administrators.
 */
router.post('/admin/users', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, email, displayName, role, password, coach_id, student_id } = req.body;

    if (!email || !password || !role || !displayName) {
      return res.status(400).json({ error: 'Display Name, Email, Role, and Password are required.' });
    }

    // Validate role is strictly one of the 3 allowed roles
    if (role !== 'COACH' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'Invalid role. Valid roles are SUPER_ADMIN, ADMIN, and COACH.' });
    }

    // Privilege Guard: ADMIN can ONLY create COACH accounts
    if (req.user?.role === 'ADMIN' && role !== 'COACH') {
      return res.status(403).json({ error: 'Forbidden: Administrators can only create Coach accounts.' });
    }

    // Privilege Guard: Only Super Admins can create Admin or Super Admin accounts
    if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Only Super Administrators can create Administrator or Super Administrator accounts.' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanUsername = username ? String(username).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '') : cleanEmail.split('@')[0];

    // Check if user already exists
    const existingUser = Array.from(db.users.values()).find((u) => u.email.toLowerCase() === cleanEmail);

    let finalUid = existingUser ? existingUser.id : `user-${Date.now()}`;

    // Firebase Auth creation is authoritative. Never report a local-only
    // account as created when the Admin SDK operation failed.
    if (!hasAdminCredentials || !adminAuth) {
      return res.status(503).json({ error: 'Firebase Admin is not configured.', code: 'FIREBASE_ADMIN_UNAVAILABLE' });
    }
    let fbUser;
    try {
      try {
        fbUser = await adminAuth.getUserByEmail(cleanEmail);
        finalUid = fbUser.uid;
        await adminAuth.updateUser(fbUser.uid, { password, displayName, disabled: false });
      } catch (lookupError: any) {
        if (lookupError?.code !== 'auth/user-not-found') throw lookupError;
        fbUser = await adminAuth.createUser({ email: cleanEmail, password, displayName });
        finalUid = fbUser.uid;
      }
      await adminAuth.setCustomUserClaims(finalUid, { role });
    } catch (fbErr: any) {
      console.error('[Admin Create User] Firebase Auth operation failed:', fbErr?.code || fbErr?.message);
      return res.status(502).json({ error: 'Firebase Authentication could not create this account. No Academy profile was saved.', code: 'FIREBASE_AUTH_WRITE_FAILED' });
    }

    // 2. Create or update database record
    const newUser: User = {
      id: finalUid,
      username: cleanUsername,
      email: cleanEmail,
      name: displayName,
      role,
      coach_id: coach_id || existingUser?.coach_id || undefined,
      student_id: student_id || existingUser?.student_id || undefined,
      is_active: true,
      created_at: existingUser ? existingUser.created_at : new Date().toISOString(),
    };

    // Keep the in-memory state ahead of the durable write. syncDocToFirestore()
    // publishes a full state snapshot, so adding this only afterwards lets a
    // second serverless request restore a snapshot that cannot see the account
    // which Firebase Auth has just created.
    const previousUser = existingUser ? { ...existingUser } : undefined;
    if (existingUser && existingUser.id !== newUser.id) db.users.delete(existingUser.id);
    db.users.set(newUser.id, newUser);
    try {
      await syncDocToFirestore('users', newUser.id, newUser);
      db.saveToDisk();
    } catch (persistErr) {
      db.users.delete(newUser.id);
      if (previousUser) db.users.set(previousUser.id, previousUser);
      throw persistErr;
    }

    return res.status(201).json({
      success: true,
      message: `Account for ${displayName} (${role}) configured successfully.`,
      user: newUser,
    });
  } catch (err: any) {
    console.error('[Admin Create User] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create user account.' });
  }
});

/**
 * Update an existing user account (role, status, username, linked profile, or password).
 * Accessible to Administrators and Super Administrators.
 */
router.patch('/admin/users/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = db.users.get(id);

  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  const { name, role, username, email, is_active, coach_id, student_id, password } = req.body;

  // Role hierarchy guard:
  // Administrators can only modify Coach accounts and cannot promote anyone to Admin or Super Admin
  if (req.user?.role === 'ADMIN') {
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Administrators cannot modify Administrator or Super Administrator accounts.' });
    }
    if (role && role !== 'COACH') {
      return res.status(403).json({ error: 'Forbidden: Administrators cannot assign Administrator or Super Administrator privileges.' });
    }
  }

  // Only Super Admins can modify Super Admin accounts or promote users to Super Admin
  if ((user.role === 'SUPER_ADMIN' || role === 'SUPER_ADMIN') && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only Super Administrators can modify Super Admin accounts or grant Super Admin privileges.' });
  }

  try {
    // Update Firebase Auth if credentials available
    if (hasAdminCredentials && adminAuth) {
      try {
        const fbUpdates: any = {};
        if (typeof is_active === 'boolean') {
          fbUpdates.disabled = !is_active;
        }
        if (name) {
          fbUpdates.displayName = name;
        }
        if (password && typeof password === 'string' && password.length >= 6) {
          fbUpdates.password = password;
        }

        if (Object.keys(fbUpdates).length > 0) {
          await adminAuth.updateUser(user.id, fbUpdates);
        }

        if (role && role !== user.role) {
          await adminAuth.setCustomUserClaims(user.id, { role });
        }
      } catch (fbErr) {
        console.warn('[Admin Patch User] Firebase Auth update note:', fbErr);
      }
    }

    // Update database record
    if (name !== undefined) user.name = name;
    if (role !== undefined) user.role = role;
    if (username !== undefined) user.username = String(username).trim().toLowerCase();
    if (email !== undefined) user.email = String(email).trim().toLowerCase();
    if (is_active !== undefined) user.is_active = is_active;
    if (coach_id !== undefined) user.coach_id = coach_id || undefined;
    if (student_id !== undefined) user.student_id = student_id || undefined;

    db.users.set(user.id, user);
    db.saveToDisk();
    syncDocToFirestore('users', user.id, user).catch(console.error);

    return res.json({
      success: true,
      message: 'User account updated successfully.',
      user,
    });
  } catch (err: any) {
    console.error('[Admin Patch User] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update user.' });
  }
});

/**
 * Reset a user's password directly in Firebase Auth.
 * Accessible to Administrators and Super Administrators.
 */
router.post('/admin/users/:id/reset-password', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = db.users.get(id);

  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  // Guard: Administrators cannot reset password for Admin or Super Admin accounts
  if (req.user?.role === 'ADMIN' && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
    return res.status(403).json({ error: 'Forbidden: Administrators cannot reset passwords for Administrator or Super Administrator accounts.' });
  }

  // Guard: Only Super Admins can reset Super Admin passwords
  if (user.role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only Super Administrators can reset Super Admin passwords.' });
  }

  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  if (!hasAdminCredentials || !adminAuth) {
    return res.status(503).json({ error: 'Password reset is temporarily unavailable.' });
  }

  try {
    await adminAuth.updateUser(user.id, { password: newPassword });
    return res.json({
      success: true,
      message: `Password for ${user.name} (${user.email}) has been reset successfully.`,
    });
  } catch (err: any) {
    console.error('[Admin Reset Password] Firebase Auth failed:', err?.code || 'unknown');
    return res.status(502).json({ error: 'Could not confirm the password reset in Firebase Authentication. Please verify the account before retrying.' });
  }
});

/**
 * Delete or remove a user account.
 * Accessible to Administrators and Super Administrators.
 */
router.delete('/admin/users/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const currentReqUser = req.user!;

  if (currentReqUser.id === id) {
    return res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
  }

  const user = db.users.get(id);
  if (!user) {
    return res.status(404).json({ error: 'User account not found.' });
  }

  // Guard: Administrators cannot delete Admin or Super Admin accounts
  if (req.user?.role === 'ADMIN' && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
    return res.status(403).json({ error: 'Forbidden: Administrators cannot delete Administrator or Super Administrator accounts.' });
  }

  // Guard: Only Super Admin can delete Super Admin account
  if (user.role === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only Super Administrators can delete Super Admin accounts.' });
  }

  try {
    if (hasAdminCredentials && adminAuth) {
      try {
        await adminAuth.deleteUser(user.id);
      } catch (fbErr) {
        console.warn('[Admin Delete User] Firebase Auth delete note:', fbErr);
      }
    }

    db.users.delete(user.id);
    db.saveToDisk();
    deleteDocFromFirestore('users', user.id).catch(console.error);

    return res.json({
      success: true,
      message: `User ${user.name} (${user.email}) removed successfully.`,
    });
  } catch (err: any) {
    console.error('[Admin Delete User] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to delete user.' });
  }
});

router.post('/auth/login', (_req, res) => {
  return res.status(410).json({
    error: 'Password login is handled by Firebase Authentication. Please update the client configuration if this endpoint is being called.',
    code: 'FIREBASE_AUTH_REQUIRED',
  });
});

router.get('/auth/me', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const coachProfile = user.coach_id ? db.coaches.get(user.coach_id) : undefined;
  const studentProfile = user.student_id ? db.getPopulatedStudent(user.student_id) : undefined;

  return res.json({
    user,
    coach_profile: coachProfile,
    student_profile: studentProfile,
  });
});

router.get('/student/me/profile', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const studentId = user.student_id || Array.from(db.students.values())[0]?.id;
  if (!studentId) {
    return res.status(404).json({ error: 'Student record not found' });
  }
  const populated = db.getPopulatedStudent(studentId);
  return res.json(populated);
});

router.post('/auth/logout', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ message: 'Logged out successfully' });
});

// ============================================================
// 2. COACHES MANAGEMENT
// ============================================================

router.get('/coaches', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const coachesList = Array.from(db.coaches.values()).map((coach) => {
    // Calculate active schedule count
    const activeScheduleCount = Array.from(db.schedules.values()).filter(
      (s) => s.coach_id === coach.id && s.status === 'ACTIVE'
    ).length;

    return {
      ...coach,
      active_schedules_count: activeScheduleCount,
    };
  });

  return res.json(coachesList);
});

router.post('/coaches', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { name, email, phone, color, color_name, bio } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Coach name and email are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const existingCoach = Array.from(db.coaches.values()).find(
    (candidate) => candidate.email.toLowerCase() === cleanEmail
  );
  if (existingCoach) {
    return res.status(409).json({
      error: 'A coach profile already exists for this email address.',
      code: 'COACH_PROFILE_EXISTS',
      coachId: existingCoach.id,
    });
  }
  const coachId = `coach-${Date.now()}`;
  const newCoach: Coach = {
    id: coachId,
    name: String(name).trim(),
    email: cleanEmail,
    phone: phone ? String(phone).trim() : '',
    color: color || '#3b82f6',
    color_name: color_name || 'Pastel Blue',
    is_active: true,
    bio: bio ? String(bio).trim() : '',
    created_at: new Date().toISOString(),
  };

  try {
    // Link the Firebase-authenticated account created by /admin/users.
    const existingUser = Array.from(db.users.values()).find((u) => u.email.toLowerCase() === cleanEmail);
    if (!existingUser) {
      return res.status(400).json({ error: 'Create the Firebase account before creating the coach profile.' });
    }
    const previousUser = { ...existingUser };
    existingUser.coach_id = coachId;
    existingUser.role = 'COACH';
    // Both documents must already be present in the in-memory state before
    // either write publishes its snapshot. Otherwise a subsequent request can
    // reload a coachless user/profile pair from a partial snapshot.
    db.users.set(existingUser.id, existingUser);
    db.coaches.set(coachId, newCoach);
    try {
      await Promise.all([
        syncDocToFirestore('users', existingUser.id, existingUser),
        syncDocToFirestore('coaches', coachId, newCoach),
      ]);
      db.saveToDisk();
    } catch (persistErr) {
      db.users.set(previousUser.id, previousUser);
      db.coaches.delete(coachId);
      throw persistErr;
    }
    return res.status(201).json(newCoach);
  } catch (error: any) {
    console.error('[Create Coach] Firestore write failed:', error?.message || error);
    return res.status(503).json({ error: 'Coach could not be saved to Firestore. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

router.put('/coaches/:id', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const coach = db.coaches.get(id);

  if (!coach) {
    return res.status(404).json({ error: 'Coach not found' });
  }

  const { name, email, phone, color, color_name, bio, is_active } = req.body;

  if (name !== undefined) coach.name = String(name).trim();
  if (email !== undefined) coach.email = String(email).trim();
  if (phone !== undefined) coach.phone = String(phone).trim();
  if (color !== undefined) coach.color = color;
  if (color_name !== undefined) coach.color_name = color_name;
  if (bio !== undefined) coach.bio = String(bio).trim();
  if (is_active !== undefined) coach.is_active = Boolean(is_active);

  db.coaches.set(id, coach);

  // Update associated user account if exists
  const associatedUser = Array.from(db.users.values()).find((u) => u.coach_id === id);
  if (associatedUser) {
    if (name !== undefined) associatedUser.name = coach.name;
    if (email !== undefined) associatedUser.email = coach.email;
    if (is_active !== undefined) associatedUser.is_active = coach.is_active;
    db.users.set(associatedUser.id, associatedUser);
  }

  return res.json(coach);
});

router.delete('/coaches/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const coach = db.coaches.get(id);

  if (!coach) {
    return res.status(404).json({ error: 'Coach not found' });
  }

  try {
    const user = Array.from(db.users.values()).find((u) => u.coach_id === id);
    if (user && adminAuth) await adminAuth.deleteUser(user.id);
    await Promise.all([
      deleteDocFromFirestore('coaches', id),
      ...(user ? [deleteDocFromFirestore('users', user.id)] : []),
    ]);
    db.coaches.delete(id);
    if (user) db.users.delete(user.id);
    db.saveToDisk();
    return res.json({ success: true, message: `Coach ${coach.name} deleted successfully` });
  } catch (error: any) {
    console.error('[Delete Coach] Firestore/Auth delete failed:', error?.message || error);
    return res.status(503).json({ error: 'Coach could not be deleted completely. Please retry.', code: 'DELETE_FAILED' });
  }
});

// ============================================================
// 3. STUDENTS & PARENTS MANAGEMENT
// ============================================================

router.get('/students', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const { search, coach_id, class_id, status } = req.query;

  let list = Array.from(db.students.values()).map((s) => db.getPopulatedStudent(s.id)!);
  const user = req.user!;
  if (user.role === 'COACH') list = list.filter((student) => canManageStudent(user, student.id));

  if (status) {
    list = list.filter((s) => s.status === status);
  }

  if (coach_id) {
    list = list.filter((s) =>
      s.enrolled_schedules?.some((sch) => {
        const fullSched = db.schedules.get(sch.schedule_id);
        return fullSched?.coach_id === coach_id;
      })
    );
  }

  if (class_id) {
    list = list.filter((s) =>
      s.enrolled_schedules?.some((sch) => {
        const fullSched = db.schedules.get(sch.schedule_id);
        return fullSched?.class_id === class_id;
      })
    );
  }

  if (search) {
    const q = String(search).trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.student_id.toLowerCase().includes(q) ||
        (s.nick_name && s.nick_name.toLowerCase().includes(q)) ||
        (s.school && s.school.toLowerCase().includes(q)) ||
        (s.parent && s.parent.name.toLowerCase().includes(q))
    );
  }

  if (user.role === 'COACH') {
    const portalStatuses = await portalAccountStatuses(list.map((student) => student.student_id));
    const normalClassDays = new Map<string, Set<number>>();
    for (const membership of db.memberships.values()) {
      if (membership.status !== 'ACTIVE') continue;
      const schedule = db.schedules.get(membership.schedule_id);
      const cls = db.classes.get(schedule?.class_id || membership.schedule_id);
      if (!cls?.is_active || !canManageClass(user, cls.id)) continue;
      const day = cls.day_of_week ?? schedule?.day_of_week;
      if (day === undefined) continue;
      if (!normalClassDays.has(membership.student_id)) normalClassDays.set(membership.student_id, new Set());
      normalClassDays.get(membership.student_id)!.add(day);
    }
    const scoped = list.map((student) => ({
      id: student.id, full_name: student.full_name, student_id: student.student_id,
      replacement_credits: replacementCreditBalance(student.id), portal_account_status: portalStatuses[student.student_id] || 'UNKNOWN',
      normal_class_days: Array.from(normalClassDays.get(student.id) || []).sort((a, b) => (a + 6) % 7 - (b + 6) % 7),
    }));
    return res.json(scoped);
  }
  return res.json(list);
});

// This deliberately narrow academy-wide directory is only available while a
// coach is adding a replacement attendee; normal coach student browsing stays
// scoped by the route above.
router.get('/sessions/:id/replacement-candidates', authenticateUser, requireCoachOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const session = db.sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (!verifySessionAttendanceAccess(session.id, req.user!)) return res.status(403).json({ error: 'Forbidden' });
  const q = String(req.query.search || '').trim().toLowerCase();
  const candidates = Array.from(db.students.values()).filter((student) => student.status === 'ACTIVE' && !student.is_unregistered &&
    Array.from(db.memberships.values()).some((membership) => membership.student_id === student.id && membership.status === 'ACTIVE' &&
      Boolean(db.schedules.get(membership.schedule_id)) && db.schedules.get(membership.schedule_id)!.class_id !== session.class_id) &&
    !db.getPopulatedSession(session.id)?.enrolled_students?.some((item) => item.id === student.id) &&
    (!q || student.full_name.toLowerCase().includes(q) || student.student_id.toLowerCase().includes(q))).map((student) => ({
    id: student.id, full_name: student.full_name, student_id: student.student_id,
    replacement_credits: replacementCreditBalance(student.id),
  }));
  return res.json(candidates);
});

router.get('/sessions/:id/replacement-candidates/:studentId/future-sessions', authenticateUser, requireCoachOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const replacementSession = db.sessions.get(req.params.id);
  const student = db.students.get(req.params.studentId);
  if (!replacementSession || !student || student.status !== 'ACTIVE') return res.status(404).json({ error: 'Replacement session or active student not found' });
  if (!verifySessionAttendanceAccess(replacementSession.id, req.user!)) return res.status(403).json({ error: 'Forbidden' });
  const today = academyToday();
  const unresolved = new Set(Array.from(db.replacementAdvanceCommitments.values()).filter((c) => c.status === 'PENDING' || c.status === 'REVIEW_REQUIRED').map((c) => c.future_session_id));
  const sessions = Array.from(db.sessions.values()).filter((session) => {
    const cls = db.classes.get(session.class_id);
    const membership = Array.from(db.memberships.values()).some((m) => m.student_id === student.id && m.status === 'ACTIVE' && (m.schedule_id === session.schedule_id || m.schedule_id === session.class_id));
    return session.session_date > today && session.status === 'SCHEDULED' && cls?.class_type === 'GROUP' && membership && !unresolved.has(session.id);
  }).sort((a, b) => a.session_date.localeCompare(b.session_date)).map((session) => ({
    id: session.id, date: session.session_date, day: new Date(`${session.session_date}T00:00:00`).toLocaleDateString('en-MY', { weekday: 'short' }),
    class_name: db.classes.get(session.class_id)?.name || 'Group class', coach_name: db.coaches.get(session.actual_coach_id || session.scheduled_coach_id)?.name,
  }));
  return res.json(sessions);
});

router.get('/students/:id', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.getPopulatedStudent(id);

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  if (!canManageStudent(req.user!, id)) return res.status(403).json({ error: 'Forbidden' });

  // Get past attendance history for this student
  const studentAttendanceRecords = Array.from(db.attendance.values())
    .filter((a) => a.student_id === id)
    .map((a) => {
      const sess = db.sessions.get(a.session_id);
      const cls = sess ? db.classes.get(sess.class_id) : undefined;
      const coach = sess ? db.coaches.get(sess.actual_coach_id) : undefined;
      return {
        ...a,
        session_date: sess?.session_date,
        start_time: sess?.start_time,
        class_name: cls?.name,
        coach_name: coach?.name,
        coach_color: coach?.color,
      };
    })
    .sort((a, b) => (b.session_date || '').localeCompare(a.session_date || ''));

  return res.json({
    ...student,
    attendance_history: studentAttendanceRecords,
  });
});

router.post('/students', authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {
    student_id,
    full_name,
    nick_name,
    school,
    parent_name,
    parent_phone,
    parent_email,
    parent_telegram,
    parent_relation,
    schedule_ids,
  } = req.body;

  if (!full_name) {
    return res.status(400).json({ error: 'Student full name is required' });
  }
  const user = req.user!;
  if (schedule_ids !== undefined && (!Array.isArray(schedule_ids) || schedule_ids.some((scheduleId) =>
    typeof scheduleId !== 'string' || !db.schedules.has(scheduleId) || !db.schedules.get(scheduleId)?.is_active || !canManageClass(user, db.schedules.get(scheduleId)!.class_id)))) {
    return res.status(400).json({ error: 'Choose only active classes you may manage.' });
  }
  if (user.role === 'COACH' && (!user.coach_id || !Array.isArray(schedule_ids) || !schedule_ids.length)) {
    return res.status(403).json({ error: 'Coaches may only add students to their own active classes.' });
  }

  let finalStudentId: string;
  try {
    finalStudentId = await reserveStudentCode(student_id, await occupiedStudentCodes());
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Could not reserve a unique student ID.' });
  }

  // Create or link parent
  let parentId: string | undefined;
  if (parent_name || parent_phone) {
    parentId = `parent-${Date.now()}`;
    db.parents.set(parentId, {
      id: parentId,
      name: String(parent_name || 'Guardian').trim(),
      phone: String(parent_phone || '').trim(),
      email: parent_email ? String(parent_email).trim() : undefined,
      telegram_username: parent_telegram ? String(parent_telegram).trim() : undefined,
      telegram_chat_id: parent_telegram ? `tg-${Date.now()}` : undefined,
      created_at: new Date().toISOString(),
    });
  }

  const stuId = `stu-${crypto.randomUUID()}`;
  const newStudent: Student = {
    id: stuId,
    student_id: finalStudentId,
    full_name: String(full_name).trim(),
    nick_name: nick_name ? String(nick_name).trim() : undefined,
    school: school ? String(school).trim() : undefined,
    parent_id: parentId,
    parent_relation: parent_relation ? String(parent_relation).trim() : 'Parent',
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  };

  const recordsToPersist: Array<[string, string, unknown]> = [];
  if (parentId) recordsToPersist.push(['parents', parentId, db.parents.get(parentId)!]);
  recordsToPersist.push(['students', stuId, newStudent]);
  db.students.set(stuId, newStudent);

  // Enroll in schedules if provided
  if (Array.isArray(schedule_ids) && schedule_ids.length > 0) {
    [...new Set<string>(schedule_ids)].forEach((schedId) => {
      if (db.schedules.has(schedId)) {
        const memId = `m-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const membership = {
          id: memId,
          student_id: stuId,
          schedule_id: schedId,
        joined_date: academyToday(),
          status: 'ACTIVE' as const,
        };
        db.memberships.set(memId, membership);
        recordsToPersist.push(['memberships', memId, membership]);
      }
    });
  }

  try {
    await recordActivity(user, 'STUDENT_CREATED', 'student', stuId, { summary: finalStudentId });
    const firestore = getFirestoreDb();
    const batch = firestore.batch();
    for (const [collection, recordId, value] of recordsToPersist) batch.set(firestore.collection(collection).doc(recordId), removeUndefinedValues(value));
    batch.set(firestore.collection('_system').doc('academy'), { revision: `${new Date().toISOString()}:${crypto.randomUUID()}` }, { merge: true });
    await batch.commit();
    await syncPortalCoachLinksForStudent(stuId).catch(console.error);
    db.saveToDisk();
    return res.status(201).json(db.getPopulatedStudent(stuId));
  } catch (error: any) {
    if (parentId) db.parents.delete(parentId);
    db.students.delete(stuId);
    recordsToPersist
      .filter(([collection]) => collection === 'memberships')
      .forEach(([, membershipId]) => db.memberships.delete(membershipId));
    console.error('[Create Student] Firestore write failed:', error?.message || error);
    return res.status(503).json({ error: 'Student could not be saved to Firestore. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

router.post('/students/bulk', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'Array of students is required.' });
  }

  const created: any[] = [];
  const errors: { row: number; full_name?: string; feedback: string }[] = [];
  // Keep the response open until every record reaches Firestore. Vercel ends
  // background work when the handler returns, so the old in-memory-only loop
  // could report a successful import while persisting nothing at all.
  const recordsToPersist: Array<[string, string, unknown]> = [];
  const localRecordsToRollback: Array<[Map<string, any>, string]> = [];
  let usedStudentCodes: Set<string>;
  try {
    usedStudentCodes = await occupiedStudentCodes();
  } catch (error: any) {
    return res.status(503).json({ error: error.message || 'Student IDs could not be verified. Please retry.', code: 'FIRESTORE_READ_FAILED' });
  }

  for (const [idx, item] of students.entries()) {
    const rowNum = idx + 1;
    const {
      full_name,
      nick_name,
      school,
      parent_name,
      parent_phone,
      parent_email,
      parent_relation,
      schedule_ids,
      status,
      student_id,
    } = item;

    if (!full_name || !String(full_name).trim()) {
      errors.push({ row: rowNum, full_name, feedback: 'Student full name is required.' });
      continue;
    }

    const cleanFullName = String(full_name).trim();

    // Verify schedule_ids if provided
    const validScheduleIds: string[] = [];
    const invalidScheduleIds: string[] = [];
    if (Array.isArray(schedule_ids) && schedule_ids.length > 0) {
      schedule_ids.forEach((sid: string) => {
        const cleanSid = String(sid).trim();
        if (db.schedules.has(cleanSid) || db.classes.has(cleanSid)) {
          validScheduleIds.push(cleanSid);
        } else {
          invalidScheduleIds.push(cleanSid);
        }
      });
    }

    if (invalidScheduleIds.length > 0) {
      errors.push({
        row: rowNum,
        full_name: cleanFullName,
        feedback: `Schedule ID(s) not found: ${invalidScheduleIds.join(', ')}.`,
      });
      continue;
    }

    let finalStudentId: string;
    try {
      finalStudentId = await reserveStudentCode(student_id, usedStudentCodes);
    } catch (error: any) {
      errors.push({ row: rowNum, full_name: cleanFullName, feedback: error.message || 'Could not reserve a unique student ID.' });
      continue;
    }

    // Create or link parent
    let parentId: string | undefined;
    if (parent_name || parent_phone || parent_email) {
      parentId = `parent-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      db.parents.set(parentId, {
        id: parentId,
        name: String(parent_name || 'Guardian').trim(),
        phone: String(parent_phone || '').trim(),
        email: parent_email ? String(parent_email).trim() : undefined,
        created_at: new Date().toISOString(),
      });
      recordsToPersist.push(['parents', parentId, db.parents.get(parentId)!]);
      localRecordsToRollback.push([db.parents, parentId]);
    }

    const stuId = `stu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newStudent: Student = {
      id: stuId,
      student_id: finalStudentId,
      full_name: cleanFullName,
      nick_name: nick_name ? String(nick_name).trim() : undefined,
      school: school ? String(school).trim() : undefined,
      parent_id: parentId,
      parent_relation: parent_relation ? String(parent_relation).trim() : 'Parent',
      status: status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    db.students.set(stuId, newStudent);
    recordsToPersist.push(['students', stuId, newStudent]);
    localRecordsToRollback.push([db.students, stuId]);

    // Enroll in schedules
    validScheduleIds.forEach((schedId) => {
      const memId = `m-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const membership = {
        id: memId,
        student_id: stuId,
        schedule_id: schedId,
        joined_date: academyToday(),
        status: 'ACTIVE' as const,
      };
      db.memberships.set(memId, membership);
      recordsToPersist.push(['memberships', memId, membership]);
      localRecordsToRollback.push([db.memberships, memId]);
    });

    const populated = db.getPopulatedStudent(stuId);
    created.push(populated);
  }

  try {
    // Avoid writing the revision once per row; it is the signal that makes all
    // Vercel instances reload the durable records on their next API request.
    await Promise.all(
      recordsToPersist.map(([collection, id, record]) => syncDocToFirestore(collection, id, record, false))
    );
    await markFirestoreStateChanged();
    await Promise.all(created.map((student) => syncPortalCoachLinksForStudent(student.id).catch(console.error)));
    db.saveToDisk();
  } catch (error: any) {
    localRecordsToRollback.forEach(([collection, id]) => collection.delete(id));
    console.error('[Bulk Student Import] Firestore write failed:', error?.message || error);
    return res.status(503).json({
      error: 'Students could not be saved to Firestore. No successful import has been reported; please retry after the issue is resolved.',
      code: 'FIRESTORE_WRITE_FAILED',
    });
  }

  return res.status(200).json({
    success: true,
    message: `Imported ${created.length} students successfully.${errors.length > 0 ? ` ${errors.length} rows had errors.` : ''}`,
    importedCount: created.length,
    errorCount: errors.length,
    created,
    errors,
  });
});

router.put('/students/:id', authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.students.get(id);
  const user = req.user!;

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  if (!canManageStudent(user, id)) return res.status(403).json({ error: 'Forbidden' });
  if (user.role === 'COACH' && ['student_id', 'status'].some((field) => req.body[field] !== undefined)) return res.status(403).json({ error: 'Coaches cannot change student IDs or status.' });

  const {
    student_id,
    full_name,
    nick_name,
    school,
    parent_name,
    parent_phone,
    parent_email,
    parent_telegram,
    parent_relation,
    status,
    schedule_ids,
  } = req.body;

  if (schedule_ids !== undefined && (!Array.isArray(schedule_ids) || schedule_ids.some((scheduleId) =>
    typeof scheduleId !== 'string' || !db.schedules.has(scheduleId) || !db.schedules.get(scheduleId)?.is_active || !canManageClass(user, db.schedules.get(scheduleId)!.class_id)))) {
    return res.status(400).json({ error: 'Choose only active classes you may manage.' });
  }

  const updatedStudent = { ...student };
  if (student_id !== undefined) updatedStudent.student_id = String(student_id).trim().toUpperCase();
  if (full_name !== undefined) updatedStudent.full_name = String(full_name).trim();
  if (nick_name !== undefined) updatedStudent.nick_name = String(nick_name).trim();
  if (school !== undefined) updatedStudent.school = String(school).trim();
  if (parent_relation !== undefined) updatedStudent.parent_relation = String(parent_relation).trim();
  if (status !== undefined) updatedStudent.status = status;

  // Update parent info
  let updatedParent: Parent | undefined;
  if (updatedStudent.parent_id && db.parents.has(updatedStudent.parent_id)) {
    const parent = { ...db.parents.get(updatedStudent.parent_id)! };
    if (parent_name !== undefined) parent.name = String(parent_name).trim();
    if (parent_phone !== undefined) parent.phone = String(parent_phone).trim();
    if (parent_email !== undefined) parent.email = String(parent_email).trim();
    if (parent_telegram !== undefined) parent.telegram_username = String(parent_telegram).trim();
    updatedParent = parent;
  } else if (parent_name || parent_phone) {
    const newParentId = `parent-${Date.now()}`;
    updatedParent = {
      id: newParentId,
      name: String(parent_name || 'Guardian').trim(),
      phone: String(parent_phone || '').trim(),
      email: parent_email ? String(parent_email).trim() : undefined,
      telegram_username: parent_telegram ? String(parent_telegram).trim() : undefined,
      created_at: new Date().toISOString(),
    };
    updatedStudent.parent_id = newParentId;
  }

  // End removed memberships without deleting their history. Coaches only replace
  // the subset they manage; memberships with other coaches remain untouched.
  const membershipChanges = { add: [] as ReturnType<typeof planStudentMemberships>['add'], end: [] as ReturnType<typeof planStudentMemberships>['end'] };
  if (Array.isArray(schedule_ids)) {
    const manageable = new Set(Array.from(db.schedules.values()).filter((schedule) =>
      schedule.is_active && canManageClass(user, schedule.class_id)).map((schedule) => schedule.id));
    Object.assign(membershipChanges, planStudentMemberships(id, schedule_ids, Array.from(db.memberships.values()), manageable, academyToday()));
  }
  try {
    const writes: Array<[string, string, unknown]> = [['students', id, updatedStudent]];
    if (updatedParent) writes.push(['parents', updatedParent.id, updatedParent]);
    const firestore = getFirestoreDb();
    const batch = firestore.batch();
    for (const [collection, recordId, value] of writes) batch.set(firestore.collection(collection).doc(recordId), removeUndefinedValues(value));
    for (const membership of [...membershipChanges.add, ...membershipChanges.end]) {
      batch.set(firestore.collection('memberships').doc(membership.id), membership);
    }
    batch.set(firestore.collection('_system').doc('academy'), { revision: `${new Date().toISOString()}:${crypto.randomUUID()}` }, { merge: true });
    await batch.commit();
    db.students.set(id, updatedStudent);
    if (updatedParent) db.parents.set(updatedParent.id, updatedParent);
    for (const membership of [...membershipChanges.add, ...membershipChanges.end]) db.memberships.set(membership.id, membership);
    return res.json(db.getPopulatedStudent(id));
  } catch { return res.status(503).json({ error: 'Student update could not be saved.' }); }
});

router.delete('/students/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.students.get(id);

  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }
  if ([...db.studentFees.values()].some(f => f.student_id === id) || [...db.studentPayments.values()].some(p => p.student_id === id) || [...db.studentAdjustments.values()].some(a => a.student_id === id)) return res.status(409).json({ error: 'Student has finance history. Mark the student inactive to preserve billing records.' });

  const membershipIds = Array.from(db.memberships.entries()).flatMap(([mId, m]) => {
    if (m.student_id === id) {
      return [mId];
    }
    return [];
  });
  try {
    await Promise.all([
      deleteDocFromFirestore('students', id),
      ...membershipIds.map((membershipId) => deleteDocFromFirestore('memberships', membershipId)),
    ]);
    membershipIds.forEach((membershipId) => db.memberships.delete(membershipId));
    db.students.delete(id);
    db.saveToDisk();
    return res.json({ success: true, message: `Student ${student.full_name} deleted successfully` });
  } catch (error: any) {
    console.error('[Delete Student] Firestore delete failed:', error?.message || error);
    return res.status(503).json({ error: 'Student could not be deleted completely. Please retry.', code: 'DELETE_FAILED' });
  }
});

// ============================================================
// 4. CLASSES (PERMANENT RECURRING ACADEMY CLASSES)
// ============================================================

router.get('/classes', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { coach_id, class_type, day_of_week, status, search } = req.query;

  let list = Array.from(db.classes.values()).map((c) => db.getPopulatedClass(c.id)!);

  if (coach_id) {
    list = list.filter((c) => c.default_coach_id === coach_id);
  }

  if (class_type) {
    list = list.filter((c) => c.class_type === class_type);
  }

  if (day_of_week !== undefined && day_of_week !== '') {
    list = list.filter((c) => c.day_of_week === Number(day_of_week));
  }

  if (status) {
    const isActive = status === 'ACTIVE';
    list = list.filter((c) => (status === 'ALL' ? true : c.is_active === isActive));
  }

  if (search) {
    const q = String(search).trim().toLowerCase();
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.default_coach?.name && c.default_coach.name.toLowerCase().includes(q)) ||
        (c.room_location && c.room_location.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }

  if (req.user!.role === 'COACH') list = list.filter((cls) => cls.is_active && canManageClass(req.user!, cls.id));
  return res.json(list);
});

router.get('/classes/:id/student-search', authenticateUser, requireCoachOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const classId = req.params.id;
  if (!canManageClass(req.user!, classId) || !db.classes.get(classId)?.is_active) return res.status(403).json({ error: 'Forbidden' });
  const query = String(req.query.search || '').trim().toLowerCase();
  const results = Array.from(db.students.values())
    .filter((student) => student.status === 'ACTIVE' && (student.full_name.toLowerCase().includes(query) || student.student_id.toLowerCase().includes(query)))
    .map((student) => {
      const memberships = Array.from(db.memberships.values()).filter((membership) => membership.student_id === student.id && membership.status === 'ACTIVE');
      return {
        id: student.id, full_name: student.full_name, student_id: student.student_id,
        already_in_class: memberships.some((membership) => db.schedules.get(membership.schedule_id)?.class_id === classId),
        assigned_elsewhere: memberships.some((membership) => db.schedules.get(membership.schedule_id)?.class_id !== classId),
      };
    })
    .filter((student) => !student.already_in_class);
  return res.json(results);
});
router.get('/classes/:id', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const cls = db.getPopulatedClass(id);
  if (!cls) {
    return res.status(404).json({ error: 'Class not found' });
  }
  if (!canManageClass(req.user!, id)) return res.status(403).json({ error: 'Forbidden' });
  return res.json(cls);
});

router.post('/classes', authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {
    name,
    class_type,
    day_of_week,
    start_time,
    end_time,
    default_coach_id,
    coach_id,
    room_location,
    description,
    default_duration_mins,
    default_capacity,
    student_ids,
  } = req.body;

  if (!name || !class_type) {
    return res.status(400).json({ error: 'Class name and class type are required' });
  }

  const user = req.user!;
  if (user.role === 'COACH' && Array.isArray(student_ids) && student_ids.length) return res.status(403).json({ error: 'Create the class first, then use student search to assign students.' });
  const assignedCoachId = user.role === 'COACH' ? user.coach_id : (default_coach_id || coach_id || 'coach-1');
  if (!assignedCoachId) return res.status(403).json({ error: 'A Coach profile is required to create a class.' });
  const classId = `class-${crypto.randomUUID()}`;
  const newClass: AcademyClass = {
    id: classId,
    name: String(name).trim(),
    class_type: class_type as 'GROUP' | 'INDIVIDUAL',
    day_of_week: day_of_week !== undefined ? Number(day_of_week) : 6,
    start_time: start_time || '09:30',
    end_time: end_time || '11:00',
    default_coach_id: assignedCoachId,
    room_location: room_location ? String(room_location).trim() : 'Chess Hall A',
    description: description ? String(description).trim() : '',
    default_duration_mins: Number(default_duration_mins) || 90,
    default_capacity: Number(default_capacity) || 8,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  const recordsToPersist: Array<[string, string, unknown]> = [['classes', classId, newClass]];
  db.classes.set(classId, newClass);

  // Synchronize recurring schedule
  const newSched: ClassSchedule = {
    id: classId,
    class_id: classId,
    coach_id: assignedCoachId,
    default_coach_id: assignedCoachId,
    day_of_week: newClass.day_of_week ?? 6,
    start_time: newClass.start_time ?? '09:30',
    end_time: newClass.end_time ?? '11:00',
    room_location: newClass.room_location,
    status: 'ACTIVE',
    is_active: true,
    created_at: newClass.created_at,
  };
  db.schedules.set(classId, newSched);
  recordsToPersist.push(['schedules', classId, newSched]);

  // Enroll initial students if provided
  if (Array.isArray(student_ids)) {
    student_ids.forEach((stuId: string) => {
      if (db.students.has(stuId)) {
        const memId = `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const membership = {
          id: memId,
          student_id: stuId,
          schedule_id: classId,
        joined_date: academyToday(),
          status: 'ACTIVE' as const,
        };
        db.memberships.set(memId, membership);
        recordsToPersist.push(['memberships', memId, membership]);
      }
    });
  }

  try {
    await recordActivity(user, 'CLASS_CREATED', 'class', classId, { classId, summary: newClass.name });
    await persistMutation(recordsToPersist, true);
    await Promise.all((Array.isArray(student_ids) ? student_ids : []).map((studentId: string) => syncPortalCoachLinksForStudent(studentId).catch(console.error)));
    db.saveToDisk();
    return res.status(201).json(db.getPopulatedClass(classId));
  } catch (error: any) {
    db.classes.delete(classId);
    db.schedules.delete(classId);
    recordsToPersist
      .filter(([collection]) => collection === 'memberships')
      .forEach(([, membershipId]) => db.memberships.delete(membershipId));
    console.error('[Create Class] Firestore write failed:', error?.message || error);
    return res.status(503).json({ error: 'Class could not be saved to Firestore. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

router.post('/classes/bulk', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { classes } = req.body;
  if (!Array.isArray(classes) || classes.length === 0) {
    return res.status(400).json({ error: 'A non-empty classes array is required.' });
  }

  const days: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const normalise = (value: unknown) => String(value || '').trim().toLowerCase().replace(/^coach\s+/, '');
  const isTime = (value: unknown) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
  const errors: { row: number; class_name?: string; feedback: string }[] = [];
  const ready: Array<{ name: string; classType: 'GROUP' | 'INDIVIDUAL'; day: number; start: string; end: string; coachId: string; room: string; capacity: number; studentIds: string[] }> = [];
  const batchSlots = new Set<string>();

  classes.forEach((raw: any, index: number) => {
    const row = index + 1;
    const name = String(raw.name || raw.class_name || '').trim();
    const classType = String(raw.class_type || 'GROUP').trim().toUpperCase();
    const dayValue = String(raw.day_of_week ?? raw.day ?? '').trim().toLowerCase();
    const day = dayValue in days ? days[dayValue] : Number(dayValue);
    const start = String(raw.start_time || '').trim();
    const end = String(raw.end_time || '').trim();
    const coachName = normalise(raw.coach_name || raw.coach || raw.default_coach);
    const coach = Array.from(db.coaches.values()).find((candidate) => normalise(candidate.name) === coachName);
    const studentCodes = Array.isArray(raw.student_ids) ? raw.student_ids : String(raw.student_ids || '').split(/[;|]/).map((value) => value.trim()).filter(Boolean);
    const matchedStudents = studentCodes.map((code: string) => Array.from(db.students.values()).find((student) => student.student_id.toUpperCase() === code.toUpperCase()));

    let feedback = '';
    if (!name) feedback = 'Class name is required.';
    else if (classType !== 'GROUP' && classType !== 'INDIVIDUAL') feedback = 'Class type must be GROUP or INDIVIDUAL.';
    else if (!Number.isInteger(day) || day < 0 || day > 6) feedback = 'Day must be Monday–Sunday or a number from 0–6.';
    else if (!isTime(start) || !isTime(end) || start >= end) feedback = 'Use valid 24-hour start and end times (for example 18:30 and 20:00).';
    else if (!coachName || !coach) feedback = 'Coach was not found. Use the coach name exactly as it appears in Staff & Coaches.';
    else if (matchedStudents.some((student) => !student)) feedback = `Student ID(s) not found: ${studentCodes.filter((_: string, itemIndex: number) => !matchedStudents[itemIndex]).join(', ')}.`;

    const slot = `${name.toLowerCase()}|${day}|${start}|${coach?.id || ''}`;
    if (!feedback && (batchSlots.has(slot) || Array.from(db.classes.values()).some((item) => item.name.toLowerCase() === name.toLowerCase() && item.day_of_week === day && item.start_time === start && item.default_coach_id === coach!.id))) {
      feedback = 'A matching class already exists for this coach, day, and time.';
    }
    if (feedback) {
      errors.push({ row, class_name: name, feedback });
      return;
    }
    batchSlots.add(slot);
    ready.push({ name, classType: classType as 'GROUP' | 'INDIVIDUAL', day, start, end, coachId: coach!.id, room: String(raw.room_location || '').trim() || 'Chess Hall A', capacity: Number(raw.default_capacity || raw.capacity) || 12, studentIds: matchedStudents.map((student) => student!.id) });
  });

  const writes: Array<[string, string, unknown]> = [];
  const rollback: Array<[Map<string, any>, string]> = [];
  const created: AcademyClass[] = [];
  ready.forEach((item) => {
    const classId = `class-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date().toISOString();
    const duration = (Number(item.end.slice(0, 2)) * 60 + Number(item.end.slice(3))) - (Number(item.start.slice(0, 2)) * 60 + Number(item.start.slice(3)));
    const newClass: AcademyClass = { id: classId, name: item.name, class_type: item.classType, day_of_week: item.day, start_time: item.start, end_time: item.end, default_coach_id: item.coachId, room_location: item.room, default_duration_mins: duration, default_capacity: item.classType === 'INDIVIDUAL' ? 1 : item.capacity, is_active: true, created_at: createdAt };
    const schedule: ClassSchedule = { id: classId, class_id: classId, coach_id: item.coachId, default_coach_id: item.coachId, day_of_week: item.day, start_time: item.start, end_time: item.end, room_location: item.room, status: 'ACTIVE', is_active: true, created_at: createdAt };
    db.classes.set(classId, newClass); db.schedules.set(classId, schedule);
    rollback.push([db.classes, classId], [db.schedules, classId]);
    writes.push(['classes', classId, newClass], ['schedules', classId, schedule]);
    item.studentIds.forEach((studentId) => {
      const membershipId = `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const membership = { id: membershipId, student_id: studentId, schedule_id: classId, joined_date: createdAt.slice(0, 10), status: 'ACTIVE' as const };
      db.memberships.set(membershipId, membership); rollback.push([db.memberships, membershipId]); writes.push(['memberships', membershipId, membership]);
    });
    created.push(newClass);
  });

  try {
    await Promise.all(writes.map(([collection, id, record]) => syncDocToFirestore(collection, id, record, false)));
    await markFirestoreStateChanged();
    await Promise.all(Array.from(new Set(ready.flatMap((item) => item.studentIds))).map((studentId) => syncPortalCoachLinksForStudent(studentId).catch(console.error)));
    db.saveToDisk();
    return res.json({ success: true, importedCount: created.length, errorCount: errors.length, created: created.map((item) => db.getPopulatedClass(item.id)), errors });
  } catch (error: any) {
    rollback.forEach(([collection, id]) => collection.delete(id));
    console.error('[Bulk Class Import] Firestore write failed:', error?.message || error);
    return res.status(503).json({ error: 'Classes could not be saved to Firestore. No successful import has been reported; please retry after the issue is resolved.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

/**
 * One-time operational reset for the academy's pre-launch test data. The
 * route intentionally retains every SUPER_ADMIN profile and Firebase account
 * so the caller cannot lock the academy out of its own portal.
 */
router.post('/admin/reset-operational-data', authenticateUser, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  if (db.studentFees.size || db.studentPayments.size || db.studentAdjustments.size) return res.status(409).json({ error: 'Finance records exist. Operational reset is blocked to preserve billing history.' });
  if (req.body?.confirmation !== 'RESET TEST DATA') {
    return res.status(400).json({ error: 'Type RESET TEST DATA to confirm this irreversible reset.' });
  }

  const preservedAdmins = Array.from(db.users.values()).filter((user) => user.role === 'SUPER_ADMIN');
  if (preservedAdmins.length === 0) {
    return res.status(409).json({ error: 'Reset stopped: no SUPER_ADMIN account was found to preserve.' });
  }

  const preservedIds = new Set(preservedAdmins.map((user) => user.id));
  const removableFirebaseUserIds = Array.from(db.users.values())
    .filter((user) => !preservedIds.has(user.id))
    .map((user) => user.id);
  const collections = ['users', 'coaches', 'parents', 'students', 'classes', 'schedules', 'memberships', 'sessions', 'attendance', 'auditLogs', 'notificationLogs'];

  try {
    const firestore = getFirestoreDb();
    const writer = firestore.bulkWriter();
    const deleted: Record<string, number> = {};

    for (const collectionName of collections) {
      const documents = await firestore.collection(collectionName).listDocuments();
      const removals = collectionName === 'users'
        ? documents.filter((document) => !preservedIds.has(document.id))
        : documents;
      removals.forEach((document) => writer.delete(document));
      deleted[collectionName] = removals.length;
    }
    await writer.close();

    const authFailures: string[] = [];
    if (adminAuth && removableFirebaseUserIds.length > 0) {
      for (let offset = 0; offset < removableFirebaseUserIds.length; offset += 1000) {
        const result = await adminAuth.deleteUsers(removableFirebaseUserIds.slice(offset, offset + 1000));
        result.errors.forEach((error) => authFailures.push(removableFirebaseUserIds[offset + error.index]));
      }
    }

    db.users = new Map(preservedAdmins.map((user) => [user.id, user]));
    db.coaches.clear();
    db.parents.clear();
    db.students.clear();
    db.classes.clear();
    db.schedules.clear();
    db.memberships.clear();
    db.sessions.clear();
    db.attendance.clear();
    db.auditLogs = [];
    db.notificationLogs = [];
    await markFirestoreStateChanged();
    db.saveToDisk();

    return res.json({
      success: true,
      message: 'Operational test data was reset. Super-admin access was preserved.',
      deleted,
      preserved_super_admins: preservedAdmins.length,
      firebase_auth_failures: authFailures,
    });
  } catch (error: any) {
    console.error('[Reset] Operational data reset failed:', error?.message || error);
    return res.status(500).json({ error: 'Reset did not complete. No further reset attempts were made.', code: 'RESET_FAILED' });
  }
});

// Bulk actions are deliberately durable: the Firestore operation completes
// before the UI reports success, so a refresh cannot bring old rows back.
router.post('/students/bulk-assign-schedule', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { student_ids, schedule_id } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0 || !schedule_id) {
    return res.status(400).json({ error: 'Select at least one student and one class schedule.' });
  }
  if (student_ids.length > 500) return res.status(400).json({ error: 'A bulk action is limited to 500 students.' });
  if (!db.schedules.has(schedule_id)) return res.status(404).json({ error: 'Class schedule not found.' });

  const uniqueStudentIds = [...new Set(student_ids)].filter((studentId): studentId is string => typeof studentId === 'string' && db.students.has(studentId));
  if (uniqueStudentIds.length === 0) return res.status(400).json({ error: 'None of the selected students still exist.' });
  const writes: Array<[string, string, unknown]> = [];
  let alreadyEnrolled = 0;
  uniqueStudentIds.forEach((studentId) => {
    const exists = Array.from(db.memberships.values()).some((membership) => membership.student_id === studentId && membership.schedule_id === schedule_id && membership.status === 'ACTIVE');
    if (exists) { alreadyEnrolled += 1; return; }
    const membership = { id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, student_id: studentId, schedule_id, joined_date: academyToday(), status: 'ACTIVE' as const };
    db.memberships.set(membership.id, membership);
    writes.push(['memberships', membership.id, membership]);
  });
  try {
    await Promise.all(writes.map(([collection, id, record]) => syncDocToFirestore(collection, id, record, false)));
    await markFirestoreStateChanged();
    await Promise.all(uniqueStudentIds.map((studentId) => syncPortalCoachLinksForStudent(studentId).catch(console.error)));
    return res.json({ success: true, assigned_count: writes.length, already_enrolled: alreadyEnrolled });
  } catch (error: any) {
    writes.forEach(([, membershipId]) => db.memberships.delete(membershipId));
    console.error('[Bulk Assign Students] Firestore write failed:', error?.message || error);
    return res.status(503).json({ error: 'Class assignment could not be saved. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

router.post('/students/bulk-delete', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { student_ids } = req.body;
  if (!Array.isArray(student_ids) || student_ids.length === 0) return res.status(400).json({ error: 'Select at least one student to delete.' });
  if (student_ids.length > 500) return res.status(400).json({ error: 'A bulk action is limited to 500 students.' });
  const ids = [...new Set(student_ids)].filter((studentId): studentId is string => typeof studentId === 'string' && db.students.has(studentId));
  if (ids.length === 0) return res.status(400).json({ error: 'None of the selected students still exist.' });
  if ([...db.studentFees.values()].some(f => ids.includes(f.student_id)) || [...db.studentPayments.values()].some(p => ids.includes(p.student_id)) || [...db.studentAdjustments.values()].some(a => ids.includes(a.student_id))) return res.status(409).json({ error: 'One or more students have finance history. Mark them inactive instead.' });
  const membershipIds = Array.from(db.memberships.values()).filter((membership) => ids.includes(membership.student_id)).map((membership) => membership.id);
  try {
    await Promise.all([
      ...ids.map((studentId) => deleteDocFromFirestore('students', studentId)),
      ...membershipIds.map((membershipId) => deleteDocFromFirestore('memberships', membershipId)),
    ]);
    membershipIds.forEach((membershipId) => db.memberships.delete(membershipId));
    ids.forEach((studentId) => db.students.delete(studentId));
    db.saveToDisk();
    return res.json({ success: true, deleted_count: ids.length });
  } catch (error: any) {
    console.error('[Bulk Delete Students] Firestore delete failed:', error?.message || error);
    return res.status(503).json({ error: 'Student deletion could not be completed. Please retry.', code: 'FIRESTORE_DELETE_FAILED' });
  }
});

router.put('/classes/:id', authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const cls = db.classes.get(id);

  if (!cls) {
    return res.status(404).json({ error: 'Class not found' });
  }

  if (!canManageClass(req.user!, id)) return res.status(403).json({ error: 'Forbidden' });
  if (req.user!.role === 'COACH' && ['default_coach_id', 'coach_id', 'student_ids', 'is_active'].some((field) => req.body[field] !== undefined)) return res.status(403).json({ error: 'Use class assignment to change students; coach and status changes require Admin.' });

  const {
    name,
    class_type,
    day_of_week,
    start_time,
    end_time,
    default_coach_id,
    coach_id,
    room_location,
    description,
    default_duration_mins,
    default_capacity,
    is_active,
    student_ids,
  } = req.body;

  if (name !== undefined) cls.name = String(name).trim();
  if (class_type !== undefined) cls.class_type = class_type;
  if (day_of_week !== undefined) cls.day_of_week = Number(day_of_week);
  if (start_time !== undefined) cls.start_time = start_time;
  if (end_time !== undefined) cls.end_time = end_time;
  if (default_coach_id !== undefined || coach_id !== undefined) {
    cls.default_coach_id = default_coach_id || coach_id;
  }
  if (room_location !== undefined) cls.room_location = String(room_location).trim();
  if (description !== undefined) cls.description = String(description).trim();
  if (default_duration_mins !== undefined) cls.default_duration_mins = Number(default_duration_mins);
  if (default_capacity !== undefined) cls.default_capacity = Number(default_capacity);
  if (is_active !== undefined) cls.is_active = Boolean(is_active);

  db.classes.set(id, cls);

  // Synchronize recurring schedule
  let sched = db.schedules.get(id) || Array.from(db.schedules.values()).find((s) => s.class_id === id);
  if (!sched) {
    sched = {
      id: id,
      class_id: id,
      coach_id: cls.default_coach_id || 'coach-1',
      default_coach_id: cls.default_coach_id || 'coach-1',
      day_of_week: cls.day_of_week ?? 6,
      start_time: cls.start_time ?? '09:30',
      end_time: cls.end_time ?? '11:00',
      room_location: cls.room_location,
      status: cls.is_active ? 'ACTIVE' : 'INACTIVE',
      is_active: cls.is_active,
      created_at: new Date().toISOString(),
    };
  } else {
    if (cls.default_coach_id) {
      sched.coach_id = cls.default_coach_id;
      sched.default_coach_id = cls.default_coach_id;
    }
    if (cls.day_of_week !== undefined) sched.day_of_week = cls.day_of_week;
    if (cls.start_time) sched.start_time = cls.start_time;
    if (cls.end_time) sched.end_time = cls.end_time;
    if (cls.room_location) sched.room_location = cls.room_location;
    if (cls.is_active !== undefined) {
      sched.status = cls.is_active ? 'ACTIVE' : 'INACTIVE';
      sched.is_active = cls.is_active;
    }
  }
  db.schedules.set(sched.id, sched);

  // Synchronize students if student_ids array provided
  const membershipWrites: Promise<unknown>[] = [];
  if (Array.isArray(student_ids)) {
    const currentMemberships = Array.from(db.memberships.values()).filter(
      (m) => m.schedule_id === id || (sched && m.schedule_id === sched.id)
    );
    const currentStudentIds = new Set(currentMemberships.filter(m => m.status === 'ACTIVE').map((m) => m.student_id));
    const targetStudentIds = new Set(student_ids);

    // Remove unassigned
    currentMemberships.forEach((m) => {
      if (m.status === 'ACTIVE' && !targetStudentIds.has(m.student_id)) {
        const ended = { ...m, status: 'ENDED' as const, ended_date: academyToday() };
        db.memberships.set(m.id, ended);
        membershipWrites.push(syncDocToFirestore('memberships', m.id, ended, false));
      }
    });

    // Add new
    student_ids.forEach((stuId: string) => {
      if (!currentStudentIds.has(stuId) && db.students.has(stuId)) {
        const memId = `m-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const membership = {
          id: memId,
          student_id: stuId,
          schedule_id: id,
          joined_date: new Date().toISOString().split('T')[0],
          status: 'ACTIVE' as const,
        };
        db.memberships.set(memId, membership);
        membershipWrites.push(syncDocToFirestore('memberships', memId, membership, false));
      }
    });
  }

  const oldFutureMonths = new Set(Array.from(db.sessions.values())
    .filter((session) => (session.class_id === id || session.schedule_id === id) && session.session_date > academyToday())
    .map((session) => session.session_date.slice(0, 7)));
  const changedSessions = reconcileRecurringSessions(cls, db.sessions, db.attendance.values(), academyToday());
  const generatedSessions = [...oldFutureMonths].flatMap((month) => db.ensureSessionsForMonth(month, academyToday()));
  const sessionWrites: Promise<unknown>[] = [
    ...changedSessions.updated.map((session) => syncDocToFirestore('sessions', session.id, session, false)),
    ...changedSessions.removed.map((session) => deleteDocFromFirestore('sessions', session.id, false)),
    ...generatedSessions.map((session) => syncDocToFirestore('sessions', session.id, session, false)),
  ];

  try {
    await Promise.all([
      syncDocToFirestore('classes', id, cls, false),
      syncDocToFirestore('schedules', sched.id, sched, false),
      ...membershipWrites,
      ...sessionWrites,
    ]);
    await publishFirestoreRevision();
    if (Array.isArray(student_ids)) {
      const affected = new Set<string>([...student_ids, ...Array.from(db.memberships.values()).filter((membership) => membership.schedule_id === id).map((membership) => membership.student_id)]);
      await Promise.all(Array.from(affected).map((studentId) => syncPortalCoachLinksForStudent(studentId).catch(console.error)));
    }
    db.saveToDisk();
    return res.json(db.getPopulatedClass(id));
  } catch (error: any) {
    console.error('[Update Class] Firestore write failed:', error?.message || error);
    return res.status(503).json({ error: 'Class changes could not be saved to Firestore. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

router.delete('/classes/:id', authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const cls = db.classes.get(id);

  if (!cls) {
    return res.status(404).json({ error: 'Class not found' });
  }

  if (!canManageClass(req.user!, id)) return res.status(403).json({ error: 'Forbidden' });
  // Archive the class and schedule; keep sessions, attendance, and class metadata for reports.
  const before = { ...cls };
  const schedules = Array.from(db.schedules.values()).filter((schedule) => schedule.class_id === id);
  const priorSchedules = schedules.map((schedule) => ({ ...schedule }));
  cls.is_active = false;
  schedules.forEach((schedule) => { schedule.is_active = false; schedule.status = 'INACTIVE'; });
  const ended = [...db.memberships.values()].filter(m => m.status === 'ACTIVE' && (m.schedule_id === id || schedules.some(s => s.id === m.schedule_id))).map(m => ({ ...m, status: 'ENDED' as const, ended_date: academyToday() }));
  try {
    await persistMutation([['classes', id, cls], ...schedules.map((schedule): [string, string, unknown] => ['schedules', schedule.id, schedule]), ...ended.map((m): [string, string, unknown] => ['memberships', m.id, m])], true);
    ended.forEach(m => db.memberships.set(m.id, m));
    return res.json({ success: true, message: 'Class archived; attendance history preserved.' });
  } catch {
    db.classes.set(id, before);
    priorSchedules.forEach((schedule) => db.schedules.set(schedule.id, schedule));
    return res.status(503).json({ error: 'Class could not be archived.' });
  }
});

// ============================================================
// 5. RECURRING CLASS SCHEDULES
// ============================================================

router.get('/schedules', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { coach_id, class_id, day_of_week, status, search } = req.query;

  let list = Array.from(db.schedules.values()).map((s) => db.getPopulatedSchedule(s.id)!);
  if (req.user!.role === 'COACH') list = list.filter((schedule) => db.classes.get(schedule.class_id)?.is_active && canManageClass(req.user!, schedule.class_id));

  if (coach_id) {
    list = list.filter((s) => s.coach_id === coach_id);
  }

  if (class_id) {
    list = list.filter((s) => s.class_id === class_id);
  }

  if (day_of_week !== undefined && day_of_week !== '') {
    list = list.filter((s) => s.day_of_week === Number(day_of_week));
  }

  if (status) {
    list = list.filter((s) => s.status === status);
  }

  if (search) {
    const q = String(search).trim().toLowerCase();
    list = list.filter(
      (s) =>
        s.class_item?.name.toLowerCase().includes(q) ||
        s.coach?.name.toLowerCase().includes(q) ||
        (s.room_location && s.room_location.toLowerCase().includes(q))
    );
  }

  return res.json(list);
});

router.post('/schedules', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { class_id, coach_id, day_of_week, start_time, end_time, room_location } = req.body;

  if (!class_id || !coach_id || day_of_week === undefined || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required schedule fields' });
  }

  const schedId = `sched-${Date.now()}`;
  const newSched: ClassSchedule = {
    id: schedId,
    class_id,
    coach_id,
    day_of_week: Number(day_of_week),
    start_time,
    end_time,
    room_location: room_location ? String(room_location).trim() : 'Main Studio',
    status: 'ACTIVE',
    is_active: true,
    created_at: new Date().toISOString(),
  };

  db.schedules.set(schedId, newSched);
  return res.status(201).json(db.getPopulatedSchedule(schedId));
});

router.put('/schedules/:id', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const sched = db.schedules.get(id);

  if (!sched) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  const { class_id, coach_id, day_of_week, start_time, end_time, room_location, status } = req.body;

  if (class_id !== undefined) sched.class_id = class_id;
  if (coach_id !== undefined) sched.coach_id = coach_id;
  if (day_of_week !== undefined) sched.day_of_week = Number(day_of_week);
  if (start_time !== undefined) sched.start_time = start_time;
  if (end_time !== undefined) sched.end_time = end_time;
  if (room_location !== undefined) sched.room_location = String(room_location).trim();
  if (status !== undefined) {
    sched.status = status;
    sched.is_active = status === 'ACTIVE';
  }

  db.schedules.set(id, sched);
  return res.json(db.getPopulatedSchedule(id));
});

router.delete('/schedules/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const sched = db.schedules.get(id);

  if (!sched) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  const ended = [...db.memberships.values()].filter(m => m.schedule_id === id && m.status === 'ACTIVE').map(m => ({ ...m, status: 'ENDED' as const, ended_date: academyToday() }));
  const archived = { ...sched, is_active: false, status: 'INACTIVE' as const };
  try {
    await persistMutation([['schedules', id, archived], ...ended.map((m): [string, string, unknown] => ['memberships', m.id, m])], true);
    db.schedules.set(id, archived); ended.forEach(m => db.memberships.set(m.id, m));
    return res.json({ success: true, message: 'Class schedule archived.' });
  } catch { return res.status(503).json({ error: 'Schedule could not be archived.' }); }
});

// Manage student memberships in a schedule
router.post('/schedules/:id/students', authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { student_id } = req.body;

  if (!student_id || !db.students.has(student_id) || !db.schedules.has(id)) {
    return res.status(400).json({ error: 'Invalid schedule or student' });
  }
  const user = req.user!;
  if (!canManageSchedule(user, id) || !db.classes.get(db.schedules.get(id)!.class_id)?.is_active) return res.status(403).json({ error: 'Forbidden: you do not manage this class.' });

  // Check if already enrolled
  const existing = Array.from(db.memberships.values()).find(
    (m) => m.schedule_id === id && m.student_id === student_id && m.status === 'ACTIVE'
  );

  if (!existing) {
    const otherClass = Array.from(db.memberships.values()).some((membership) => membership.student_id === student_id && membership.status === 'ACTIVE' && membership.schedule_id !== id);
    if (otherClass && req.body.add_anyway !== true) return res.status(409).json({ error: 'This student is already assigned to another class/coach. Add anyway?', confirmation_required: true });
    const memId = `m-${crypto.randomUUID()}`;
    const membership = {
      id: memId,
      student_id,
      schedule_id: id,
      joined_date: academyToday(),
      status: 'ACTIVE',
    } as const;
    db.memberships.set(memId, membership);
    try {
      await recordActivity(user, 'STUDENT_ASSIGNED_TO_CLASS', 'membership', memId, { classId: db.schedules.get(id)!.class_id, summary: student_id });
      await persistMutation([['memberships', memId, membership]]);
      await syncPortalCoachLinksForStudent(student_id);
    } catch (error) {
      db.memberships.delete(memId);
      return res.status(503).json({ error: 'Assignment could not be saved. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
    }
  }

  return res.json(db.getPopulatedSchedule(id));
});

router.delete('/schedules/:id/students/:studentId', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id, studentId } = req.params;
  const ended = [...db.memberships.values()].filter(m => m.schedule_id === id && m.student_id === studentId && m.status === 'ACTIVE').map(m => ({ ...m, status: 'ENDED' as const, ended_date: academyToday() }));
  try {
    await persistMutation(ended.map((m): [string, string, unknown] => ['memberships', m.id, m]), true);
    ended.forEach(m => db.memberships.set(m.id, m));
    return res.json(db.getPopulatedSchedule(id));
  } catch { return res.status(503).json({ error: 'Enrollment could not be ended.' }); }
});

// ============================================================
// 6. CALENDAR SESSIONS (CONCRETE OCCURRENCES)
// ============================================================

router.get('/sessions', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const { date, month, coach_id, class_id, status, my_classes_only } = req.query;
  const user = req.user!;

  // Day view requests a date, while month view requests a month. Generate
  // recurring instances for either path before filtering the response.
  const requestedMonth = typeof month === 'string'
    ? month
    : typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date.slice(0, 7)
      : undefined;
  if (requestedMonth) {
    const originalSessions = new Map(db.sessions);
    const repaired = { updated: [] as ClassSession[], removed: [] as ClassSession[] };
    for (const cls of db.classes.values()) {
      const changes = reconcileRecurringSessions(cls, db.sessions, db.attendance.values(), academyToday(), requestedMonth);
      repaired.updated.push(...changes.updated);
      repaired.removed.push(...changes.removed);
    }
    const createdSessions = db.ensureSessionsForMonth(requestedMonth, academyToday());
    if (createdSessions.length || repaired.updated.length || repaired.removed.length) {
      try {
        await Promise.all([
          ...createdSessions.map((session) => syncDocToFirestore('sessions', session.id, session, false)),
          ...repaired.updated.map((session) => syncDocToFirestore('sessions', session.id, session, false)),
          ...repaired.removed.map((session) => deleteDocFromFirestore('sessions', session.id, false)),
        ]);
        await publishFirestoreRevision();
      } catch (error: any) {
        for (const session of [...repaired.updated, ...repaired.removed]) {
          const original = originalSessions.get(session.id);
          if (original) db.sessions.set(session.id, original);
        }
        // Let the next request retry any unsaved generated occurrence. Keep a
        // session if roll call has already referenced it concurrently.
        createdSessions.forEach((session) => {
          if (!Array.from(db.attendance.values()).some((record) => record.session_id === session.id)) {
            db.sessions.delete(session.id);
          }
        });
        console.error('[Generate Sessions] Firestore write failed:', error?.message || error);
        return res.status(503).json({ error: 'Sessions could not be generated safely. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
      }
    }
  }

  let list = Array.from(db.sessions.values()).map((s) => db.getPopulatedSession(s.id)!);

  // Strictly enforce coach isolation: A coach only sees their own assigned sessions
  if (user.role === 'COACH' && user.coach_id) {
    list = list.filter(
      (s) =>
        s.scheduled_coach_id === user.coach_id ||
        s.actual_coach_id === user.coach_id ||
        s.replacement_coach_id === user.coach_id
    );
  } else if (my_classes_only === 'true' && user.coach_id) {
    list = list.filter(
      (s) =>
        s.scheduled_coach_id === user.coach_id ||
        s.actual_coach_id === user.coach_id ||
        s.replacement_coach_id === user.coach_id
    );
  }

  if (coach_id && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
    list = list.filter(
      (s) =>
        s.scheduled_coach_id === coach_id ||
        s.actual_coach_id === coach_id ||
        s.replacement_coach_id === coach_id
    );
  }

  if (class_id) {
    list = list.filter((s) => s.class_id === class_id);
  }

  if (date) {
    list = list.filter((s) => s.session_date === String(date));
  }

  if (month) {
    // Format YYYY-MM
    list = list.filter((s) => s.session_date.startsWith(String(month)));
  }

  if (status) {
    list = list.filter((s) => s.status === status);
  }

  // Sort by date desc, then start_time asc
  list.sort((a, b) => {
    if (a.session_date !== b.session_date) {
      return a.session_date.localeCompare(b.session_date);
    }
    return a.start_time.localeCompare(b.start_time);
  });

  return res.json(list);
});

router.get('/sessions/:id', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  const session = db.getPopulatedSession(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Resource authorization check for coaches
  if (user.role === 'COACH') {
    const authorized = verifySessionAttendanceAccess(id, user);
    if (!authorized) {
      return res.status(403).json({
        error: 'Forbidden: You are not assigned as the scheduled or replacement coach for this session',
      });
    }
  }

  // Also include list of all enrolled students in the schedule so coach/admin sees everyone
  const enrolledMemberships = Array.from(db.memberships.values()).filter(
    (m) => (m.schedule_id === session.schedule_id || m.schedule_id === session.class_id) && m.status === 'ACTIVE'
  );

  const enrolledStudents = enrolledMemberships
    .map((m) => db.getPopulatedStudent(m.student_id))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return res.json({
    ...session,
    enrolled_students: enrolledStudents,
  });
});

router.post('/sessions', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const {
    schedule_id,
    class_id,
    session_date,
    start_time,
    end_time,
    scheduled_coach_id,
    default_coach_id,
    actual_coach_id,
    status,
    notes,
  } = req.body;

  if (!schedule_id || !class_id || !session_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required session parameters' });
  }

  const defCoach = default_coach_id || scheduled_coach_id || 'coach-1';
  const sessId = `sess-${Date.now()}`;
  const newSession: ClassSession = {
    id: sessId,
    schedule_id,
    class_id,
    session_date,
    start_time,
    end_time,
    default_coach_id: defCoach,
    scheduled_coach_id: defCoach,
    actual_coach_id: actual_coach_id || defCoach,
    session_type: 'NORMAL',
    status: status || 'SCHEDULED',
    notes,
  };

  db.sessions.set(sessId, newSession);
  db.saveToDisk();
  return res.status(201).json(db.getPopulatedSession(sessId));
});

router.put('/sessions/:id', authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const existingSession = db.sessions.get(id);

  if (!existingSession) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (!canManageClass(req.user!, existingSession.class_id)) return res.status(403).json({ error: 'Forbidden: you do not manage this session.' });
  if (req.body.expected_occurrence_revision !== null && typeof req.body.expected_occurrence_revision !== 'string') {
    return res.status(428).json({ error: 'Reload this occurrence before saving.' });
  }
  if (req.body.session_type !== undefined && !['NORMAL', 'REPLACEMENT_COACH', 'COACH_CANCELLED', 'PLANNED_OFF_DAY'].includes(req.body.session_type)) {
    return res.status(400).json({ error: 'Invalid session mode.' });
  }
  if (req.body.status !== undefined && !['SCHEDULED', 'COMPLETED', 'CANCELLED', 'OFF_DAY', 'COACH_CANCELLED', 'PLANNED_OFF_DAY'].includes(req.body.status)) {
    return res.status(400).json({ error: 'Invalid session status.' });
  }
  if (req.body.session_type && req.body.status && (
    ['COACH_CANCELLED', 'CANCELLED'].includes(req.body.status) && req.body.session_type !== 'COACH_CANCELLED' ||
    ['PLANNED_OFF_DAY', 'OFF_DAY'].includes(req.body.status) && req.body.session_type !== 'PLANNED_OFF_DAY' ||
    ['NORMAL', 'REPLACEMENT_COACH'].includes(req.body.session_type) &&
      ['COACH_CANCELLED', 'CANCELLED', 'PLANNED_OFF_DAY', 'OFF_DAY'].includes(req.body.status) ||
    req.body.session_type === 'COACH_CANCELLED' && !['COACH_CANCELLED', 'CANCELLED'].includes(req.body.status) ||
    req.body.session_type === 'PLANNED_OFF_DAY' && !['PLANNED_OFF_DAY', 'OFF_DAY'].includes(req.body.status))) {
    return res.status(400).json({ error: 'Session mode and status conflict.' });
  }
  if (['session_date', 'start_time', 'end_time', 'notes', 'cancellation_reason'].some((field) => req.body[field] !== undefined && typeof req.body[field] !== 'string') ||
      req.body.replacement_coach_id !== undefined && req.body.replacement_coach_id !== null && typeof req.body.replacement_coach_id !== 'string' ||
      req.body.reset_to_regular_schedule !== undefined && typeof req.body.reset_to_regular_schedule !== 'boolean') {
    return res.status(400).json({ error: 'Invalid occurrence update.' });
  }
  if (req.user!.role === 'COACH' && (req.body.status !== undefined && !['SCHEDULED', 'COACH_CANCELLED', 'PLANNED_OFF_DAY'].includes(req.body.status) ||
      req.body.actual_coach_id !== undefined || req.body.scheduled_coach_id !== undefined || req.body.default_coach_id !== undefined)) {
    return res.status(400).json({ error: 'Invalid occurrence update.' });
  }
  // A replacement assignment must be durable before the substitute coach can
  // reliably see the occurrence on another server instance.
  let session: ClassSession = { ...existingSession };

  const {
    session_type,
    replacement_coach_id,
    actual_coach_id,
    status,
    cancellation_reason,
    notes,
    session_date,
    start_time,
    end_time,
    reset_to_regular_schedule,
  } = req.body;

  const sessionClass = db.classes.get(session.class_id);
  const hasTakenAttendance = Array.from(db.attendance.values()).some((record) => record.session_id === id && record.status !== 'BOOKED');
  if (hasTakenAttendance && (['COACH_CANCELLED', 'PLANNED_OFF_DAY'].includes(session_type) ||
      ['CANCELLED', 'OFF_DAY', 'COACH_CANCELLED', 'PLANNED_OFF_DAY'].includes(status))) {
    return res.status(409).json({ error: 'Attendance already exists. Resolve existing markings before cancelling or declaring an off-day.' });
  }
  try {
    session = planOccurrence(session, sessionClass, { session_date, start_time, end_time, replacement_coach_id, actual_coach_id, session_type, reset_to_regular_schedule },
      db.sessions.values(), hasTakenAttendance);
  } catch (error) {
    if (error instanceof OccurrenceError) return res.status(400).json({ error: error.message, code: error.code });
    throw error;
  }

  try {
    session = applyOccurrenceMode(session, { session_type, replacement_coach_id, actual_coach_id, status,
      cancellation_reason, notes, reset_to_regular_schedule }, db.coaches, isAdmin(req.user!));
  } catch (error) {
    if (error instanceof OccurrenceError) return res.status(400).json({ error: error.message, code: error.code });
    throw error;
  }

  try {
    const changedDate = session.session_date !== existingSession.session_date;
    const changedTime = session.start_time !== existingSession.start_time || session.end_time !== existingSession.end_time;
    const previousMode = existingSession.session_type || 'NORMAL';
    const mode = session.session_type || 'NORMAL';
    const action = mode !== previousMode || session.replacement_coach_id !== existingSession.replacement_coach_id
      ? mode === 'REPLACEMENT_COACH' ? (previousMode === mode ? 'REPLACEMENT_COACH_CHANGED' : 'REPLACEMENT_COACH_ASSIGNED')
      : mode === 'COACH_CANCELLED' ? 'OCCURRENCE_COACH_CANCELLED'
      : mode === 'PLANNED_OFF_DAY' ? /5th\s*week/i.test(session.cancellation_reason || '') ? 'OCCURRENCE_FIFTH_WEEK_OFF_DAY' : 'OCCURRENCE_PLANNED_OFF_DAY'
      : previousMode === 'REPLACEMENT_COACH' ? 'REPLACEMENT_COACH_REMOVED' : 'OCCURRENCE_RESTORED'
      : changedDate && changedTime ? 'OCCURRENCE_RESCHEDULED' : changedDate ? 'OCCURRENCE_DATE_CHANGED' : changedTime ? 'OCCURRENCE_TIME_CHANGED' : 'OCCURRENCE_UPDATED';
    const values = (value: ClassSession) => ({ session_date: value.session_date, start_time: value.start_time, end_time: value.end_time,
      session_type: value.session_type || 'NORMAL', status: value.status, replacement_coach_id: value.replacement_coach_id || null,
      cancellation_reason: value.cancellation_reason || null, notes: value.notes || '' });
    const activity = activityEntry(req.user!, action, 'session', id, { classId: session.class_id,
      summary: `${session.session_date} ${session.start_time}-${session.end_time}`, previous_values: values(existingSession),
      new_values: values(session), notes: session.notes });
    const requireUnmarked = changedDate || changedTime || session.replacement_coach_id !== existingSession.replacement_coach_id ||
      ['COACH_CANCELLED', 'PLANNED_OFF_DAY'].includes(mode) && mode !== previousMode;
    const saved = await commitOccurrence(getFirestoreDb(), session, activity, req.body.expected_occurrence_revision, requireUnmarked);
    if (saved.kind === 'stale') return res.status(409).json({ error: 'This occurrence changed elsewhere. Reload before saving.' });
    if (saved.kind === 'marked') return res.status(409).json({ error: 'Attendance was recorded while this occurrence was being edited. Reload before saving.' });
    session = saved.session;
    db.sessions.set(id, session);
    db.activityLogs.unshift(activity);
    db.saveToDisk();
    return res.json(db.getPopulatedSession(id));
  } catch (error: any) {
    console.error('[Update Session] Firestore write failed:', error?.message || error);
    return res.status(503).json({ error: 'Session update could not be saved. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

// ============================================================
// 7. ATTENDANCE & REPLACEMENT ATTENDANCE
// ============================================================

router.post('/sessions/:id/attendance', (_req, res, next) => {
  const requestStartedAt = performance.now();
  res.once('finish', () => attendanceTiming('request_total', requestStartedAt));
  next();
}, authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const { student_id, status, attendance_type, replacement_note, base_stars, lucky_tshirt_worn } = req.body;

  if (typeof student_id !== 'string' || !student_id || !status) {
    return res.status(400).json({ error: 'Student ID and attendance status are required' });
  }
  if (!['PRESENT', 'ABSENT'].includes(status)) return res.status(400).json({ error: 'Choose Present or Absent.' });
  if (attendance_type !== undefined && !['REGULAR', 'REPLACEMENT'].includes(attendance_type)) return res.status(400).json({ error: 'Invalid attendance type.' });
  if (lucky_tshirt_worn !== undefined && typeof lucky_tshirt_worn !== 'boolean') return res.status(400).json({ error: 'Lucky T-shirt must be true or false.' });

  const session = db.sessions.get(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (['COACH_CANCELLED', 'CANCELLED', 'PLANNED_OFF_DAY', 'OFF_DAY'].includes(session.status)) {
    return res.status(409).json({ error: 'Attendance is not required for a cancelled session or planned off-day.' });
  }

  // Security check: Coach can only take attendance for assigned sessions!
  if (!verifySessionAttendanceAccess(id, user)) {
    return res.status(403).json({
      error: 'Forbidden: You are not authorized to mark attendance for this session',
    });
  }
  if (['CANCELLED', 'COACH_CANCELLED', 'OFF_DAY', 'PLANNED_OFF_DAY'].includes(session.status) ||
      ['COACH_CANCELLED', 'PLANNED_OFF_DAY'].includes(session.session_type || '')) {
    return res.status(409).json({ error: 'Roll call is closed for this occurrence.' });
  }

  // Future session attendance restriction (attendance only opens on or after session date)
  const todayStr = academyToday();
  if (session.session_date > todayStr) {
    return res.status(400).json({
      error: 'Attendance cannot be recorded for future sessions. Attendance opens on the scheduled session date.',
    });
  }

  // Check if attendance record already exists for this student and session
  const existingRecord = Array.from(db.attendance.values()).find(
    (a) => a.session_id === id && a.student_id === student_id
  );
  const classMemberships = Array.from(db.memberships.values()).filter((membership) =>
    membership.student_id === student_id && (membership.schedule_id === session.schedule_id || membership.schedule_id === session.class_id));
  // Legacy paused memberships may have no dated pause. Where a dated pause
  // exists, use its interval so an earlier legitimate lesson stays markable.
  if (classMemberships.some((membership) => membership.status === 'PAUSED' &&
      !Array.from(db.studentPauses.values()).some((pause) => pause.membership_id === membership.id))) {
    return res.status(409).json({ error: 'Attendance is not required for a paused student.' });
  }
  if (classMemberships.some((membership) => pauseOnDate(db.studentPauses.values(), membership.id, session.session_date))) {
    return res.status(409).json({ error: 'Attendance is not required while this student is on pause for this class.' });
  }
  const studentForRoll = db.students.get(student_id);
  if (!studentForRoll) return res.status(404).json({ error: 'Student not found.' });
  const enrolled = db.getPopulatedSession(id)?.enrolled_students?.some((item) => item.id === student_id);
  if (!existingRecord && !enrolled) {
    const belongsToAnotherClass = Array.from(db.memberships.values()).some((membership) =>
      membership.student_id === student_id && membership.status === 'ACTIVE');
    if (!belongsToAnotherClass) return res.status(403).json({ error: 'Student is not enrolled in an academy class.' });
    return res.status(409).json({ error: 'Add this student as a replacement before marking attendance.' });
  }
  if (!existingRecord && attendance_type === 'REPLACEMENT') return res.status(409).json({ error: 'Add this student as a replacement before marking attendance.' });
  if (existingRecord && attendance_type && attendance_type !== existingRecord.attendance_type) return res.status(409).json({ error: 'Attendance type cannot be changed during roll call.' });
  if (existingRecord && existingRecord.status !== 'BOOKED' && existingRecord.status !== status) {
    return res.status(409).json({ error: 'Attendance is already recorded. Ask an admin to correct it.' });
  }

  const prevStatus: AttendanceStatus | 'NOT_MARKED' = existingRecord ? existingRecord.status : 'NOT_MARKED';
  const newStatus = status as AttendanceStatus;
  if (!['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(newStatus)) {
    return res.status(400).json({ error: 'Invalid attendance mark.' });
  }
  const attType = (attendance_type as AttendanceType) || (existingRecord ? existingRecord.attendance_type : 'REGULAR');
  if (attType === 'REPLACEMENT' && !replacementBookingEnabled()) {
    return res.status(409).json({ error: 'Replacement attendance is temporarily closed.' });
  }
  if (!['REGULAR', 'REPLACEMENT'].includes(attType) || existingRecord && attendance_type && attendance_type !== existingRecord.attendance_type ||
      !existingRecord && attType !== 'REGULAR') {
    return res.status(400).json({ error: 'Invalid attendance type for this occurrence.' });
  }
  const suppliedStars = base_stars === undefined || base_stars === '' ? undefined : Number(base_stars);
  if (existingRecord && existingRecord.status !== 'BOOKED' &&
      (suppliedStars !== undefined && suppliedStars !== existingRecord.base_stars ||
       lucky_tshirt_worn !== undefined && Boolean(lucky_tshirt_worn) !== Boolean(existingRecord.lucky_tshirt_worn))) {
    return res.status(409).json({ error: 'Attendance is already recorded. Ask an admin to correct it.' });
  }
  if (suppliedStars !== undefined && (!Number.isFinite(suppliedStars) || suppliedStars < 0 || suppliedStars > 10000)) {
    return res.status(400).json({ error: 'Stars must be a number from 0 to 10,000.' });
  }
  if (newStatus === 'ABSENT' && suppliedStars && suppliedStars > 0) {
    return res.status(400).json({ error: 'Absent students cannot receive stars.' });
  }
  const portalAwardLocked = existingRecord?.portal_sync_status === 'SYNCED';
  if (portalAwardLocked && suppliedStars !== undefined && suppliedStars !== existingRecord.base_stars) {
    return res.status(400).json({ error: 'This star award has already synced. Correct star mistakes manually in Bingo Space.' });
  }
  if (portalAwardLocked && lucky_tshirt_worn !== undefined && Boolean(lucky_tshirt_worn) !== Boolean(existingRecord.lucky_tshirt_worn)) {
    return res.status(400).json({ error: 'This star award has already synced. Correct star mistakes manually in Bingo Space.' });
  }
  if (portalAwardLocked && newStatus !== 'PRESENT' && newStatus !== 'LATE') {
    return res.status(400).json({ error: 'This attendance already awarded stars. Correct star mistakes manually in Bingo Space.' });
  }

  const recordId = existingRecord?.id || attendanceRecordId(id, student_id);
  const attendanceToPersist: AttendanceRecord = {
    ...(existingRecord || {}),
    id: recordId,
    session_id: id,
    student_id,
    status: newStatus,
    attendance_type: attType,
    ...(replacement_note !== undefined ? { replacement_note } : {}),
    marked_at: new Date().toISOString(),
    marked_by_user_id: user.id,
    notification_status: 'SENT',
    ...(suppliedStars !== undefined ? { base_stars: suppliedStars } : {}),
    ...(lucky_tshirt_worn !== undefined
      ? { lucky_tshirt_worn: Boolean(lucky_tshirt_worn) }
      : (!existingRecord ? { lucky_tshirt_worn: false } : {})),
  };
  const attendanceClass = db.classes.get(session.class_id);
  if (!attendanceClass) return res.status(409).json({ error: 'The session class is unavailable. Attendance was not changed.' });
  const auditEntry = prevStatus !== newStatus ? {
    id: `audit-${crypto.randomUUID()}`,
    attendance_id: recordId,
    session_id: id,
    student_id,
    student_name: studentForRoll.full_name,
    changed_by_user_id: user.id,
    changed_by_user_name: user.name,
    changed_by_user_role: user.role,
    previous_status: prevStatus,
    new_status: newStatus,
    reason: user.role === 'ADMIN' ? (req.body.audit_reason || 'Admin status update') : 'Roll-call marked by coach',
    timestamp: new Date().toISOString(),
  } : undefined;
  const persistStartedAt = performance.now();
  let idempotentMark = false;
  try {
    const persisted = await persistAttendanceWithReplacementReconciliation({
      attendance: attendanceToPersist,
      classType: attendanceClass.class_type,
      expectedMarkedAt: existingRecord?.marked_at ?? null,
      pauseMembershipIds: classMemberships.map(m => m.id).filter(Boolean),
      sessionDate: session.session_date,
      initialMarkOnly: true,
      audit: auditEntry,
    });
    idempotentMark = Boolean(persisted.idempotent);
    if (idempotentMark && (persisted.attendance.portal_sync_status === 'SYNCED' ||
        !['PRESENT', 'LATE'].includes(persisted.attendance.status) || !Number(persisted.attendance.base_stars))) {
      return res.json({ success: true, idempotent: true, attendance_record: persisted.attendance, session: db.getPopulatedSession(id) });
    }
  } catch (error: any) {
    if (error instanceof PauseAttendanceError) return res.status(409).json({ error: error.message });
    if (error instanceof AttendanceConflictError) return res.status(409).json({ error: error.message });
    if (error instanceof ReplacementCreditError) return res.status(409).json({ error: error.message });
    console.error('[Attendance] Durable attendance/credit transaction failed:', error?.message || error);
    return res.status(503).json({ error: 'Attendance could not be saved. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
  attendanceTiming('attendance_persist', persistStartedAt);

  // Parent Attendance Notification Trigger (via NotificationService)
  const student = db.students.get(student_id);
  const parent = student?.parent_id ? db.parents.get(student.parent_id) : undefined;
  const classItem = db.classes.get(session.class_id);
  const coach = db.coaches.get(session.actual_coach_id) || db.coaches.get(session.scheduled_coach_id);

  if (student && !idempotentMark) {
    notificationService.sendAttendanceAlert({
      attendanceId: recordId,
      sessionId: id,
      studentId: student_id,
      studentName: student.full_name,
      parentId: parent?.id,
      parentName: parent?.name,
      parentPhone: parent?.phone,
      parentTelegramChatId: parent?.telegram_chat_id,
      parentTelegramUsername: parent?.telegram_username,
      attendanceStatus: newStatus,
      attendanceType: attType,
      className: classItem?.name || 'Class',
      sessionDate: session.session_date,
      startTime: session.start_time,
      endTime: session.end_time,
      coachName: coach?.name || 'Coach',
      replacementNote: req.body.replacement_note,
    }).catch((err) => console.error('[Routes] Attendance notification alert error:', err));
  }

  // Attendance always wins: the record above is created first. A portal outage
  // only makes the reward pending; it can never undo or block roll-call.
  const record = db.attendance.get(recordId)!;
  if (record.portal_sync_status !== 'SYNCED' && (newStatus === 'PRESENT' || newStatus === 'LATE') && suppliedStars !== undefined && suppliedStars > 0 && student) {
    const portalStartedAt = performance.now();
    const teachingCoach = db.coaches.get(session.actual_coach_id) || db.coaches.get(session.scheduled_coach_id);
    const portalResult = await awardPortalStars({
      attendance: record,
      student,
      session: session as ClassSession,
      coachName: teachingCoach?.name,
      baseStars: Number(record.base_stars),
      luckyTshirtWorn: Boolean(record.lucky_tshirt_worn),
    });
    attendanceTiming('portal_award', portalStartedAt);
    const portalPersistStartedAt = performance.now();
    try {
      const ref = getFirestoreDb().collection('attendance').doc(recordId);
      const durable = await getFirestoreDb().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.data() as AttendanceRecord | undefined;
        if (!current || current.portal_sync_status === 'SYNCED') return current;
        const updated = removeUndefinedValues({ ...current,
          portal_sync_status: portalResult.status,
          portal_transaction_id: portalResult.transactionId,
          portal_awarded_stars: portalResult.awardedStars,
          portal_multiplier: portalResult.multiplier,
          portal_sync_message: portalResult.message,
        }) as AttendanceRecord;
        transaction.set(ref, updated);
        return updated;
      });
      if (durable) db.attendance.set(recordId, durable);
    } catch (error) {
      console.error('[Attendance] Portal result could not be persisted; retry by attendance event ID:', error);
      record.portal_sync_status = 'PENDING';
      record.portal_sync_message = 'Star status needs reconciliation. Attendance is saved.';
      db.attendance.set(recordId, record);
    }
    await publishFirestoreRevision().catch((error) => console.error('[Attendance] Portal status revision publish failed:', error));
    attendanceTiming('portal_result_persist', portalPersistStartedAt);
  }

  return res.json({
    success: true,
    attendance_record: db.attendance.get(recordId),
    session: db.getPopulatedSession(id),
  });
});

// Coach adds a replacement student to session
router.post('/sessions/:id/replacement-student', authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const { student_id, replacement_note, advance_future_session_id } = req.body;

  if (!replacementBookingEnabled()) {
    return res.status(409).json({ error: 'Replacement booking is temporarily closed.' });
  }

  if (typeof student_id !== 'string' || !student_id) {
    return res.status(400).json({ error: 'Student ID is required' });
  }
  if (replacement_note !== undefined && (typeof replacement_note !== 'string' || replacement_note.length > 500)) return res.status(400).json({ error: 'Invalid replacement note.' });
  if (advance_future_session_id !== undefined && typeof advance_future_session_id !== 'string') return res.status(400).json({ error: 'Invalid advance class.' });

  const session = db.sessions.get(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!verifySessionAttendanceAccess(id, user)) {
    return res.status(403).json({
      error: 'Forbidden: You are not authorized to manage attendance for this session',
    });
  }
  if (['CANCELLED', 'COACH_CANCELLED', 'OFF_DAY', 'PLANNED_OFF_DAY'].includes(session.status) ||
      ['COACH_CANCELLED', 'PLANNED_OFF_DAY'].includes(session.session_type || '')) {
    return res.status(409).json({ error: 'Replacement booking is closed for this occurrence.' });
  }

  const todayStr = academyToday();

  const student = db.students.get(student_id);
  if (!student || student.status !== 'ACTIVE' || student.is_unregistered) {
    return res.status(404).json({ error: 'Active registered student not found in academy directory' });
  }
  if (db.getPopulatedSession(id)?.enrolled_students?.some((item) => item.id === student_id)) {
    return res.status(409).json({ error: 'Student is already enrolled in this occurrence.' });
  }
  if (!Array.from(db.memberships.values()).some((membership) => membership.student_id === student_id && membership.status === 'ACTIVE' &&
      Boolean(db.schedules.get(membership.schedule_id)) && db.schedules.get(membership.schedule_id)!.class_id !== session.class_id)) {
    return res.status(409).json({ error: 'Replacement student must have an active class outside this occurrence.' });
  }

  let advanceCommitment: ReplacementAdvanceCommitment | undefined;
  if (advance_future_session_id) {
    const futureSession = db.sessions.get(String(advance_future_session_id));
    const futureClass = futureSession && db.classes.get(futureSession.class_id);
    const isEnrolled = Boolean(futureSession && Array.from(db.memberships.values()).some((membership) =>
      membership.student_id === student_id && membership.status === 'ACTIVE' &&
      (membership.schedule_id === futureSession.schedule_id || membership.schedule_id === futureSession.class_id)));
    const unavailable = !futureSession || !futureClass || futureClass.class_type !== 'GROUP' ||
      futureSession.session_date <= todayStr || futureSession.status !== 'SCHEDULED' || !isEnrolled;
    if (unavailable) return res.status(400).json({ error: 'Advance Replacement must be linked to this student’s active future Group class.' });
    const duplicate = Array.from(db.replacementAdvanceCommitments.values()).some((commitment) =>
      commitment.future_session_id === futureSession.id && ['PENDING', 'REVIEW_REQUIRED'].includes(commitment.status));
    if (duplicate) return res.status(409).json({ error: 'That future class is already linked to an unresolved advance replacement.' });
    advanceCommitment = {
      id: `advance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      student_id,
      replacement_attendance_id: '',
      replacement_session_id: id,
      future_session_id: futureSession.id,
      status: 'PENDING',
      created_by_user_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  if (Array.from(db.attendance.values()).some((record) => record.session_id === id && record.student_id === student_id)) return res.status(409).json({ error: 'Student is already in this session.' });
  // A stable document ID makes network retries and concurrent requests share one booking.
  const recordId = attendanceRecordId(id, student_id);
  const newRecord: AttendanceRecord = {
    id: recordId,
    session_id: id,
    student_id,
    status: 'BOOKED',
    attendance_type: 'REPLACEMENT',
    replacement_note: replacement_note || 'Attending replacement lesson',
    marked_at: new Date().toISOString(),
    marked_by_user_id: user.id,
    notification_status: 'QUEUED',
  };
  if (advanceCommitment) advanceCommitment.replacement_attendance_id = recordId;

  const replacementClass = db.classes.get(session.class_id);
  if (!replacementClass) return res.status(409).json({ error: 'The session class is unavailable. Replacement attendance was not changed.' });
  let booked: AttendanceRecord;
  try {
    booked = (await persistAttendanceWithReplacementReconciliation({ attendance: newRecord, classType: replacementClass.class_type, advanceCommitment, bookingOnly: true })).attendance;
  } catch (error: any) {
    if (error instanceof ReplacementCreditError || error instanceof AttendanceConflictError) return res.status(409).json({ error: error.message });
    console.error('[Replacement Attendance] Durable attendance/credit transaction failed:', error?.message || error);
    return res.status(503).json({ error: 'Replacement attendance could not be saved. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }

  return res.json({
    success: true,
    attendance_record: booked,
    session: db.getPopulatedSession(id),
  });
});

router.get('/students/:id/replacement-credits', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const student = db.students.get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const history = Array.from(db.replacementCredits.values()).filter((entry) => entry.student_id === student.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
  return res.json({ balance: replacementCreditBalance(student.id), history });
});

router.post('/students/:id/replacement-credits/adjustments', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const student = db.students.get(req.params.id);
  const user = req.user!;
  const amount = Number(req.body.amount);
  const reason = String(req.body.reason || '').trim();
  const openingBalance = Boolean(req.body.opening_balance);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!Number.isInteger(amount) || amount === 0) return res.status(400).json({ error: 'Adjustment amount must be a non-zero whole number.' });
  if (reason.length < 3) return res.status(400).json({ error: 'Adjustment reason is required.' });
  const timestamp = new Date().toISOString();
  const idempotencyKey = String(req.body.idempotency_key || `adjustment-${student.id}-${user.id}-${Date.now()}`);
  const entry: ReplacementCredit = { id: idempotencyKey, student_id: student.id, amount, reason: openingBalance ? 'OPENING_BALANCE_ADJUSTMENT' : 'ADMIN_ADJUSTMENT', created_by_user_id: user.id, created_at: timestamp, effective_at: timestamp, idempotency_key: idempotencyKey };
  try { await createReplacementCredit(entry); return res.json({ success: true, balance: replacementCreditBalance(student.id), entry }); }
  catch (error: any) { return res.status(503).json({ error: error.message || 'Adjustment could not be saved.' }); }
});

// Record an Unregistered Student on the fly during Roll Call
router.post('/sessions/:id/unregistered-student', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const { full_name, nick_name, parent_phone, status, replacement_note, idempotency_key } = req.body;

  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ error: 'Student full name is required' });
  }

  const session = db.sessions.get(id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (['COACH_CANCELLED', 'CANCELLED', 'PLANNED_OFF_DAY', 'OFF_DAY'].includes(session.status)) {
    return res.status(409).json({ error: 'Attendance is not required for a cancelled session or planned off-day.' });
  }

  if (!verifySessionAttendanceAccess(id, user)) {
    return res.status(403).json({ error: 'Forbidden: Unauthorized to mark attendance for this session' });
  }

  const todayStr = academyToday();
  if (session.session_date > todayStr) {
    return res.status(400).json({
      error: 'Attendance cannot be recorded for future sessions. Attendance opens on the scheduled session date.',
    });
  }

  const requestKey = typeof idempotency_key === 'string' ? idempotency_key.trim() : '';
  const retried = requestKey && Array.from(db.attendance.values()).find((record) => record.session_id === id && record.trial_request_key === requestKey);
  if (retried) return res.json({ success: true, idempotent: true, student: db.students.get(retried.student_id), attendance_record: retried, session: db.getPopulatedSession(id) });

  // Create temporary/unregistered parent if phone provided
  let parentId: string | undefined;
  if (parent_phone) {
    parentId = `parent-unreg-${Date.now()}`;
    const newParent = {
      id: parentId,
      name: `${String(full_name).trim()}'s Parent`,
      phone: String(parent_phone).trim(),
      created_at: new Date().toISOString(),
    };
    db.parents.set(parentId, newParent);
  }

  const studentId = `student-unreg-${crypto.randomUUID()}`;
  const unregCode = `UNREG-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const newStudent: Student = {
    id: studentId,
    student_id: unregCode,
    full_name: String(full_name).trim(),
    nick_name: nick_name ? String(nick_name).trim() : undefined,
    parent_id: parentId,
    status: 'ACTIVE',
    is_unregistered: true,
    created_at: new Date().toISOString(),
  };

  db.students.set(studentId, newStudent);

  const attStatus: AttendanceStatus = (status as AttendanceStatus) || 'PRESENT';
  const recordId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const newRecord: AttendanceRecord = {
    id: recordId,
    session_id: id,
    student_id: studentId,
    status: attStatus,
    attendance_type: 'REGULAR',
    replacement_note: replacement_note || 'Unregistered student walk-in/trial',
    marked_at: new Date().toISOString(),
    marked_by_user_id: user.id,
    notification_status: 'QUEUED',
    trial_request_key: requestKey || undefined,
  };

  db.attendance.set(recordId, newRecord);

  // Audit log
  const auditEntry = {
    id: `audit-${Date.now()}`,
    attendance_id: recordId,
    session_id: id,
    student_id: studentId,
    student_name: newStudent.full_name,
    changed_by_user_id: user.id,
    changed_by_user_name: user.name,
    changed_by_user_role: user.role,
    previous_status: 'NOT_MARKED' as const,
    new_status: attStatus,
    reason: `Unregistered student recorded (${unregCode})`,
    timestamp: new Date().toISOString(),
  };
  db.auditLogs.unshift(auditEntry);
  try {
    await recordActivity(user, 'TRIAL_STUDENT_CREATED', 'student', studentId, { classId: session.class_id, summary: unregCode });
    const records: Array<[string, string, unknown]> = [['students', studentId, newStudent], ['attendance', recordId, newRecord], ['auditLogs', auditEntry.id, auditEntry]];
    if (parentId) records.push(['parents', parentId, db.parents.get(parentId)!]);
    await persistMutation(records);
    db.saveToDisk();
  } catch (error) {
    if (parentId) db.parents.delete(parentId);
    db.students.delete(studentId); db.attendance.delete(recordId); db.auditLogs = db.auditLogs.filter((item) => item.id !== auditEntry.id);
    return res.status(503).json({ error: 'Trial student could not be saved. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }

  return res.status(201).json({
    success: true,
    student: newStudent,
    attendance_record: newRecord,
    session: db.getPopulatedSession(id),
  });
});

// Admin converts an Unregistered Student to a Formal Registered Student profile
router.post('/students/:id/convert-registered', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.students.get(id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }

  const {
    student_id,
    full_name,
    nick_name,
    school,
    parent_name,
    parent_phone,
    parent_email,
    parent_telegram,
    parent_relation,
    schedule_ids,
  } = req.body;

  if (!full_name) {
    return res.status(400).json({ error: 'Full Name is required' });
  }
  let formalStudentCode: string;
  try { formalStudentCode = await reserveStudentCode(student_id, await occupiedStudentCodes()); }
  catch (error: any) { return res.status(400).json({ error: error.message || 'Formal Student ID is invalid or already in use.' }); }

  // Update parent
  let parentId = student.parent_id;
  if (!parentId) {
    parentId = `parent-${Date.now()}`;
    const newParent = {
      id: parentId,
      name: parent_name || `${full_name}'s Parent`,
      phone: parent_phone || '',
      email: parent_email || '',
      telegram_username: parent_telegram || '',
      created_at: new Date().toISOString(),
    };
    db.parents.set(parentId, newParent);
  } else {
    const p = db.parents.get(parentId);
    if (p) {
      if (parent_name) p.name = parent_name;
      if (parent_phone) p.phone = parent_phone;
      if (parent_email) p.email = parent_email;
      if (parent_telegram) p.telegram_username = parent_telegram;
      db.parents.set(parentId, p);
    }
  }

  // Update student in place to maintain all existing attendance records and audit logs
  student.student_id = formalStudentCode;
  student.full_name = String(full_name).trim();
  student.nick_name = nick_name ? String(nick_name).trim() : undefined;
  student.school = school ? String(school).trim() : undefined;
  student.parent_id = parentId;
  student.parent_relation = parent_relation || 'Parent';
  student.is_unregistered = false; // Officially registered

  db.students.set(id, student);
  // Conversion may add class memberships but must preserve existing coach links.
  if (Array.isArray(schedule_ids)) {
    for (const schedId of new Set<string>(schedule_ids)) {
      if (!db.schedules.has(schedId)) continue;
      const enrolled = Array.from(db.memberships.values()).some((membership) => membership.student_id === id && membership.schedule_id === schedId && membership.status === 'ACTIVE');
      if (enrolled) continue;
      const memId = 'm-' + crypto.randomUUID();
      db.memberships.set(memId, { id: memId, student_id: id, schedule_id: schedId, joined_date: academyToday(), status: 'ACTIVE' });
    }
  }
  try {
    const records: Array<[string, string, unknown]> = [['students', id, student]];
    if (parentId && db.parents.has(parentId)) records.push(['parents', parentId, db.parents.get(parentId)!]);
    Array.from(db.memberships.values()).filter((membership) => membership.student_id === id).forEach((membership) => records.push(['memberships', membership.id, membership]));
    await recordActivity(req.user!, 'TRIAL_STUDENT_CONVERTED', 'student', id, { summary: formalStudentCode });
    await Promise.all(records.map(([collection, recordId, record]) => syncDocToFirestore(collection, recordId, record, false)));
    await markFirestoreStateChanged();
    db.saveToDisk();
    return res.json(db.getPopulatedStudent(id));
  } catch (error) {
    return res.status(503).json({ error: 'Formal registration could not be saved. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }
});

// List all attendance records with rich filtering (Admin & Session view)
router.get('/attendance', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { session_id, month, date, coach_id, class_id, status, student_search } = req.query;
  let records = Array.from(db.attendance.values());
  if (req.user!.role === 'COACH') records = records.filter((record) => verifySessionAttendanceAccess(record.session_id, req.user!));

  if (session_id) {
    records = records.filter((r) => r.session_id === session_id);
  }

  if (month || date || coach_id || class_id) {
    records = records.filter((r) => {
      const sess = db.sessions.get(r.session_id);
      if (!sess) return false;
      if (month && !sess.session_date.startsWith(String(month))) return false;
      if (date && sess.session_date !== String(date)) return false;
      if (
        coach_id &&
        sess.actual_coach_id !== coach_id &&
        sess.scheduled_coach_id !== coach_id &&
        sess.replacement_coach_id !== coach_id
      ) return false;
      if (class_id && sess.class_id !== class_id) return false;
      return true;
    });
  }

  if (status) {
    records = records.filter((r) => r.status === status);
  }

  if (student_search) {
    const term = String(student_search).toLowerCase();
    records = records.filter((r) => {
      const stu = db.students.get(r.student_id);
      return stu && (stu.full_name.toLowerCase().includes(term) || stu.student_id.toLowerCase().includes(term));
    });
  }

  const populated = records.map((r) => {
    const student = db.students.get(r.student_id);
    const session = db.getPopulatedSession(r.session_id);
    return {
      ...r,
      student,
      session,
    };
  });

  return res.json(populated);
});

// Admin direct attendance correction with mandatory audit reason
router.put('/attendance/:id', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = req.user!;
  const { status, attendance_type, replacement_note, reason } = req.body;

  const record = db.attendance.get(id);
  if (!record) {
    return res.status(404).json({ error: 'Attendance record not found' });
  }

  if (!reason || String(reason).trim().length < 3) {
    return res.status(400).json({ error: 'Audit reason is required for administrative attendance corrections' });
  }
  if (status !== undefined && !['BOOKED', 'PRESENT', 'ABSENT', 'EXCUSED', 'LATE'].includes(status)) return res.status(400).json({ error: 'Invalid attendance status.' });
  if (attendance_type !== undefined && !['REGULAR', 'REPLACEMENT'].includes(attendance_type)) return res.status(400).json({ error: 'Invalid attendance type.' });

  const prevStatus = record.status;
  const correctedRecord: AttendanceRecord = {
    ...record,
    ...(status !== undefined ? { status } : {}),
    ...(attendance_type !== undefined ? { attendance_type } : {}),
    ...(replacement_note !== undefined ? { replacement_note } : {}),
    ...(record.portal_sync_status === 'SYNCED' ? { portal_sync_message: 'Original star award remains. Reconcile star corrections in Bingo Space.' } : {}),
    marked_at: new Date().toISOString(),
    marked_by_user_id: user.id,
  };
  const correctionSession = db.sessions.get(record.session_id);
  const correctionClass = correctionSession && db.classes.get(correctionSession.class_id);
  if (!correctionClass) return res.status(409).json({ error: 'The attendance session class is unavailable. Correction was not saved.' });
  if (correctionSession.session_date > academyToday() && correctedRecord.status !== 'BOOKED') {
    return res.status(400).json({ error: 'Attendance cannot be recorded for future sessions.' });
  }
  const student = db.students.get(record.student_id);
  const auditEntry = {
    id: `audit-${crypto.randomUUID()}`,
    attendance_id: id,
    session_id: record.session_id,
    student_id: record.student_id,
    student_name: student?.full_name || 'Student',
    changed_by_user_id: user.id,
    changed_by_user_name: user.name,
    changed_by_user_role: user.role,
    previous_status: prevStatus,
    new_status: correctedRecord.status,
    reason: String(reason).trim(),
    timestamp: new Date().toISOString(),
  };
  try {
    await persistAttendanceWithReplacementReconciliation({ attendance: correctedRecord, classType: correctionClass.class_type, expectedMarkedAt: record.marked_at ?? null, audit: auditEntry });
  } catch (error: any) {
    if (error instanceof AttendanceConflictError) return res.status(409).json({ error: error.message });
    console.error('[Attendance Correction] Durable attendance/credit transaction failed:', error?.message || error);
    return res.status(503).json({ error: 'Attendance correction could not be saved. Please retry.', code: 'FIRESTORE_WRITE_FAILED' });
  }

  return res.json({
    success: true,
    attendance_record: db.attendance.get(id),
  });
});

// ============================================================
// 8. BULK IMPORT ENDPOINTS
// ============================================================

router.post('/admin/bulk-import/validate', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { type, records } = req.body;
  if (!type || !Array.isArray(records)) {
    return res.status(400).json({ error: 'Valid import type and records array are required' });
  }

  const validationResult = validateBulkImport(type, records);
  return res.json(validationResult);
});

router.post('/admin/bulk-import/commit', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { type, validatedItems } = req.body;
  if (!type || !Array.isArray(validatedItems)) {
    return res.status(400).json({ error: 'Valid import type and validated items array are required' });
  }

  const result = await commitBulkImport(type, validatedItems);
  return res.json(result);
});

// ============================================================
// 9. EXPORT ENDPOINTS (WORD DOCX & HUMAN-READABLE CSV)
// ============================================================

router.get('/export/class-schedules-docx', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const docBuffer = await generateClassScheduleDocx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Chess_Academy_Class_Schedules.docx"');
    return res.send(docBuffer);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to generate Word document' });
  }
});

// Admins can invite any student. Coaches are limited to normal class memberships.
router.post('/students/:id/portal-invite', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const student = db.students.get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!canManageStudent(req.user!, student.id)) return res.status(403).json({ error: 'Forbidden' });
  const user = req.user!;
  try {
    const result = await getPortalLink(student);
    await recordActivity(user, result.status === 'REGISTERED' ? 'PORTAL_LINK_RETRIEVED' : 'PORTAL_INVITE_GENERATED', 'student', student.id, { summary: student.student_id });
    await markFirestoreStateChanged();
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status === 409 ? 409 : 502).json({ error: error.message || 'Could not create portal invite', code: error.code });
  }
});

router.get('/students/:id/portal-account', refreshCredentialScope, authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const student = db.students.get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!canManageStudentCredentials(req.user!, student.id)) return res.status(403).json({ error: 'Forbidden' });
  try { res.setHeader('Cache-Control', 'no-store'); return res.json(await managePortalAccount(student.student_id, 'metadata', req.user!)); }
  catch (error: any) {
    if (error.status === 404) return res.json({ linked: false });
    return res.status(error.status || 502).json({ error: error.message || 'Bingo Space account unavailable' });
  }
});

router.put('/students/:id/portal-account/username', refreshCredentialScope, authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const student = db.students.get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!canManageStudentCredentials(req.user!, student.id)) return res.status(403).json({ error: 'Forbidden' });
  if (typeof req.body.username !== 'string') return res.status(400).json({ error: 'Username is required' });
  try {
    const result = await managePortalAccount(student.student_id, 'username', req.user!, { username: req.body.username });
    await recordActivity(req.user!, 'PORTAL_USERNAME_CHANGED', 'student', student.id, { summary: student.student_id });
    return res.json(result);
  } catch (error: any) { return res.status(error.status || 502).json({ error: error.message || 'Could not change username' }); }
});

router.post('/students/:id/portal-account/password-reset', refreshCredentialScope, authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const student = db.students.get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!canManageStudentCredentials(req.user!, student.id)) return res.status(403).json({ error: 'Forbidden' });
  if (typeof req.body.new_password !== 'string' || typeof req.body.new_password_confirmation !== 'string') {
    return res.status(400).json({ error: 'New password and confirmation are required' });
  }
  try {
    const result = await managePortalAccount(student.student_id, 'password-reset', req.user!, {
      new_password: req.body.new_password, new_password_confirmation: req.body.new_password_confirmation,
    });
    await recordActivity(req.user!, 'PORTAL_PASSWORD_RESET', 'student', student.id, { summary: student.student_id });
    return res.json(result);
  } catch (error: any) { return res.status(error.status || 502).json({ error: error.message || 'Could not reset password' }); }
});

router.post('/students/:id/portal-account/password-reveal', refreshCredentialScope, authenticateUser, requireCoachOrAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const student = db.students.get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!canManageStudentCredentials(req.user!, student.id)) return res.status(403).json({ error: 'Forbidden' });
  if (!req.authTime || Date.now() - req.authTime > 5 * 60_000 || req.authTime > Date.now()) {
    return res.status(403).json({ error: 'Sign in again to show the password.' });
  }
  try {
    const result = await managePortalAccount(student.student_id, 'password-reveal', req.user!, { actor_auth_time: String(Math.floor(req.authTime / 1000)) });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    return res.json(result);
  } catch (error: any) { return res.status(error.status || 502).json({ error: error.message || 'Could not show password' }); }
});

router.get('/export/accountant-report.xlsx', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : academyMonth();
    const buffer = await generateAccountantWorkbook(month, typeof req.query.coach_id === 'string' ? req.query.coach_id : undefined, typeof req.query.class_id === 'string' ? req.query.class_id : undefined);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Academy_Accountant_${month}.xlsx"`);
    return res.send(buffer);
  } catch (err: any) { return res.status(500).json({ error: err.message || 'Failed to generate Excel report' }); }
});

router.get('/export/accountant-report.pdf', authenticateUser, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : academyMonth();
    const buffer = await generateAccountantPdf(month, typeof req.query.coach_id === 'string' ? req.query.coach_id : undefined, typeof req.query.class_id === 'string' ? req.query.class_id : undefined);
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="Academy_Accountant_${month}.pdf"`); return res.send(buffer);
  } catch (err: any) { return res.status(500).json({ error: err.message || 'Failed to generate PDF report' }); }
});

router.get('/export/attendance-csv', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { month, coach_id, class_id } = req.query;
  const targetMonth = month ? String(month) : academyMonth();

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let records = Array.from(db.attendance.values()).filter((r) => {
    if (r.status === 'BOOKED') return false;
    const sess = db.sessions.get(r.session_id);
    if (!sess) return false;
    if (!sess.session_date.startsWith(targetMonth)) return false;
    if (coach_id && sess.actual_coach_id !== coach_id && sess.scheduled_coach_id !== coach_id) return false;
    if (class_id && sess.class_id !== class_id) return false;
    return true;
  });

  // Human-readable CSV column order:
  // Date, Day, Start Time, End Time, Class, Class Type, Coach, Student, Attendance Status, Attendance Type, Replacement, Notes
  const headers = [
    'Date',
    'Day',
    'Start Time',
    'End Time',
    'Class',
    'Class Type',
    'Coach',
    'Student',
    'Attendance Status',
    'Attendance Type',
    'Replacement',
    'Notes',
  ];

  const rows = records.map((r) => {
    const sess = db.sessions.get(r.session_id)!;
    const cls = db.classes.get(sess.class_id);
    const coach = db.coaches.get(sess.actual_coach_id);
    const student = db.students.get(r.student_id);
    const dateObj = new Date(sess.session_date);
    const dayName = isNaN(dateObj.getTime()) ? '' : daysOfWeek[dateObj.getDay()];

    const isReplacement = r.attendance_type === 'REPLACEMENT' ? 'YES' : 'NO';
    const notes = r.replacement_note ? `"${r.replacement_note.replace(/"/g, '""')}"` : '""';
    const className = cls?.name ? `"${cls.name.replace(/"/g, '""')}"` : '""';
    const studentName = student?.full_name ? `"${student.full_name.replace(/"/g, '""')}"` : '""';
    const coachName = coach?.name ? `"${coach.name.replace(/"/g, '""')}"` : '""';

    return [
      sess.session_date,
      dayName,
      sess.start_time,
      sess.end_time,
      className,
      cls?.class_type || 'GROUP',
      coachName,
      studentName,
      r.status,
      r.attendance_type,
      isReplacement,
      notes,
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="Chess_Academy_Attendance_${targetMonth}.csv"`);
  return res.send(csvContent);
});

// Dedicated Coach Breakdown
router.get('/coach/breakdown', authenticateUser, requireCoachOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { month } = req.query;
  const targetMonth = month ? String(month) : academyMonth();

  // Determine which coach to inspect
  let coachId = user.coach_id;
  if (user.role === 'ADMIN' && req.query.coach_id) {
    coachId = String(req.query.coach_id);
  }

  if (!coachId) {
    return res.status(400).json({ error: 'No associated coach profile found for this account' });
  }

  const coach = db.coaches.get(coachId);
  if (!coach) {
    return res.status(404).json({ error: 'Coach not found' });
  }

  // Get all sessions taught or scheduled for this coach in this month
  const sessions = Array.from(db.sessions.values()).filter((s) => {
    if (!s.session_date.startsWith(targetMonth) || !attendanceExpectedOn(s.session_date) && !Array.from(db.attendance.values()).some(a => a.session_id === s.id && a.status !== 'BOOKED')) return false;
    return s.actual_coach_id === coachId || s.scheduled_coach_id === coachId || s.default_coach_id === coachId;
  });

  let totalSessions = 0;
  let normalSessions = 0;
  let replacementSessions = 0;
  let cancelledSessions = 0;
  let plannedOffDays = 0;
  let totalPresentStudents = 0;
  let totalAbsentStudents = 0;
  let totalLateStudents = 0;
  let totalReplacementStudents = 0;

  const sessionDetails = sessions.map((s) => {
    const cls = db.classes.get(s.class_id);
    const isReplacementCoach = s.session_type === 'REPLACEMENT_COACH' || (s.replacement_coach_id && s.replacement_coach_id === coachId);
    
    if (s.status === 'COACH_CANCELLED' || s.status === 'CANCELLED') {
      cancelledSessions++;
    } else if (s.status === 'PLANNED_OFF_DAY' || s.status === 'OFF_DAY') {
      plannedOffDays++;
    } else {
      totalSessions++;
      if (isReplacementCoach) replacementSessions++;
      else normalSessions++;
    }

    const attendances = Array.from(db.attendance.values()).filter((a) => a.session_id === s.id);
    const present = attendances.filter((a) => a.status === 'PRESENT').length;
    const absent = attendances.filter((a) => a.status === 'ABSENT').length;
    const late = attendances.filter((a) => a.status === 'LATE').length;
    const repCount = attendances.filter((a) => a.attendance_type === 'REPLACEMENT' && (a.status === 'PRESENT' || a.status === 'LATE')).length;

    totalPresentStudents += present;
    totalAbsentStudents += absent;
    totalLateStudents += late;
    totalReplacementStudents += repCount;

    return {
      session_id: s.id,
      date: s.session_date,
      start_time: s.start_time,
      end_time: s.end_time,
      class_name: cls?.name || 'Class',
      class_type: cls?.class_type || 'GROUP',
      status: s.status,
      session_type: s.session_type,
      is_replacement_coach: isReplacementCoach,
      marked_count: attendances.length,
      present_count: present,
      absent_count: absent,
      late_count: late,
      replacement_students_count: repCount,
    };
  });

  return res.json({
    month: targetMonth,
    coach: {
      id: coach.id,
      name: coach.name,
      email: coach.email,
      color: coach.color,
      color_name: coach.color_name,
    },
    metrics: {
      total_sessions: totalSessions,
      normal_sessions: normalSessions,
      replacement_sessions: replacementSessions,
      cancelled_sessions: cancelledSessions,
      planned_off_days: plannedOffDays,
      total_present_students: totalPresentStudents,
      total_absent_students: totalAbsentStudents,
      total_late_students: totalLateStudents,
      total_replacement_students: totalReplacementStudents,
    },
    sessions: sessionDetails,
  });
});


// ============================================================
// 8. MONTHLY REPORTS & AGGREGATION
// ============================================================

router.get('/reports/monthly', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { month, coach_id, class_id, student_id, class_type } = req.query;

  const targetMonth = month ? String(month) : academyMonth();

  // 1. Get all sessions for this month
  let monthSessions = Array.from(db.sessions.values()).filter((s) =>
    s.session_date.startsWith(targetMonth) && (
      ['COACH_CANCELLED', 'CANCELLED', 'PLANNED_OFF_DAY', 'OFF_DAY'].includes(s.status) ||
      Array.from(db.attendance.values()).some((a) => a.session_id === s.id && a.status !== 'BOOKED'))
  );

  if (coach_id) {
    monthSessions = monthSessions.filter(
      (s) => s.actual_coach_id === coach_id || s.scheduled_coach_id === coach_id
    );
  }

  if (class_id) {
    monthSessions = monthSessions.filter((s) => s.class_id === class_id);
  }

  if (class_type) {
    monthSessions = monthSessions.filter((s) => {
      const cls = db.classes.get(s.class_id);
      return cls?.class_type === class_type;
    });
  }

  // Aggregation by Coach
  const coachReportsMap = new Map<string, MonthlyReportItem>();

  Array.from(db.coaches.values()).forEach((coach) => {
    coachReportsMap.set(coach.id, {
      coach_id: coach.id,
      coach_name: coach.name,
      coach_color: coach.color,
      total_sessions_taught: 0,
      normal_sessions_taught: 0,
      replacement_sessions_taught: 0,
      cancelled_sessions_count: 0,
      planned_off_days_count: 0,
      group_sessions_count: 0,
      individual_sessions_count: 0,
      total_student_attendances: 0,
      total_replacement_students: 0,
      sessions: [],
    });
  });

  monthSessions.forEach((sess) => {
    const defaultCoachId = sess.default_coach_id || sess.scheduled_coach_id;
    const defaultCoach = db.coaches.get(defaultCoachId);
    const defaultCoachReport = defaultCoach ? coachReportsMap.get(defaultCoach.id) : undefined;

    if (sess.status === 'COACH_CANCELLED' || sess.status === 'CANCELLED') {
      if (defaultCoachReport) {
        defaultCoachReport.cancelled_sessions_count += 1;
      }
      return;
    }

    if (sess.status === 'PLANNED_OFF_DAY' || sess.status === 'OFF_DAY') {
      if (defaultCoachReport) {
        defaultCoachReport.planned_off_days_count += 1;
      }
      return;
    }

    // The coach who actually taught this session receives teaching credit
    const actualCoachId = sess.actual_coach_id || defaultCoachId;
    const actualCoach = db.coaches.get(actualCoachId);
    if (!actualCoach) return;

    const reportItem = coachReportsMap.get(actualCoach.id);
    if (!reportItem) return;

    const cls = db.classes.get(sess.class_id);
    const isReplacementCoach = sess.session_type === 'REPLACEMENT_COACH' || (sess.replacement_coach_id && sess.replacement_coach_id !== defaultCoachId);

    const sessionAttendances = Array.from(db.attendance.values()).filter(
      (a) => a.session_id === sess.id
    );
    const presentStudents = sessionAttendances.filter(
      (a) => a.status === 'PRESENT' || a.status === 'LATE'
    ).length;
    const replacementStudents = sessionAttendances.filter(
      (a) => a.attendance_type === 'REPLACEMENT' && (a.status === 'PRESENT' || a.status === 'LATE')
    ).length;

    reportItem.total_sessions_taught += 1;
    if (isReplacementCoach) {
      reportItem.replacement_sessions_taught += 1;
    } else {
      reportItem.normal_sessions_taught += 1;
    }

    if (cls?.class_type === 'INDIVIDUAL') {
      reportItem.individual_sessions_count += 1;
    } else {
      reportItem.group_sessions_count += 1;
    }

    reportItem.total_student_attendances += presentStudents;
    reportItem.total_replacement_students += replacementStudents;

    reportItem.sessions.push({
      session_id: sess.id,
      date: sess.session_date,
      class_name: cls?.name || 'Class',
      class_type: cls?.class_type || 'GROUP',
      is_replacement_coach: isReplacementCoach,
      present_students: presentStudents,
      replacement_students: replacementStudents,
    });
  });

  // Aggregation by Student
  const studentReports: MonthlyStudentReportItem[] = [];
  const studentsList = Array.from(db.students.values());

  studentsList.forEach((stu) => {
    if (student_id && stu.id !== student_id) return;

    const populatedStu = db.getPopulatedStudent(stu.id)!;
    const stuAttendances = Array.from(db.attendance.values()).filter((a) => {
      if (a.student_id !== stu.id || a.status === 'BOOKED') return false;
      const sess = db.sessions.get(a.session_id);
      return sess && sess.session_date.startsWith(targetMonth);
    });

    const attendedCount = stuAttendances.filter(
      (a) => a.status === 'PRESENT' || a.status === 'LATE'
    ).length;
    const absentCount = stuAttendances.filter((a) => a.status === 'ABSENT').length;
    const replacementCount = stuAttendances.filter(
      (a) => a.attendance_type === 'REPLACEMENT'
    ).length;

    const totalScheduled = stuAttendances.length;
    const attendanceRate = totalScheduled > 0 ? Math.round((attendedCount / totalScheduled) * 100) : 100;

    const attendanceDetails = stuAttendances.map((a) => {
      const sess = db.sessions.get(a.session_id);
      const cls = sess ? db.classes.get(sess.class_id) : undefined;
      const coach = sess ? db.coaches.get(sess.actual_coach_id) : undefined;
      return {
        date: sess?.session_date || '',
        class_name: cls?.name || 'Class',
        coach_name: coach?.name || 'Coach',
        status: a.status,
        type: a.attendance_type,
      };
    });

    studentReports.push({
      student_id: stu.id,
      student_code: stu.student_id,
      student_name: stu.full_name,
      school: stu.school,
      parent_name: populatedStu.parent?.name,
      parent_phone: populatedStu.parent?.phone,
      enrolled_classes: (populatedStu.enrolled_schedules || []).map((s) => s.class_name),
      total_scheduled: totalScheduled,
      attended_count: attendedCount,
      absent_count: absentCount,
      replacement_count: replacementCount,
      attendance_rate: attendanceRate,
      attendances: attendanceDetails,
    });
  });

  return res.json({
    month: targetMonth,
    coaches_summary: Array.from(coachReportsMap.values()).filter((c) =>
      coach_id ? c.coach_id === coach_id : true
    ),
    students_summary: studentReports,
  });
});

// Dashboard Quick Stats
const getDashboardStatsHandler = (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentMonth = academyMonth();
    const today = academyToday();

    const sessions = db?.sessions ? Array.from(db.sessions.values()) : [];
    const attendance = db?.attendance ? Array.from(db.attendance.values()) : [];
    const students = db?.students ? Array.from(db.students.values()) : [];
    const coaches = db?.coaches ? Array.from(db.coaches.values()) : [];

    const monthSessions = sessions.filter((s) => s?.session_date && s.session_date.startsWith(currentMonth) && (attendanceExpectedOn(s.session_date) || attendance.some(a => a.session_id === s.id && a.status !== 'BOOKED')));
    const monthAttendances = attendance.filter((a) => {
      const sess = db.sessions.get(a.session_id);
      return sess && sess.session_date && sess.session_date.startsWith(currentMonth) && (a.status === 'PRESENT' || a.status === 'LATE');
    });

    const monthReplacements = attendance.filter((a) => {
      const sess = db.sessions.get(a.session_id);
      return (
        sess &&
        sess.session_date &&
        sess.session_date.startsWith(currentMonth) &&
        a.attendance_type === 'REPLACEMENT' &&
        (a.status === 'PRESENT' || a.status === 'LATE')
      );
    });

    const todaySessions = sessions
      .filter((s) => s?.session_date === today)
      .map((s) => {
        try {
          return db.getPopulatedSession(s.id);
        } catch {
          return s;
        }
      })
      .filter(Boolean);

    return res.json({
      month: currentMonth,
      sessions_this_month: monthSessions.length,
      student_attendances: monthAttendances.length,
      replacement_attendances: monthReplacements.length,
      today_sessions: todaySessions,
      total_active_students: students.filter((s) => s?.status === 'ACTIVE').length,
      total_active_coaches: coaches.filter((c) => c?.is_active).length,
    });
  } catch (err: any) {
    console.error('[Dashboard Stats Error]:', err);
    return res.json({
      month: academyMonth(),
      sessions_this_month: 0,
      student_attendances: 0,
      replacement_attendances: 0,
      today_sessions: [],
      total_active_students: 0,
      total_active_coaches: 0,
    });
  }
};

router.get('/reports/stats', authenticateUser, requireCoachOrAdmin, getDashboardStatsHandler);
router.get('/dashboard/stats', authenticateUser, requireCoachOrAdmin, getDashboardStatsHandler);

// ============================================================
// 9. AUDIT LOGS & NOTIFICATIONS
// ============================================================

router.get('/audit-logs', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  return res.json(db.auditLogs);
});

router.get('/admin/recent-activity', authenticateUser, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const newest = <T extends { created_at: string }>(rows: T[], limit: number) => [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  return res.json({
    students: newest(Array.from(db.students.values()), 10),
    classes: newest(Array.from(db.classes.values()), 10),
    activity: newest(db.activityLogs, 15),
  });
});

router.get('/notifications', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  return res.json(db.notificationLogs);
});

router.get('/notifications/logs', authenticateUser, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  return res.json(db.notificationLogs);
});
