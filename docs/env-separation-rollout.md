# Env Separation Rollout

## Final Architecture

### Local
- `APP_ENV=local`
- `NEXT_PUBLIC_APP_ENV=local`
- App runs on `localhost`
- Supabase: staging project
- R2 bucket: `famlo-images-staging`
- Razorpay: test keys
- Channex: staging/sandbox
- Email: disabled or log only
- WhatsApp: disabled
- Refunds, payouts, and Channex execution: disabled

### Staging
- `APP_ENV=staging`
- `NEXT_PUBLIC_APP_ENV=staging`
- App runs on `staging.famlo.in` or Vercel Preview
- Supabase: staging project
- R2 bucket: `famlo-images-staging`
- Razorpay: test keys
- Channex: staging/sandbox
- Email: disabled or log only by default
- WhatsApp: disabled
- Refunds and payouts: disabled
- Channex execution: disabled by default, enable only intentionally against staging

### Production
- `APP_ENV=production`
- `NEXT_PUBLIC_APP_ENV=production`
- App runs on `famlo.in`
- Supabase: production project
- R2 bucket: `famlo-images`
- Razorpay: live keys
- Channex: production
- Email: only when `EMAIL_EXECUTION_ENABLED=true`
- WhatsApp: only when explicitly enabled with valid credentials
- Refunds, payouts, and Channex execution: only through explicit safe flags

## Supabase Staging Setup

1. Create a separate `famlo-staging` Supabase project.
2. Apply the existing migrations to staging.
3. Move only public app demo/testing data into staging when needed.
4. Do not restore Supabase internal schemas or tables into staging:
- `auth`
- `storage`
- `realtime`
- `vault`
- `supabase_migrations`
- `graphql`
- `extensions`
- `net`
- `pgmq`
- `cron`
- `pgsodium`
- `secrets`
5. Keep production cleanup separate from staging copy. Production cleanup should be a later dry-run-first operation.

## Cloudflare R2 Setup

1. Keep the production bucket unchanged as `famlo-images`.
2. Create a new staging bucket named `famlo-images-staging`.
3. Create a separate staging R2 access key pair scoped only to the staging bucket.
4. Use production R2 credentials only with the production bucket.

## Vercel Setup

### Vercel Development

| Variable | Value / Category |
| --- | --- |
| `APP_ENV` | `local` |
| `NEXT_PUBLIC_APP_ENV` | `local` |
| `SUPABASE_ENVIRONMENT` | `staging` |
| `NEXT_PUBLIC_SUPABASE_URL` | staging Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service role key |
| `R2_BUCKET_NAME` | `famlo-images-staging` |
| `R2_ACCOUNT_ID` | staging R2 account |
| `R2_ACCESS_KEY_ID` | staging R2 access key |
| `R2_SECRET_ACCESS_KEY` | staging R2 secret |
| `RAZORPAY_KEY_ID` | test key |
| `RAZORPAY_KEY_SECRET` | test secret |
| `CHANNEX_ENV` | `staging` |
| `CHANNEX_STAGING_BASE_URL` | staging base URL |
| `CHANNEX_STAGING_API_KEY` | staging API key |
| `EMAIL_EXECUTION_ENABLED` | `false` |
| `FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS` | `false` |
| `REFUND_PROVIDER_EXECUTION_ENABLED` | `false` |
| `SETTLEMENT_PAYOUT_EXECUTION_ENABLED` | `false` |
| `CHANNEX_SYNC_EXECUTION_ENABLED` | `false` |
| `PRO_BILLING_PAYMENT_EXECUTION_ENABLED` | `false` |
| `FAMLO_TEMP_ALLOW_LOCAL_PRODUCTION_SUPABASE` | `false` |

### Vercel Preview / Staging

