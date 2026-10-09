# Bingo Chess — Agent Instructions

## PRODUCTION HOSTING — AUTHORITATIVE RULE

Bingo Chess Attendance is hosted on Hostinger VPS.

Canonical production URL: `https://attendance.bingochess.space/`

Vercel is deprecated and must not be used as the production deployment target for Bingo Chess Attendance.

All production deployments, runtime debugging, server configuration, health checks, logs, and rollback procedures must target the verified Hostinger VPS.

Never assume that a successful GitHub push, Vercel build, or Vercel deployment means the Hostinger production application has been updated.

A deployment is successful only after the correct commit has been deployed to Hostinger and its live application has passed verification. See `DEPLOYMENT.md`.

Do not disconnect or delete Vercel until the dependency checks in `DEPLOYMENT.md` are complete and the user approves the live change.

Before non-trivial work, read the relevant files in `.harness/`.

Project docs:
- `.harness/ARCHITECTURE.md`
- `.harness/PLAN.md`
- `.harness/KNOWN_ISSUES.md`
- `.harness/PORTAL_SYNC.md`

Project naming:
- Bingo Attendance = `attendance.bingochess.space` (admin/coach system; Hostinger production)
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
- For an approved release, commit only its intended files and push `main`; then verify the Hostinger deployment run, VPS checkout SHA, and live application. Do not describe a push or Vercel build as live.

Current Phase 1:
1. link existing Bingo Space students with `attendance_student_id`
2. add/migrate explicit pet tiers
3. complete the attendance-to-stars bridge
4. add safe star correction/adjustment support

Do not expand this phase into attendance UI, fees, or payments unless explicitly requested.
