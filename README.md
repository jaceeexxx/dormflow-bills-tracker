# DormFlow v3.3.1 · 20 St. Paul

DormFlow v3.3.1 is the beta-stabilization release of the private household-finance PWA for four roommates. It keeps the authenticated Supabase ledger and v3.3 active-month/notification model, while fixing the mobile navigation, profile/media lifecycle, Admin management, real-time member refresh, PayLater reimbursement accounting, app-lock PIN experience, and iPhone push behavior found during beta testing.

## What v3.3.1 adds

- Native Back controls on secondary screens and touch-first swipe/snap banking cards on phones.
- Mobile-safe DormFlow header/logo and uploaded profile photo in the top-right account control.
- Profile photo crop/preview before upload; saved avatar state refreshes everywhere it is used.
- One Save lifecycle: **Saving… → Successfully saved → close → refreshed state**. Failed writes remain open with entered values preserved.
- Shared responsive rows for Settings, Who Pays Whom, Notifications, and Admin records so text/actions no longer overlap on narrow phones.
- Supabase Realtime invalidation for Utilities, Expenses, Payments, PayLater, billing month, profiles/payment methods, announcements, balances, and notifications. Realtime triggers a refetch; PostgreSQL remains the source of truth.
- Admin Edit + safe Archive/Void management with audit history preserved.
- PayLater Equal or Custom installment schedules. Every installment is split economically across all four dormies; the borrower’s own 25% is automatically settled and only the other three shares become obligations owed to the borrower.
- Six-digit banking-style local PIN screen with keypad, auto-submit, error feedback, and **Use password instead**.
- Foreground push becomes an in-app banner; background/closed PWA uses the system notification. Expired 404/410 push subscriptions are deactivated automatically.
- All v3.3 behavior remains: one active billing month, August carry-forward, authoritative Inbox, default-ON push categories, and 8:00 AM PHT due reminders.

## Upgrade an existing v3.3 household to v3.3.1

If your current Supabase project is already on DormFlow v3.3, use this exact order:

1. Back up/confirm the existing Supabase project.
2. Run `supabase/migrate-v3.3.1.sql` **once** in Supabase SQL Editor.
3. **Do not rerun** `supabase/schema.sql`, `supabase/seed-members.sql`, `supabase/migrate-history.sql`, `supabase/migrate-v3.2.sql`, or `supabase/migrate-v3.3.sql` on a project already at v3.3.
4. Deploy the v3.3.1 application files to Vercel and keep the existing Production environment variables/VAPID pair.
5. Run `npm install`, `npm test`, and `npm run check` before deployment.
6. After deployment, hard-refresh/reopen the installed PWA once so the `dormflow-v3-3-1` service-worker cache takes control.
7. Beta-check Admin Add/Edit/Archive, PayLater, profile crop/avatar, realtime member refresh, six-digit PIN, and foreground/background push.

The v3.3.1 migration is additive. It adds audit-safe management fields/functions, the PayLater-installment obligation link, four-way PayLater reimbursement obligations, and v3.3.1 event notifications. It does not reseed members or rewrite historical August obligations.

If a project is still on v3.2, run `migrate-v3.3.sql` first and then `migrate-v3.3.1.sql`. Do not skip versions or rerun earlier migrations.

## Fresh Supabase setup

For a new Supabase project:

1. Run `supabase/schema.sql` once.
2. Create the four Auth accounts manually in Supabase Authentication and disable public sign-ups.
3. Run `supabase/seed-members.sql` once.
4. Run `supabase/migrate-history.sql` once.
5. Verify August 2026 remains **₱23,944.22 total / ₱22,062.29 settled / ₱1,881.93 outstanding**.
6. Follow `docs/DEPLOYMENT.md` for Vercel, VAPID, cron, and iPhone installation.

The fresh `schema.sql` already contains the final v3.3.1 schema/RPC definitions. Do **not** run the additive upgrade migrations after a fresh schema install.

## Browser-safe configuration

`js/config.js` contains only values safe for browser delivery:

```js
export const config = Object.freeze({
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabasePublishableKey: 'sb_publishable_YOUR_KEY',
  householdSlug: '20-st-paul',
  vapidPublicKey: 'YOUR_PUBLIC_VAPID_KEY'
});
```

Never put `SUPABASE_SECRET_KEY`, a VAPID private key, `CRON_SECRET`, passwords, or private receipt data in browser code or Git.

## Run locally

```bash
npm install
npm test
npm run check
vercel dev
```

For Vercel Dev, link/pull the Development environment as described in `docs/DEPLOYMENT.md`.

## Main upgrade files

- `supabase/migrate-v3.3.1.sql` — one-time additive upgrade from an existing v3.3 household.
- `supabase/schema.sql` — fresh v3.3.1 schema.
- `js/realtime.js` — focused household invalidation/refetch layer.
- `js/form-flow.js`, `js/avatar-cropper.js`, `js/pin-screen.js` — shared beta-stabilization UI behavior.
- `js/paylater-v3.js` — Equal/Custom schedules and Admin management UI.
- `service-worker.js`, `lib/push-server.js`, `api/push-event.js`, `api/reminders.js` — foreground/background delivery and expired-subscription cleanup.

## Security rules

- No public registration UI.
- Private receipts remain in `financial-documents`; household avatars/payment QR media remain in private `household-media`.
- RLS remains the privacy boundary for member data.
- Financial writes are blocked offline.
- Realtime never calculates balances from event payloads; it causes authoritative Supabase refetches.
- Financial archive/void operations preserve audit/payment history.
