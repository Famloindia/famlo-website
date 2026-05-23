#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/db/prod-cleanup-config.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/db/prod-cleanup-real.sh

Required environment variables:
  PROD_PROJECT_REF
  PROD_DB_PASSWORD

This script mutates production only after you type the exact confirmation:
  CLEAN_PRODUCTION_DATA
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

require_prod_db_env

echo "Production cleanup preflight"
echo "Project ref: ${PROD_PROJECT_REF}"
echo
"$ROOT_DIR/scripts/db/prod-cleanup-dry-run.sh"

existing_targets=()
for table in "${CLEAN_TABLES[@]}"; do
  exists="$(run_prod_psql -At -c "SELECT to_regclass('public.${table}')::text;")"
  if [[ -n "$exists" ]]; then
    existing_targets+=("public.\"${table}\"")
  fi
done

if [[ "${#existing_targets[@]}" -eq 0 ]]; then
  echo
  echo "No reviewed cleanup tables exist in production. Nothing to do."
  exit 0
fi

echo
echo "This will truncate only the reviewed public app/demo tables listed above."
echo "It will not touch Supabase internal schemas, migrations, env vars, or R2 objects."
read -r -p "Type CLEAN_PRODUCTION_DATA to continue: " confirmation
if [[ "$confirmation" != "CLEAN_PRODUCTION_DATA" ]]; then
  echo "Aborted."
  exit 1
fi

table_csv="$(printf '%s, ' "${existing_targets[@]}")"
table_csv="${table_csv%, }"

run_prod_psql -v ON_ERROR_STOP=1 -c "TRUNCATE TABLE ${table_csv} RESTART IDENTITY CASCADE;"

echo
echo "Production cleanup completed for reviewed public app/demo tables."
