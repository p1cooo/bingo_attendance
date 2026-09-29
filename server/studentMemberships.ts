import type { StudentClassMembership } from '../src/types.js';
import crypto from 'node:crypto';

export function planStudentMemberships(
  studentId: string,
  selected: string[],
  existing: StudentClassMembership[],
  manageable: Set<string>,
  today: string,
) {
  const desired = new Set(selected);
  const add: StudentClassMembership[] = [];
  const end: StudentClassMembership[] = [];
  for (const membership of existing) {
    if (membership.student_id !== studentId || !manageable.has(membership.schedule_id) || membership.status !== 'ACTIVE') continue;
    if (desired.has(membership.schedule_id)) desired.delete(membership.schedule_id);
    else end.push({ ...membership, status: 'ENDED', ended_date: today });
  }
  for (const scheduleId of desired) {
    if (!manageable.has(scheduleId)) continue;
    add.push({ id: `m-${crypto.randomUUID()}`, student_id: studentId, schedule_id: scheduleId, joined_date: today, status: 'ACTIVE' });
  }
  return { add, end };
}
