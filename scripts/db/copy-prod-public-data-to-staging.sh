#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:${PATH}"

usage() {
  cat <<'EOF'
Usage:
  scripts/db/copy-prod-public-data-to-staging.sh

Required environment variables:
  FAMLO_ALLOW_PRODUCTION_DB_OPERATION=I_UNDERSTAND
  PROD_DB_PASSWORD
  STAGING_DB_PASSWORD
  PROD_PROJECT_REF
  STAGING_PROJECT_REF
  PROD_DB_HOST
  PROD_DB_PORT
  PROD_DB_NAME
  STAGING_DB_HOST
  STAGING_DB_PORT
  STAGING_DB_NAME

This script:
1. checks prod and staging connectivity
2. computes the shared public base-table set between prod and staging
3. computes the shared column intersection for each shared table
4. exports prod public data using only shared columns
5. prints current staging counts for key tables
6. asks for confirmation before truncating staging public tables
7. restores the filtered data into staging
8. repairs public sequences
9. prints post-restore counts

Execution notes:
- defaults to dry-run mode
- requires DRY_RUN=false and FAMLO_ALLOW_STAGING_RESTORE=I_UNDERSTAND to mutate staging
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
DRY_RUN="${DRY_RUN:-true}"

for cmd in psql sed awk sort comm mktemp "$PYTHON_BIN"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

: "${FAMLO_ALLOW_PRODUCTION_DB_OPERATION:?FAMLO_ALLOW_PRODUCTION_DB_OPERATION is required}"
: "${PROD_DB_PASSWORD:?PROD_DB_PASSWORD is required}"
: "${STAGING_DB_PASSWORD:?STAGING_DB_PASSWORD is required}"
: "${PROD_PROJECT_REF:?PROD_PROJECT_REF is required}"
: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF is required}"
: "${PROD_DB_HOST:?PROD_DB_HOST is required}"
: "${PROD_DB_PORT:?PROD_DB_PORT is required}"
: "${PROD_DB_NAME:?PROD_DB_NAME is required}"
: "${STAGING_DB_HOST:?STAGING_DB_HOST is required}"
: "${STAGING_DB_PORT:?STAGING_DB_PORT is required}"
: "${STAGING_DB_NAME:?STAGING_DB_NAME is required}"

if [[ "$FAMLO_ALLOW_PRODUCTION_DB_OPERATION" != "I_UNDERSTAND" ]]; then
  echo "Refusing to continue. Set FAMLO_ALLOW_PRODUCTION_DB_OPERATION=I_UNDERSTAND." >&2
  exit 1
fi

PROD_DB_USER="postgres.${PROD_PROJECT_REF}"

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
    local exists
    local value
    exists="$(run_staging_psql -At -c "SELECT to_regclass('public.${table}')::text;")"
    if [[ -z "$exists" ]]; then
      value="MISSING"
    else
      value="$(run_staging_psql -At -c "SELECT count(*)::text FROM public.\"${table}\";")"
    fi
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

sql_ident_list_from_file() {
  local file="$1"
  awk '
    BEGIN { first = 1 }
    NF {
      gsub(/"/, "\"\"", $0)
      if (!first) printf(", ")
      printf("\"%s\"", $0)
      first = 0
    }
  ' "$file"
}

csv_list_from_file() {
  local file="$1"
  awk '
    BEGIN { first = 1 }
    NF {
      if (!first) printf(", ")
      printf("%s", $0)
      first = 0
    }
  ' "$file"
}

