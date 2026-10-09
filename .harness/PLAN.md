# Bingo Chess — Current Plan

## Hosting and release checkpoint (2026-10-09)

- [x] Verify Hostinger as the canonical Attendance host and confirm its VPS, Nginx, PM2, and Firestore configuration.
- [x] Identify the live Hostinger checkout: `ca5711f3a9bbf22b47aa8af22249f9331ce83485`.
- [x] Confirm Finance commit `8de3782534946a9f13404dd8cad999859533ea44` is on GitHub `main` but is **not** deployed to Hostinger.
- [ ] Have an authorized administrator configure and verify the GitHub Actions VPS secrets and review the deployment gate. No deployment is authorized by this documentation task.
- [ ] Review Vercel project Git integration and any external callback/webhook settings, then approve disconnection only after the dependency audit is complete.

The older Phase 1 plan below is historical product planning; it does not identify the current production host or release state.

## Completed
- [x] Coaches imported
- [x] Students imported
- [x] Classes imported
- [x] Roster enrolments completed
- [x] 113 verified enrolments created
- [x] 46 no-portal/unmatched students intentionally skipped

## Current Phase 1 — Portal Linking / Stars Integration

### 1A — Link existing Bingo Space users
Goal: populate the correct Bingo Attendance `STU-xxxx` into `attendance_student_id`.

Rules:
- one active exact-name match -> use it
- one active + inactive duplicate -> use active
- two active matches -> STOP and ask user
- no guessing
- do not create duplicate accounts
- do not silently overwrite conflicting existing IDs

### 1B — Pet tier migration
Add explicit pet tier values:
- `normal`
- `legendary`
- null / not applicable

Migration rule:
- `stars_required <= 300` -> normal
- `stars_required > 300` -> legendary

Do not delete or recreate rewards, pets, redemptions, or ownership links.
After migration, bonus logic must use explicit tier rather than price.

### 1C — Attendance star bridge
Reuse the signed attendance award bridge.

Bonus rules:
- normal pet owned -> +10%
- legendary pet owned -> +50%
- lucky T-shirt -> +50%
- normal and legendary can both count once
- multiple pets in the same tier do not stack
- maximum multiplier = 2.1

### 1D — Star corrections
Current award endpoint is first-award/idempotency only.
Add a safe correction flow:
- preserve original transaction
- create an adjustment transaction for the difference
- example: +200 original, -40 correction, net +160
- coach must confirm before applying correction

## Deferred or not yet live
- Bingo Space `My Progress` attendance UI
- Finance is implemented in GitHub commit `8de3782` but is not yet live on Hostinger.
- payment gateway
- payment reconciliation
