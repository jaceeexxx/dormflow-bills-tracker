# DormFlow v3.3.2 Upgrade — Existing v3.3.1 Project

This patch is for the existing DormFlow v3.3.1 project/database.

## 1. Back up first
Back up the current DormFlow project folder and Supabase database before applying the upgrade.

## 2. Overlay the patch
Copy the **contents** of this folder into the root of the existing DormFlow project and choose **Replace** for matching files.

This patch does not contain `.env.local` or `js/config.js`, so your local browser/server credentials are not replaced.

## 3. Run one Supabase migration
In Supabase SQL Editor, run only:

`supabase/migrate-v3.3.2.sql`

Run it once.

Do **not** rerun `schema.sql`, `seed-members.sql`, `migrate-history.sql`, `migrate-v3.2.sql`, `migrate-v3.3.sql`, or `migrate-v3.3.1.sql` on the existing database. `schema.sql` and `migrate-history.sql` are included in the source patch only so future fresh installs remain correct.

The migration is targeted. It reconciles only legacy imported PayLater accounts (`created_by is null`), repairs their unsettled scheduled reimbursement obligations, and prevents future draft-period debt from inflating the current balance. It does not reset the database or rewrite settled payment history.

If you manually created beta-test PayLater plans, those are intentionally not auto-deleted. Archive any known duplicate/test plan from Admin after confirming it is not part of the canonical imported schedule.

## 4. Verify locally

```powershell
npm test
npm run check
vercel dev
```

Open `http://localhost:3000/api/health` and confirm Supabase/push/cron are configured.

## 5. Deploy

```powershell
vercel deploy --prod
```

Then fully close and reopen the installed iPhone DormFlow PWA once so the v3.3.2 service worker takes control.

## 6. Repair and prove iPhone push
In the installed Home Screen PWA:

1. Open **Notifications**.
2. Tap **Enable push / Repair** once.
3. Confirm Permission, Browser subscription, Server registration, and VAPID key are ready/current.
4. Tap **Send 5-second test**.
5. Immediately go to the iPhone Home Screen.
6. Confirm a real DormFlow system push notification arrives.

## 7. Beta verification priority
1. Admin Add/Save: Utility, Grocery, Other Expense, Announcement, PayLater.
2. Upload/crop: selected file or crop state is visible before Save; successful Save closes automatically.
3. PayLater: Sep 5 Aerian ₱592 and Jace ₱4,660 appear in Upcoming; Sep 15/16 entries remain correct.
4. Household Settlement: Needs to pay / Owed to member / Net position are understandable.
5. Mobile: Schedule cards, notification rows, Back button, logo, Upcoming/Settlement text do not overlap.
6. Background iPhone push passes the 5-second test.
