# DormFlow v3.3 → v3.3.1 Beta Stabilization Upgrade

Use this patch only on an existing DormFlow v3.3 project.

1. Back up the current DormFlow project and Supabase database.
2. Copy the contents of this patch folder over the existing project root and replace matching files.
3. Do **not** overwrite your local/production secret configuration. This patch does not include `.env.local`, Vercel secrets, or a private key.
4. In Supabase SQL Editor, run `supabase/migrate-v3.3.1.sql` **once**.
5. Do **not** rerun `supabase/schema.sql`, `seed-members.sql`, `migrate-history.sql`, `migrate-v3.2.sql`, or `migrate-v3.3.sql` on the existing v3.3 database. `schema.sql` is included only so the source tree remains correct for future fresh installs and project checks.
6. Locally run `npm test` and `npm run check`.
7. Deploy the updated project to Vercel. Existing Supabase/VAPID/CRON environment variables can remain unchanged.
8. Reopen or hard-refresh the installed PWA once so the v3.3.1 service worker becomes active.
9. On a real iPhone, re-test profile/avatar, Admin Add/Edit/Archive, realtime member updates, PayLater, six-digit PIN, foreground notification banner, and background Lock Screen push.

## PayLater v3.3.1 rule

Every installment is split economically across all four dormies. The borrower pays the provider, so the borrower's own share is automatically settled and no self-obligation is created. Only the other three shares become obligations owed to the borrower. Equal schedules auto-distribute the principal across months; Custom schedules may change installment amounts/dates but must total the principal exactly.
