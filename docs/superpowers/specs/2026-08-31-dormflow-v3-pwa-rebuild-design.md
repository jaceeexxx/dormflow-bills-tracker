# DormFlow v3 PWA Rebuild Design

**Status:** Stakeholder-approved design consolidation, pending final written-spec review  
**Date:** 2026-08-31  
**Household:** 20 St. Paul  
**Product:** DormFlow  
**Primary stakeholder/admin:** Jace  

## 1. Purpose

DormFlow v3 rebuilds the current household bills tracker as a private, installable Progressive Web App for four roommates on iOS, Android, and desktop. The rebuild keeps the accounting concepts that already work—obligations, payment allocations, carry-over, credits, PayLater schedules, utility splitting, Smart Delete/void, announcements, and audit history—but removes the public-dashboard architecture and starts from a fresh Supabase project designed around authenticated users from day one.

The application must feel like a deliberately designed small banking product, not a generic admin template or AI-generated dashboard.

## 2. Product Goals

DormFlow v3 must:

1. Give each roommate a personalized financial home screen immediately after login.
2. Keep household-level finances transparent while protecting personal receipts, payment references, credits, and detailed transaction history.
3. Give the admin a fast mobile-first workflow for Utilities, Groceries, PayLater, Other Expenses, Payments, Claims, Announcements, Monthly Setup, and member management.
4. Preserve accounting correctness through server-authoritative transactions, explicit payment allocations, idempotency, audit history, and optimistic concurrency checks.
5. Install cleanly as a PWA on iOS and Android without requiring App Store or Play Store distribution.
6. Support in-app notifications and optional push notifications.
7. Provide a safe offline experience without allowing stale or queued financial writes.
8. Cleanly migrate useful August 2026 financial history into a new authenticated schema without carrying forward obsolete v1/v2 database structure.

## 3. Non-Goals

DormFlow v3 will not initially:

- be distributed through the Apple App Store or Google Play Store;
- provide public household access without login;
- allow public self-registration;
- allow offline creation, approval, editing, or deletion of financial records;
- cache receipt images, payment references, detailed transaction history, or audit logs for offline viewing;
- introduce complex enterprise accounting concepts such as double-entry general-ledger reporting, bank integrations, or external payment processing;
- use a heavy visual-design system, stock dashboard kit, generic icon pack as the brand, or decorative AI/SaaS motifs.

## 4. Users and Roles

The household has four authenticated users:

| Member | Role |
| --- | --- |
| Jace | `admin` |
| Kean | `member` |
| Aerian | `member` |
| Aexy | `member` |

Public sign-up is disabled. The admin manually creates each Supabase Auth account and privately gives each roommate a unique email/password combination.

Names are display values only. Security and financial ownership use UUIDs, never names.

## 5. Technology Direction

DormFlow remains intentionally small and maintainable:

- **Frontend:** dependency-light HTML/CSS/JavaScript ES modules, reorganized into one authenticated SPA/PWA shell rather than separate public/admin pages.
- **Hosting:** Vercel.
- **Backend:** Supabase Auth, PostgreSQL, RLS, database functions/RPCs, and private Storage.
- **Server-side endpoints:** Vercel serverless functions for operations that require server secrets or push delivery.
- **PWA:** web manifest, service worker, install metadata, custom icons, standalone mode, safe offline shell.
- **Push:** standards-based Web Push where supported, treated as progressive enhancement.

A framework is intentionally not required for this four-user household app. Modules must remain small and responsibility-focused so the authenticated shell does not become a single large script.

## 6. Core Architecture

```text
DormFlow PWA
      |
      +--> Supabase Auth
      |       |
      |       +--> profile/member identity + role
      |
      +--> Role-aware app shell
      |       |
      |       +--> Member experience
      |       +--> Admin experience
      |
      +--> Supabase PostgreSQL + RLS
      |
      +--> Private Supabase Storage
      |
      +--> Vercel server APIs
              |
              +--> push delivery
              +--> scheduled reminders
              +--> server-secret operations
```

There is no public financial dashboard in v3. Unauthenticated users see only the sign-in experience.

## 7. Authentication and Session Model

### 7.1 Sign-in

