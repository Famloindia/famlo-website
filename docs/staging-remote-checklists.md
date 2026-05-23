# Staging Remote Checklists

## 1. Apply Schema To Staging

Use remote-only commands because local Docker Supabase is not available.

Prerequisites:
- `supabase` CLI installed
- `STAGING_DB_URL` exported locally
- no production connection strings in your shell

Commands:

```bash
export STAGING_DB_URL="<staging_db_url>"
supabase migration list --db-url "$STAGING_DB_URL"
supabase db push --db-url "$STAGING_DB_URL"
supabase migration list --db-url "$STAGING_DB_URL"
```

Checks:
- all migration filenames stay in `YYYYMMDDHHMMSS_name.sql` format
- no duplicate 14-digit migration versions
- bootstrap succeeds without manual dashboard table creation

## 2. Create Seed Data

Use fake data only. Do not copy real people, real bookings, real payment artifacts, or bank details.

Seed set:
- admin user for staging access
- 3 to 5 fake hosts
- 5 to 10 fake properties
- 1 to 3 stay units per host
- fake amenities and media references
- 10 to 20 fake bookings
- fake payment statuses using test-only Razorpay references
- fake WhatsApp/email metadata only if needed for UI verification

Checklist:
- use clearly fake emails and phone numbers
- do not seed production auth users
- do not seed live Razorpay ids
- do not seed real host bank or payout details
- do not seed real tax, GST, or invoice data

## 3. Optionally Copy Sanitized Production Data

Only do this if fake data is insufficient.

Rules:
- strip PII: names, emails, phones, addresses, free-text bios
- strip payment identifiers and webhook payloads
- strip payout, bank account, UPI, and settlement data
- strip WhatsApp tokens and email delivery metadata
- strip auth secrets and service tokens

Preferred flow:
1. export only the tables needed for QA
2. transform into sanitized staging-safe rows
3. import sanitized rows into staging
4. verify no production identifiers remain

Never copy directly:
- `auth.users`
- bank account details
- payout artifacts
- refund provider metadata
- invoice PDFs or customer PDFs with PII
- live payment gateway ids

## 4. Copy R2 Files To Staging Only If Needed

Only copy assets when staging UI verification genuinely needs them.

Rules:
- copy from production bucket `famlo-images`
- copy into staging bucket `famlo-images-staging`
- use staging R2 credentials for the destination
- do not overwrite production objects

Safer approach:
- prefer a subset of public, non-sensitive image assets
- avoid private documents, invoices, or identity files
- rebuild image variants in staging if the source material is safe

## 5. Verify Staging App Works Without Touching Production

Environment checks:
- `APP_ENV=staging`
- `NEXT_PUBLIC_APP_ENV=staging`
- `SUPABASE_ENVIRONMENT=staging`
- `R2_BUCKET_NAME=famlo-images-staging`
- Razorpay test keys only
- `CHANNEX_ENV=staging`
- `EMAIL_EXECUTION_ENABLED=false`
- `FAMLO_ENABLE_WHATSAPP_NOTIFICATIONS=false`
- `REFUND_PROVIDER_EXECUTION_ENABLED=false`
- `SETTLEMENT_PAYOUT_EXECUTION_ENABLED=false`
- `CHANNEX_SYNC_EXECUTION_ENABLED=false`

Verification checklist:
- login works against staging Supabase only
- image uploads land in `famlo-images-staging`
- no upload/delete path touches production R2
- checkout uses test Razorpay only
- no real email is sent
- no WhatsApp message is sent
- payout/refund actions remain blocked
- Channex production mutations remain blocked
- admin and host dashboards render using staging data only
