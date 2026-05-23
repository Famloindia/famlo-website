# Env Separation Rollout

## Final Architecture

### Local
- `APP_ENV=local`
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
3. Do not copy production data into staging.
4. Seed only fake data for development and QA:
- fake hosts
- fake properties
- fake rooms
- fake bookings
- fake payments

## Cloudflare R2 Setup

1. Keep the production bucket unchanged as `famlo-images`.
2. Create a new staging bucket named `famlo-images-staging`.
3. Create a separate staging R2 access key pair scoped only to the staging bucket.
4. Use production R2 credentials only with the production bucket.

## Vercel Setup

### Production Environment Values
- `APP_ENV=production`
- `SUPABASE_ENVIRONMENT=production`
- production Supabase URL and keys
- `R2_BUCKET_NAME=famlo-images`
- production R2 credentials
- Razorpay live keys
- `CHANNEX_ENV=production`
- production Channex credentials
- `EMAIL_EXECUTION_ENABLED=false` by default
- `REFUND_PROVIDER_EXECUTION_ENABLED=false` by default
- `SETTLEMENT_PAYOUT_EXECUTION_ENABLED=false` by default
- `CHANNEX_SYNC_EXECUTION_ENABLED=false` by default

### Preview/Staging Environment Values
- `APP_ENV=staging`
- `SUPABASE_ENVIRONMENT=staging`
- staging Supabase URL and keys
- `R2_BUCKET_NAME=famlo-images-staging`
- staging R2 credentials
- Razorpay test keys
- `CHANNEX_ENVIRONMENT=staging`
- staging Channex credentials
- `EMAIL_EXECUTION_ENABLED=false`
- `FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS=false`
- `REFUND_PROVIDER_EXECUTION_ENABLED=false`
- `SETTLEMENT_PAYOUT_EXECUTION_ENABLED=false`
- `CHANNEX_SYNC_EXECUTION_ENABLED=false`
- `PRO_BILLING_PAYMENT_EXECUTION_ENABLED=false`

## Local .env.local Setup

- `APP_ENV=local`
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
