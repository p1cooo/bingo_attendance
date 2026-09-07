# Bingo Chess — Architecture / Project Context

Keep this file concise. If this document conflicts with the repository, trust the repository and update this file.

## Known infrastructure

- Firebase Authentication is used for account creation/authentication.
- Firestore is the main database.
- The project is deployed on Vercel.
- The server has in-memory state/snapshots in addition to Firestore-backed persistence.

## Important Firebase / Firestore behavior

### Vercel stale snapshot issue

A previous bug occurred because different warm Vercel server instances could serve different stale in-memory Firestore snapshots.

Important rule:
- relevant API requests must refresh from Firestore before responding where required by the existing implementation.
- do not remove this refresh behavior as an "optimization" without understanding the regression it prevents.

### Coach creation ordering

Correct coach creation flow:

1. Create Firebase Auth account.
2. Obtain Firebase UID.
3. Put the Firebase-backed user / coach profile into the in-memory state.
4. Persist/publish the Firestore snapshot.
5. Roll back the in-memory change if persistence fails.

Regression fix:
- commit `5764aff` — `Fix coach account snapshot ordering`
- file changed: `server/routes.ts`

Do not reverse this ordering.

## Conceptual data relationships

Coach
  -> Classes

Student
  -> Enrolment
  -> Class

Important:
- one student may belong to multiple classes.
- do not create duplicate students simply because the same student appears in multiple roster rows.

## Current data-import state

Already completed:
- coaches imported
- students imported
- classes imported

Next step:
- roster dry run
- match roster nicknames/short names to existing full student records
- resolve ambiguous matches
- then create enrolments in one confirmed write pass

## Class rules used for the current imported classes

Only normal GROUP and INDIVIDUAL classes are included.
School/program-only classes are excluded.

Class type:
- GROUP = group class
- INDIVIDUAL = one-to-one class

Capacity:
- GROUP = 12
- INDIVIDUAL = 1

Individual class names:
- use only the student's name
- example: `Ivria`, not `Ivria Individual`

Room/location rules:
- Zhi Qi physical classes -> Kepong Branch
- Wei Yuan Saturday physical group classes -> Kepong Branch
- Yong Zhao physical classes -> YZ Branch
- Jer Shin physical classes -> JS Branch
- other physical classes -> Main Branch
- online classes -> Online

## Current coaches

- Zhi Qi
- Qing Sien
- Yong Zhao
- Jer Shin
- Wei Hao
- Wei Yuan
- Chee Pang
- Jia Yi
