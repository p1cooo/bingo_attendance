# October 2026 go-live checkpoint (11 October 2026)

**Owner decision, 13 October 2026:** All historical attendance is genuine and must be preserved and included in applicable attendance reports. The reset candidate analysis and deletion sequence below are superseded; no attendance or Finance reset is part of this launch. See `OCTOBER_13_QA.md` for the current release assessment.

This is a preparation record, not authorization to deploy or delete data. Hostinger is the production application host. The production Firestore source was read but never modified.

## Date and billing model

- Finance billing baseline: `ACADEMY_GO_LIVE_DATE=2026-10-01`, to be enabled only with a reconciled production billing state. The code treats October as the first real billing month and does not regenerate older charges.
- Official electronic attendance start: `ACADEMY_ATTENDANCE_GO_LIVE_DATE=YYYY-MM-DD`. The owner has not selected the exact October date. With the Finance baseline enabled, leaving the attendance date unset keeps roll-call closed. Before a configured attendance date, occurrences keep their existing IDs and overrides, but no roll-call write or coach overdue task is allowed. If neither boundary is configured, legacy attendance behavior remains. The date does not mark anyone present or absent.
- Monthly group tuition remains a monthly fee for an active enrollment unless a full-month pause makes that membership RM0 or a partial-month pause has an approved custom amount. The existing policy does not automatically prorate a class starting or ending partway through a month.
- Per-session October lessons before electronic attendance starts have an unknown delivery state. The balance is marked Pending Finance Review and lists the scheduled dates. Known post-start `PRESENT`, `LATE`, and `ABSENT` marks continue to drive per-session charges. Missing pre-start marks never silently waive tuition. Finance needs an approved source or policy to determine the earlier lesson charges.
- `BOOKED` replacement records, trial relationships, absence credits, and Bingo Space awards have independent operational effects; no reset may infer those effects from a missing mark.

## Read-only production inventory

The latest successful read was generated **2026-10-11 15:06 UTC** with local service credentials, project `gen-lang-client-0937442942`, named database `ai-studio-academymanagemen-2caacafd-217e-4741-b292-40c397c4893c`. This verifies that the locally configured service account can read that named database; it does **not** verify the currently deployed Hostinger environment values. Counts changed during this development checkpoint, so they are a dated snapshot, not an execution manifest.

| Collection or measure | Count |
| --- | ---: |
| Attendance documents, all marked | 161 |
| Attendance `PRESENT` / `ABSENT` / `BOOKED` | 128 / 33 / 0 |
| Marked in September / October 2026 | 115 / 46 |
| Isolated regular-mark candidates for later review | 25 |
| Mixed or unresolved attendance rows | 136 |
| Affected students / classes / occurrences | 58 / 20 / 48 |
| Sessions / classes / schedules / memberships | 1,074 / 67 / 67 / 146 |
| Students / coaches / users | 273 / 8 / 10 |
| Replacement credits / advance commitments | 51 / 0 |
| Student pauses / pause locks | 0 / 0 |
| Fee versions / payments / adjustments | 0 / 0 / 0 |
| Audit / activity / notification logs | 168 / 30 / 182 |
| `_academy_state` / `_system` documents | 17 / 1 |

Blocker reason counts overlap: 96 Bingo Space award state, 96 unrecognized attendance fields, 51 replacement-credit links, 33 possible group-absence credits, and 16 non-regular or trial rows. The `portal_transaction_id` field appears on 96 rows. No marked `COMPLETED` sessions were found in this snapshot. Finance has no stored transaction amounts or fee versions in this database, so the read-only Finance transaction candidate count and total are zero; charges and outstanding balances are calculated from fees, memberships, sessions, marks, pauses, and payments rather than stored as separate charge documents. Confirm any other billing source before calling the financial inventory complete.

The 25 isolated marks are **conditional candidates only**. Their IDs are in the restricted local inventory output, not this document. Source classification, external Bingo Space verification, a stable write-frozen manifest, and recovery evidence are still required before any operation. The 136 blocked records stay intact pending record-level decisions. A newer inventory is mandatory immediately before reset approval because the marked count grew from 151 to 161 between two reads.