The login screen contains only the information needed to sign in:

- DormFlow custom mark
- `20 St. Paul`
- Email
- Password
- Sign In

No public registration link is shown.

### 7.2 Identity resolution

After Supabase Auth succeeds:

```text
auth.users.id
   -> profiles.user_id
   -> household_members.profile_id
   -> household + member UUID + role
```

The app does not ask a user to select who they are.

### 7.3 Session behavior

- Supabase sessions persist by default on the user's personal device.
- Expired/invalid server sessions require real sign-in again.
- Signing out clears user-specific cached summaries and local app-lock state that should not survive account changes.

### 7.4 Optional app lock

App Lock is a device-local privacy convenience, not authentication authority.

Initial modes:

- Off
- Local PIN
- Device authentication when safely supported by the platform/browser

Device authentication is progressive enhancement. Unsupported devices remain fully usable with Supabase login and optional local PIN.

Repeated app-lock failures can fall back to requiring full account login instead of implementing a complex local lockout system.

A local PIN must never be stored as plaintext. The device stores only a salted verifier derived with Web Crypto (or an equivalent browser cryptographic primitive), namespaced to the signed-in user. Signing out removes that verifier. Device-authentication support should use standards-based browser capabilities such as WebAuthn where appropriate, without exposing biometric data to DormFlow.

## 8. Privacy Model

DormFlow uses **hybrid privacy**.

### 8.1 Household-visible data

All authenticated household members may read:

- current billing period;
- household monthly total;
- category totals for Utilities, Groceries, and PayLater;
- shared household expenses that do not expose another member's private payment details;
- shared due dates;
- announcements;
- high-level settled/balance-remaining status for household members;
- general household recent activity where it does not expose private receipt/reference information.

### 8.2 Personal/private data

A member may read their own:

- exact obligations and creditor relationships;
- payment history;
- payment claims;
- payment allocations relevant to them;
- credits;
- receipts/files they are authorized to access;
- payment references;
- notification inbox/preferences;
- profile/payment method settings.

The admin may read all household records required to operate DormFlow.

### 8.3 RLS principle

Privacy is enforced in Supabase RLS and Storage policies, not only in frontend rendering.

Example:

```text
Kean -> Kean private payment history       ALLOW
Kean -> Aerian private payment history     DENY
Jace/admin -> Aerian payment history       ALLOW
```

## 9. New Supabase Data Model

The new Supabase project starts clean. The v3 schema is designed for authenticated operation rather than copied from v1/v2.

### 9.1 Identity

#### `profiles`

Application profile linked 1:1 to `auth.users`.

Core fields:

- `id uuid pk`
- `user_id uuid unique not null`
- `display_name text not null`
- `avatar_path text null`
- `created_at timestamptz`
- `updated_at timestamptz`

#### `households`

- `id uuid pk`
- `name text` — `20 St. Paul`
- `slug text unique`
- `timezone text` — `Asia/Manila`
- timestamps

#### `household_members`

- `id uuid pk`
- `household_id uuid`
- `profile_id uuid`
- `role text check in ('admin','member')`
- `is_active boolean`
- optional member accent metadata
- timestamps

A unique constraint prevents the same profile from being linked twice to the same household.

#### `member_payment_methods`

Stores a member's own payment-receiving details, such as GCash/Maya label, masked account text, and optional QR attachment reference. Members may manage only their own rows; admin may manage all household rows. Sensitive values are not exposed in household-wide read models.

### 9.2 Billing periods

#### `billing_periods`

- `id uuid pk`
- `household_id uuid`
- `month date` normalized to first day of month
- `status` (`draft`, `active`, `closed`)
- timestamps

A unique constraint on `(household_id, month)` prevents duplicate months.

### 9.3 Expenses and obligations

#### `expenses`

Source financial event.

Key fields:

- household and billing period IDs
- category/type
- description
- `amount_cents bigint`
- bill date/due date
- status metadata
- created/updated by
- `version integer`
- void fields (`voided_at`, `voided_by`, `void_reason`)
- timestamps

Money is always stored as integer centavos.

#### `expense_payers`

Supports one or multiple people funding an expense.

