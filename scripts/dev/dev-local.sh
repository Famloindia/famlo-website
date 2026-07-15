#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(pwd)"
LOCAL_NEXT_PIDS="$(pgrep -f "$REPO_ROOT/.*/node_modules/.bin/next dev|$REPO_ROOT/node_modules/.bin/next dev|next-server \\(v.*\\).*$REPO_ROOT" 2>/dev/null || true)"

warn_if_file_provider_documents() {
  if [[ "$REPO_ROOT" != "$HOME/Documents" && "$REPO_ROOT" != "$HOME/Documents/"* ]]; then
    return
  fi

  if ! command -v xattr >/dev/null 2>&1; then
    return
  fi

  if xattr -p com.apple.file-provider-domain-id "$HOME/Documents" >/dev/null 2>&1; then
    cat <<'EOF'
CODE RED local dev warning:
This repo is under ~/Documents, and Documents is managed by Apple File Provider/iCloud Drive.
Next dev reads thousands of tiny files from node_modules; File Provider mediation can make startup hang.
Move the repo to a non-synced path such as ~/Developer/famlo-web or ~/Code/famlo-web.

EOF
  fi
}

warn_if_low_disk() {
  local available_kb capacity

  available_kb="$(df -Pk "$REPO_ROOT" | awk 'NR == 2 { print $4 }')"
  capacity="$(df -Pk "$REPO_ROOT" | awk 'NR == 2 { print $5 }')"

  if [[ "$available_kb" =~ ^[0-9]+$ ]] && (( available_kb < 15728640 )); then
    echo "CODE RED local dev warning: only $(( available_kb / 1024 / 1024 ))GiB free on this volume (${capacity} used). Keep 15-20GiB free for Next caches."
    echo
  fi
}

warn_if_file_provider_documents
warn_if_low_disk

if [[ "${FAMLO_DEV_PREFLIGHT_ONLY:-}" == "1" ]]; then
  exit 0
fi

if [[ -n "$LOCAL_NEXT_PIDS" ]]; then
  echo "Stopping existing repo-local Next dev process(es): $LOCAL_NEXT_PIDS"
  for PID in $LOCAL_NEXT_PIDS; do
    kill "$PID" 2>/dev/null || true
  done
  sleep 1
fi

bash scripts/dev/port-kill.sh 3000

echo "Removing stale Webpack pack cache..."
rm -rf .next/dev/cache/webpack

echo "Starting Next dev on port 3000 with Webpack..."
export NEXT_TELEMETRY_DISABLED=1
unset NODE_OPTIONS
exec ./node_modules/.bin/next dev --webpack --port 3000 --disable-source-maps
