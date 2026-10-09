# Bingo Attendance production hosting and deployment

## Authoritative production target

The canonical production site is `https://attendance.bingochess.space/` on Hostinger VPS. Vercel is deprecated for Bingo Attendance and a Vercel deployment does not update this site.

Verified on 2026-10-09: `attendance.bingochess.space` and `srv880872.hstgr.cloud` both resolved to `31.97.157.195`. Nginx on the VPS terminates HTTPS with a Let's Encrypt certificate and proxies to Node on `127.0.0.1:3001`; HTTP redirects to HTTPS. The checkout is `/var/www/bingo-attendance/app`, and PM2 runs `bingo-attendance` from that directory. PM2 loads `/etc/bingo-attendance.env` before starting `dist/server.cjs`. The live checkout was `ca5711f3a9bbf22b47aa8af22249f9331ce83485` (2026-09-30), so Finance commit `8de3782534946a9f13404dd8cad999859533ea44` was **not live** at this checkpoint. `/api/finance/students` returned the SPA HTML fallback rather than a Finance API response.

The production process uses Firebase project `gen-lang-client-0937442942` and Firestore database `ai-studio-academymanagemen-2caacafd-217e-4741-b292-40c397c4893c`. A read-only Firestore connection using the VPS runtime environment found the required `students`, `classes`, `attendance`, and `users` collections. Never print, commit, or copy the service-account private key into documentation or logs.

## GitHub `main` to Hostinger

`.github/workflows/deploy-production.yml` is triggered by a push to `main` or `workflow_dispatch`, but its deploy job runs only when the repository variable `ATTENDANCE_AUTO_DEPLOY_ENABLED` is `true`. Keep that gate disabled until a release is approved; do not enable automatic deployments permanently without explicit approval. A successful push alone leaves Hostinger unchanged.

An authorized GitHub administrator must configure these repository Actions secrets and verify their presence before a run:

- `VPS_HOST`: the verified Hostinger SSH hostname (`srv880872.hstgr.cloud` at the 2026-10-09 check).
- `VPS_USER`: the authorized SSH user that can access the checkout, PM2, and backup directory. Verify its permissions; do not infer it from the hostname.
- `VPS_SSH_PRIVATE_KEY`: a dedicated deploy private key whose public key is authorized for that user. Enter it directly in GitHub Actions secrets.
- `VPS_SSH_KNOWN_HOSTS`: the VPS host-key line, fingerprint checked through Hostinger or another trusted channel. The workflow enforces strict host-key checking.
- `VPS_PORT`: optional; defaults to 22.

The prior attempted workflow failed before SSH because the four required secret values were empty. This repository cannot prove whether an administrator has since configured them or changed the gate; recheck GitHub's current settings before deploying. Do not put secret values in a commit, issue, chat, or workflow log.

## Approved release procedure

1. Record the intended `main` SHA and the VPS checkout SHA. Review the code diff and any production data-file diff. A deployment must not change tracked `database_state.json` or `backup/database_state.json` without a separate data plan.
2. Confirm the VPS checkout is on `main`, has the expected GitHub remote, and has no code edits or untracked files. The deployment script permits a dirty live `database_state.json` and `backup/database_state.json` only. Verify adequate disk space and backup access before a release.
3. Verify the four required GitHub secrets and the trusted VPS host-key fingerprint. Obtain approval for the exact release and enable `ATTENDANCE_AUTO_DEPLOY_ENABLED` only for the approved run if automatic deployments are not intended.
4. Run the guarded workflow for that SHA. It sends `scripts/deploy-production.sh` over SSH. The script checks the branch, remote, clean code checkout, expected `origin/main`, fast-forward ancestry, and absence of incoming tracked production data changes. Its `--check` mode performs these preflight checks without build or restart; it is not a backup or full release test.
5. The script backs up live `database_state.json` to `/var/backups/bingo-attendance` when present and checks that the backup parses as JSON. It then fast-forwards the checkout, runs `npm ci` and `npm run build`, checks `dist/server.cjs`, and restarts `bingo-attendance` with PM2. It requires both a successful local HTTP response on port 3001 and PM2 `online` status. If fetch, backup, install, or build fails, PM2 is not restarted.
6. Verify the GitHub Actions result and read the deployed SHA from the VPS (`git -C /var/www/bingo-attendance/app rev-parse HEAD`). Check `pm2 list`, `https://attendance.bingochess.space/api/health`, and the public site. An unauthenticated request to `/api/students` should be rejected by Firebase auth (401), not by Firestore (503). With an authorized account, verify login, Students, Classes, Attendance, and Finance when Finance is part of the released SHA. Check PM2 logs privately for Firestore errors. A 200 health response alone is insufficient.
7. Compare the live SHA to the approved SHA and record verification results. Disable the gate again if the approval was for one run. Do not call the release live until the SHA and application checks agree.

## Manual rollback

There is no automatic rollback in the current script. It prints the previous SHA if the post-restart check fails and leaves the data backup on the VPS. Do not reset the production checkout, overwrite live `database_state.json`, or restore a backup merely to roll back code.

For a code regression, an authorized operator should preserve the current live state, identify the last good commit, prepare and review a revert commit on GitHub `main` that leaves tracked production data files untouched, then run the same approved Hostinger deployment procedure and verify the resulting SHA and application. If the app is down or the workflow is unavailable, stop normal releases and have the VPS operator prepare a recovery plan against the saved previous SHA and backups before changing the live checkout. A tested instant rollback path has not been established.

## Vercel dependency audit and decommission hold (2026-10-09)

The old `https://bingo-attendance.vercel.app/` deployment still responds, but it is not the canonical production site. The repository's frontend API client uses relative `/api` URLs, the GitHub production workflow targets Hostinger, and `vercel.json` contains only legacy serverless routing. Vercel-specific serverless files and code comments remain for historical compatibility; they do not control the VPS process. The Attendance source uses Firebase email/password sign-in; no OAuth redirect implementation was found in the reviewed source.

The live Attendance `PORTAL_BRIDGE_URL` points to `https://bingochess.space/`. The live Bingo Space `BINGO_ATTENDANCE_URL` points to `https://attendance.bingochess.space/`. No old Attendance Vercel URL was found in the checked Bingo Space live source; no `vercel.app` reference was found in the checked production env files, Attendance built assets, Nginx configuration, cron directory, or systemd service directory. Attendance DNS points directly to the Hostinger VPS. Local code and runtime checks found no live Vercel URL dependency in the Attendance-to-Bingo-Space bridge.

**Hold Vercel disconnection.** This audit did not have Vercel project administration access to confirm its Git integration/automatic deployment state, and it could not inspect every external service's registered webhook, callback, or Firebase authorized-domain setting. Before disconnecting, an authorized administrator must review those dashboard settings and current Vercel traffic/logs, replace any remaining Vercel URL with the canonical Hostinger URL, and re-verify both applications and the signed bridge. Then disconnect the Vercel Git integration, confirm Hostinger stays healthy, and observe for missed callbacks. Permanently deleting the Vercel project requires separate final confirmation.
