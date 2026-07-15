#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(pwd)"
LOCAL_NEXT_PIDS="$(pgrep -f "$REPO_ROOT/.*/node_modules/.bin/next dev|$REPO_ROOT/node_modules/.bin/next dev|next-server \\(v.*\\).*$REPO_ROOT" || true)"

if [[ -n "$LOCAL_NEXT_PIDS" ]]; then
  echo "Stopping existing repo-local Next dev process(es): $LOCAL_NEXT_PIDS"
  for PID in $LOCAL_NEXT_PIDS; do
    kill "$PID" 2>/dev/null || true
  done
  sleep 1
fi

echo "Removing .next cache..."
rm -rf .next

echo "Starting Next dev on port 3000 with Webpack..."
export NEXT_TELEMETRY_DISABLED=1
exec ./node_modules/.bin/next dev --webpack --port 3000 --disable-source-maps
