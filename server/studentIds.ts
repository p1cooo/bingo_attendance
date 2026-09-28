/**
 * Bingo Attendance owns STU identifiers.  Count-based allocation is unsafe:
 * imports, inactive profiles, and manually assigned identifiers all make the
 * collection size unrelated to the next free identifier.
 */
export function normaliseStudentCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export function isFormalStudentCode(value: unknown): boolean {
  return /^STU-\d+$/.test(normaliseStudentCode(value));
}

/** Allocate the lowest free formal STU number; gaps are deliberately reusable. */
export function nextUnusedStudentCode(usedCodes: Iterable<string>): string {
  const used = new Set(
    Array.from(usedCodes, normaliseStudentCode)
      .map((code) => /^STU-(\d+)$/.exec(code)?.[1])
      .filter((suffix): suffix is string => Boolean(suffix))
      .map((suffix) => BigInt(suffix).toString())
  );
  let suffix = 1n;
  while (used.has(suffix.toString())) suffix += 1n;
  return `STU-${suffix.toString().padStart(4, '0')}`;
}
