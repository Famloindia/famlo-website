#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

EXPECTED_PRODUCTION_PROJECT_REF="wokjtntnbkwdsxbkotcr"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/db/supabase-schema-workflow.sh push staging
  bash scripts/db/supabase-schema-workflow.sh push production
  bash scripts/db/supabase-schema-workflow.sh diff staging
  bash scripts/db/supabase-schema-workflow.sh diff production

Required environment variables:
  STAGING_DB_URL
  STAGING_PROJECT_REF
  PRODUCTION_DB_URL
  PRODUCTION_PROJECT_REF

Production-only guardrails:
  PRODUCTION_PROJECT_REF must exactly match the expected production project ref.
  FAMLO_ALLOW_PRODUCTION_SCHEMA_PUSH=true is required for production push.
EOF
}

if [[ $# -ne 2 ]]; then
  usage
  exit 1
fi

ACTION="$1"
TARGET="$2"

if [[ "$ACTION" != "push" && "$ACTION" != "diff" ]]; then
  echo "Unsupported action: $ACTION" >&2
  usage
  exit 1
fi

if [[ "$TARGET" != "staging" && "$TARGET" != "production" ]]; then
  echo "Unsupported target: $TARGET" >&2
  usage
  exit 1
fi

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required." >&2
    exit 1
  fi
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

require_command npx

if [[ "$TARGET" == "staging" ]]; then
  require_env STAGING_DB_URL
  require_env STAGING_PROJECT_REF
  DB_URL="$STAGING_DB_URL"
  PROJECT_REF="$STAGING_PROJECT_REF"
else
  require_env PRODUCTION_DB_URL
  require_env PRODUCTION_PROJECT_REF
  DB_URL="$PRODUCTION_DB_URL"
  PROJECT_REF="$PRODUCTION_PROJECT_REF"

  if [[ "$PROJECT_REF" != "$EXPECTED_PRODUCTION_PROJECT_REF" ]]; then
    echo "Refusing production schema command because PRODUCTION_PROJECT_REF does not match the expected production project ref." >&2
    echo "Expected: $EXPECTED_PRODUCTION_PROJECT_REF" >&2
    echo "Received: $PROJECT_REF" >&2
    exit 1
  fi

  if [[ "$ACTION" == "push" && "${FAMLO_ALLOW_PRODUCTION_SCHEMA_PUSH:-}" != "true" ]]; then
    echo "Refusing production schema push without FAMLO_ALLOW_PRODUCTION_SCHEMA_PUSH=true." >&2
    exit 1
  fi
fi

echo "Supabase schema workflow"
echo "  action: $ACTION"
echo "  target: $TARGET"
echo "  project_ref: $PROJECT_REF"
echo "  schema scope: public"

if [[ "$ACTION" == "push" ]]; then
  npx supabase migration list --db-url "$DB_URL"
  npx supabase db push --db-url "$DB_URL" --include-all --yes
  npx supabase migration list --db-url "$DB_URL"
  exit 0
fi

npx supabase db diff --from migrations --to "$DB_URL" --schema public
