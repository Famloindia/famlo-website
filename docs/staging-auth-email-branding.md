# Staging Supabase Auth Email Branding

Apply these settings only in Supabase project `nsanahmopvwrlwvmxdmf`.

## URL configuration

In **Authentication > URL Configuration**:

- Site URL: `https://famlo-web-staging.vercel.app`
- Add redirect URL: `https://famlo-web-staging.vercel.app/auth/callback`
- Add reset URL: `https://famlo-web-staging.vercel.app/auth/reset-password`

## Custom SMTP

In **Project Settings > Authentication > SMTP Settings**, enable custom SMTP using credentials for a verified Famlo domain. Set:

- Sender name: `Famlo Traveltech`
- Sender address: `no-reply@famlo.in` (after domain verification)
- Reply-to/support address: `support@famlo.in`

Do not place SMTP credentials in this repository or in `NEXT_PUBLIC_*` variables.

## Confirm signup template

Subject: `Verify your Famlo email`

```html
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
  <img src="https://famlo-web-staging.vercel.app/logo-blue.png" alt="Famlo" width="120">
  <h1>Verify your Famlo email</h1>
  <p>Confirm this email to finish setting up your Famlo guest account.</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 18px;background:#165dcc;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Verify email</a></p>
  <p>If the button does not work, open this URL:</p>
  <p style="word-break:break-all">{{ .ConfirmationURL }}</p>
  <p>Need help? Contact support@famlo.in.</p>
</div>
```

## Password recovery template

Subject: `Reset your Famlo password`

```html
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
  <img src="https://famlo-web-staging.vercel.app/logo-blue.png" alt="Famlo" width="120">
  <h1>Reset your Famlo password</h1>
  <p>Use the secure link below to choose a new password.</p>
  <p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 18px;background:#165dcc;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Reset password</a></p>
  <p>If the button does not work, open this URL:</p>
  <p style="word-break:break-all">{{ .ConfirmationURL }}</p>
  <p>If you did not request this, you can ignore this email. Need help? Contact support@famlo.in.</p>
</div>
```

Send one confirmation and one recovery email to a staging test account after saving. Verify both links remain on the staging domain before enabling the templates for broader testing.