build_export_select_for_table() {
  local table="$1"
  local shared_cols_file="$2"
  local prod_meta_file="$3"
  local staging_meta_file="$4"
  local fk_meta_file="$5"
  local restorable_cols_file="$6"
  local select_exprs_file="$7"
  local normalized_cols_file="$8"
  local unresolved_not_null_file="$9"
  local skipped_mismatch_cols_file="${10}"

  "$PYTHON_BIN" - "$table" "$shared_cols_file" "$prod_meta_file" "$staging_meta_file" "$fk_meta_file" "$restorable_cols_file" "$select_exprs_file" "$normalized_cols_file" "$unresolved_not_null_file" "$skipped_mismatch_cols_file" <<'PY'
import re
import sys

(
    table_name,
    shared_cols_path,
    prod_meta_path,
    staging_meta_path,
    fk_meta_path,
    restorable_cols_path,
    select_exprs_path,
    normalized_cols_path,
    unresolved_not_null_path,
    skipped_mismatch_cols_path,
) = sys.argv[1:11]

shared_cols = [line.strip() for line in open(shared_cols_path, "r", encoding="utf-8") if line.strip()]
prod_meta = {}
staging_meta = {}

def load_meta(path):
    result = {}
    for raw_line in open(path, "r", encoding="utf-8"):
        line = raw_line.rstrip("\n")
        if not line:
            continue
        parts = line.split("\t")
        while len(parts) < 5:
            parts.append("")
        column_name, data_type, udt_name, is_nullable, column_default = parts[:5]
        result[column_name] = {
            "data_type": data_type,
            "udt_name": udt_name,
            "is_nullable": is_nullable,
            "column_default": column_default,
        }
    return result

prod_meta = load_meta(prod_meta_path)
staging_meta = load_meta(staging_meta_path)
fk_meta = {}

for raw_line in open(fk_meta_path, "r", encoding="utf-8"):
    line = raw_line.rstrip("\n")
    if not line:
        continue
    child_col, parent_table, parent_col = line.split("\t")
    fk_meta[child_col] = {
        "parent_table": parent_table,
        "parent_col": parent_col,
    }

def qident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'

def sql_type(meta):
    data_type = meta["data_type"]
    udt_name = meta["udt_name"]
    if data_type == "ARRAY":
        element = udt_name[1:] if udt_name.startswith("_") else udt_name
        mapping = {
            "text": "text[]",
            "varchar": "character varying[]",
            "bpchar": "character[]",
            "uuid": "uuid[]",
            "int2": "smallint[]",
            "int4": "integer[]",
            "int8": "bigint[]",
            "float4": "real[]",
            "float8": "double precision[]",
            "numeric": "numeric[]",
            "bool": "boolean[]",
            "json": "json[]",
            "jsonb": "jsonb[]",
        }
        return mapping.get(element, "text[]")
    if data_type == "USER-DEFINED":
        return udt_name
    return data_type

def same_type(prod, staging):
    return prod["data_type"] == staging["data_type"] and prod["udt_name"] == staging["udt_name"]

def fallback_expr(column_name: str, meta: dict):
    data_type = meta["data_type"]
    udt_name = meta["udt_name"]
    column_default = meta["column_default"]
    target_type = sql_type(meta)
    name = column_name.lower()
    default = column_default.strip()
    if default and not default.startswith("nextval("):
        return default

    if data_type in {"uuid"} or udt_name == "uuid":
        if name == "id":
            return "gen_random_uuid()"
        return None

    if data_type in {"text", "character varying", "character", "citext"} or udt_name == "citext":
        return f"''::{target_type}"

    if data_type in {"boolean"}:
        return "false"

    if data_type in {"smallint", "integer", "bigint", "numeric", "double precision", "real", "decimal"}:
        return f"0::{target_type}"

    if data_type == "jsonb":
        return "'{}'::jsonb"

    if data_type == "json":
        return "'{}'::json"

    if data_type == "ARRAY" or udt_name.startswith("_"):
        return f"'{{}}'::{target_type}"

    if data_type in {"timestamp with time zone", "timestamp without time zone"}:
        if re.search(r"(created_at|updated_at|inserted_at|modified_at|occurred_at|last_message_at)$", name):
            return "now()"
        return None

    if data_type == "date":
        if re.search(r"(created_on|updated_on|effective_date|start_date|end_date)$", name):
            return "CURRENT_DATE"
        return None

    return None

restorable_cols = []
select_exprs = []
normalized = []
unresolved = []
skipped_mismatch = []

for column_name in shared_cols:
    prod_column_meta = prod_meta.get(column_name)
    staging_column_meta = staging_meta.get(column_name)
    if prod_column_meta is None or staging_column_meta is None:
        continue

    quoted = qident(column_name)
    target_type = sql_type(staging_column_meta)
    source_expr = f"{quoted}::{target_type}" if same_type(prod_column_meta, staging_column_meta) else None
    is_nullable = staging_column_meta["is_nullable"]
    fk = fk_meta.get(column_name)

    if source_expr is None:
        if is_nullable == "NO":
            fallback = fallback_expr(column_name, staging_column_meta)
            if fallback:
                restorable_cols.append(column_name)
                select_exprs.append(f"{fallback} AS {quoted}")
                normalized.append(column_name)
                skipped_mismatch.append(column_name)
            else:
                unresolved.append(column_name)
        else:
            skipped_mismatch.append(column_name)
        continue

    if is_nullable == "NO":
        fallback = fallback_expr(column_name, staging_column_meta)
        if fallback:
            restorable_cols.append(column_name)
            nullable_expr = source_expr
            if fk:
                parent_table = qident(fk["parent_table"])
                parent_col = qident(fk["parent_col"])
                nullable_expr = (
                    f"CASE "
                    f"WHEN {source_expr} IS NULL THEN NULL "
                    f"WHEN EXISTS (SELECT 1 FROM public.{parent_table} parent_ref WHERE parent_ref.{parent_col} = {source_expr}) THEN {source_expr} "
                    f"ELSE NULL END"
                )
            select_exprs.append(f"COALESCE({nullable_expr}, {fallback}) AS {quoted}")
            normalized.append(column_name)
        else:
            restorable_cols.append(column_name)
            if fk:
                parent_table = qident(fk["parent_table"])
                parent_col = qident(fk["parent_col"])
                select_exprs.append(
                    f"CASE "
                    f"WHEN {source_expr} IS NULL THEN NULL "
                    f"WHEN EXISTS (SELECT 1 FROM public.{parent_table} parent_ref WHERE parent_ref.{parent_col} = {source_expr}) THEN {source_expr} "
                    f"ELSE NULL END AS {quoted}"
                )
            else:
                select_exprs.append(f"{source_expr} AS {quoted}")
            unresolved.append(column_name)
    else:
        restorable_cols.append(column_name)
        if fk:
            parent_table = qident(fk["parent_table"])
            parent_col = qident(fk["parent_col"])
            select_exprs.append(
                f"CASE "
                f"WHEN {source_expr} IS NULL THEN NULL "
                f"WHEN EXISTS (SELECT 1 FROM public.{parent_table} parent_ref WHERE parent_ref.{parent_col} = {source_expr}) THEN {source_expr} "
                f"ELSE NULL END AS {quoted}"
            )
        else:
            select_exprs.append(f"{source_expr} AS {quoted}")

with open(restorable_cols_path, "w", encoding="utf-8") as fh:
    for column_name in restorable_cols:
        fh.write(f"{column_name}\n")

with open(select_exprs_path, "w", encoding="utf-8") as fh:
    fh.write(", ".join(select_exprs))

with open(normalized_cols_path, "w", encoding="utf-8") as fh:
    for column_name in normalized:
        fh.write(f"{column_name}\n")

with open(unresolved_not_null_path, "w", encoding="utf-8") as fh:
    for column_name in unresolved:
        fh.write(f"{column_name}\n")

with open(skipped_mismatch_cols_path, "w", encoding="utf-8") as fh:
    for column_name in skipped_mismatch:
        fh.write(f"{column_name}\n")
PY
}

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PROD_TABLES_FILE="$TMP_DIR/prod_public_tables.txt"
STAGING_TABLES_FILE="$TMP_DIR/staging_public_tables.txt"
SHARED_TABLES_FILE="$TMP_DIR/shared_public_tables.txt"
PROD_ONLY_TABLES_FILE="$TMP_DIR/prod_only_public_tables.txt"
RESTORABLE_TABLES_FILE="$TMP_DIR/restorable_public_tables.txt"
SKIPPED_TABLES_FILE="$TMP_DIR/skipped_public_tables.txt"
FK_EDGES_FILE="$TMP_DIR/public_fk_edges.txt"
RESTORE_ORDER_FILE="$TMP_DIR/public_restore_order.txt"

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
echo "Preparing shared-column export plan."
: > "$DUMP_RAW"
: > "$DUMP_SAFE"
: > "$RESTORABLE_TABLES_FILE"
: > "$SKIPPED_TABLES_FILE"

