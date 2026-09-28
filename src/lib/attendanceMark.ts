import { AttendanceRecord, ClassSession } from '../types.js';

export function withAttendanceRecord<T extends ClassSession>(session: T, studentId: string, record?: AttendanceRecord): T {
  return {
    ...session,
    attendance_records: [
      ...(session.attendance_records || []).filter((item) => item.student_id !== studentId),
      ...(record ? [record] : []),
    ],
  };
}

/** The lock is taken before React renders, so a rapid second click cannot send another request. */
export async function runAttendanceMark<T>(
  pending: Set<string>,
  studentId: string,
  actions: { optimistic: () => void; save: () => Promise<T>; commit: (value: T) => void; rollback: () => void },
): Promise<boolean> {
  if (pending.has(studentId)) return false;
  pending.add(studentId);
  try {
    actions.optimistic();
    actions.commit(await actions.save());
    return true;
  } catch (error) {
    actions.rollback();
    throw error;
  } finally {
    pending.delete(studentId);
  }
}
