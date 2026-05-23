#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/db/copy-prod-public-data-to-staging.sh

Required environment variables:
  PROD_DB_PASSWORD
  STAGING_DB_PASSWORD
  PROD_PROJECT_REF
  STAGING_PROJECT_REF

This script:
1. checks prod and staging connectivity
2. computes the shared public base-table set between prod and staging
3. dumps prod public data for only those shared tables
4. sanitizes the dump by removing trigger toggles and sequence setval calls
5. prints current staging counts for key tables
6. asks for confirmation before truncating staging public tables
7. restores the sanitized dump into staging
8. repairs public sequences
9. prints post-restore counts
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

for cmd in psql pg_dump sed awk sort comm mktemp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

: "${PROD_DB_PASSWORD:?PROD_DB_PASSWORD is required}"
: "${STAGING_DB_PASSWORD:?STAGING_DB_PASSWORD is required}"
: "${PROD_PROJECT_REF:?PROD_PROJECT_REF is required}"
: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF is required}"

PROD_DB_HOST="aws-1-ap-south-1.pooler.supabase.com"
PROD_DB_PORT="5432"
PROD_DB_NAME="postgres"
PROD_DB_USER="postgres.${PROD_PROJECT_REF}"

STAGING_DB_HOST="aws-1-ap-northeast-1.pooler.supabase.com"
STAGING_DB_PORT="5432"
STAGING_DB_NAME="postgres"
STAGING_DB_USER="postgres.${STAGING_PROJECT_REF}"

DUMP_RAW="$ROOT_DIR/prod-public-data-for-staging.sql"
DUMP_SAFE="$ROOT_DIR/prod-public-data-for-staging-safe.sql"

IMPORTANT_TABLES=(
  users
  families
  family_photos
  host_onboarding_drafts
  family_applications
  hosts
  bookings
  bookings_v2
  payments_v2
  conversations
  messages
  channel_properties
  channel_room_mappings
  channel_sync_jobs
)

run_prod_psql() {
  PGPASSWORD="$PROD_DB_PASSWORD" psql \
    -X \
    -h "$PROD_DB_HOST" \
    -p "$PROD_DB_PORT" \
    -U "$PROD_DB_USER" \
    -d "$PROD_DB_NAME" \
    "$@"
}

run_staging_psql() {
  PGPASSWORD="$STAGING_DB_PASSWORD" psql \
    -X \
    -h "$STAGING_DB_HOST" \
    -p "$STAGING_DB_PORT" \
    -U "$STAGING_DB_USER" \
    -d "$STAGING_DB_NAME" \
    "$@"
}

print_counts() {
  local label="$1"
  echo
  echo "$label"
  for table in "${IMPORTANT_TABLES[@]}"; do
    local value
    value="$(run_staging_psql -At -c "SELECT CASE WHEN to_regclass('public.${table}') IS NULL THEN 'MISSING' ELSE (SELECT count(*)::text FROM public.\"${table}\") END;")"
    printf '  %-24s %s\n' "${table}" "${value}"
  done
}

repair_public_sequences() {
  run_staging_psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  r RECORD;
  seq_name TEXT;
  max_id BIGINT;
BEGIN
  FOR r IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_default LIKE 'nextval(%'
  LOOP
    seq_name := pg_get_serial_sequence(format('%I.%I', r.table_schema, r.table_name), r.column_name);
    IF seq_name IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT COALESCE(MAX(%I), 0) FROM %I.%I',
      r.column_name,
      r.table_schema,
      r.table_name
    ) INTO max_id;

    IF max_id = 0 THEN
      EXECUTE format('SELECT setval(%L, 1, false)', seq_name);
    ELSE
      EXECUTE format('SELECT setval(%L, %s, true)', seq_name, max_id);
    END IF;
  END LOOP;