{
  echo "-- Prod public table export plan"
  echo "-- Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
} > "$DUMP_RAW"

{
  echo "-- Staging public restore plan"
  echo "-- Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
} > "$DUMP_SAFE"

while IFS= read -r table; do
  [[ -n "$table" ]] || continue

  prod_cols_file="$TMP_DIR/${table}.prod.cols"
  prod_meta_file="$TMP_DIR/${table}.prod.meta.tsv"
  staging_cols_file="$TMP_DIR/${table}.staging.cols"
  staging_meta_file="$TMP_DIR/${table}.staging.meta.tsv"
  fk_meta_file="$TMP_DIR/${table}.fk_meta.tsv"
  shared_cols_file="$TMP_DIR/${table}.shared.cols"
  skipped_cols_file="$TMP_DIR/${table}.skipped.cols"
  restorable_cols_file="$TMP_DIR/${table}.restorable.cols"
  select_exprs_file="$TMP_DIR/${table}.select.exprs.sql"
  normalized_cols_file="$TMP_DIR/${table}.normalized.cols"
  unresolved_not_null_file="$TMP_DIR/${table}.unresolved_not_null.cols"
  skipped_mismatch_cols_file="$TMP_DIR/${table}.skipped_mismatch.cols"

  run_prod_psql -At -c \
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position;" \
    > "$prod_cols_file"
  run_prod_psql -At -F $'\t' -c \
    "SELECT column_name, data_type, udt_name, is_nullable, COALESCE(column_default, '') FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position;" \
    > "$prod_meta_file"
  run_staging_psql -At -c \
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position;" \
    > "$staging_cols_file"
  run_staging_psql -At -F $'\t' -c \
    "SELECT column_name, data_type, udt_name, is_nullable, COALESCE(column_default, '') FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position;" \
    > "$staging_meta_file"
  run_staging_psql -At -F $'\t' -c \
    "SELECT a.attname, parent.relname, pa.attname
     FROM pg_constraint c
     JOIN pg_class child ON child.oid = c.conrelid
     JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
     JOIN pg_class parent ON parent.oid = c.confrelid
     JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
     JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
     JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = ck.ord
     JOIN pg_attribute a ON a.attrelid = child.oid AND a.attnum = ck.attnum
     JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = fk.attnum
     WHERE c.contype = 'f'
       AND child_ns.nspname = 'public'
       AND parent_ns.nspname = 'public'
       AND child.relname = '${table}'
       AND cardinality(c.conkey) = 1
       AND cardinality(c.confkey) = 1;" \
    > "$fk_meta_file"

  awk 'NR==FNR { keep[$0] = 1; next } keep[$0] { print }' "$staging_cols_file" "$prod_cols_file" > "$shared_cols_file"
  awk 'NR==FNR { keep[$0] = 1; next } !keep[$0] { print }' "$staging_cols_file" "$prod_cols_file" > "$skipped_cols_file"

  if [[ ! -s "$shared_cols_file" ]]; then
    echo "$table" >> "$SKIPPED_TABLES_FILE"
    echo "Skipping ${table}: no shared columns."
    {
      echo
      echo "TABLE ${table}"
      echo "STATUS skipped_no_shared_columns"
    } >> "$DUMP_RAW"
    {
      echo
      echo "TABLE ${table}"
      echo "STATUS skipped_no_shared_columns"
    } >> "$DUMP_SAFE"
    continue
  fi

  printf '%s\n' "$table" >> "$RESTORABLE_TABLES_FILE"

  skipped_cols_csv="$(csv_list_from_file "$skipped_cols_file")"
  shared_cols_csv="$(csv_list_from_file "$shared_cols_file")"
  build_export_select_for_table "$table" "$shared_cols_file" "$prod_meta_file" "$staging_meta_file" "$fk_meta_file" "$restorable_cols_file" "$select_exprs_file" "$normalized_cols_file" "$unresolved_not_null_file" "$skipped_mismatch_cols_file"
  restorable_cols_csv="$(csv_list_from_file "$restorable_cols_file")"
  normalized_cols_csv="$(csv_list_from_file "$normalized_cols_file")"
  unresolved_not_null_csv="$(csv_list_from_file "$unresolved_not_null_file")"
  skipped_mismatch_cols_csv="$(csv_list_from_file "$skipped_mismatch_cols_file")"

  if [[ ! -s "$restorable_cols_file" ]]; then
    echo "$table" >> "$SKIPPED_TABLES_FILE"
    echo "Skipping ${table}: no restorable shared columns after type compatibility checks."
    continue
  fi

  {
    echo
    echo "TABLE ${table}"
    echo "SHARED_COLUMNS ${shared_cols_csv}"
    echo "RESTORABLE_COLUMNS ${restorable_cols_csv}"
    if [[ -n "$normalized_cols_csv" ]]; then
      echo "NORMALIZED_NOT_NULL_COLUMNS ${normalized_cols_csv}"
    fi
    if [[ -n "$skipped_cols_csv" ]]; then
      echo "SKIPPED_COLUMNS ${skipped_cols_csv}"
    fi
    if [[ -n "$skipped_mismatch_cols_csv" ]]; then
      echo "SKIPPED_TYPE_MISMATCH_COLUMNS ${skipped_mismatch_cols_csv}"
    fi
    if [[ -n "$unresolved_not_null_csv" ]]; then
      echo "UNRESOLVED_NOT_NULL_COLUMNS ${unresolved_not_null_csv}"
    fi
  } >> "$DUMP_RAW"

  {
    echo
    echo "TABLE ${table}"
    echo "RESTORE_COLUMNS ${restorable_cols_csv}"
    if [[ -n "$normalized_cols_csv" ]]; then
      echo "NORMALIZED_NOT_NULL_COLUMNS ${normalized_cols_csv}"
    fi
    if [[ -n "$skipped_cols_csv" ]]; then
      echo "SKIPPED_COLUMNS ${skipped_cols_csv}"
    fi
    if [[ -n "$skipped_mismatch_cols_csv" ]]; then
      echo "SKIPPED_TYPE_MISMATCH_COLUMNS ${skipped_mismatch_cols_csv}"
    fi
    if [[ -n "$unresolved_not_null_csv" ]]; then
      echo "UNRESOLVED_NOT_NULL_COLUMNS ${unresolved_not_null_csv}"
    fi
  } >> "$DUMP_SAFE"

  if [[ -n "$normalized_cols_csv" ]]; then
    echo "${table} normalized NOT NULL columns: ${normalized_cols_csv}"
  fi
  if [[ -n "$skipped_cols_csv" ]]; then
    echo "${table} skipped columns: ${skipped_cols_csv}"
  fi
  if [[ -n "$skipped_mismatch_cols_csv" ]]; then
    echo "${table} skipped type-mismatch columns: ${skipped_mismatch_cols_csv}"
  fi
  if [[ -n "$unresolved_not_null_csv" ]]; then
    echo "${table} warning: NOT NULL columns without automatic fallback: ${unresolved_not_null_csv}"
  fi
