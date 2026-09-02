# DormFlow v3.3.4 deployment

## Existing v3.3.3 project

1. Overlay the v3.3.4 patch over the current application files.
2. Run `supabase/migrate-v3.3.4.sql` **once** in Supabase SQL Editor.
3. Do **not** rerun schema/seed/history/v3.2/v3.3/v3.3.1/v3.3.2/v3.3.3 migrations on the existing database.
4. Keep the existing Production environment variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `CRON_SECRET`.
5. Run `npm test` and `npm run check`.
6. Deploy with `vercel deploy --prod` or Git push.
7. Verify the production `/api/health` still reports Supabase/push/cron configured.
8. Fully close and reopen the installed iPhone PWA once for the `dormflow-v3-3-4-shell-2` service-worker cache.
9. In Notifications, tap **Enable push / Repair**, then **Send 5-second test** and immediately background the app. Confirm an iPhone system notification arrives.

If an earlier v3.3.4 draft was already applied, rerun the current migration once. It only replaces the read RPC and reapplies its grant; it does not write financial rows.

## Client vs server configuration

`js/config.js` contains browser-safe values only: the **Supabase project URL**, the Supabase **publishable key**, and the **VAPID public key**. Never place a Supabase secret/service key, VAPID private key, or cron secret in browser code.

Vercel environment variables hold the server-only configuration, including `SUPABASE_SECRET_KEY`, `VAPID_PRIVATE_KEY`, and `CRON_SECRET`. Keep the matching public variables configured there as required by the API functions.

## Production acceptance

- Home "Pay these people", Balance, and payment QR sheets agree on totals and category/date breakdowns.
- KD profile/name changes do not fork balance identity; member ids remain the source of truth.
- Rent appears as its own admin action and as its own balance category.
- Due schedule groups Overdue, Due within 5 days, Later this month, and No due date.
- Payment breakdown rows do not overlap on iPhone widths and member avatars render from profile media when present.
- Announcement ticker is readable and not too fast.
- Push diagnostics show Permission granted, Browser subscription ready, Server registration ready, and VAPID key current before the background test.

## Fresh deployment

For a new Supabase project run `schema.sql`, create the four Auth accounts, run `seed-members.sql`, then `migrate-history.sql`. Configure `js/config.js` with browser-safe values only; configure server secrets in Vercel environments. The daily `/api/reminders` cron remains `0 0 * * *` (8:00 AM PHT).
