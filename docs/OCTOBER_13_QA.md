# 13 October 2026 release QA checkpoint

**Verdict: NO-GO — critical verification and recovery gates remain.** No production deployment, activation, configuration change, or data mutation was performed. All testing used local fixtures or source inspection.

## Release identity

- Reviewed base: `9c46c6598c49342fcf5c53fc21df7bd311c50a9f` on `release/october-14-preserve-data`.
- The release branch includes occurrence editing (`9258de0`), pause management (`f1c35d2`), October billing and attendance boundaries (`ab0b51c`), report and replacement restrictions (`5294825`), and the requested base commit (`9c46c65`).
- The exact new fix commit is recorded in the final handoff after commit creation. Hostinger's current checkout SHA has **not** been freshly verified. The last documented observation was `ca5711f3a9bbf22b47aa8af22249f9331ce83485` on 9 October; it must not be treated as current.

## Tested locally

- Automated: 74 tests, 70 passed, 0 failed, 4 skipped because the named Firestore emulator was unavailable. TypeScript and production build passed.
- Covered by passing local tests: group and individual attendance validation, paused and unrelated student rejection, occurrence modes and rescheduling persistence logic, fifth-week off-day editor, coach scope, student ID allocation, class enrollment, pause/Finance rules, report aggregation, replacement booking disabled at the server handler, and billing/attendance date separation.
- Historical marks now remain in student totals, monthly reports, coach breakdowns, accountant exports, dashboard counts, and the signed Bingo Space progress feed. Regression fixtures verify that pre-activation marks remain in the data and are counted. This does not establish live production counts.
- New attendance documents use a stable student/occurrence ID. The Firestore transaction checks for an existing pair and rejects stale writes, and retains already synced portal award fields. A concurrency emulator regression is added but remains **unexecuted**.
- Bingo Space source shows an `attendance_event_id` unique database column and a transaction around balance increment and ledger insertion. No isolated Bingo Space runtime or star ledger test was available, so award correctness, retries, and live history remain unverified.

## Browser and mobile status

No Coach, Admin, student management, pause, or mobile journey completed in a browser. The in-app browser could not attach to the local preview. Local loopback HTTP was denied by sandbox socket permissions. `firebase-tools` was absent and npm registry lookup failed (`ENOTFOUND`); Bingo Space's PHP runtime and vendor dependencies were absent. Login, 390px navigation, dialogs, save feedback, refresh persistence, and screenshots are therefore unverified.

## Launch issues

| Severity | Issue | Result / action |
| --- | --- | --- |
| BLOCKER | Genuine historical marks were filtered from applicable reports | Fixed in this release branch and verified with local fixtures. Verify against read-only production counts before launch. |
| BLOCKER | Simultaneous new marks could receive different random document IDs | Stable IDs, transaction pair check, and stale-write rejection added. Execute the skipped emulator concurrency test and browser retry flow before launch. |
| BLOCKER | Authenticated Coach/Admin browser workflows and 390px mobile flows unverified | Provide isolated Firebase Auth/Firestore emulators and a local browser environment with loopback access; complete the journeys in the brief. |
| BLOCKER | Production target, collision inventory, full backup and restore unverified | Confirm the live VPS SHA, project and named database, read-only collision counts for intended sessions, and a recoverable named-database export/import. Preserve Bingo Space and auth backups separately. |
| BLOCKER | October Finance setup and pre-activation individual lessons unresolved | Verify real fee versions and payments read-only, then have Finance approve the earlier lesson source/policy; keep provisional balances until reviewed. |
| IMPORTANT | Bingo Space awards and cross-system retries untested in isolation | Run signed award, duplicate event, wrong-student, failure/retry, and concurrent award tests against isolated portal storage. Preserve the existing ledger. |
| IMPORTANT | Replacement-credit ledger unreconciled | Keep `ACADEMY_REPLACEMENT_BOOKING_ENABLED=false`; later reconcile each genuine entitlement against attendance, bookings, and credits before enabling. Do not reset or bulk import. |

## Production plan after gates pass

Use `ACADEMY_GO_LIVE_DATE=2026-10-01` only with reconciled Finance state; set the separately approved `ACADEMY_ATTENDANCE_GO_LIVE_DATE` for activation. Preserve every historical attendance and legitimate Finance record. Verify the live Hostinger checkout and runtime target, take and restore-test the named Firestore export, verify Bingo Space and auth recovery, and perform a fresh read-only collision scan. Then request separate owner approval for the exact release SHA and deployment. After deployment, verify the VPS SHA, health, authenticated Coach/Admin access, historical reports, restricted replacement booking, and a production-safe smoke test without synthetic attendance or stars. Code rollback uses a reviewed revert on `main` and the guarded Hostinger workflow; never overwrite live data with an old cache or blind import.
