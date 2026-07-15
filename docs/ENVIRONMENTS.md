# Environments

## Local

- Uses `.env.local`
- Intended for local development only
- Should default to sandbox or non-production integrations

## Staging

- Staging Supabase project
- Razorpay test mode
- Channex staging
- Staging R2 bucket
- Staging domain and webhooks

## Production

- Production Supabase project
- Razorpay live mode
- Channex production
- Production R2 bucket
- Production domain and webhooks

## Rules

- No credentials belong in Git.
- Request access separately for each environment.
- Do not reuse production secrets in local development.
