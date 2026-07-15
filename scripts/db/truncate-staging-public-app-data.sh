#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:${PATH}"

usage() {
  cat <<'EOF'
Usage:
  scripts/db/truncate-staging-public-app-data.sh [--yes]

Required environment variables:
  STAGING_DB_PASSWORD
  STAGING_PROJECT_REF

This truncates only base tables in the public schema on staging, with
RESTART IDENTITY CASCADE. It does not touch Supabase internal schemas.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

: "${STAGING_DB_PASSWORD:?STAGING_DB_PASSWORD is required}"
: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF is required}"

STAGING_DB_HOST="aws-1-ap-northeast-1.pooler.supabase.com"
STAGING_DB_PORT="5432"
STAGING_DB_NAME="postgres"
STAGING_DB_USER="postgres.${STAGING_PROJECT_REF}"

run_staging_psql() {
  PGPASSWORD="$STAGING_DB_PASSWORD" psql \
    -X \
    -h "$STAGING_DB_HOST" \
    -p "$STAGING_DB_PORT" \
    -U "$STAGING_DB_USER" \
    -d "$STAGING_DB_NAME" \
    "$@"
}

TABLE_LIST_SQL=$(cat <<'SQL'
WITH public_tables AS (
  SELECT format('%I.%I', schemaname, tablename) AS fqtn
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
)
SELECT COALESCE(string_agg(fqtn, ', ' ORDER BY fqtn), '')
FROM public_tables;
SQL
)

TABLE_LIST="$(run_staging_psql -At -c "$TABLE_LIST_SQL")"

if [[ -z "$TABLE_LIST" ]]; then
  echo "No public base tables found in staging. Nothing to truncate."
  exit 0
fi

if [[ "${1:-}" != "--yes" ]]; then
  echo "About to run:"
  echo "  TRUNCATE TABLE ${TABLE_LIST} RESTART IDENTITY CASCADE;"
  read -r -p "Type YES to continue: " reply
  if [[ "$reply" != "YES" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

run_staging_psql -v ON_ERROR_STOP=1 -c "TRUNCATE TABLE ${TABLE_LIST} RESTART IDENTITY CASCADE;"
echo "Staging public app tables truncated successfully."
