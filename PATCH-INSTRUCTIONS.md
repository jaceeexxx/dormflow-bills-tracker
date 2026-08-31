# DormFlow v3.3 Upgrade Patch

This patch is for an existing DormFlow v3.2 household that already has the four Auth users, August history, v3.2 media/payment-profile migration, and the private Storage buckets.

## Apply in this order

1. Back up your current local DormFlow project folder.
2. Copy the contents of this patch into the project root and choose **Replace** for matching files. Keep your existing `js/config.js` and `.env.local`; this patch does not contain real credentials.
3. In Supabase → SQL Editor, run `supabase/migrate-v3.3.sql` **once**.
4. Do **not** rerun `schema.sql`, `seed-members.sql`, `migrate-history.sql`, or `migrate-v3.2.sql` on your already-configured v3.2 project.
5. If push is not configured yet, generate VAPID keys with `npx web-push generate-vapid-keys` and configure:
   - browser-safe public key in `js/config.js` → `vapidPublicKey`
   - `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `CRON_SECRET` in `.env.local` and Vercel
   - keep `SUPABASE_SECRET_KEY` server-only
6. Run `npm install`, `npm test`, `npm run check`, then `vercel dev`.
7. Test Notifications. Inbox is always on; all five push categories default ON. Each device still requires the user to approve OS/browser notification permission once.
8. As Jace/admin go to **Manage → Monthly Setup** and make **September 2026** current.
9. Confirm August becomes **Closed**, September becomes **Active**, Home/Admin display September, and unpaid August obligations still remain in Current Balance.

## Reminder schedule

DormFlow creates reminder Inbox events at 3 days before, 1 day before, due today, and once per overdue day. The Vercel cron runs at `00:00 UTC`, which is `08:00` Philippine time.

## Important accounting invariant

Changing the active month does not copy, reset, move, or delete older unpaid obligations. Prior unpaid balances remain attached to their original month and continue contributing to Current Balance until paid.
