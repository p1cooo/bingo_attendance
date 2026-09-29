export type RosterCandidate = { id: string; full_name: string; student_id: string; already_in_class: boolean; assigned_elsewhere: boolean };

export const filterRosterCandidates = (students: RosterCandidate[], query: string) => {
  const search = query.trim().toLowerCase();
  return students.filter((student) => !student.already_in_class &&
    (`${student.full_name} ${student.student_id}`).toLowerCase().includes(search));
};

export const toggleRosterStudent = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];

export async function addRosterStudents(students: RosterCandidate[], selectedIds: string[], add: (student: RosterCandidate) => Promise<unknown>) {
  const added: string[] = [];
  let failed = 0;
  for (const student of students.filter((row) => selectedIds.includes(row.id) && !row.already_in_class)) {
    try { await add(student); added.push(student.id); }
    catch { failed++; }
  }
  return { added, failed };
}
