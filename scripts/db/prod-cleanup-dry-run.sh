#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source "$ROOT_DIR/scripts/db/prod-cleanup-config.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/db/prod-cleanup-dry-run.sh

Required environment variables:
  FAMLO_ALLOW_PRODUCTION_DB_OPERATION=I_UNDERSTAND
  PROD_PROJECT_REF
  PROD_DB_PASSWORD
  PROD_DB_HOST
  PROD_DB_PORT
  PROD_DB_NAME

This script is read-only. It prints counts for reviewed public app tables
that would be cleared by the production cleanup workflow, and lists the
reference/config tables that are intentionally preserved.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

require_prod_db_env
print_production_sensitive_banner

echo "Production cleanup dry-run"
echo "Project ref: ${PROD_PROJECT_REF}"
echo

total_rows=0
existing_tables=0

for table in "${CLEAN_TABLES[@]}"; do
  exists="$(run_prod_psql -At -c "SELECT to_regclass('public.${table}')::text;")"
  if [[ -z "$exists" ]]; then
    printf '  %-34s %s\n' "$table" "MISSING"
    continue
  fi

  count="$(run_prod_psql -At -c "SELECT count(*)::text FROM public.\"${table}\";")"
  printf '  %-34s %s\n' "$table" "$count"
  total_rows=$((total_rows + count))
  existing_tables=$((existing_tables + 1))
done

echo
echo "Summary"
echo "  Existing cleanup tables: $existing_tables"
echo "  Total rows across existing cleanup tables: $total_rows"

echo
echo "Preserved reference/config tables"
for table in "${PRESERVE_TABLES[@]}"; do
  exists="$(run_prod_psql -At -c "SELECT to_regclass('public.${table}')::text;")"
  if [[ -z "$exists" ]]; then
    printf '  %-34s %s\n' "$table" "MISSING"
  else
    count="$(run_prod_psql -At -c "SELECT count(*)::text FROM public.\"${table}\";")"
    printf '  %-34s %s\n' "$table" "$count"
  fi
done

echo
echo "Dry-run only. No production data was changed."
