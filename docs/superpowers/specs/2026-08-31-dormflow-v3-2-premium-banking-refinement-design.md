# DormFlow v3.2 Premium Banking Refinement Design

**Status:** Stakeholder-approved direction, pending written-spec review  
**Date:** 2026-08-31  
**Household:** 20 St. Paul  
**Product:** DormFlow  
**Primary stakeholder/admin:** Jace  
**Baseline:** DormFlow v3 authenticated PWA with working Supabase Auth, RLS, household ledger, and August 2026 migration

## 1. Purpose

DormFlow v3.2 refines the working v3 PWA into a richer consumer-banking experience inspired by the interaction quality of modern banking applications such as MariBank and UnionBank while preserving DormFlow's own identity, color system, logo, component geometry, information architecture, and custom icon family.

This refinement does **not** replace the working accounting engine or reset the current Supabase project. It fixes the current admin permission defect, adds a small additive Supabase migration for household-visible profile/payment media, differentiates Home from Balance, introduces a swipeable banking-card carousel, upgrades Account/Profile and payment-method management, cleans migration-specific activity labels from the visible UI, and completes announcement/admin surfaces.

The product target is: **a real private mobile banking app for four roommates, implemented as a responsive PWA rather than a web dashboard pretending to be an app.**

## 2. Hard Design Constraints

1. Cards remain a core UI primitive. DormFlow must use a deliberate mixture of strong account cards, compact action cards, grouped transaction surfaces, banners, and list rows.
2. The design must feel native-quality on iOS, Android, installed PWA mode, tablets, and desktop.
3. The app must not imitate another bank's trade dress, exact layouts, proprietary artwork, or brand color system. Banking applications are quality references, not templates.
4. DormFlow keeps its deep forest/emerald financial identity with restrained warm accents.
5. Icons must be custom and visually consistent. No emoji, mixed Unicode symbols, random stock-icon families, or decorative AI/SaaS motifs.
6. Motion must communicate state and hierarchy. It must not become decorative animation for its own sake.
7. `prefers-reduced-motion` must disable or simplify non-essential motion.
8. The working Auth/RLS/accounting model stays server-authoritative. Visual changes cannot bypass permissions or recalculate financial truth in the client.
9. The Supabase secret/service-role credential is never embedded in client JavaScript, the PWA bundle, or a GitHub-ready ZIP.

## 3. Problems This Refinement Solves

### 3.1 Admin cannot open

The current schema enables RLS and defines a `profiles` select policy but omits `GRANT SELECT ON public.profiles TO authenticated`. This causes the admin dashboard to fail with `permission denied for table profiles` even for a valid admin session.

v3.2 adds the missing table privilege through an additive migration and regression-tests admin identity resolution and admin overview loading.

### 3.2 Home and Balance feel duplicated

The current member Home and Balance surfaces both emphasize the same amount without sufficiently different purposes.

v3.2 makes:

- **Home:** a swipeable banking-card carousel plus quick actions, household snapshot, announcements, and recent activity.
- **Balance:** a detailed repayment/account-position workspace showing creditors, due schedule, category obligations, carry-over, payments, credits, and historical month drill-down.

### 3.3 Migration language leaks into the product

Normal users currently see technical labels such as `Legacy workbook`.

v3.2 keeps migration provenance in the database/audit layer but never renders it as customer-facing activity copy. Historical records render according to their actual domain type: Payment, Groceries, Meralco, PayLater, etc.

### 3.4 Profile and payment methods are under-designed

The current profile view is too simple and profile photos cannot be managed. Payment methods use a form-like layout, have no real QR upload workflow, and expose an unfinished QR-path input.

v3.2 introduces premium Account and Payment Profile experiences with image uploads backed by authenticated Supabase Storage.

## 4. Architecture Impact

The existing v3 architecture remains:

```text
DormFlow PWA
      |
      +--> Supabase Auth
      +--> Role-aware member/admin shell
      +--> PostgreSQL + RLS + RPCs
      +--> Supabase Storage
      +--> Vercel server APIs
```

