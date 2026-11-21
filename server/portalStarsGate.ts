import type { Student } from '../src/types.js';
import type { PortalStatus } from './studentDeletion.js';

/**
 * Owner rule (2026-11-21): stars are only given to students who already have a
 * Bingo Space account. Coaches note stars for the others and the owner adds the
 * total in Bingo Space after registration, so no award is ever left stuck.
 */
export const STARS_NEED_BINGO_SPACE = 'No Bingo Space account yet. Note the stars and add them after the student registers.';
export const STARS_NEED_OFFICIAL_STUDENT = 'Walk-in student: register them as an official student first. Note the stars and add them after they join Bingo Space.';

type StudentIdentity = Pick<Student, 'student_id' | 'is_unregistered'>;

export function isWalkInStudent(student: StudentIdentity): boolean {
  return Boolean(student.is_unregistered) || /^UNREG-/i.test(student.student_id || '');
}

/** Why stars can't be given, or null when they can. UNKNOWN (Space unreachable) is allowed. */
export function starsBlockedReason(student: StudentIdentity, status: PortalStatus): string | null {
  if (isWalkInStudent(student)) return STARS_NEED_OFFICIAL_STUDENT;
  if (status === 'NOT_REGISTERED') return STARS_NEED_BINGO_SPACE;
  return null;
}
