// Enable only during a supervised diagnostic run. Never log student data.
export function attendanceTiming(label: string, startedAt: number): void {
  if (process.env.ATTENDANCE_TIMING === '1') {
    console.info(`[AttendanceTiming] ${label}=${Math.round(performance.now() - startedAt)}ms`);
  }
}