v3.2 adds only:

- one additive database migration;
- one private household-media storage bucket or equivalent storage-policy expansion;
- profile avatar upload/read flows;
- payment QR upload/read flows;
- client-side banking carousel/motion components;
- redesigned route renderers and navigation;
- improved service-worker cache invalidation for future visual releases.

No financial tables are dropped, rewritten, or reseeded.

## 5. Supabase v3.2 Additive Migration

The migration must be idempotent and safe to run against the already-migrated v3 database.

### 5.1 Fix `profiles` access

Grant authenticated sessions the table-level permission required for the existing RLS policy to function:

```sql
grant select on public.profiles to authenticated;
```

The existing policy continues to decide which rows are visible.

### 5.2 Profile media

`profiles.avatar_path` already exists and remains the canonical avatar reference.

Create a private Storage bucket named `household-media` if it does not exist. Objects use household-scoped paths such as:

```text
<household_uuid>/profiles/<member_uuid>/avatar/<uuid>-photo.webp
```

Storage rules:

- active members of the same household may read profile avatars;
- a member may upload/replace/delete only their own avatar objects;
- an admin may manage avatars for members in their household;
- unauthenticated users cannot read the bucket.

Profile avatar files are limited to image MIME types (`image/jpeg`, `image/png`, `image/webp`) and a reasonable file-size ceiling such as 5 MB.

### 5.3 Payment profile model

Use `member_payment_methods` as the canonical payment-profile table. Align the database with the new UI instead of exposing unfinished client-only fields.

Required fields after migration:

- `id uuid`
- `member_id uuid`
- `provider text not null default 'MariBank'`
- `label text not null default 'Personal account'`
- `account_name text not null default ''`
- `masked_account text not null default ''`
- `qr_attachment_id uuid null`
- `is_default boolean`
- timestamps

The old generic `method` value may be migrated or retained for compatibility, but new UI language uses `provider` and defaults to `MariBank`.

Do **not** add a raw plaintext household-wide bank-account field solely for display. The normal shared payment profile exposes the member-provided account name, masked account number, provider, and QR code. Detailed receipts and transaction references remain private.

### 5.4 Payment QR storage

QR images use the private `household-media` bucket under a path such as:

```text
<household_uuid>/payment-profiles/<member_uuid>/qr/<uuid>-qr.png
```

Read policy:

- any active member in the same household may read another member's payment QR;
- this is intentional because the stakeholder selected the hybrid household payment-profile model.

Write policy:

- member may manage only their own QR;
- admin may manage all household payment QRs.

The QR attachment/reference must not be reused as a payment receipt. Payment receipts remain in the more restrictive financial-document storage path/policies.

### 5.5 Payment-method RLS

The current policy permits only owner/admin access. v3.2 changes read access so active household members may read the household-safe payment-profile fields for other active members, while insert/update/delete remain owner/admin only.

Private receipts, payment references, claim details, and audit information keep their existing stricter policies.

## 6. Member Home — Banking Card Carousel

Home becomes the richest mobile-banking screen.

### 6.1 Carousel contents

The first three cards are:

**Card 1 — My Balance**

- current outstanding;
- due-soon amount;
- available credit when non-zero;
- primary actions: `Report payment`, `View balance`.

**Card 2 — Household This Month**

- household monthly obligations;
- settled percentage;
- outstanding household amount;
- compact category composition.

**Card 3 — My Monthly Share**

- Housing & Utilities share;
- Groceries share;
- PayLater share;
- carry-over when present;
- amount paid this month.

### 6.2 Carousel interaction

Mobile/iOS/Android:

- horizontal touch swipe;
- card follows pointer/finger while dragging;
- subtle `rotateY`/depth response proportional to drag distance;
- snap to the nearest card when released;
- pagination dots;
- no auto-rotation timer.

Desktop:

- mouse/trackpad drag;
- previous/next controls;
- keyboard arrow navigation when carousel is focused.

Accessibility:

- semantic controls and visible focus states;
- `aria-label` describes the active card and position;
- `prefers-reduced-motion` removes 3D rotation and uses simple horizontal snapping/fade.

### 6.3 Home content below the carousel

Keep premium cards for:

- quick actions;
- `Pay these people`;
- household composition;
- active announcement(s);
- recent activity.

Home should answer **"What matters to me right now?"** and must not become a detailed ledger.

## 7. Balance — Distinct Detailed Financial Screen

Balance must not repeat the Home carousel as its primary content.

The screen contains:

1. compact account-position header;
2. exact creditor list (`You owe`);
3. `Owed to you` where applicable;
4. credits;
5. due schedule and overdue/due-soon status;
6. category breakdown;
7. carry-over and payments applied;
8. previous-month selector/history;
9. optional net-position summary.

Creditor cards can open a payment sheet that includes that person's shared MariBank payment profile and QR when available.

## 8. Premium Account / Profile

`Account` becomes a first-class banking screen rather than a simple settings page.

### 8.1 Identity card

Top card contains:

- profile photo or initials fallback;
- display name;
- role (`Admin` or `Member`);
- household (`20 St. Paul`);
- account/security status;
- `Edit profile` action.

### 8.2 Profile photo workflow

`Edit profile` opens a bottom sheet or focused panel with:

- current avatar preview;
- `Upload photo`;
- `Replace photo`;
- `Remove photo`;
- display-name edit.

Image is validated client-side before upload and persisted to `profiles.avatar_path` only after Storage upload succeeds.

When replacing/removing, orphaned old avatar objects should be removed when safe.

Avatar rendering is reused consistently in:

- app header;
- Account;
- payment profile;
- settlement/member cards;
- admin People view;
- creditor/payee surfaces.

### 8.3 Account services

Below the identity card, premium grouped cards link to:

- Payment Profile;
- Notifications;
- Security/App Lock;
- Push Notifications;
- Sign Out.

Jace's Account includes the Admin/Personal mode relationship but does not require a second Auth account.

## 9. MariBank Payment Profile

All four roommates use MariBank as the default provider.

### 9.1 Payment profile card

Display:

- provider: `MariBank`;
- provider badge/mark;
- account name;
- masked account number;
- QR preview;
- `Copy details` when there is useful copyable safe text;
- `Show QR`;
- owner/admin-only `Edit`.

The provider visual should use an official/local MariBank asset when one is supplied. If an official asset is not packaged, DormFlow uses a restrained provider badge (`MariBank` text / `MB` mark) rather than redrawing or imitating a proprietary bank logo.

### 9.2 Edit flow

The old raw `QR image path` text input is removed.

The new editor contains:

- Provider (defaults to MariBank);
- Account name;
- Masked account number / account display value;
- QR image preview;
- `Upload QR`;
- `Replace QR`;
- `Remove QR`;
- `Save`.

Upload accepts JPG/PNG/WebP, validates file size/type, writes Storage first, then atomically updates the payment profile reference.

### 9.3 Hybrid visibility

A member's payment profile is available:

- contextually when another member owes them;
- under `More -> Payment Methods`, where household members may intentionally browse the household payment profiles.

Only the owner/admin can edit it.

## 10. Admin Workspace

### 10.1 Permission repair

The admin overview must load after the `profiles` grant fix. Regression tests cover:

- Jace identity resolution;
- admin overview read model;
- profile list used by admin/member surfaces.

### 10.2 Banking dashboard

Admin Overview keeps the richer banking layout:

- household-position card;
- settlement progress;
- monthly composition;
- who-needs-to-pay-whom;
- settlement-by-member;
- upcoming obligations;
- recent activity;
- pending claims;
- announcements;
- quick actions.

### 10.3 Announcements

Announcements must be discoverable from both:

- the admin `+ Add` / Quick Actions surface;
- `Manage -> Announcements`.