END $$;
SQL
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PROD_TABLES_FILE="$TMP_DIR/prod_public_tables.txt"
STAGING_TABLES_FILE="$TMP_DIR/staging_public_tables.txt"
SHARED_TABLES_FILE="$TMP_DIR/shared_public_tables.txt"
PROD_ONLY_TABLES_FILE="$TMP_DIR/prod_only_public_tables.txt"

LIST_PUBLIC_TABLES_SQL=$(cat <<'SQL'
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
ORDER BY tablename;
SQL
)

echo "Checking database connections..."
run_prod_psql -v ON_ERROR_STOP=1 -At -c "SELECT 'prod_ok';" >/dev/null
run_staging_psql -v ON_ERROR_STOP=1 -At -c "SELECT 'staging_ok';" >/dev/null
echo "Prod and staging connections succeeded."

run_prod_psql -At -c "$LIST_PUBLIC_TABLES_SQL" > "$PROD_TABLES_FILE"
run_staging_psql -At -c "$LIST_PUBLIC_TABLES_SQL" > "$STAGING_TABLES_FILE"

comm -12 "$PROD_TABLES_FILE" "$STAGING_TABLES_FILE" > "$SHARED_TABLES_FILE"
comm -23 "$PROD_TABLES_FILE" "$STAGING_TABLES_FILE" > "$PROD_ONLY_TABLES_FILE"

if [[ ! -s "$SHARED_TABLES_FILE" ]]; then
  echo "No shared public tables found between prod and staging. Aborting." >&2
  exit 1
fi

echo
echo "Shared public tables to copy: $(wc -l < "$SHARED_TABLES_FILE" | tr -d ' ')"
if [[ -s "$PROD_ONLY_TABLES_FILE" ]]; then
  echo "Prod-only public tables that will be skipped because staging does not have them yet:"
  sed 's/^/  - /' "$PROD_ONLY_TABLES_FILE"
fi

echo
echo "Creating prod public data dump at:"
echo "  $DUMP_RAW"

PG_DUMP_ARGS=(
  --data-only
  --schema=public
  --no-owner
  --no-privileges
  --quote-all-identifiers
  --exclude-table=public.schema_migrations
  --exclude-table=public.spatial_ref_sys
)

while IFS= read -r table; do
  [[ -n "$table" ]] || continue
  PG_DUMP_ARGS+=(--table="public.${table}")
done < "$SHARED_TABLES_FILE"

PGPASSWORD="$PROD_DB_PASSWORD" pg_dump \
  -h "$PROD_DB_HOST" \
  -p "$PROD_DB_PORT" \
  -U "$PROD_DB_USER" \
  -d "$PROD_DB_NAME" \
  "${PG_DUMP_ARGS[@]}" \
  > "$DUMP_RAW"

sed -E \
  -e '/DISABLE TRIGGER ALL;/d' \
  -e '/ENABLE TRIGGER ALL;/d' \
  -e '/SELECT pg_catalog\.setval\(/d' \
  "$DUMP_RAW" \
  > "$DUMP_SAFE"

if grep -Eq '^(COPY|INSERT INTO) (auth|storage|realtime|vault|supabase_migrations|graphql|extensions|net|pgmq|cron|pgsodium|secrets)\.' "$DUMP_SAFE"; then
  echo "Sanitized dump still contains forbidden internal-schema writes. Aborting." >&2
  exit 1
fi

print_counts "Current staging row counts (dry run)"

echo
echo "About to truncate staging public app tables and restore:"
echo "  $DUMP_SAFE"
read -r -p "Type YES to continue: " reply
if [[ "$reply" != "YES" ]]; then
  echo "Aborted before staging cleanup."
  exit 1
fi

"$ROOT_DIR/scripts/db/truncate-staging-public-app-data.sh" --yes

echo "Restoring sanitized public data into staging..."
run_staging_psql -v ON_ERROR_STOP=1 -f "$DUMP_SAFE"

echo "Repairing public sequences after restore..."
repair_public_sequences

print_counts "Post-restore staging row counts"

echo
echo "Done."
echo "Raw dump:       $DUMP_RAW"
echo "Sanitized dump: $DUMP_SAFE"