- `expense_id`
- `member_id`
- `amount_cents`

Payer contributions must sum to the expense total before the expense is committed.

#### `expense_splits`

Represents each member's share.

- `expense_id`
- `member_id`
- `amount_cents`
- optional percentage metadata

Shares must reconcile exactly to the expense total after deterministic centavo rounding.

#### `obligations`

Represents a real debtor -> creditor amount generated from expenses or opening-history migration.

Key fields:

- household/period/source expense IDs
- debtor member ID
- creditor member ID
- original amount cents
- due date
- source category
- timestamps

The application never stores a manually editable remaining-balance field as the source of truth.

### 9.4 Payments

#### `payments`

Approved financial movement.

- payer member
- payee member
- amount cents
- date/method/reference metadata
- created/verified by
- idempotency key
- timestamps

#### `payment_allocations`

Maps approved payment amounts to exact obligations.

Outstanding balances derive from:

```text
obligation original amount
- approved payment allocations
- applied credits
= outstanding amount
```

#### `payment_claims`

Member-submitted payment awaiting admin review.

Statuses:

- `pending`
- `verified`
- `rejected`
- `withdrawn`

Members may edit/withdraw only their own `pending` claims. Approval creates/links the real payment atomically.

#### `credits`

Tracks explicit member-to-member available credit rather than silently overpaying an obligation.

### 9.5 Utilities

#### `utility_records`

Utility-specific metadata attached to the common expense engine.

Types:

- `electricity`
- `water`
- `wifi`

`utility_records` references an `expenses` row; it does not duplicate accounting logic.

Admin is the default payer for utility entry, but the payer remains a stored relationship rather than hard-coded business logic.

Default split workflow:

- preset defaults to `All 4 Equally`;
- all active household members are checked;
- admin visually confirms/unchecks participants before saving;
- equal split among checked members is recalculated immediately;
- custom amount/percentage/one-person modes remain available.

### 9.6 PayLater

#### `paylater_accounts`

- household
- provider
- borrower member
- creditor/covering member where applicable
- original principal/total cents
- status
- timestamps

#### `paylater_installments`

- account ID
- billing period
- due date
- amount cents
- state
- optional generated expense/obligation linkage

Active schedules can feed new-month setup automatically.

### 9.7 Split presets

#### `split_presets`

Stores reusable participant/default split definitions, including `All 4 Equally`.

### 9.8 Announcements

#### `announcements`

Core fields:

- household ID
- title
- body
- priority
- `starts_at`
- `ends_at`
- `is_active`
- `notify_household boolean`
- created/updated by
- timestamps

Only active announcements inside their schedule window are shown to members.

### 9.9 Attachments

#### `attachments`

Metadata for private Storage objects attached to payments, claims, expenses, utilities, or PayLater records.

Original files remain private. Access uses RLS + signed URLs.

### 9.10 Notifications

#### `notifications`

- recipient profile/member
- type
- title
- body
- deep-link target metadata
- `read_at`
- timestamps

#### `notification_preferences`

Per-user booleans for:

- payment updates
- due reminders
- announcements
- expense updates

Default preferences for a newly linked member are:

- payment updates: ON
- due reminders: ON
- announcements: ON
- expense updates: OFF

#### `push_subscriptions`

One user may have multiple device/browser push subscriptions. Revoked or failed endpoints can be deactivated without touching the user's account.

### 9.11 Audit

#### `audit_log`

Captures meaningful admin and financial workflow changes:

- actor
- action
- entity type/id
- before/after summary where appropriate
- reason
- timestamp

The audit log is admin-only.

## 10. Financial Rules

### 10.1 Money

All calculations use integer centavos. UI formatting converts centavos to Philippine peso display values.

### 10.2 Carry-over

Historical activity remains associated with the original month. Unpaid obligations remain outstanding until settled; they do not need to be copied as fake new expenses to carry forward.

The current balance read model includes unpaid prior-period obligations.

### 10.3 Payment allocation

Admin-approved payments support:

- oldest-debt-first suggested allocation;
- manual allocation adjustment before commit;
- partial payments;
- multiple target obligations;
- overpayment choice: keep as credit, apply elsewhere, or record only required amount.

