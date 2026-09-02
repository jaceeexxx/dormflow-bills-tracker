# DormFlow v3.3.5 - 20 St. Paul

DormFlow v3.3.5 is the exact payment selection and receipt visibility release. It keeps the v3.3.4 balance, rent, due-status, and repayment clarity work while adding item-level payment choices, partial payment allocations, receipt review after admin approval, and the payee payment-received notification.

## Upgrade an existing v3.3.4 household

Use this exact order:

1. Back up the current project/database.
2. Overlay the v3.3.5 application patch.
3. In Supabase SQL Editor, run **only** `supabase/migrate-v3.3.5.sql` once.
4. Do **not** rerun `schema.sql`, `seed-members.sql`, `migrate-history.sql`, `migrate-v3.2.sql`, `migrate-v3.3.sql`, `migrate-v3.3.1.sql`, `migrate-v3.3.2.sql`, `migrate-v3.3.3.sql`, or `migrate-v3.3.4.sql` on an existing v3.3.4 database.
5. Run `npm test` and `npm run check`.
6. Deploy with `vercel deploy --prod` or push the linked Git repository.
7. Fully close and reopen the installed iPhone PWA once so the v3.3.5 service worker takes control.

The v3.3.5 migration is additive. It adds `payment_target_options_v3()`, requires Report Payment to declare the exact obligation rows being paid, preserves those rows through admin review, grants approved claim receipt visibility to the payer/payee/admin, and sends the payee notification only after admin approval. It does not modify settled financial data.

If you already ran an earlier copy of v3.3.5, rerun the current `supabase/migrate-v3.3.5.sql` once. It is safe to rerun because it only uses `CREATE OR REPLACE FUNCTION`, policy replacement, and grants; it does not insert, update, delete, or duplicate financial rows.

## Balance and rent clarity

- Admin can add Rent as its own first-class action.
- Home "Pay these people" and the payment QR sheet use the same detailed balance source.
- Payment sheets show the owed breakdown, such as Groceries, Rent, PayLater / Loans, and Housing & Utilities.
- Report Payment lets the payer choose exactly which dated balance rows to pay and enter partial amounts per row.
- Admin Review shows the chosen rows and can approve them into the matching allocations.
- Approved claims notify the payee with the receipt/details prompt after the financial write succeeds.
- Due schedule groups items into Overdue, Due within 5 days, Later this month, and No due date.
- Overdue and due-soon flags are derived from the obligation or expense due date.
- Credit balance includes a creditor/payment breakdown instead of only one vague total.
- Announcement ticker timing is slower for easier reading.

## Canonical September PayLater schedule

The v3.3.2 migration reconciles the legacy schedule to the workbook:

- Sep 5: SPayLater - Aerian - PHP 592 installment / PHP 148 economic share per dormie.
- Sep 5: SPayLater - Jace - PHP 4,660 installment / PHP 1,165 per dormie.
- Sep 15: SPayLater - Aexy - PHP 280 / PHP 70 per dormie.
- Sep 15: SPayLater - KD - PHP 428 / PHP 107 per dormie.
- Sep 16: TikTok PayLater - Jace - PHP 360 / PHP 90 per dormie.

For every installment, the borrower pays the provider. The borrower's own 25% is automatically settled; only the other three roommates receive reimbursement obligations owed to the borrower.

## iPhone push verification

Push "Active" requires notification permission, a browser subscription, the current VAPID key, and a matching active server registration.

After deploying v3.3.5 on the installed Home Screen PWA:

1. Open **Notifications**.
2. Tap **Enable push / Repair** once to re-register the device with the current VAPID pair.
3. Confirm Permission, Browser subscription, Server registration, and VAPID key are all ready/current.
4. Tap **Send 5-second test**.
5. Immediately go to the iPhone Home Screen.
6. A real system DormFlow test notification should arrive about five seconds later.

If the test reports a stale/expired subscription, re-enable push and repeat. 404/410 subscriptions are automatically marked inactive.

## Fresh setup

For a new project use `schema.sql` -> create the four Auth accounts -> `seed-members.sql` -> `migrate-history.sql`. The fresh schema/history files already contain the current v3.3.5 read models, exact payment target flow, approved receipt visibility, and corrected legacy PayLater source values; do not run additive migrations after a fresh setup.

August verification remains **PHP 23,944.22 total / PHP 22,062.29 settled / PHP 1,881.93 outstanding**.

## Security

`js/config.js` may contain only the browser-safe Supabase URL/publishable key and VAPID public key. Keep `SUPABASE_SECRET_KEY`, VAPID private key, `CRON_SECRET`, passwords, private receipts, and other server secrets out of browser code and Git.
