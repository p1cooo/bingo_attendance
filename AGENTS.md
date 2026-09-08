# Bingo Chess — Agent Instructions

Before non-trivial work, read the relevant files in `.harness/`.

Project docs:
- `.harness/ARCHITECTURE.md`
- `.harness/PLAN.md`
- `.harness/KNOWN_ISSUES.md`
- `.harness/PORTAL_SYNC.md`

Project naming:
- Bingo Attendance = `bingo-attendance.vercel.app` (admin/coach system)
- Bingo Space = `bingochess.space` (student portal)

Working rules:
- Prefer the smallest targeted change.
- Inspect existing implementation before editing.
- Do not broadly refactor working code unless explicitly requested.
- Do not delete or recreate existing student, reward, pet, star, or attendance data unless explicitly approved.
- If a data match is ambiguous, stop and ask the user.
- For regressions, check git history before redesigning.
- Run targeted validation first; avoid full test suites unless necessary.
- Do not use browser/computer control unless explicitly requested.
- If `.harness` conflicts with the actual repository, trust the repository and update the docs.

Current Phase 1:
1. link existing Bingo Space students with `attendance_student_id`
2. add/migrate explicit pet tiers
3. complete the attendance-to-stars bridge
4. add safe star correction/adjustment support

Do not expand this phase into attendance UI, fees, or payments unless explicitly requested.
