#!/usr/bin/env bash
# Full local verification: unit -> API -> UI -> first-run setup. Needs postgres + postgrest (see README).
set -euo pipefail
cd "$(dirname "$0")/.."
export POSTGREST_BIN=${POSTGREST_BIN:-postgrest}

echo "== unit"
node --experimental-strip-types --no-warnings --test tests/unit/*.test.ts 2>&1 | grep -E "^# (pass|fail)"

echo "== build"
tests/local/start.sh > /dev/null
tests/local/app.sh

echo "== api"
source tests/local/env.sh
node --experimental-strip-types --no-warnings --test --test-concurrency=1 tests/e2e/api.test.mjs 2>&1 | grep -E "^(not ok|ok)|^# (pass|fail)"

echo "== ui"
tests/local/start.sh > /dev/null
SKIP_BUILD=1 tests/local/app.sh > /dev/null
node tests/e2e/ui.mjs

echo "== timer expiry"
tests/local/start.sh > /dev/null
SKIP_BUILD=1 tests/local/app.sh > /dev/null
node tests/e2e/timer-expiry.mjs

echo "== first-run setup"
SKIP_SCHEMA=1 tests/local/start.sh > /dev/null
SKIP_BUILD=1 tests/local/app.sh > /dev/null
node tests/e2e/setup-flow.mjs
