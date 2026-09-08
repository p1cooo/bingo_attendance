# Bingo Attendance ↔ Bingo Space — Portal Sync Design

## Purpose
Connect Bingo Attendance (coach/admin) with Bingo Space (student portal) while keeping clear ownership of business data.

## Identity bridge
Permanent cross-system key: `attendance_student_id` = Bingo Attendance `STU-xxxx`.

### Existing account linking
1. exact full-name match only for one-time migration
2. exactly one active match -> link
3. active + inactive duplicate -> use active
4. two active matches -> stop and ask user
5. no match -> leave for invitation flow
6. do not create accounts during linking

## New account invitation
For an Attendance student with no Bingo Space account:
- Bingo Attendance requests invite
- Bingo Space creates student-specific token
- registration remains tied to student ID/full name
- student fills allowed profile/login fields
- successful account creation invalidates further use of the invite/student ID
- one student ID must not create multiple accounts

## Attendance award endpoint
Existing endpoint:
`POST /integration/attendance/award`

Payload:
- `event_id`
- `student_id`
- `base_stars`
- `lucky_tshirt_worn`
Optional:
- `coach_name`
- `effective_at`

Keep HMAC verification with `ATTENDANCE_BRIDGE_SECRET`.

## Bonus rules
All bonuses use base stars:
- normal pet -> +10%
- legendary pet -> +50%
- lucky T-shirt -> +50%

Stacking:
- multiple normal pets count once
- multiple legendary pets count once
- normal + legendary can stack
- shirt can also stack
- max multiplier = 2.1

Formula:
`awarded = ceil(base_stars * multiplier)`

## Pet tier design
Current ownership uses `pet_student(student_id, reward_id)`.

Do not recreate pets or ownership rows.

Add explicit tier on relevant reward records:
- `normal`
- `legendary`
- null / not applicable

One-time migration:
- `stars_required <= 300` -> normal
- `stars_required > 300` -> legendary

After migration, price changes must not alter pet bonus tier.

## Idempotency
Attendance star awards remain idempotent by `event_id`.
The same event must never award stars twice.

## Corrections
Current award endpoint cannot modify a previous event.

Desired correction:
- original +200
- corrected intended total +160
- create adjustment -40
- preserve original ledger record
- coach confirms before applying correction

## Attendance display — later phase
`My Progress` should become the student-facing attendance/progress page.
Attendance remains owned by Bingo Attendance.
Bingo Space should live-read attendance rather than duplicate the full attendance ledger.

Potential display:
- session date
- present/absent
- stars earned
- monthly attendance rate
- later monthly fees/payment information

## Current Phase 1 boundary
Implement only:
- identity linking
- pet tier migration
- star bridge completion
- correction/adjustment support

Do not implement attendance UI, fees, or payments in this phase.
