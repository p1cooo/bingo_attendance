# Bingo Chess — Known Issues / Fragile Areas

## Coach creation snapshot ordering regression
Known fix: commit `5764aff` — `Fix coach account snapshot ordering`.

## Historical Vercel / Firestore stale snapshot regression
The Vercel serverless path is obsolete production infrastructure. Do not remove refresh-before-response behavior without understanding the regression it prevents; this note does not make Vercel the current host.

## Hostinger release gap (verified 2026-10-09)
The live Hostinger checkout is `ca5711f3a9bbf22b47aa8af22249f9331ce83485`; Finance commit `8de3782534946a9f13404dd8cad999859533ea44` is not deployed there. The previous GitHub Actions attempt failed before SSH because required VPS secrets were empty. Secret presence and the gate's current value require an authorized GitHub administrator to recheck before any release. Vercel remains online; do not retire it until dashboard Git integration and external callback/webhook dependencies are checked.

## Cross-system identity
Runtime integration must use `attendance_student_id`, not names.
If two active Bingo Space accounts match one name, stop and ask user.

## Attendance award corrections
`POST /integration/attendance/award` is idempotent by `event_id` and cannot edit a prior award.
A separate correction/adjustment flow is required.

## Pet bonus currently depends on reward price
This is fragile. Migrate to explicit `pet_tier`.
Do not delete/recreate existing reward or ownership data.

## Reward redemption consistency risk
Existing redemption updates inventory, ownership, balance, and ledger without one enclosing transaction.
Do not refactor this in Phase 1 unless explicitly requested.

## Credentials
Never commit Firebase/service-account keys to Git, `.harness`, source, logs, or documentation.
