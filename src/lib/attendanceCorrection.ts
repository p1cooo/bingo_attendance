/**
 * When a coach may change a roll-call mark they already saved (Present <-> Absent).
 * Shared by the server check and the roll-call screen so both use the same rule.
 * Older lessons, or lessons whose stars already reached Bingo Space, go to an admin.
 */

/** Long enough for "I noticed next lesson", short enough to keep past months stable. */
export const COACH_CORRECTION_DAYS = 7;

type CorrectableRecord = { status?: string; portal_sync_status?: string };

export function earliestCoachCorrectionDate(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - COACH_CORRECTION_DAYS);
  return date.toISOString().slice(0, 10);
}

/** Why the coach cannot change this mark, or null when they can. */
export function coachCorrectionBlocker(record: CorrectableRecord | undefined, sessionDate: string, today: string): string | null {
  if (!record || !['PRESENT', 'ABSENT'].includes(record.status || '')) return 'Only a saved Present or Absent mark can be changed.';
  if (record.portal_sync_status === 'SYNCED') return 'Stars for this lesson are already in Bingo Space. Ask an admin to correct it.';
  if (sessionDate > today) return 'Attendance cannot be recorded for future sessions.';
  if (sessionDate < earliestCoachCorrectionDate(today)) {
    return `Coaches can change a mark for up to ${COACH_CORRECTION_DAYS} days. Ask an admin to correct older lessons.`;
  }
  return null;
}
