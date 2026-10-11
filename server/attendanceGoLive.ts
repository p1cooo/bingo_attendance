/** Electronic roll-call begins on this date; billing has a separate monthly baseline. */
export function configuredAttendanceGoLiveDate(): string | null {
  const value = process.env.ACADEMY_ATTENDANCE_GO_LIVE_DATE?.trim();
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('ACADEMY_ATTENDANCE_GO_LIVE_DATE must be a valid YYYY-MM-DD date.');
  }
  return value;
}

export function attendanceExpectedOn(sessionDate: string): boolean {
  const start = configuredAttendanceGoLiveDate();
  // Preserve legacy behavior when neither rollout boundary is configured.
  // Once October billing is enabled, an unset attendance date keeps roll-call closed.
  return start ? sessionDate >= start : !process.env.ACADEMY_GO_LIVE_DATE;
}
