import type { AttendanceRecord, ClassType, ReplacementCredit } from '../src/types.js';

export type LegacyAbsenceRepair = 'CREATE_CREDIT' | 'STAMP_IMPACT' | 'NONE' | 'CONFLICT';

/** Only legacy group absences without a recorded impact may be repaired. */
export function legacyAbsenceRepair(
  attendance: AttendanceRecord,
  classType: ClassType,
  credits: ReplacementCredit[],
): LegacyAbsenceRepair {
  if (attendance.attendance_type !== 'REGULAR' || attendance.status !== 'ABSENT' || classType !== 'GROUP') return 'NONE';
  const earned = credits.filter((credit) => credit.amount === 1 && credit.reason === 'GROUP_ABSENCE_CREDIT');
  if (attendance.replacement_credit_impact === 1) return earned.length === 1 ? 'NONE' : 'CONFLICT';
  if (attendance.replacement_credit_impact !== undefined) return 'CONFLICT';
  if (credits.length === 0) return 'CREATE_CREDIT';
  return credits.length === 1 && earned.length === 1 ? 'STAMP_IMPACT' : 'CONFLICT';
}
