#!/usr/bin/env bash
# End-to-end test of the schedule page against the real scheduling API and a
# PostgreSQL built from packages/database/schemas. Seeds fresh data every run.
#   DATABASE_URL=postgres://... bash scripts/e2e-schedule.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$(mktemp)"
LOG="$(mktemp)"

pnpm --filter @crm/api build >/dev/null
(cd "$ROOT/apps/api" && E2E_STATE_FILE="$STATE" exec node test/e2e/scheduling-e2e-server.cjs >"$LOG" 2>&1) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -f "$STATE"' EXIT

for _ in $(seq 1 60); do
  [ -s "$STATE" ] && break
  kill -0 $SERVER 2>/dev/null || { cat "$LOG"; exit 1; }
  sleep 1
done
[ -s "$STATE" ] || { echo "e2e API did not start"; cat "$LOG"; exit 1; }

API_URL="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).apiUrl)" "$STATE")"
cd "$ROOT/apps/web"
E2E_API_URL="$API_URL" E2E_STATE_FILE="$STATE" npx vitest run "src/app/(dashboard)/schedule/schedule.e2e.test.tsx"