| Variable | Value / Category |
| --- | --- |
| `APP_ENV` | `staging` |
| `NEXT_PUBLIC_APP_ENV` | `staging` |
| `SUPABASE_ENVIRONMENT` | `staging` |
| `NEXT_PUBLIC_SUPABASE_URL` | staging Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service role key |
| `R2_BUCKET_NAME` | `famlo-images-staging` |
| `R2_ACCOUNT_ID` | staging R2 account |
| `R2_ACCESS_KEY_ID` | staging R2 access key |
| `R2_SECRET_ACCESS_KEY` | staging R2 secret |
| `RAZORPAY_KEY_ID` | test key |
| `RAZORPAY_KEY_SECRET` | test secret |
| `CHANNEX_ENV` | `staging` |
| `CHANNEX_STAGING_BASE_URL` | staging base URL |
| `CHANNEX_STAGING_API_KEY` | staging API key |
| `EMAIL_EXECUTION_ENABLED` | `false` |
| `FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS` | `false` |
| `REFUND_PROVIDER_EXECUTION_ENABLED` | `false` |
| `SETTLEMENT_PAYOUT_EXECUTION_ENABLED` | `false` |
| `CHANNEX_SYNC_EXECUTION_ENABLED` | `false` |
| `PRO_BILLING_PAYMENT_EXECUTION_ENABLED` | `false` |

### Vercel Production

| Variable | Value / Category |
| --- | --- |
| `APP_ENV` | `production` |
| `NEXT_PUBLIC_APP_ENV` | `production` |
| `SUPABASE_ENVIRONMENT` | `production` |
| `NEXT_PUBLIC_SUPABASE_URL` | production Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | production service role key |
| `R2_BUCKET_NAME` | `famlo-images` |
| `R2_ACCOUNT_ID` | production R2 account |
| `R2_ACCESS_KEY_ID` | production R2 access key |
| `R2_SECRET_ACCESS_KEY` | production R2 secret |
| `RAZORPAY_KEY_ID` | live key |
| `RAZORPAY_KEY_SECRET` | live secret |
| `CHANNEX_ENV` | `production` |
| `CHANNEX_PRODUCTION_BASE_URL` | production base URL |
| `CHANNEX_PRODUCTION_API_KEY` | production API key |
| `EMAIL_EXECUTION_ENABLED` | `false` by default |
| `FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS` | `false` by default |
| `REFUND_PROVIDER_EXECUTION_ENABLED` | `false` by default |
| `SETTLEMENT_PAYOUT_EXECUTION_ENABLED` | `false` by default |
| `CHANNEX_SYNC_EXECUTION_ENABLED` | `false` by default |
| `PRO_BILLING_PAYMENT_EXECUTION_ENABLED` | `false` by default |

## Local .env.local Setup

- `APP_ENV=local`
- `NEXT_PUBLIC_APP_ENV=local`
- `SUPABASE_ENVIRONMENT=staging`
- point `NEXT_PUBLIC_SUPABASE_URL` to the staging Supabase project
- `R2_BUCKET_NAME=famlo-images-staging`
- use staging R2 credentials
- Razorpay test keys
- Channex staging configuration
- `EMAIL_EXECUTION_ENABLED=false`
- `FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS=false`
- `REFUND_PROVIDER_EXECUTION_ENABLED=false`
- `SETTLEMENT_PAYOUT_EXECUTION_ENABLED=false`
- `CHANNEX_SYNC_EXECUTION_ENABLED=false`
- `PRO_BILLING_PAYMENT_EXECUTION_ENABLED=false`

## Verification Checklist

1. Local rejects production Supabase unless the temporary local override is explicitly enabled.
2. Local temporary override does not enable production R2, WhatsApp, email, refunds, payouts, or Channex execution.
3. Staging rejects production Supabase.
4. Local and staging reject `R2_BUCKET_NAME=famlo-images`.
5. Production requires `R2_BUCKET_NAME=famlo-images`.
6. Local and staging require `R2_BUCKET_NAME=famlo-images-staging`.
7. Production rejects `rzp_test_` keys.
8. Local and staging reject `rzp_live_` keys.
9. Email execution is blocked outside production.
10. WhatsApp execution is blocked outside production.
11. Refund and payout execution are blocked outside production.
12. Channex production sync is blocked outside production.
13. Browser-side runtime checks respect `NEXT_PUBLIC_APP_ENV` when `APP_ENV` is not exposed client-side.

