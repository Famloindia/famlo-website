#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3000}"
PIDS="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN || true)"

if [[ -z "$PIDS" ]]; then
  echo "No listening process found on port $PORT."
  exit 0
fi

echo "Stopping process(es) on port $PORT: $PIDS"
for PID in $PIDS; do
  kill "$PID" 2>/dev/null || true
done

sleep 1

REMAINING="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN || true)"
if [[ -n "$REMAINING" ]]; then
  echo "Force stopping remaining process(es) on port $PORT: $REMAINING"
  for PID in $REMAINING; do
    kill -9 "$PID" 2>/dev/null || true
  done
fi

echo "Port $PORT is clear."