Admin capabilities:

- create;
- edit;
- activate/deactivate;
- schedule start/end;
- choose priority;
- optionally notify household;
- delete/archive where safe.

Member Home renders active announcements as premium notification/banner cards rather than raw text rows.

## 11. Activity and Imported History Presentation

Migration provenance remains internal.

Never display normal-user strings such as:

- `Legacy workbook`;
- `v1 migration`;
- `Imported history`;
- `Historical record`.

Map records to domain copy instead:

- Payment;
- Meralco;
- Water;
- PLDT WiFi;
- Groceries;
- PayLater;
- Other Expense.

Supporting metadata may show method, date, payer/payee, or status when useful.

Admin audit/debug data may retain original source identifiers.

## 12. Icons and Buttons

### 12.1 Custom icon family

Expand the current DormFlow SVG line-icon system with consistent:

- 24x24 viewBox;
- stroke weight;
- rounded line caps/joins;
- optical padding;
- active/inactive state treatment.

Required icons include:

- Home;
- Balance/Wallet;
- Pay/Transfer;
- Activity;
- More;
- Utilities;
- Groceries;
- PayLater;
- Receipt;
- QR;
- Profile;
- Camera/Upload;
- Notifications;
- Announcement;
- Members;
- Reports;
- Settings;
- Edit;
- Overflow;
- Back/Close;
- Copy;
- Chevron/navigation.

Icons are used where they make scanning/actions faster, not beside every label.

### 12.2 Useful action hierarchy

Banking screens use:

- one visually dominant primary action when appropriate;
- compact quick-action tiles for common tasks;
- text/secondary actions inside cards;
- overflow menus for low-frequency/destructive actions;
- bottom sheets on mobile instead of crowded inline forms.

## 13. Motion and Micro-interactions

Allowed motion:

- banking-card swipe/depth;
- bottom sheet entrance/exit;
- route crossfade/slide where subtle;
- pressed/touch feedback;
- smooth progress-bar changes;
- number transitions for refreshed balances;
- skeleton-to-content transition;
- notification unread dot/state change;
- profile/QR image preview transition.

No confetti, bouncing financial cards, decorative floating blobs, or automatic carousel timers.

## 14. Responsive Rules

DormFlow must remain one coherent product across form factors.

### Mobile — primary target (`< 768px`)

- bottom navigation;
- edge-to-edge banking surfaces with safe gutters;
- one primary card column;
- swipe carousel;
- bottom sheets;
- touch targets at least ~44 CSS px where practical;
- `env(safe-area-inset-*)` support for installed iOS PWA.

### Tablet (`768px–1199px`)

- two-column card compositions where useful;
- bottom navigation or compact rail based on available width;
- carousel remains interactive;
- sheets may widen into centered panels.

### Desktop (`>= 1200px`)

- premium navigation rail;
- multi-column banking dashboard;
- same cards/components as mobile, not a separate admin-template design;
- carousel supports drag/arrows/keyboard;
- maximum readable content width prevents cards from stretching excessively.

Orientation changes and browser resizing must not lose active route, carousel state, or dialog state unnecessarily.

## 15. PWA Cache and Release Safety

The stale-CSS incident must not recur.

v3.2 changes the service-worker strategy:

- version the cache name per release;
- clean old caches during `activate`;
- use network-first for HTML, CSS, and JavaScript while online;
- fall back to cached shell only when the network fails;
- avoid long-lived cache-first behavior for release-critical application bundles;
- preserve the existing safe offline summary policy for financial data.

The release test must simulate or assert cache-version change semantics so a new stylesheet cannot be indefinitely shadowed by an older cache.

## 16. Error Handling

### Profile/QR upload

If Storage upload fails:

- do not update the database path/reference;
- show a concise error;
- retain the old avatar/QR.

If database update fails after a new upload:

- attempt cleanup of the newly uploaded orphan object;
- keep previous profile/payment method intact.

### Admin load

