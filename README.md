# DormFlow v3.3.2 · 20 St. Paul

DormFlow v3.3.2 is the Admin/accounting stabilization release after the second iPhone beta test. It keeps the v3.3 active-month, Inbox, realtime, and v3.3.1 Admin/PayLater foundations while repairing Admin Add/Save flows, legacy PayLater data, current-month balance filtering, Admin Settlement/Upcoming semantics, mobile overlap, crop/upload readiness, and real iPhone push diagnostics.

## Upgrade an existing v3.3.1 household

Use this exact order:

1. Back up the current project/database.
2. Overlay the v3.3.2 application patch.
3. In Supabase SQL Editor, run **only** `supabase/migrate-v3.3.2.sql` once.
4. Do **not** rerun `schema.sql`, `seed-members.sql`, `migrate-history.sql`, `migrate-v3.2.sql`, `migrate-v3.3.sql`, or `migrate-v3.3.1.sql` on an existing v3.3.1 database.
5. Run `npm test` and `npm run check`.
6. Deploy with `vercel deploy --prod` or push the linked Git repository.
7. Fully close and reopen the installed iPhone PWA once so the v3.3.2 service worker takes control.

The v3.3.2 migration is targeted. It repairs only legacy migrated PayLater schedules (`created_by is null`), rebuilds only unsettled scheduled reimbursement obligations, preserves posted/settled history, and makes current balances ignore future draft billing periods.

## Canonical September PayLater schedule

The migration reconciles the legacy schedule to the workbook:

- **Sep 5:** SPayLater · Aerian — ₱592 installment / ₱148 economic share per dormie.
- **Sep 5:** SPayLater · Jace — ₱4,660 installment / ₱1,165 per dormie.
- **Sep 15:** SPayLater · Aexy — ₱280 / ₱70 per dormie.
- **Sep 15:** SPayLater · Kean — ₱428 / ₱107 per dormie.
- **Sep 16:** TikTok PayLater · Jace — ₱360 / ₱90 per dormie.

For every installment, the borrower pays the provider. The borrower's own 25% is automatically settled; only the other three roommates receive reimbursement obligations owed to the borrower.

## Admin + mobile fixes

- Utility, Grocery, and Other Add forms use the normalized active `periodId` everywhere.
- Announcement and financial forms use one visible Save lifecycle: **Saving… → Successfully saved → close**; failed saves stay open with entered data.
- Selected receipts/QR/profile files show **Ready to upload** before Save.
- Profile cropper opens immediately in the browser top layer above the bottom sheet.
- Admin Settlement shows **Needs to pay / Owed to member / Net position**.
- Upcoming uses real current-month PayLater installments instead of fragmented reimbursement rows.
- PayLater schedule options render as separate mobile cards; Back is a full touch target; Notifications/Upcoming/Settlement text reflows without overlap; mobile header logo uses bounded geometry.

## iPhone push verification

Push “Active” now requires notification permission, a browser subscription, the current VAPID key, and a matching active server registration.

After deploying v3.3.2 on the installed Home Screen PWA:

1. Open **Notifications**.
2. Tap **Enable push / Repair** once to re-register the device with the current VAPID pair.
3. Confirm Permission, Browser subscription, Server registration, and VAPID key are all ready/current.
4. Tap **Send 5-second test**.
5. Immediately go to the iPhone Home Screen.
6. A real system DormFlow test notification should arrive about five seconds later.

If the test reports a stale/expired subscription, re-enable push and repeat. 404/410 subscriptions are automatically marked inactive.

## Fresh setup

For a new project use `schema.sql` → create the four Auth accounts → `seed-members.sql` → `migrate-history.sql`. The fresh schema/history files already contain the current v3.3.2 read-model and corrected legacy PayLater source values; do not run additive migrations after a fresh setup.

August verification remains **₱23,944.22 total / ₱22,062.29 settled / ₱1,881.93 outstanding**.

## Security

`js/config.js` may contain only the browser-safe Supabase URL/publishable key and VAPID public key. Keep `SUPABASE_SECRET_KEY`, VAPID private key, `CRON_SECRET`, passwords, private receipts, and other server secrets out of browser code and Git.