### 10.4 Net and simplified settlement

DormFlow preserves actual debtor/creditor obligations and may separately calculate:

- member net position;
- optional simplified settlement recommendation minimizing transfers.

These calculations never silently rewrite the real ledger.

### 10.5 Smart Delete

Admin sees a Delete action, but backend logic chooses the safe result:

- unlinked/unsettled record: permanent delete may be allowed;
- record already tied to verified financial activity: void instead;
- voided records are excluded from normal active read models and due/upcoming lists;
- audit history remains available.

## 11. Member Experience

### 11.1 Mobile navigation

Primary mobile tabs:

```text
Home | Balance | Payments | More
```

No permanent hamburger-heavy navigation.

### 11.2 Home

Personal information appears before household analytics.

Priority order:

1. greeting/member identity;
2. current personal outstanding balance;
3. exact people the member needs to pay;
4. due-soon amount;
5. Report Payment action;
6. current household monthly total;
7. Utilities/Groceries/PayLater totals;
8. announcements;
9. relevant upcoming household bills/activity;
10. optional lower-priority trends.

### 11.3 Balance

Shows:

- current outstanding;
- creditor relationships;
- amounts owed to the user;
- net position;
- category breakdown;
- carry-over;
- credits;
- due dates;
- previous months.

### 11.4 Payments

Shows:

- Report Payment;
- pending claims;
- verified/rejected history;
- authorized receipts.

A pending claim opens a focused bottom sheet. Members may edit/withdraw only while pending.

### 11.5 Report Payment

Because identity is authenticated, payer is never manually selectable by a member.

Flow:

1. choose payee from valid household creditors/open relationships;
2. enter amount;
3. choose suggested oldest balances or manual targets;
4. select method;
5. optionally upload receipt;
6. review exact allocation suggestion;
7. submit once with idempotency key;
8. claim becomes `pending` and balance does not change yet.

### 11.6 More

Contains lower-frequency member areas:

- Utilities
- Household Expenses
- PayLater
- Notifications
- Payment Method
- Profile
- Security

## 12. Admin Experience

Jace remains both a household member and the admin. Admin mode therefore still exposes Jace's own personal balance/payment information through the Overview and profile/account area; admin privileges add operational tools rather than replacing the user's personal financial identity.

### 12.1 Mobile navigation

```text
Overview | + Add | Review | Manage
```

### 12.2 Add action sheet

The center Add action opens:

- Record Utility Bill
- Add Grocery
- Add PayLater
- Add Other Expense
- Record Payment
- Post Announcement

### 12.3 Review

Prioritizes:

- pending payment claims;
- overdue accounts;
- receipt review;
- month setup attention;
- records requiring intervention.

### 12.4 Manage

Contains:

- Utilities
- Groceries
- PayLater
- Other Expenses
- Announcements
- People & Splits
- Monthly Setup
- Reports
- Settings

Desktop may use a grouped restrained sidebar, but mobile remains bottom-nav/action-sheet first.

### 12.5 Record actions

Rows should not expose a wall of equal buttons.

Default pattern:

```text
Edit | •••
```

Overflow contains context actions such as:

- Add Receipt
- Duplicate
- Adjust Due Date
- Delete (Smart Delete)

## 13. Visual System

### 13.1 Design intent

DormFlow must look like a small private banking/finance product designed specifically for 20 St. Paul.

It must avoid:

- generic dashboard templates;
- giant rounded card grids for every value;
- arbitrary gradients/blobs;
- sparkle/star motifs;
- stock "AI SaaS" illustrations;
- icon beside every label;
- oversized success celebrations;
- raw database labels in the UI;
- unnecessary subtitles/footer captions.

### 13.2 Brand mark

The custom DormFlow mark should communicate **shared home + split/flow relationship** using simple original geometry.

It must not be:

- a stock house icon;
- wallet/coin icon;
- generic `D` inside a gradient circle;
- direct copy of a common icon-library glyph.

The mark must remain legible as an iOS/Android home-screen icon and as a small in-app header mark.

### 13.3 Color

Quiet-luxury banking palette:

