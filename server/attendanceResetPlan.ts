/** Pure, read-only classification. This module has no Firestore write path. */
export type ResetDocument = Record<string, unknown> & { id: string };

const attendanceOnlyFields = new Set([
  'id', 'session_id', 'student_id', 'status', 'attendance_type', 'replacement_note',
  'marked_at', 'marked_by_user_id', 'marked_by_user_name', 'notification_status',
  'base_stars', 'lucky_tshirt_worn', 'portal_sync_status', 'portal_sync_message',
  'replacement_credit_impact', 'replacement_credit_revision',
]);
const markedStatuses = new Set(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);

export interface AttendanceResetPlan {
  candidateIds: string[];
  bookedIds: string[];
  blockers: Array<{ id: string; reasons: string[] }>;
  affectedStudentIds: string[];
  affectedSessionIds: string[];
  affectedClassIds: string[];
}

export function planAttendanceMarkReset(input: {
  attendance: ResetDocument[];
  sessions: ResetDocument[];
  classes: ResetDocument[];
  replacementCredits: ResetDocument[];
  replacementAdvanceCommitments: ResetDocument[];
  studentFees: ResetDocument[];
  studentPayments: ResetDocument[];
  studentAdjustments: ResetDocument[];
  auditLogs?: ResetDocument[];
  notificationLogs?: ResetDocument[];
}): AttendanceResetPlan {
  const sessions = new Map(input.sessions.map((session) => [session.id, session]));
  const classById = new Map(input.classes.map((cls) => [cls.id, cls]));
  const creditAttendanceIds = new Set(input.replacementCredits.map((credit) => credit.attendance_id));
  const commitmentAttendanceIds = new Set(input.replacementAdvanceCommitments.map((commitment) => commitment.replacement_attendance_id));
  const financeStudentIds = new Set([...input.studentFees, ...input.studentPayments, ...input.studentAdjustments]
    .map((item) => item.student_id));
  const candidateIds: string[] = [];
  const bookedIds: string[] = [];
  const blockers: AttendanceResetPlan['blockers'] = [];
  const students = new Set<string>();
  const occurrences = new Set<string>();
  const classes = new Set<string>();
  const seen = new Set<string>();

  for (const row of input.attendance) {
    const reasons: string[] = [];
    if (seen.has(row.id)) reasons.push('duplicate attendance ID');
    seen.add(row.id);
    if (row.status === 'BOOKED') {
      bookedIds.push(row.id);
      if (reasons.length) blockers.push({ id: row.id, reasons });
      continue;
    }
    if (!markedStatuses.has(String(row.status))) reasons.push('unrecognized attendance status');
    if (row.attendance_type !== 'REGULAR') reasons.push('non-regular or trial attendance');
    if (typeof row.student_id !== 'string' || typeof row.session_id !== 'string') reasons.push('missing student or session identity');
    const session = sessions.get(String(row.session_id));
    if (!session) reasons.push('occurrence is missing');
    else if (session.status !== 'SCHEDULED') reasons.push('occurrence status requires review');
    const cls = session ? classById.get(String(session.class_id)) : undefined;
    if (session && !cls) reasons.push('class is missing');
    if (row.status === 'ABSENT' && cls?.class_type === 'GROUP') reasons.push('possible group absence credit');
    if (row.portal_sync_status && !['DISABLED', 'NOT_LINKED'].includes(String(row.portal_sync_status)) ||
        row.portal_transaction_id || row.portal_awarded_stars || row.portal_multiplier) reasons.push('Bingo Space award state');
    if (row.replacement_credit_impact && row.replacement_credit_impact !== 0 ||
        creditAttendanceIds.has(row.id) || input.replacementCredits.some((credit) =>
          credit.student_id === row.student_id && credit.session_id === row.session_id)) reasons.push('replacement credit ledger link');
    if (row.replacement_advance_commitment_id || commitmentAttendanceIds.has(row.id)) reasons.push('advance replacement commitment link');
    if (row.trial_request_key) reasons.push('trial registration link');
    if (financeStudentIds.has(row.student_id)) reasons.push('student has Finance history');
    if (Object.keys(row).some((key) => !attendanceOnlyFields.has(key))) reasons.push('unrecognized attendance document fields');
    if (reasons.length) {
      blockers.push({ id: row.id, reasons });
      continue;
    }
    candidateIds.push(row.id);
    students.add(String(row.student_id));
    occurrences.add(String(row.session_id));
    if (session && typeof session.class_id === 'string') classes.add(session.class_id);
  }
  return { candidateIds, bookedIds, blockers, affectedStudentIds: [...students],
    affectedSessionIds: [...occurrences], affectedClassIds: [...classes] };
}