## Exact reset preservation policy

The approved scope is historical **test** attendance and Finance transaction state only. Preserve every student and ID, account, class, membership, schedule, concrete session ID, date/time override, replacement coach, cancellation, off day, note, pause, standard fee version, booking, replacement or advance credit, Bingo Space account and ledger, audit/activity/security/notification record, and configuration. Preserve `_student_pause_locks` and do not treat the local `database_state.json` as a backup.

The read-only classifier considers a whole attendance document only if it is a regular recognized mark on an existing scheduled occurrence and known class, contains only recognized attendance fields, has no Bingo Space award or transaction state, no credit/commitment/booking/trial link, no Finance-linked student, and is not a group absence with possible legacy credit. No **field-level** deletion is currently approved on a mixed document. In particular, `status`, `marked_at`, stars, portal fields, replacement fields, `student_id`, `session_id`, and the document ID may all be dependencies; do not strip an apparent mark while retaining an award or booking without a verified inverse operation. `BOOKED` is always preserved. Standard `studentFees` are always preserved. Finance payments and adjustments require source classification and a separate evidence-backed test cutoff; `2026-10-01` is a billing boundary, never a test-data deletion cutoff.

No destructive executor is supplied. The current mixed rows have unresolved external award and credit effects, and no verified backup/restore exists. An executor must wait for an approved per-document and per-field manifest. It should default to dry-run, require exact target and precondition hashes, exclude protected IDs, cap transactional batches, journal idempotent progress, refresh `_academy_state` and `_system` cache revision consistently, and verify postconditions before reopening writes. Derived balances should be recalculated only from reconciled retained data and the configured Finance baseline.

## Backup and recovery gate

No full production export, isolated import, or restore comparison was performed. `gcloud` is unavailable in the current development shell and no approved export bucket/reference was available in the local service configuration. A VPS archive or local cache is insufficient.

An authorized operator must first confirm the live Hostinger process's `FIREBASE_PROJECT_ID` and `FIREBASE_DATABASE_ID` without revealing credentials. Provision a restricted Cloud Storage bucket and Firestore export/import IAM access. During a maintenance write freeze, run `gcloud firestore export gs://BUCKET/PREFIX --database=NAMED_DATABASE --project=PROJECT`, wait for completion, retain the operation ID and export metadata, and verify access to the resulting objects. Create an empty isolated database and run `gcloud firestore import gs://BUCKET/PREFIX/ --database=ISOLATED_DATABASE --project=ISOLATED_PROJECT`. Compare collection counts and representative student–membership–schedule–session, attendance–credit, pause–review, award-reference, Finance, audit, and snapshot relationships. Record document counts and hashes in a restricted recovery report. Also preserve Bingo Space and authentication/configuration backups as their own stores. Journal legitimate writes after backup; never overwrite those writes through a blind live import. The detailed sequence is in `ATTENDANCE_RESET_RUNBOOK.md`.

## Remaining release decisions

1. Choose the official October attendance date and announce when coaches may start. Keep the attendance setting unset and attendance writes closed until deployment and reset gates are satisfied.
2. Enter and review the real standard `studentFees` versions for October; the inventoried database currently has none, so the Finance baseline alone cannot produce tuition obligations. Confirm the October charge policy or source of truth for individual/per-session lessons before electronic attendance starts. Do not infer delivery from missing marks or silently waive the fee.
3. Verify the live Hostinger database target and its rollback commit; approve deployment separately.
4. Classify the 136 ambiguous attendance rows, including Bingo Space award and replacement-credit effects; approve exact test Finance scope if new payments appear.
5. Supply and verify a full named-database export and isolated restore, then choose a maintenance window, freeze writes, rerun the read-only inventory, and approve the final reset manifest separately.

The earliest safe launch sequence is: reconcile policy and dependencies; verify Hostinger target and recoverable backup; approve and deploy code; freeze writes; run final dry-run and obtain deletion approval; execute only an independently reviewed reset plan; validate canonical Firestore, caches, Finance, Bingo Space, and reports; set the approved attendance date and open coach writes. No step in this document substitutes for the two owner approvals.