done < "$SHARED_TABLES_FILE"

if [[ ! -s "$RESTORABLE_TABLES_FILE" ]]; then
  echo "No restorable shared public tables remain after column intersection. Aborting." >&2
  exit 1
fi

RESTORABLE_SQL_IN_LIST="$(sed "s/.*/'&'/" "$RESTORABLE_TABLES_FILE" | paste -sd, -)"

run_staging_psql -At -F $'\t' <<SQL > "$FK_EDGES_FILE"
SELECT child.relname, parent.relname
FROM pg_constraint c
JOIN pg_class child ON child.oid = c.conrelid
JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
JOIN pg_class parent ON parent.oid = c.confrelid
JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
WHERE c.contype = 'f'
  AND child_ns.nspname = 'public'
  AND parent_ns.nspname = 'public'
  AND child.relname IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (${RESTORABLE_SQL_IN_LIST})
  )
  AND parent.relname IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (${RESTORABLE_SQL_IN_LIST})
  );
SQL

"$PYTHON_BIN" - "$RESTORABLE_TABLES_FILE" "$FK_EDGES_FILE" "$RESTORE_ORDER_FILE" <<'PY'
import sys
from collections import defaultdict, deque

tables_path, edges_path, out_path = sys.argv[1:4]
with open(tables_path, "r", encoding="utf-8") as fh:
    tables = [line.strip() for line in fh if line.strip()]

