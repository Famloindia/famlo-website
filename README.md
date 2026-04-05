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
