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