If permission/identity resolution fails, the screen must show a useful diagnostic state and retry action, but the release tests must prevent the known `profiles` grant defect from shipping again.

### Carousel

If JavaScript fails or reduced-motion disables enhancement, cards remain accessible as a horizontally scrollable CSS-snap surface.

## 17. Testing Requirements

### Database / RLS

Tests or SQL verification must cover:

- authenticated users can select allowed `profiles` rows after the new grant;
- member cannot edit another member's profile/avatar;
- member can read household payment profiles;
- member cannot edit another member's payment profile;
- admin can manage all four payment profiles;
- household member can read household-media avatar/QR objects;
- outsider/unauthenticated access is denied;
- financial-document receipt privacy remains unchanged.

### UI / behavior

Automated tests cover:

- Home carousel renders all required cards;
- carousel navigation/pagination contract;
- reduced-motion fallback;
- Balance renders detailed sections instead of duplicating Home;
- profile photo upload/replace/remove actions exist;
- payment method no longer exposes a QR path text input;
- QR upload/replace/remove actions exist;
- MariBank default provider rendering;
- clean activity labels contain no migration/debug wording;
- Jace admin overview loads and Jace can switch to personal routes;
- announcement create/edit/activate/deactivate routes remain accessible;
- responsive navigation contracts for member/admin screens;
- service-worker cache version/update strategy.

### Manual release matrix

Before packaging, smoke-test at minimum:

- desktop Chromium;
- narrow mobile viewport;
- iPhone Safari/PWA layout assumptions (safe-area CSS and touch behavior);
- Android Chrome/PWA layout assumptions;
- Jace admin mode;
- Jace personal mode;
- one regular member account;
- profile avatar upload;
- payment QR upload;
- creditor QR display;
- announcement creation and member display.

## 18. Data Migration / Existing Database

The existing Supabase database is **not** reset.

The v3.2 migration must:

1. add/fix only required privileges, columns, indexes, policies, and storage configuration;
2. preserve all August financial history and existing Auth/member links;
3. avoid rerunning `schema.sql`, `seed-members.sql`, or `migrate-history.sql`;
4. preserve the verified totals:

```text
August obligations   ₱23,944.22
August settled       ₱22,062.29
August outstanding   ₱1,881.93
```

No existing financial record is rewritten merely to remove `Legacy workbook` from the UI; that cleanup belongs in presentation/read-model mapping.

## 19. Acceptance Criteria

v3.2 is acceptable when all of the following are true:

1. Jace can open Admin without `permission denied for table profiles`.
2. Jace retains one Auth account and can switch between Admin Workspace and personal member views.
3. Member Home has a polished swipeable/drag banking-card carousel with three meaningful cards.
4. Balance is visibly and functionally distinct from Home.
5. Cards remain a strong part of the experience on mobile and desktop.
6. Profile photo can be uploaded, replaced, and removed.
7. Payment Profile defaults to MariBank and supports QR upload, preview, replace, and remove.
8. Household members can intentionally view other roommates' shared payment profiles/QRs but cannot edit them.
9. Private receipts/payment references remain private under existing financial-document policies.
10. Normal UI never shows `Legacy workbook` or other migration/debug provenance.
11. Admin Announcements are reachable, editable, schedulable, and visible to members when active.
12. Icons/actions feel consistent with the custom DormFlow banking design.
13. Animations remain subtle and reduced-motion compatible.
14. Layout behaves cleanly across iOS-sized, Android-sized, tablet, and desktop viewports.
15. A release update cannot keep serving stale old CSS/JS indefinitely through the service worker.
16. Existing financial totals and accounting behavior remain unchanged.
17. No server secret/service-role key is present in browser code or the release ZIP.

## 20. Product Principle

DormFlow v3.2 should feel like a small private bank for the household: **rich cards, confident financial hierarchy, fast personal actions, trustworthy admin control, and polished mobile interaction—without copying another bank or falling back to a generic dashboard template.**
