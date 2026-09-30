# Attendance production deployment

Every push to `main` runs `.github/workflows/deploy-production.yml`. The workflow connects to the Hostinger VPS over SSH and runs `scripts/deploy-production.sh` in `/var/www/bingo-attendance/app`.

Set these GitHub Actions repository secrets before enabling the first deployment:

- `VPS_HOST`: the Hostinger VPS hostname.
- `VPS_USER`: the SSH login with access to the app, PM2, and `/var/backups/bingo-attendance`.
- `VPS_PORT`: SSH port (optional; defaults to 22).
- `VPS_SSH_PRIVATE_KEY`: a dedicated deploy private key; never commit it.
- `VPS_SSH_KNOWN_HOSTS`: the verified OpenSSH known-hosts line for the VPS. Verify its fingerprint in Hostinger before saving it. Do not use `StrictHostKeyChecking=no`.

Set the repository variable `ATTENDANCE_AUTO_DEPLOY_ENABLED` to `true` only after these secrets are present and the VPS preflight has passed. Until then, push runs are intentionally skipped. A manual `workflow_dispatch` run from `main` can deploy the first revision after enabling the variable; later pushes deploy automatically.

The script refuses a dirty code checkout, untracked files, a divergent branch, a moved `main`, an unexpected remote, or an incoming change to tracked production data. It allows the live `database_state.json` and `backup/database_state.json` to be dirty, backs up the live state to `/var/backups/bingo-attendance`, and verifies the backup parses as JSON. It then fast-forwards, runs `npm ci` and `npm run build`, checks `dist/server.cjs`, restarts `bingo-attendance` with PM2, and checks both HTTP on port 3001 and PM2 online status.

If fetch, backup, install, or build fails, PM2 is not restarted. A failed post-restart health check fails the workflow and requires manual recovery; the log prints the prior commit SHA and the data backup remains available. Do not reset the production checkout or overwrite `database_state.json` during recovery.

For a completed enhancement, commit only its intended files, push `main`, record the commit SHA, and confirm the matching GitHub Actions run succeeds before reporting it live.
