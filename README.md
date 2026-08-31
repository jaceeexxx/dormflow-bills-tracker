# DormFlow v3.3 · 20 St. Paul

DormFlow v3.3 is a private installable household-finance PWA for four roommates. Everyone signs in with a separate Supabase Auth account; Jace is the admin and also remains a normal household member, while Kean, Aerian, and Aexy are members.

The app is designed for iOS, Android, and desktop from one Vercel deployment. It uses a fresh Supabase project, PostgreSQL/RLS for privacy, private Storage for receipts, optional Web Push, and a centavo-safe relational ledger.

## What v3.3 includes

- One authenticated app for every roommate, with role-aware member and admin experiences.
- Personalized member Home, Balance, Payments, Notifications, Utilities, Expenses, PayLater, Profile, and Security.
- Hybrid privacy: shared household totals are visible to all members; detailed receipts, payment references, credits, and personal histories are limited to the member and admin through RLS.
- Admin mobile navigation: **Overview / + Add / Review / Manage**.
- Utilities in one flow for Electricity/Meralco, Water, and PLDT WiFi; admin is the default payer and the checked-member split is reviewed before saving.
- Grocery, PayLater, other-expense, payment, announcement, people/split, month-setup, report, edit, duplicate, attachment, and Smart Delete/void workflows.
- Member payment claims with private receipt upload; balances change only after admin verification.
- Authoritative in-app Inbox plus optional device push. Push categories default ON; OS/browser permission is approved once by the user.
- Banking-style reminders at 3 days before, 1 day before, due today, and once daily while overdue at 8:00 AM Philippine time.
- Admin-controlled active billing month with exactly one current month; prior unpaid obligations continue into Current Balance without being copied or reset.
- Installable PWA shell, custom DormFlow brand mark/icons, safe offline last-known summary, and no offline financial writes.
- Optional local app PIN in addition to the persistent Supabase session.
- Idempotency and version checks for important financial writes.

## Upgrade an existing v3.2 household to v3.3

If this Supabase project already has the v3.2 household, four linked Auth users, August history, private media buckets, and MariBank payment profiles, use this exact order:

1. Back up/confirm the existing Supabase project.
2. Run `supabase/migrate-v3.3.sql` **once** in Supabase SQL Editor.
3. **Do not rerun** `supabase/schema.sql`, `supabase/seed-members.sql`, `supabase/migrate-history.sql`, or `supabase/migrate-v3.2.sql` on a project that is already at v3.2.
4. Configure VAPID/cron values for push delivery if not already configured.
5. Run `npm install`, `npm test`, and `npm run check`, then test with `vercel dev`.
6. In Admin → Manage → Monthly Setup, make **September 2026** current. DormFlow closes the previous active month but leaves every unpaid August obligation attached to August and included in the member's Current Balance.
7. Confirm Home/Admin show September 2026, August is Closed, September is Active, and the carried outstanding balance remains visible.

The v3.3 migration is additive. It adds the one-active-month invariant, month/balance notification preference, push delivery audit timestamps, active-month RPC/read-model fields, and Inbox-first financial event behavior without reseeding or rewriting historical obligations.

If an older authenticated v3 project has **not** yet run `migrate-v3.2.sql`, upgrade to v3.2 first, then run `migrate-v3.3.sql`.

## Fresh Supabase setup

Use a **new Supabase project**. Do not run any DormFlow v1/v2 migration.

1. Run `supabase/schema.sql` once.
2. In Supabase Authentication, manually create the four Auth accounts with different passwords and disable public sign-ups.
3. Run `supabase/seed-members.sql`. It is preconfigured for `jace@gmail.com`, `kean@gmail.com`, `aerian@gmail.com`, and `aexy@gmail.com`. Confirm Jace = `admin`; Kean/Aerian/Aexy = `member`.
4. Run `supabase/migrate-history.sql` once.
5. Confirm the August 2026 verification queries return:
   - total obligations: **2,394,422 centavos = ₱23,944.22**
   - settled: **2,206,229 centavos = ₱22,062.29**
   - outstanding: **188,193 centavos = ₱1,881.93**
6. Follow `docs/DEPLOYMENT.md` for browser-safe configuration, Vercel secrets, push setup, and device installation.

Detailed migration notes are in `docs/MIGRATION.md`.

## Browser-safe configuration

Edit `js/config.js` before deployment:

```js
export const config = Object.freeze({
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabasePublishableKey: 'sb_publishable_YOUR_KEY',
  householdSlug: '20-st-paul',
  vapidPublicKey: 'YOUR_PUBLIC_VAPID_KEY'
});
```

Only the Supabase project URL, publishable key, household slug, and public VAPID key belong in browser code.

## Run locally

Install the one server dependency and use Vercel Dev so the PWA and `/api` functions run together:

```bash
npm install
npm test
npm run check
vercel dev
```

Create `.env.local` from `.env.example` before testing push/reminders. The app itself can authenticate against Supabase once `js/config.js` is configured.

## Main files

- `index.html`, `css/styles.css`, `js/app.js` — authenticated PWA shell and premium responsive UI.
- `js/auth.js`, `js/supabase-client.js` — Supabase Auth/session/data client.
- `js/member-*.js` — personalized member experience.
- `js/admin-*.js`, `js/paylater-v3.js`, `js/announcements-v3.js` — admin workflows.
- `manifest.webmanifest`, `service-worker.js`, `offline.html`, `assets/brand/` — installable PWA assets.
- `supabase/schema.sql` — fresh v3 schema, RLS, private Storage, read models, and financial RPCs.
- `supabase/seed-members.sql` — links the four manually-created Auth accounts to household roles.
- `supabase/migrate-history.sql` — clean historical import for fresh v3 installs.
- `supabase/migrate-v3.2.sql` — prior additive upgrade for profile/media/payment-profile support.
- `supabase/migrate-v3.3.sql` — one-time additive upgrade for notifications and active-month control on an existing v3.2 household.
- `api/` — push subscription/delivery, target-based event push, and scheduled reminder server functions.

## Security rules

- No public registration UI.
- Never commit `.env.local`, a Supabase secret/service-role key, VAPID private key, CRON secret, passwords, or private receipts.
- `financial-documents` is a private Storage bucket; receipts are accessed with authorization/signed URLs.
- Sign-out clears the user-specific offline summary and local app-lock state.
- The service worker does not durably cache Supabase/API financial responses and uses network-first refresh for release-critical HTML/CSS/JS.
- Financial writes are blocked while offline.