## Staging Data Copy

Use the scripts in [scripts/db](/Users/aryankrishan/Documents/Playground/famlo-web/scripts/db) to move production demo/testing data into staging without touching Supabase internal schemas.

### Temporary Shell Setup

Set the project refs:

```bash
export PROD_PROJECT_REF='wokjtntnbkwdsxbkotcr'
export STAGING_PROJECT_REF='nsanahmopvwrlwvmxdmf'
```

Set the passwords only in the current shell session:

```bash
read -rsp 'Production DB password: ' PROD_DB_PASSWORD && export PROD_DB_PASSWORD && echo
read -rsp 'Staging DB password: ' STAGING_DB_PASSWORD && export STAGING_DB_PASSWORD && echo
```

If you want to use the known password values directly in a one-off shell session, export them manually and then unset them when finished. Avoid writing them into any file.

### What The Copy Script Does

`[scripts/db/copy-prod-public-data-to-staging.sh](/Users/aryankrishan/Documents/Playground/famlo-web/scripts/db/copy-prod-public-data-to-staging.sh)` will:

1. verify production and staging DB connections
2. list public base tables in both DBs
3. dump only the public tables that exist in both DBs
4. write a raw dump to `prod-public-data-for-staging.sql`
5. write a sanitized dump to `prod-public-data-for-staging-safe.sql`
6. remove `DISABLE TRIGGER ALL`, `ENABLE TRIGGER ALL`, and `setval(...)` lines from the sanitized dump
7. print dry-run staging row counts for key app tables
8. ask for explicit confirmation before truncating staging public tables
9. restore the sanitized dump into staging
10. repair public sequences after restore
11. print post-restore row counts

### Command To Run

```bash
bash scripts/db/copy-prod-public-data-to-staging.sh
```

### Staging Cleanup Only

If you need to clear staging public app tables without restoring yet:

```bash
bash scripts/db/truncate-staging-public-app-data.sh
```

This truncates only base tables in the `public` schema using `RESTART IDENTITY CASCADE`. It does not touch `auth`, `storage`, `realtime`, `vault`, `supabase_migrations`, or other internal schemas.

### Verification After Restore

The copy script prints counts for:

- `users`
- `families`
- `family_photos`
- `host_onboarding_drafts`
- `family_applications`
- `hosts`
- `bookings`
- `bookings_v2`
- `payments_v2`
- `conversations`
- `messages`
- `channel_properties`
- `channel_room_mappings`
- `channel_sync_jobs`

Manually spot-check with:

```bash
PGPASSWORD="$STAGING_DB_PASSWORD" psql \
  -h aws-1-ap-northeast-1.pooler.supabase.com \
  -p 5432 \
  -U "postgres.${STAGING_PROJECT_REF}" \
  -d postgres \
  -c "select count(*) as families from public.families;"
```

### Rollback Notes

- Staging can be truncated, reset, and re-migrated if a restore goes wrong.
- `prod-backup-before-clean.sql` must stay local and must not be committed.
- The generated dump files are ignored in `.gitignore` and should remain uncommitted.
- Production cleanup is a separate later step and should use a dry-run-only script first.

## Production Cleanup

Use the production cleanup scripts only after reviewing the dry-run output. Do not run the real cleanup until you intentionally want to erase old testing/demo data from the live production website.

### Temporary Shell Setup

```bash
export PROD_PROJECT_REF='wokjtntnbkwdsxbkotcr'
read -rsp 'Production DB password: ' PROD_DB_PASSWORD && export PROD_DB_PASSWORD && echo
```

### Dry-Run Command

