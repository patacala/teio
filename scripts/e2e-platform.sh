#!/usr/bin/env bash
# End-to-end test of the platform (super admin) overview: the real page against
# the real platform API and PostgreSQL. Platform figures span every
# organization, so it runs on a throwaway database built from
# packages/database/schemas (created empty, dropped afterwards). DATABASE_URL
# only needs rights to create databases; its own data is never touched.
#   DATABASE_URL=postgres://... bash scripts/e2e-platform.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$(mktemp)"
LOG="$(mktemp)"
DB="crm_e2e_platform_$$"
E2E_DB_URL="$(node -e 'const u = new URL(process.argv[1]); u.pathname = "/" + process.argv[2]; console.log(u.toString())' "$DATABASE_URL" "$DB")"
SERVER=""

cleanup() {
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true
  psql "$DATABASE_URL" -qc "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true
  rm -f "$STATE" "$LOG"
}
trap cleanup EXIT

psql "$DATABASE_URL" -qc "CREATE DATABASE $DB"
# Same as `pnpm db:migrate`; extensions only Supabase has (pg_cron) fail harmlessly.
for f in "$ROOT"/packages/database/schemas/*.sql; do psql "$E2E_DB_URL" -q -f "$f" >/dev/null 2>&1 || true; done

pnpm --filter @crm/api build >/dev/null
(cd "$ROOT/apps/api" && DATABASE_URL="$E2E_DB_URL" E2E_STATE_FILE="$STATE" exec node test/e2e/platform-e2e-server.cjs >"$LOG" 2>&1) &
SERVER=$!

for _ in $(seq 1 60); do
  [ -s "$STATE" ] && break
  kill -0 $SERVER 2>/dev/null || { cat "$LOG"; exit 1; }
  sleep 1
done
[ -s "$STATE" ] || { echo "e2e API did not start"; cat "$LOG"; exit 1; }

API_URL="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).apiUrl)" "$STATE")"
cd "$ROOT/apps/web"
E2E_API_URL="$API_URL" E2E_STATE_FILE="$STATE" npx vitest run "src/app/(dashboard)/platform/platform.e2e.test.tsx"