- warm off-white canvas;
- near-black forest ink;
- deep muted DormFlow green as primary action/accent;
- stone neutrals;
- restrained brass/gold used rarely;
- muted amber for due-soon/warning;
- muted red only for overdue/destructive/error states.

Resident accent colors are identifiers only, not full-card themes.

### 13.4 Typography

Financial amounts get strong numerical hierarchy. Supporting labels remain understated. Avoid unnecessary all-caps and explanatory text.

### 13.5 Icons

Use a small custom-consistent line-icon language for navigation/actions only:

- Home
- Balance
- Payments
- More
- Add
- Notifications
- Receipt
- Back/Close

Categories such as Water/Meralco/WiFi should primarily use typography and subtle category marks rather than cartoon pictograms everywhere.

### 13.6 Motion

Motion is functional and restrained:

- bottom-sheet transition;
- navigation transition;
- skeleton loading;
- pull-to-refresh response;
- subtle amount/progress update;
- announcement ticker where retained;
- concise success confirmation.

No excessive bounce, floating cards, or decorative animation.

## 14. Announcements

Announcements appear in the authenticated member experience. A thin premium horizontal ticker may surface current notices near the top when appropriate, while the Home page also exposes a readable announcement section/detail view.

Admin may:

- create;
- edit;
- schedule start/end;
- activate/deactivate;
- set priority;
- choose whether to notify household;
- delete/archive according to simple content-history rules.

Announcement notifications point back to the actual announcement record.

## 15. Notifications and Push

### 15.1 In-app notifications

All push-worthy events create an in-app notification first.

Member event examples:

- payment approved/rejected;
- personal balance due soon;
- overdue balance;
- new utility affecting the member;
- PayLater installment approaching;
- new household announcement.

Admin event examples:

- new payment claim;
- receipt awaiting review;
- month setup required;
- overdue member balance.

### 15.2 Push

Push is optional per user and per device. Financial correctness never depends on push delivery. On iOS, push is treated as available only on supported OS/browser combinations and may require the site to be installed to the Home Screen; in-app notifications are the universal fallback.

Flow:

```text
financial/database event commits
        -> notification record created
        -> preferences checked
        -> push delivery attempted
```

If push fails, the financial event remains committed and the in-app notification remains available.

### 15.3 Reminder scheduler

A scheduled server job (Vercel Cron in the initial deployment) checks due-soon obligations, respects user preferences, and records reminder generation so the same reminder is not repeatedly emitted.

## 16. PWA and Offline Strategy

### 16.1 Installability

The app includes:

- `manifest.webmanifest`;
- custom standard and maskable icons;
- service worker;
- theme/background colors;
- `display: standalone`;
- iOS home-screen metadata;
- install guidance where useful.

### 16.2 Cached resources

The service worker may cache:

- app shell;
- CSS;
- JS bundles/modules;
- custom logo/icons;
- static UI assets;
- offline page.

Detailed financial API responses are network-first and are not treated as durable offline truth.

### 16.3 Safe offline summary

When online, the app may store only a small user-specific summary:

- user/member identifier;
- display name;
- last-known balance;
- due-soon total;
- last synced timestamp.

Offline UI clearly labels these values as **last known**, never current.

### 16.4 Never cached offline

Do not intentionally cache for offline use:

- receipt images/files;
- payment references;
- full payment history;
- detailed obligations;
- audit log;
- other members' private data.

### 16.5 No offline financial writes

While offline, DormFlow blocks:

- report payment;
- create/edit/delete/void expense;
- approve/reject payment claim;
- record payment;
- create utility/PayLater;
- initialize month;
- other ledger-changing actions.

The app does not queue these writes for later synchronization.

## 17. Safe Sync and Concurrency

### 17.1 Server-authoritative transactions

Multi-table financial operations execute atomically through database RPC/function logic or equivalent controlled server operations.

Example utility creation must either commit all of:

- expense;
- payer(s);
- split(s);
- generated obligation(s);
- utility metadata;
- audit event;

or commit none.

### 17.2 Idempotency

Important financial writes carry a unique idempotency key, including:

- payment claim submission;
- payment approval/verification;
- approved payment creation;
- utility/expense creation;
- month initialization.

