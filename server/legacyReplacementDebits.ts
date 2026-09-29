import type { AttendanceRecord, ReplacementCredit } from '../src/types.js';

export type LegacyReplacementDebitRepair = 'CREATE_DEBIT' | 'STAMP_IMPACT' | 'NONE' | 'CONFLICT';

/** Conservative repair for a currently attended replacement with a missing historical debit. */
export function legacyReplacementDebitRepair(
  attendance: AttendanceRecord,
  credits: ReplacementCredit[],
): LegacyReplacementDebitRepair {
  if (attendance.attendance_type !== 'REPLACEMENT' || attendance.status !== 'PRESENT') return 'NONE';
  const impact = attendance.replacement_credit_impact;
  const revision = attendance.replacement_credit_revision;
  if (impact !== undefined && impact !== -1) return 'CONFLICT';
  if (revision !== undefined && revision !== 1) return 'CONFLICT';
  if (credits.length > 1) return 'CONFLICT';
  if (credits.length === 1) {
    const credit = credits[0];
    if (credit.amount !== -1 || credit.student_id !== attendance.student_id ||
        credit.session_id !== attendance.session_id ||
        !['REPLACEMENT_ATTENDED_DEBIT', 'ADVANCE_REPLACEMENT_DEBIT'].includes(credit.reason)) return 'CONFLICT';
    return impact === -1 ? 'NONE' : 'STAMP_IMPACT';
  }
  return 'CREATE_DEBIT';
}
