# Bingo Chess — Known Issues / Data Warnings

## 1. Coach creation regression

Symptom:
`Create the Firebase account before creating the coach profile.`

Known fix:
commit `5764aff` — `Fix coach account snapshot ordering`

Root cause:
the Firebase-backed user/coach profile had to be inserted into in-memory state before Firestore published its snapshot.

Do not redesign this flow unless necessary. For regressions, check git history first.

## 2. Stale Vercel / Firestore snapshots

Different warm Vercel instances previously served different stale in-memory Firestore snapshots.

Do not remove the existing refresh-before-response behavior without validating why it exists.

## 3. Roster names may be nicknames

The roster contains short names / nicknames, while student records in the system may use full legal/full names.

Roster matching rules:
- exact normalized match = safe
- unique nickname/short-name match may be proposed
- if multiple students could match, mark UNRESOLVED
- never guess
- never create a new student during roster import
- never merge student records automatically

## 4. Confirmed roster corrections

Exclude:
- Rakuto
- Jun Xi
- Siddarth

Include:
- Willey is active again in September

Jer Shin:
- K2 Saturday 08:30-10:00 excluded
- K2 Saturday 10:00-11:30 excluded

Tony and Carmen:
- two different students, not one student named "Tony Carmen"

Caleb Saw:
- same student appears in both Wei Hao group class and Chee Pang individual class
- expected result is one student record with multiple enrolments

## 5. School/program classes

Do not include school/program-only classes in the normal roster/class workflow.
Only GROUP and INDIVIDUAL classes are used here.