Repeated requests with the same key return the existing result rather than duplicating money events.

### 17.3 Optimistic concurrency

Editable financial records use `version` or equivalent `updated_at` guard.

If the client submits an edit based on stale version N while server is already N+1, server rejects the overwrite and asks the client to refresh.

## 18. Loading, Errors, and Feedback

### 18.1 Loading

Use skeletons for screen content and button-local progress for actions. Avoid giant global spinners.

### 18.2 Error copy

User-facing errors are specific and non-technical.

Examples:

- `Couldn't refresh your balance.`
- `Utility wasn't saved. Nothing was added to the ledger.`
- `This record changed since you opened it. Refresh to continue.`

### 18.3 Success feedback

Short and calm:

- `Payment submitted`
- `Utility added`
- `Payment verified`

Avoid celebratory confetti/emoji language for normal financial operations.

## 19. Clean Historical Migration

The new Supabase schema is not migrated table-for-table from v1/v2.

A dedicated history migration inserts only useful financial history into v3 relationships after the four Auth accounts have been created and linked.

The August 2026 verification targets remain:

| Metric | Amount |
| --- | ---: |
| Total obligations | ₱23,944.22 |
| Settled | ₱22,062.29 |
| Outstanding | ₱1,881.93 |

The migration should also preserve the useful active PayLater schedule and outstanding obligations supported by the existing source data. Where an old record does not support a reliable person relationship, the migration must label it explicitly rather than invent identity.

## 20. Fresh Supabase Setup Sequence

The intended operator flow is:

1. Create a new Supabase project.
2. Run the new v3 `schema.sql` once.
3. Create the four Auth accounts manually.
4. Run a member-link/setup script using the four actual Auth UUIDs/emails.
5. Verify Jace = admin and the other three = member.
6. Run the clean historical migration.
7. Verify August totals exactly.
8. Verify private Storage and RLS policies with admin/member test accounts.
9. Configure Vercel environment variables.
10. Deploy.
11. Test login, privacy, financial workflows, push registration, and PWA installation on iOS and Android.

The release package should make this sequence explicit and should not require replaying previous v1/v2 patch migrations.

## 21. Deployment and Secrets

Browser-safe configuration may contain only public values such as:

- Supabase project URL;
- Supabase publishable key;
- public VAPID key or equivalent browser-safe push configuration.

Server-only environment variables stay in Vercel/local `.env.local`, never GitHub/browser code:

- Supabase secret/service-role credential;
- push private key/secret;
- scheduler/server signing secrets;
- any private rate-limit salt if used.

The release safety scanner must fail when secret-looking values are packaged into browser assets or ZIP output.

## 22. Acceptance Criteria

### Authentication

- [ ] Unauthenticated users cannot access household financial screens.
- [ ] Each of the four accounts signs in with its own credentials.
- [ ] Jace resolves to admin; Kean/Aerian/Aexy resolve to member.
- [ ] No public registration flow is exposed.
- [ ] Sign-out clears user-specific offline summary/app-lock state.

### Privacy/RLS

- [ ] A member can read their own detailed financial records.
- [ ] A member cannot read another member's private receipts/references/history.
- [ ] All members can read allowed household summary data.
- [ ] Admin can read/manage all required household data.
- [ ] Jace/admin can still access Jace's own personal balance and payment information as a household member.
- [ ] Private Storage access follows the same identity rules.

### Accounting

- [ ] All money uses integer centavos.
- [ ] Expense payer/split totals reconcile exactly.
- [ ] Outstanding balances derive from obligations, allocations, and credits.
- [ ] Partial payments work.
- [ ] Oldest-first suggested allocation is editable before approval.
- [ ] Overpayments can become credit/apply elsewhere/record only required amount.
- [ ] Smart Delete permanently deletes only safe records and voids financially linked records.
- [ ] Voided records disappear from active balance/due/upcoming read models.
- [ ] Idempotency prevents duplicate money events from double taps/retries.
- [ ] Stale edits cannot silently overwrite newer financial records.

### Member App

