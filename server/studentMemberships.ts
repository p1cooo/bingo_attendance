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

const dayBefore = (date: string) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const inClass = (m: StudentClassMembership, scheduleId: string, classId: string) => m.schedule_id === scheduleId || m.schedule_id === classId;
/** A membership that is (or will be) on rosters on or after `date`. Legacy ENDED rows without a date are treated as over. */
const inEffectFrom = (m: StudentClassMembership, date: string) => !(m.status === 'ENDED' && !m.ended_date) && (!m.ended_date || m.ended_date >= date);

/**
 * Dated recurring-class enrolment. The student appears on rosters from
 * `effectiveDate` onward; earlier occurrences are untouched.
 */
export function planMembershipAdd(input: {
  studentIds: string[]; scheduleId: string; classId: string; effectiveDate: string;
  memberships: Iterable<StudentClassMembership>;
}) {
  const all = [...input.memberships];
  const add: StudentClassMembership[] = [];
  const alreadyInClass: string[] = [];
  const otherClasses: Array<{ student_id: string; schedule_ids: string[] }> = [];
  for (const studentId of [...new Set(input.studentIds)]) {
    const own = all.filter(m => m.student_id === studentId && inEffectFrom(m, input.effectiveDate));
    if (own.some(m => inClass(m, input.scheduleId, input.classId))) { alreadyInClass.push(studentId); continue; }
    const others = own.filter(m => !inClass(m, input.scheduleId, input.classId)).map(m => m.schedule_id);
    if (others.length) otherClasses.push({ student_id: studentId, schedule_ids: others });
    add.push({ id: `m-${crypto.randomUUID()}`, student_id: studentId, schedule_id: input.scheduleId, joined_date: input.effectiveDate, status: 'ACTIVE' });
  }
  return { add, alreadyInClass, otherClasses };
}

/**
 * Ends one student's membership in one recurring class. `effectiveDate` is the
 * first date the student is no longer on the roster, so the stored (inclusive)
 * `ended_date` is the day before. Attendance, credits and Finance records are
 * not touched.
 */
export function planMembershipEnd(input: {
  studentId: string; scheduleId: string; classId: string; effectiveDate: string;
  memberships: Iterable<StudentClassMembership>;
}) {
  const endedDate = dayBefore(input.effectiveDate);
  return [...input.memberships]
    .filter(m => m.student_id === input.studentId && inClass(m, input.scheduleId, input.classId) && inEffectFrom(m, input.effectiveDate))
    .map(m => ({ ...m, status: 'ENDED' as const, ended_date: endedDate, removal_effective_date: input.effectiveDate }));
}
