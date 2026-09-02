#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SERVER_PATH="$PROJECT_ROOT/.next/standalone/server.js"
SMOKE_PORT="${STANDALONE_SMOKE_PORT:-3101}"
SMOKE_URL="http://127.0.0.1:$SMOKE_PORT/api/health"
SMOKE_DATABASE_URL='mysql://school:smoke@127.0.0.1:9/school'
SERVER_PID=''

fail() {
  printf 'standalone runtime smoke test failed: %s\n' "$*" >&2
  exit 1
}

for command_name in curl mktemp node rm sleep; do
  command -v "$command_name" >/dev/null 2>&1 || fail "missing command: $command_name"
done

[[ "$SMOKE_PORT" =~ ^[0-9]+$ ]] || fail 'STANDALONE_SMOKE_PORT must be numeric'
(( SMOKE_PORT >= 1024 && SMOKE_PORT <= 65535 )) || fail 'STANDALONE_SMOKE_PORT must be between 1024 and 65535'
[[ -f "$SERVER_PATH" ]] || fail "missing standalone server: $SERVER_PATH"

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/school-standalone-smoke.XXXXXX")"
SERVER_LOG="$TEMP_DIR/server.log"
HEALTH_RESPONSE="$TEMP_DIR/health.json"

cleanup() {
  local exit_code=$?
  trap - EXIT HUP INT TERM
  set +e
  if [[ -n "$SERVER_PID" ]]; then
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      kill "$SERVER_PID" 2>/dev/null || true
    fi
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TEMP_DIR"
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

DATABASE_URL="$SMOKE_DATABASE_URL" \
HOSTNAME=127.0.0.1 \
NODE_ENV=production \
PORT="$SMOKE_PORT" \
node "$SERVER_PATH" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

http_status='000'
for (( attempt = 1; attempt <= 15; attempt += 1 )); do
  http_status="$(curl -sS --max-time 3 --output "$HEALTH_RESPONSE" --write-out '%{http_code}' -- "$SMOKE_URL" 2>/dev/null || true)"
  if [[ "$http_status" == 503 ]]; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ "$http_status" != 503 ]]; then
  printf 'expected HTTP 503 from %s, received %s\n' "$SMOKE_URL" "${http_status:-000}" >&2
  sed -n '1,120p' "$SERVER_LOG" >&2 || true
  fail 'standalone server did not load the health route'
fi

node --input-type=module -e '
  import { readFileSync } from "node:fs";

  const body = JSON.parse(readFileSync(process.argv[1], "utf8"));
  if (body.success !== false || body.error?.code !== "SERVICE_UNAVAILABLE") {
    throw new Error("health route did not return the expected unavailable response");
  }
' "$HEALTH_RESPONSE"

printf '%s\n' 'standalone runtime smoke test passed'