- [ ] Login lands directly on the signed-in member's personalized Home.
- [ ] Home prioritizes personal balance and exact people to pay before household analytics.
- [ ] Balance and Payments tabs expose only authorized personal detail.
- [ ] Member can submit a payment claim and optional receipt.
- [ ] Member can edit/withdraw only their own pending claim.
- [ ] Verified/rejected claims are read-only to the member.
- [ ] A member can manage only their own profile and payment-method/QR settings.

### Admin App

- [ ] Mobile admin navigation is `Overview / + Add / Review / Manage`.
- [ ] Add sheet exposes Utility, Grocery, PayLater, Other Expense, Payment, Announcement.
- [ ] Utilities combine Electricity/Meralco, Water, and PLDT WiFi.
- [ ] Utility default payer is admin and default split preset checks all active members.
- [ ] Admin can edit records and use overflow actions without a wall of buttons.
- [ ] Admin can verify/reject claims and apply exact payment allocations.
- [ ] Admin can create/schedule/edit announcements.

### PWA / Mobile

- [ ] App is installable on supported Android browsers.
- [ ] iOS Add to Home Screen launches standalone with correct branding.
- [ ] Custom logo/app icons do not use stock/template branding.
- [ ] Offline shell opens without exposing detailed private cached data.
- [ ] Offline summary clearly says last-known/last-synced.
- [ ] Financial write actions are blocked offline.
- [ ] Returning online refreshes authoritative balances.

### Notifications

- [ ] In-app notification center works even if push is disabled.
- [ ] Push permission is opt-in.
- [ ] Payment approval/rejection notifications target the correct member.
- [ ] Announcement notifications respect admin notify choice and member preferences.
- [ ] Due reminder job does not repeatedly emit the same reminder.

### Migration

- [ ] Fresh v3 schema runs successfully on a new Supabase project.
- [ ] Four users link to correct household member UUIDs/roles.
- [ ] Historical migration reproduces August ₱23,944.22 total, ₱22,062.29 settled, and ₱1,881.93 outstanding.
- [ ] Active useful PayLater/history is preserved without copying obsolete v1/v2 schema baggage.

### Visual Quality

- [ ] No generic dashboard-template appearance.
- [ ] No raw database labels are visible.
- [ ] Unnecessary subtitles/footer captions are removed.
- [ ] Financial hierarchy is carried primarily by typography/spacing rather than excessive cards.
- [ ] Icons are restrained and visually consistent.
- [ ] Custom DormFlow branding remains legible at app-icon and navigation size.

## 23. Testing Strategy

Implementation must remain test-driven. Tests should be grouped by responsibility rather than one giant end-to-end file.

Required coverage includes:

- ledger arithmetic and rounding;
- split generation;
- payment allocation and credits;
- read models for member/admin privacy;
- Supabase schema/RLS static assertions plus integration checks where practical;
- auth/session state transitions;
- payment-claim state machine;
- idempotency/concurrency helpers;
- utility workflow;
- announcements and notification preference logic;
- service-worker/offline safety behavior;
- PWA manifest/install metadata;
- mobile navigation smoke tests;
- migration verification totals;
- release secret-safety/ZIP checks.

## 24. Design Decision Log

The stakeholder approved these decisions during design:

- PWA rather than native Flutter/React Native for the current dorm use case.
- Fresh Supabase project.
- Hybrid household/privacy model.
- Email/password accounts manually created by admin; no public signup.
- Clean migration of useful history rather than copying old schema.
- Members may manage their own profile/payment method and pending claims but not shared accounting records.
- In-app + optional push notifications.
- Offline app shell + safe cached summary only.
- Stay signed in + optional local app lock/device authentication where supported.
- Focused mobile bottom navigation with contextual More/Manage.
- Personalized member information first, household information second.
- Utilities remain one combined area for Electricity/Meralco, Water, and PLDT WiFi.
- Utility splitting defaults to the preset-plus-checkbox workflow with all active members checked.
- Smart Delete remains.
- Premium banking-like visual direction with a non-templated custom logo/icon language and minimal unnecessary subtitles/captions.

## 25. Final Product Principle

DormFlow v3 is one private household app with four real identities:

> **Authenticated by default, personal where it should be personal, transparent where the household benefits, and server-authoritative whenever money changes.**

