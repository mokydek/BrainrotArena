#!/usr/bin/env bash
# (Re)build and start the app against the local stack, with social-network fetch mocked.
set -euo pipefail
cd "$(dirname "$0")/../.."
source tests/local/env.sh
pkill -f "next-server" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
sleep 1
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  NEXT_TELEMETRY_DISABLED=1 npx next build > /tmp/build.log 2>&1 || { tail -30 /tmp/build.log; exit 1; }
fi
NODE_OPTIONS="--import $PWD/tests/local/fetch-mock.mjs" NEXT_TELEMETRY_DISABLED=1 nohup npx next start -p 3000 > /tmp/next.log 2>&1 &
for i in $(seq 1 60); do
  curl -fsS -o /dev/null http://localhost:3000/api/health && { echo "app ready"; exit 0; }
  sleep 0.5
done
tail -20 /tmp/next.log; exit 1