deps = defaultdict(set)
reverse = defaultdict(set)
incoming = {table: 0 for table in tables}

with open(edges_path, "r", encoding="utf-8") as fh:
    for line in fh:
      line = line.strip()
      if not line:
          continue
      child, parent = line.split("\t", 1)
      if child == parent:
          continue
      if child not in incoming or parent not in incoming:
          continue
      if child in deps[parent]:
          continue
      deps[parent].add(child)
      reverse[child].add(parent)
      incoming[child] += 1

queue = deque(sorted([table for table, degree in incoming.items() if degree == 0]))
ordered = []

while queue:
    node = queue.popleft()
    ordered.append(node)
    for child in sorted(deps.get(node, ())):
        incoming[child] -= 1
        if incoming[child] == 0:
            queue.append(child)

remaining = [table for table in tables if table not in ordered]
ordered.extend(sorted(remaining))

with open(out_path, "w", encoding="utf-8") as fh:
    for table in ordered:
        fh.write(f"{table}\n")
PY

print_counts "Current staging row counts (dry run)"

echo
echo "Production-sensitive operation: this script reads production and can truncate and restore staging."
if [[ "$DRY_RUN" != "false" ]]; then
  echo "Dry-run mode is enabled. No staging cleanup or restore will be executed."
  echo "To execute the restore flow, rerun with DRY_RUN=false and FAMLO_ALLOW_STAGING_RESTORE=I_UNDERSTAND."
  exit 0
