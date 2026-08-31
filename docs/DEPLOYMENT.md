# DormFlow v3.3.1 deployment

## Existing v3.3 Supabase project

1. Run `supabase/migrate-v3.3.1.sql` **once** in Supabase SQL Editor.
2. **Do not rerun** `schema.sql`, `seed-members.sql`, `migrate-history.sql`, `migrate-v3.2.sql`, or `migrate-v3.3.sql`.
3. Keep the existing Supabase/VAPID/CRON Production environment variables, deploy v3.3.1, and reopen/hard-refresh the installed PWA once for the new service-worker cache.
4. A project still on v3.2 must run `migrate-v3.3.sql` once before `migrate-v3.3.1.sql`.

# DormFlow v3.3 Deployment Guide

Use this guide for a **fresh Supabase project + GitHub + Vercel** deployment.

## Existing v3.2 project: upgrade to v3.3 first

For the Supabase project already configured with Jace, Kean, Aerian, Aexy, the verified August history, and the v3.2 media/payment-profile migration:

1. Run `supabase/migrate-v3.3.sql` **once** in Supabase SQL Editor.
2. Confirm it completes without error.
3. **Do not rerun** `schema.sql`, `seed-members.sql`, `migrate-history.sql`, or `migrate-v3.2.sql` on this already-configured project.
4. Keep the existing users, buckets, receipts, profile photos, QR images, obligations, payments, and August history.
5. Continue with browser/server configuration and testing below.

The v3.3 migration is additive. It enforces one active billing month, adds Inbox/push metadata and month/balance preferences, and updates current-period read/RPC behavior without moving old obligations.

## 1. Create the new Supabase project

Create a new project in Supabase. In **Authentication**, keep email/password sign-in enabled and disable public user sign-ups.

In **SQL Editor**, run `supabase/schema.sql` once.

## 2. Create the four Auth accounts

In **Authentication → Users**, manually create:

- Jace — admin account
- Kean — member account
- Aerian — member account
- Aexy — member account

Give each account a different password. Do not store those passwords in DormFlow source code.

Run `supabase/seed-members.sql`; it is already configured for the four DormFlow Auth emails. Verify the returned roles and that the notification-preference count is 4.

Then run `supabase/migrate-history.sql`. Confirm **2,394,422 total / 2,206,229 settled / 188,193 outstanding centavos** for August 2026.

## 3. Configure browser-safe values

Supabase **Settings → API Keys** provides the browser-safe publishable key.

Edit `js/config.js` with only:

- **Supabase project URL** → `supabaseUrl`
- **Supabase publishable key** (`sb_publishable_...`) → `supabasePublishableKey`
- household slug `20-st-paul`
- **VAPID public key** → `vapidPublicKey` after push keys are generated

Never put a Supabase secret/service-role key, VAPID private key, or CRON secret in `js/config.js`.

## 4. Generate Web Push VAPID keys

After `npm install`, generate a VAPID pair locally:

```bash
npx web-push generate-vapid-keys
```

The **public** key goes in both `js/config.js` and server environment `VAPID_PUBLIC_KEY`. The **private** key is server-only.

## 5. Local full-app testing

Create `.env.local` from `.env.example` and fill the real server-only values:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
SUPABASE_PUBLISHABLE_KEY
VAPID_SUBJECT
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
CRON_SECRET
```

Use a VAPID subject such as `mailto:you@example.com`. Generate `CRON_SECRET` as a long random value.

Then:

```bash
npm install
npm test
npm run check
vercel dev
```

Open the localhost URL printed by Vercel. Test all four logins and verify that member privacy is enforced by Supabase, not only hidden in the UI.

For v3.3 specifically, also verify Jace Admin Workspace + personal view, the banking-card carousel, profile/MariBank media, Inbox unread badge, push settings, Monthly Setup, and announcement flows. Activate September 2026 and confirm unpaid August balances remain in Current Balance.

## 6. Push to GitHub

Upload the **contents** of the v3 release folder to your GitHub repository. Before pushing, confirm there is no `.env.local`, `.vercel/`, secret key, private receipt, or private QR file in the repository.

## 7. Import in Vercel

Vercel → **Add New → Project** → import the GitHub repository.

Use the repository root. `package.json` contains the `web-push` dependency; Vercel installs it automatically. No frontend build command is required because DormFlow is a static ES-module app with serverless functions in `api/`.

## 8. Vercel server-only environment variables

In **Project → Settings → Environment Variables**, add:

```text
SUPABASE_URL=<new Supabase project URL>
SUPABASE_SECRET_KEY=<new Supabase sb_secret_... key>
SUPABASE_PUBLISHABLE_KEY=<browser-safe sb_publishable_... key>
VAPID_SUBJECT=mailto:you@example.com
VAPID_PUBLIC_KEY=<public VAPID key>
VAPID_PRIVATE_KEY=<private VAPID key>
CRON_SECRET=<long random secret>
```

These values belong in Vercel/local `.env.local`, not in GitHub. `VAPID_PUBLIC_KEY` is intentionally also browser-safe; the other push/cron secrets are not.

The daily `/api/reminders` cron is declared in `vercel.json` at `0 0 * * *`, which is **8:00 AM Philippine time**. With `CRON_SECRET` configured, Vercel sends the authorization token used by the endpoint. Reminder stages are 3 days before, 1 day before, due today, and once per overdue calendar day.

## 9. Production verification

Test in this order:

1. `/api/health` reports configuration booleans only and exposes no secret values.
2. Unauthenticated `/` shows only the sign-in screen.
3. Sign in as each of the four users; confirm each account resolves to the correct profile/role.
4. As a member, confirm another roommate's private receipt/reference/history cannot be queried through the app.
5. As Jace/admin, confirm Overview, Add, Review, Manage, Utilities, expense Edit/Smart Delete, payment verification, announcements, month setup, people/splits, and reports work.
6. Submit a member payment claim with a receipt; confirm it remains pending until admin verification.
7. Open Notifications: confirm Inbox is always on and all five push categories default on. Enable device push once, then trigger a payment/announcement or reminder and confirm the Inbox row exists even if push delivery is unavailable.
8. In Monthly Setup, activate September 2026; confirm August becomes Closed, September becomes Active, and an unpaid August balance is still included in Current Balance.
9. Go offline; confirm only the clearly labeled last-known safe summary remains and financial writes are blocked.
10. Sign out; confirm the last-known user summary/app-lock state is cleared.

## 10. Install on iPhone and Android

### iPhone

Open the production URL in Safari → Share → **Add to Home Screen**. For Web Push, notification permission is requested only after the user opts in from the installed Home Screen PWA on supported iOS versions.

### Android

Open the URL in Chrome and choose **Install app / Add to Home screen** when offered. DormFlow push categories default on, while Android still requires the user to grant the OS/browser notification permission once.

DormFlow remains usable in the browser even if a roommate does not install the PWA or enable push.
