# Bingo Chess — Known Issues / Fragile Areas

## Coach creation snapshot ordering regression
Known fix: commit `5764aff` — `Fix coach account snapshot ordering`.

## Vercel / Firestore stale snapshot issue
Do not remove refresh-before-response behavior without understanding the regression it prevents.

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