```bash
bash scripts/db/prod-cleanup-dry-run.sh
```

This is read-only. It prints the row counts for reviewed public app/demo tables that would be cleared, plus the preserved reference/config tables that stay in place.

### Real Cleanup Command

```bash
bash scripts/db/prod-cleanup-real.sh
```

The real cleanup script:

1. runs the dry-run report again
2. requires the exact confirmation text `CLEAN_PRODUCTION_DATA`
3. truncates only the reviewed public app/demo tables with `RESTART IDENTITY CASCADE`

It does not:

- drop schema
- delete migrations
- touch Supabase internal schemas
- touch production env vars
- touch R2/storage objects

### Reviewed Cleanup Tables

- user/profile app data: `users`, `user_profiles_v2`
- onboarding/property data: `host_onboarding_drafts`, `family_applications`, `families`, `family_photos`, `hosts`, `host_media`, `gallery_posts_v2`, `stay_units_v2`
- availability/inventory operational data: `availability_rules_v2`, `availability_exceptions_v2`, `seasonal_pricing_rules`, `inventory_rules_v2`, `inventory_event_log`, `inventory_rule_sets`, `inventory_day_projection`, `inventory_projection_runs`, `inventory_parity_checks`
- messaging/demo operations: `conversations`, `messages`, `booking_action_jobs`, `booking_whatsapp_actions`, `whatsapp_action_tokens`, `notification_queue`
- bookings and payments: `bookings_v2`, `booking_status_history_v2`, `booking_checkin_attempts_v2`, `guest_feedback_v2`, `booking_modifications_v2`, `payments_v2`, `payment_intents`, `payment_events`, `booking_financial_snapshots`
- refunds/payouts/settlements: `refunds_v2`, `refund_allocations_v2`, `refund_requests`, `refund_attempts`, `payouts_v2`, `payout_transfers_v2`, `host_payout_accounts`, `host_settlements_v2`, `settlement_line_items_v2`, `host_payout_executions`
- invoice/document artifacts: `guest_tax_invoices`, `platform_fee_invoices`, `credit_notes`, `credit_notes_v2`, `invoices_v2`, `finance_document_files`, `finance_email_deliveries`, `document_exports`
- channel/calendar operational data: `calendar_connections`, `calendar_sync_logs`, `calendar_events`, `calendar_conflicts`, `channel_properties`, `channel_room_mappings`, `channel_sync_jobs`, `channel_sync_logs`, `channel_booking_revisions`, `channel_provider_accounts`, `channel_operation_ledger`, `channel_provider_diagnostics`, `channel_reconciliation_runs`
- subscriptions/other demo content: `host_pro_subscriptions`, `host_pro_settings`, `activities_v2`, `stories_v2`, `reviews_v2`, `recent_views_v2`, `host_applications_v2`, `hommie_applications_v2`, `hommie_profiles_v2`, `hommie_media_v2`, `ads_v2`
- reservation-layer operational data: `reservations_v2`, `reservation_segments_v2`, `reservation_guests_v2`, `reservation_assignment_history_v2`, `reservation_lifecycle_events_v2`, `reservation_folios_v2`, `folio_line_items_v2`
- finance override/audit operational data: `finance_overrides`, `finance_audit_logs`

### Preserved Reference/Config Tables

- `channel_providers`
- `finance_rule_sets`
- `tax_rules`
- `commission_rules`
- `payout_rules`
- `finance_settings`
- `cancellation_policies`
- `platform_settings`
- `admin_platform_settings`

### Rollback Command

Use the existing local backup file only if you intentionally want to restore the pre-cleanup production state:

```bash
PGPASSWORD="$PROD_DB_PASSWORD" psql \
  -h aws-1-ap-south-1.pooler.supabase.com \
  -p 5432 \
  -U "postgres.${PROD_PROJECT_REF}" \
  -d postgres \
  -f prod-backup-before-clean.sql
```

Review the backup contents and target carefully before using rollback on production.
