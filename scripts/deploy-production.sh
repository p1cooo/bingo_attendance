#!/usr/bin/env bash
set -euo pipefail

expected_sha=${1:?Expected commit SHA is required}
[[ $expected_sha =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 1; }
cd /var/www/bingo-attendance/app

test "$(git branch --show-current)" = main || { echo 'Production checkout is not on main' >&2; exit 1; }
test "$(git remote get-url origin)" = 'https://github.com/p1cooo/bingo_attendance.git' || { echo 'Unexpected production remote' >&2; exit 1; }
git diff --quiet HEAD -- . ':(exclude)database_state.json' ':(exclude)backup/database_state.json' || { echo 'Production code has local changes' >&2; exit 1; }
test -z "$(git ls-files --others --exclude-standard)" || { echo 'Production checkout has untracked files' >&2; exit 1; }

git fetch origin main
test "$(git rev-parse origin/main)" = "$expected_sha" || { echo 'origin/main moved; a later run must deploy it' >&2; exit 1; }
git merge-base --is-ancestor HEAD origin/main || { echo 'Production branch diverged from main' >&2; exit 1; }
git diff --quiet HEAD origin/main -- database_state.json backup/database_state.json || { echo 'Incoming commit changes tracked production data' >&2; exit 1; }
if test "${2:-}" = --check; then
  echo "Attendance deployment preflight passed for $expected_sha"
  exit 0
fi

if test -f database_state.json; then
  backup_dir=/var/backups/bingo-attendance
  install -d -m 700 "$backup_dir"
  backup="$backup_dir/database_state.$(date -u +%Y%m%dT%H%M%SZ).json"
  cp -p database_state.json "$backup"
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$backup" || { echo 'Production data backup is incomplete' >&2; exit 1; }
fi

previous_sha=$(git rev-parse HEAD)
git merge --ff-only origin/main
npm ci
npm run build
test -s dist/server.cjs || { echo 'Build did not produce dist/server.cjs' >&2; exit 1; }
pm2 restart bingo-attendance

for attempt in 1 2 3 4 5; do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3001/ > /dev/null; then
    pm2 jlist | node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => { const app = JSON.parse(input).find(item => item.name === "bingo-attendance"); process.exit(app?.pm2_env?.status === "online" ? 0 : 1); });'
    echo "Deployed $(git rev-parse HEAD); previous commit $previous_sha"
    exit 0
  fi
  sleep 2
done
echo "Attendance health check failed after restart; previous commit: $previous_sha" >&2
exit 1
