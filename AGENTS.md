# Bingo Chess — Codex Instructions

Before non-trivial work, read the relevant files in `.harness/`.

Project docs:
- `.harness/ARCHITECTURE.md` — known architecture and important system behavior
- `.harness/PLAN.md` — current project state and next work
- `.harness/KNOWN_ISSUES.md` — regressions, fragile areas, and data warnings

## Working rules

- Prefer the smallest targeted change that solves the task.
- Inspect the existing implementation before editing it.
- Do not broadly refactor working code unless explicitly requested.
- Do not change Firestore schema unless the task requires it.
- Do not delete Firestore/Auth records automatically unless explicitly approved.
- For regressions, check git history / previous working code before redesigning.
- Run targeted tests/checks first; avoid the full test suite unless needed.
- Preserve working UI/UX and existing behavior outside the requested change.
- If `.harness` conflicts with the actual repository, trust the repository and update the docs.
- Never guess unknown architecture details; mark them as needing confirmation.

## Data-import rule

For coach/class/student migration work, use prepared CSV/import data as the source of truth.
Do not spend agent time re-cleaning already-prepared import files unless validation reveals a real problem.

Preferred order:
1. Coaches
2. Classes / schedules
3. Students
4. Roster / enrolments

Roster import should create relationships, not duplicate students.
A single student may belong to multiple classes.
