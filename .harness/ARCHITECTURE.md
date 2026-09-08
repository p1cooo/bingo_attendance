# Bingo Chess — Architecture

## System ownership

### Bingo Attendance
Source of truth for:
- students and official `STU-` IDs
- coaches
- classes/schedules
- enrolments
- attendance
- base stars entered by coaches
- lucky T-shirt status per attendance event

### Bingo Space
Source of truth for:
- student portal login/account
- student profile data
- star balance
- star transaction ledger
- rewards
- redemptions
- pet ownership
- marketplace

## Bingo Space backend
- Laravel 12
- Eloquent
- MariaDB/MySQL
- UUID primary IDs
- student login uses `users.username` + hashed `users.password`
- Laravel session `student` guard
- inactive student profiles cannot log in

Relevant structures:
- `students`
- `users`
- `stars_transactions`
- `rewards`
- `redemptions`
- `pet_student`

## Cross-system identity
Use `students.attendance_student_id` as the immutable cross-system key.
It stores the Bingo Attendance `STU-xxxx` code.

Names may be used only for the one-time linking migration, not normal runtime sync.

## Existing integration bridge
Bingo Space already has:
- `POST /integration/attendance/award`
- `POST /integration/attendance/coach-assignment`
- `POST /integration/attendance/invite`

The attendance award bridge is HMAC signed using `ATTENDANCE_BRIDGE_SECRET`.

## Star ownership
Bingo Space remains source of truth for star balance.

Flow:
Bingo Attendance -> signed award request -> Bingo Space resolves by `attendance_student_id` -> calculates bonuses -> updates `students.stars` -> writes `stars_transactions`.

## Attendance ownership
Attendance remains owned by Bingo Attendance.
Bingo Space should later live-read attendance for display rather than maintain an independently editable duplicate ledger.

## New-account invitations
Bingo Space already supports Attendance-driven invitation registration.
The invite must be tied to one attendance student ID and must no longer be usable once that student account exists.