fi

: "${FAMLO_ALLOW_STAGING_RESTORE:?FAMLO_ALLOW_STAGING_RESTORE is required when DRY_RUN=false}"
if [[ "$FAMLO_ALLOW_STAGING_RESTORE" != "I_UNDERSTAND" ]]; then
  echo "Refusing to continue. Set FAMLO_ALLOW_STAGING_RESTORE=I_UNDERSTAND when DRY_RUN=false." >&2
  exit 1
fi

echo
echo "About to truncate staging public app tables and restore:"
echo "  $DUMP_SAFE"
read -r -p "Type YES to continue: " reply
if [[ "$reply" != "YES" ]]; then
  echo "Aborted before staging cleanup."
  exit 1
fi

"$ROOT_DIR/scripts/db/truncate-staging-public-app-data.sh" --yes

echo "Exporting prod public data with column intersection..."
while IFS= read -r table; do
  [[ -n "$table" ]] || continue
  restorable_cols_file="$TMP_DIR/${table}.restorable.cols"
  csv_file="$TMP_DIR/${table}.csv"
  select_exprs_file="$TMP_DIR/${table}.select.exprs.sql"
  select_exprs="$(cat "$select_exprs_file")"

  run_prod_psql -v ON_ERROR_STOP=1 -c \
    "COPY (SELECT ${select_exprs} FROM public.\"${table}\") TO STDOUT WITH CSV HEADER" \
    > "$csv_file"
done < "$RESTORE_ORDER_FILE"

echo "Restoring filtered public data into staging..."
while IFS= read -r table; do
  [[ -n "$table" ]] || continue
  restorable_cols_file="$TMP_DIR/${table}.restorable.cols"
  csv_file="$TMP_DIR/${table}.csv"
  column_list="$(sql_ident_list_from_file "$restorable_cols_file")"

  echo "  Restoring ${table}"
  run_staging_psql -v ON_ERROR_STOP=1 -c \
    "\\copy public.\"${table}\" (${column_list}) FROM '${csv_file}' WITH (FORMAT csv, HEADER true)"
done < "$RESTORE_ORDER_FILE"

echo "Repairing public sequences after restore..."
repair_public_sequences

print_counts "Post-restore staging row counts"

echo
echo "Done."
echo "Raw dump:       $DUMP_RAW"
echo "Sanitized dump: $DUMP_SAFE"
