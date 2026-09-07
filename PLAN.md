# Bingo Chess — Current Plan

## Completed

- [x] Coaches added
- [x] Students added
- [x] Classes added

## Current task: roster / enrolments

### Phase 1 — dry run only

- [ ] Read existing students from the system
- [ ] Read existing classes from the system
- [ ] Match each roster row to an existing class
- [ ] Match roster nickname / short name to existing full student record
- [ ] Mark ambiguous student matches as UNRESOLVED
- [ ] Report duplicate enrolments that already exist
- [ ] Produce a concise match report
- [ ] Do NOT create enrolments yet

### Phase 2 — confirmed write

Only after the user confirms the dry-run mappings:

- [ ] Create enrolments using confirmed student IDs and class IDs
- [ ] Do not recreate coaches, students, or classes
- [ ] Do not create duplicate enrolments
- [ ] Allow one student to have multiple enrolments
- [ ] Skip anything still unresolved
- [ ] Report created / already-existing / skipped counts
- [ ] Run targeted validation only

## Efficiency rules

For roster work:
- use the prepared final roster and class CSV files
- do not re-clean the original raw timetable data
- do not broadly scan/refactor unrelated parts of the repository
- do not use browser/computer control unless explicitly requested
- prefer existing import/enrolment utilities if they already exist
