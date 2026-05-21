# Famlo Website

Famlo is a Next.js 14 website for cultural stays and local connections.

## Local development

1. Copy `.env.example` to `.env.local`
2. Fill in real Supabase and admin values
3. Install dependencies
4. Run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production setup

1. Run the SQL in `supabase/production-setup.sql`
2. Add the same environment variables in Vercel
3. Deploy the repository to Vercel
4. Add your custom domain inside the Vercel project settings

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `RESEND_API_KEY`
- `MAIL_FROM_EMAIL`
- `CHANNEX_ENVIRONMENT`
- `CHANNEX_STAGING_BASE_URL`
- `CHANNEX_STAGING_API_KEY`
- `CHANNEX_WEBHOOK_SECRET`
- `CHANNEX_WEBHOOK_AUTH_MODE`

## Channex staging setup

Famlo defaults to Channex staging when `CHANNEX_ENVIRONMENT` is not set. For an explicit staging setup, add these values to `.env.local` or your Vercel environment:

```bash
CHANNEX_ENVIRONMENT=staging
CHANNEX_STAGING_BASE_URL=https://staging.channex.io
CHANNEX_STAGING_API_KEY=your_channex_staging_api_key
CHANNEX_WEBHOOK_SECRET=your_channex_webhook_secret
CHANNEX_WEBHOOK_AUTH_MODE=signature
```

Production mode is intentionally guarded. If you later switch to production, also set:

```bash
CHANNEX_PRODUCTION_BASE_URL=https://app.channex.io
CHANNEX_PRODUCTION_API_KEY=your_channex_production_api_key
FAMLO_CHANNEX_ALLOW_PRODUCTION_MUTATIONS=true
```

## Manual channel connection flow

Famlo can create the Channex property record, but the real OTA connection and mapping flow still happens inside Channex. The normal operator flow is:

1. Create the Channex property from the Famlo Pro dashboard.
2. Open the real Channex workspace for the provider from Famlo. This uses a one-time token and lands on the property-scoped channels page.
3. Inside Channex staging, attach the OTA channel for the property and complete the provider-side connection steps.
4. Return to Famlo and run the connection refresh / test connection action.
5. Verify structure and ARI sync so Famlo can confirm room types, rate plans, availability, and restrictions are visible.

If the Channex API is connected but the UI still looks empty, check the selected property, group, channel filters, and then refresh the provider state again from Famlo.
