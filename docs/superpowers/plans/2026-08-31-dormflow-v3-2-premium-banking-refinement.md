# DormFlow v3.2 Premium Banking Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the authenticated DormFlow v3 PWA into the stakeholder-approved premium banking experience while fixing admin access, adding profile/QR media workflows, and preserving all existing financial data and server-authoritative accounting behavior.

**Architecture:** Keep the v3 Auth/RLS/ledger/PWA architecture intact. Add one idempotent Supabase v3.2 migration for `profiles` access, household-safe payment profiles, and private household media; add focused client modules for banking carousel and household media; redesign member Home/Balance/Account and admin surfaces using existing read models; update the service worker to network-first release-critical assets.

**Tech Stack:** Vanilla ES modules, HTML/CSS, Supabase Auth/PostgREST/Storage/RLS, Vercel serverless APIs, Web Push, PWA service worker, Node `node:test` contract tests.

**Spec:** `docs/superpowers/specs/2026-08-31-dormflow-v3-2-premium-banking-refinement-design.md`

## Global Constraints

- Existing Supabase Auth users, household-member links, and August financial history must not be reset or reseeded.
- Preserve verified August totals: obligations `2394422`, settled `2206229`, outstanding `188193` centavos.
- Supabase service-role/secret credentials remain server-only and must never appear in browser JavaScript or the release ZIP.
- Cards remain a core UI primitive across mobile, tablet, installed PWA, and desktop.
- Home uses a swipeable/drag banking-card carousel; Balance is a distinct detailed account-position screen.
- MariBank is the default payment provider, but DormFlow must use an original provider badge unless an official asset is supplied.
- Household members may read household-safe payment profiles and QR images; only owner/admin may edit them.
- Receipts/payment references keep existing stricter privacy rules.
- `prefers-reduced-motion` must remove non-essential 3D/transition effects.
- Release-critical HTML/CSS/JS must not remain indefinitely stale behind service-worker cache-first behavior.

---

### Task 1: Add the v3.2 Supabase additive migration

**Files:**
- Create: `supabase/migrate-v3.2.sql`
- Test: `tests/v3-2-schema.test.mjs`

**Interfaces:**
- Consumes: existing `profiles`, `household_members`, `member_payment_methods`, `attachments`, `storage.objects`/`storage.buckets`, helper functions `current_member_id_v3`, `current_household_id_v3`, `is_household_admin_v3`.
- Produces: authenticated `profiles` SELECT grant; `member_payment_methods.provider`, `account_name`, `qr_attachment_id` compatibility; `household-media` private bucket; household-safe payment-profile read RLS; owner/admin write RLS; household-media avatar/QR read/write policies.

- [ ] **Step 1: Write the failing schema contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrate-v3.2.sql', 'utf8');

test('v3.2 migration grants profile reads and creates household media', () => {
  assert.match(sql, /grant select on public\.profiles to authenticated/i);
  assert.match(sql, /household-media/i);
  assert.match(sql, /member_payment_methods/i);
  assert.match(sql, /provider/i);
  assert.match(sql, /account_name/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/v3-2-schema.test.mjs`

Expected: FAIL because `supabase/migrate-v3.2.sql` does not exist.

- [ ] **Step 3: Implement the additive SQL migration**

The migration must use `begin; ... commit;`, `if not exists`/catalog checks where PostgreSQL requires them, preserve existing payment-method rows, default provider to `MariBank`, create the private `household-media` bucket with JPG/PNG/WebP and 5 MB limit, and replace the old owner/admin-only payment-method SELECT policy with same-household read access while retaining owner/admin writes.

Storage object paths must be household scoped:

```text
<household_uuid>/profiles/<member_uuid>/avatar/<uuid>-photo.webp
<household_uuid>/payment-profiles/<member_uuid>/qr/<uuid>-qr.png
```

- [ ] **Step 4: Run focused and existing schema tests**

Run: `node --test tests/v3-2-schema.test.mjs tests/v3-schema.test.mjs tests/v3-release.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrate-v3.2.sql tests/v3-2-schema.test.mjs
git commit -m "feat: add DormFlow v3.2 media migration"
```

### Task 2: Add household media and payment-profile data helpers

**Files:**
- Modify: `js/supabase-client.js`
- Create: `js/household-media.js`
- Modify: `js/people-settings.js`
- Test: `tests/v3-2-profile-media.test.mjs`

**Interfaces:**
- Consumes: authenticated Supabase session from `js/auth.js`, `household-media` bucket, `profiles.avatar_path`, `member_payment_methods`.
- Produces: `uploadStorageObject(bucket,path,file)`, `removeStorageObject(bucket,path)`, `createSignedStorageUrl(bucket,path,expiresIn)`; `uploadAvatar`, `removeAvatar`, `uploadPaymentQr`, `removePaymentQr`, `loadHouseholdPaymentProfiles`.

- [ ] **Step 1: Write failing module/UI contract tests**

Assert that:

```js
assert.match(mediaSource, /uploadAvatar/);
assert.match(mediaSource, /uploadPaymentQr/);
assert.match(profileSource, /Upload photo/);
assert.match(profileSource, /Upload QR/);
assert.doesNotMatch(profileSource, /QR image path/i);
assert.match(profileSource, /MariBank/);
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test tests/v3-2-profile-media.test.mjs`

Expected: FAIL because the new module/actions are missing.

- [ ] **Step 3: Extend the Supabase client with binary Storage calls**

Implement authenticated Storage helpers using the existing project URL and bearer session. Upload requests send the raw `File` body with the file MIME type, not JSON. Signed URL creation posts to `/storage/v1/object/sign/<bucket>/<path>`.

- [ ] **Step 4: Implement `js/household-media.js`**

Validate image MIME (`image/jpeg`, `image/png`, `image/webp`) and max 5 MB before upload. Generate UUID-based object paths. Upload first, update DB reference second, and remove the new object if the DB update fails. Reuse signed URLs for rendering private images.

- [ ] **Step 5: Replace raw payment-method form fields with premium profile/QR flow**

`openPaymentMethodSheet()` renders Provider (`MariBank` default), Account name, Masked account number/display value, QR preview, Upload/Replace/Remove QR, and Save. `renderProfile()` shows avatar, role, household, Edit profile, payment profile, Notifications, Security/App Lock, and Sign Out grouping.

- [ ] **Step 6: Run focused and auth/client tests**

Run: `node --test tests/v3-2-profile-media.test.mjs tests/v3-auth-client.test.mjs tests/v3-auth-ui.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add js/supabase-client.js js/household-media.js js/people-settings.js tests/v3-2-profile-media.test.mjs
git commit -m "feat: add profile and MariBank QR media"
```

### Task 3: Implement the premium banking-card carousel and distinct Balance screen

**Files:**
- Create: `js/banking-carousel.js`
- Modify: `js/member-home.js`
- Modify: `js/member-balance.js`
- Modify: `js/dashboard-model.js`
- Modify: `css/styles.css`
- Test: `tests/v3-2-carousel-balance.test.mjs`

**Interfaces:**
- Consumes: `buildMemberDashboard`, member-home read model, member-balance RPC response.
- Produces: `initBankingCarousels(root=document)`; Home three-card carousel; detailed Balance layout with creditors, owed-to-you, credits, due/status/category/history affordances.

- [ ] **Step 1: Write failing carousel/Balance contracts**

Assert three Home card labels (`My Balance`, `Household This Month`, `My Monthly Share`), carousel roles/pagination, drag/arrow hooks, reduced-motion CSS, and detailed Balance sections (`You owe`, `Owed to you`, `Credits`, `Due schedule`, `Category breakdown`).

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/v3-2-carousel-balance.test.mjs`

Expected: FAIL because carousel markup/module and detailed Balance sections are absent.

- [ ] **Step 3: Implement `banking-carousel.js`**

Use pointer events for touch/mouse drag, CSS scroll-snap as the no-JS fallback, previous/next buttons on desktop, pagination dots, keyboard ArrowLeft/ArrowRight, and subtle drag-proportional `rotateY` only when reduced motion is not requested.

- [ ] **Step 4: Refactor Home into carousel-first banking layout**

Keep quick actions, `Pay these people`, household snapshot, announcements, and recent activity below the carousel. Do not duplicate the full Balance ledger on Home.

- [ ] **Step 5: Expand Balance into detailed account-position layout**

Render exact creditors, owed-to-you total, credit, net position, due/status grouping when available, category breakdown from the member dashboard/read model, payments shortcut, and month-history affordance. Creditor cards expose a payment-profile action rather than routing only to generic Payments.

- [ ] **Step 6: Add responsive and reduced-motion styles**

Mobile: one prominent card with adjacent-card peek; tablet/desktop: constrained card widths and arrows. Preserve safe-area padding and 44 px practical touch targets.

- [ ] **Step 7: Initialize carousel after route rendering**

Call `initBankingCarousels(root)` in `renderApp()` after `root.innerHTML` is set and before/with icon hydration.

- [ ] **Step 8: Run focused banking tests**

Run: `node --test tests/v3-2-carousel-balance.test.mjs tests/v3-banking-interactions.test.mjs tests/v3-banking-redesign.test.mjs tests/v3-visual-quality.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add js/banking-carousel.js js/member-home.js js/member-balance.js js/dashboard-model.js css/styles.css js/app.js tests/v3-2-carousel-balance.test.mjs
git commit -m "feat: add premium banking carousel"
```

### Task 4: Add household payment-profile browsing and creditor QR sheets

**Files:**
- Modify: `js/people-settings.js`
- Modify: `js/member-more.js`
- Modify: `js/member-balance.js`
- Modify: `js/app.js`
- Test: `tests/v3-2-payment-profiles.test.mjs`

**Interfaces:**
- Consumes: household-safe `member_payment_methods` RLS, signed QR URLs, member/profile data.
- Produces: `renderHouseholdPaymentProfiles(identity)`, `openPaymentProfileSheet(memberId)`, `payment-methods` route, creditor `Show payment details` action.

- [ ] **Step 1: Write failing navigation/rendering tests**

Require `More -> Payment Methods`, provider badge `MariBank`, QR preview/show action, owner/admin Edit action, and creditor cards with `data-payment-profile`.

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/v3-2-payment-profiles.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement household payment-profile renderer and bottom sheet**

Show member avatar/initial, MariBank provider badge, account name, masked account value, QR preview when present, and `Report payment` context when invoked from a creditor card. Never show private receipts or payment references.

- [ ] **Step 4: Wire route/actions**

Add `payment-methods` as an authenticated member/admin-personal route; bind `[data-payment-profile]` and owner/admin `[data-action="payment-method"]` actions.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/v3-2-payment-profiles.test.mjs tests/v3-completeness.test.mjs tests/v3-banking-redesign-routes.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/people-settings.js js/member-more.js js/member-balance.js js/app.js tests/v3-2-payment-profiles.test.mjs
git commit -m "feat: add household MariBank payment profiles"
```

### Task 5: Repair admin identity access and complete premium admin/announcement surfaces

**Files:**
- Modify: `js/admin-overview-v3.js`
- Modify: `js/announcements-v3.js`
- Modify: `js/app.js`
- Modify: `css/styles.css`
- Test: `tests/v3-2-admin-announcements.test.mjs`

**Interfaces:**
- Consumes: fixed profiles privilege, existing admin overview read model, announcement CRUD.
- Produces: admin diagnostic/retry state for identity/profile load failures, Announcement quick action and Manage route, premium announcement cards with Edit/Activate/Deactivate/Schedule affordances, Jace Admin/Personal mode switch.

- [ ] **Step 1: Write failing admin contracts**

Require announcement access from Add and Manage, edit/toggle controls, admin/personal switch labels, and absence of generic `permission denied` copy in normal successful render paths.

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/v3-2-admin-announcements.test.mjs`

Expected: FAIL on missing refinement contracts.

- [ ] **Step 3: Complete announcement management UX**

Retain create/edit/activate/deactivate/schedule/priority/notify fields, but render with banking cards and bottom-sheet actions. Member Home announcement presentation uses premium notification/banner cards instead of migration/debug-looking rows.

- [ ] **Step 4: Preserve Jace dual-mode navigation**

One Auth account retains admin routes plus personal Home/Balance/Payments/Utilities/Expenses/PayLater/Account routes. Mode switches must not mutate role or Auth identity.

- [ ] **Step 5: Run admin regression tests**

Run: `node --test tests/v3-2-admin-announcements.test.mjs tests/v3-admin.test.mjs tests/v3-admin-workflows.test.mjs tests/v3-banking-redesign-extended.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/admin-overview-v3.js js/announcements-v3.js js/app.js css/styles.css tests/v3-2-admin-announcements.test.mjs
git commit -m "feat: complete premium admin surfaces"
```

### Task 6: Clean activity copy and expand the custom icon/motion system

**Files:**
- Modify: `js/dashboard-model.js`
- Modify: `js/member-home.js`
- Modify: `js/icons.js`
- Modify: `css/styles.css`
- Test: `tests/v3-2-visual-copy.test.mjs`

**Interfaces:**
- Consumes: expense/payment domain fields including migration provenance.
- Produces: domain-facing activity labels only; expanded custom icon names `qr`, `profile`, `camera`, `copy`, `edit`, `settings`, `reports`, `members`; consistent pressed/focus/skeleton/bottom-sheet motion.

- [ ] **Step 1: Write failing visual/copy tests**

Assert source/UI does not render `Legacy workbook`, `Imported history`, `Historical record`, or `v1 migration`, and required custom icon names exist.

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/v3-2-visual-copy.test.mjs`

Expected: FAIL where migration source text or missing icons remain.

- [ ] **Step 3: Map activity rows to domain copy**

Use `Payment`, `Meralco`, `Water`, `PLDT WiFi`, `Groceries`, `PayLater`, or `Other Expense` based on source/category fields. Keep provenance only in DB/audit data.

- [ ] **Step 4: Expand icons and motion CSS**

Add only useful icons/actions, consistent line geometry, touch pressed state, bottom-sheet transition, skeleton transition, progress/number transition hooks, and reduced-motion overrides.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/v3-2-visual-copy.test.mjs tests/v3-visual-quality.test.mjs tests/v3-banking-redesign-extended.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/dashboard-model.js js/member-home.js js/icons.js css/styles.css tests/v3-2-visual-copy.test.mjs
git commit -m "style: finish DormFlow v3.2 banking polish"
```

### Task 7: Fix PWA cache invalidation

**Files:**
- Modify: `service-worker.js`
- Test: `tests/v3-2-service-worker.test.mjs`

**Interfaces:**
- Consumes: existing PWA shell asset list.
- Produces: release-versioned cache and network-first same-origin HTML/CSS/JS with cached fallback; old-cache cleanup on activate.

- [ ] **Step 1: Write failing service-worker test**

Require a cache name containing `v3-2`, old-cache deletion, and a network-first branch for `.css`, `.js`, and navigation requests.

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/v3-2-service-worker.test.mjs`

Expected: FAIL because current CSS/JS is cache-first under `dormflow-v3-shell-1`.

- [ ] **Step 3: Implement network-first release-critical caching**

Navigation and same-origin `.css`/`.js` call `fetch()` first; successful responses update the current cache; failures fall back to cache/offline shell. Static brand icons/manifest may remain cache-first or stale-while-revalidate.

- [ ] **Step 4: Run PWA tests**

Run: `node --test tests/v3-2-service-worker.test.mjs tests/v3-pwa.test.mjs tests/v3-release.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add service-worker.js tests/v3-2-service-worker.test.mjs
git commit -m "fix: prevent stale DormFlow release assets"
```

### Task 8: Update docs, run complete release verification, and package v3.2

**Files:**
- Modify: `README.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `RELEASE-CHECKLIST.md`
- Modify: `package.json`
- Test: all `tests/v3-*.test.mjs` and `tests/v3-2-*.test.mjs`

**Interfaces:**
- Consumes: completed v3.2 code and `supabase/migrate-v3.2.sql`.
- Produces: clear existing-database upgrade instructions and a GitHub/Vercel-ready ZIP that contains no secret credentials.

- [ ] **Step 1: Update upgrade instructions**

Document this exact existing-project order:

```text
1. Back up/confirm existing v3 Supabase project.
2. Run supabase/migrate-v3.2.sql once.
3. Do NOT rerun schema.sql, seed-members.sql, or migrate-history.sql.
4. Keep SUPABASE_SECRET_KEY only in .env.local / Vercel Environment Variables.
5. npm install
6. npm test
7. npm run check
8. vercel dev
9. smoke-test Jace admin + Jace personal + one member + avatar + QR + announcement.
10. deploy through GitHub/Vercel.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 3: Run project safety check**

Run: `npm run check`

Expected: exit code 0; no embedded service secret, `.env.local`, Git metadata, or forbidden release artifacts.

- [ ] **Step 4: Run release packager**

Run: `npm run release`

Expected: release ZIP created successfully.

- [ ] **Step 5: Extract the release ZIP into a clean temporary directory and verify it**

Run the equivalent of:

```bash
rm -rf /tmp/dormflow-v3-2-release-check
mkdir -p /tmp/dormflow-v3-2-release-check
unzip -q <release-zip> -d /tmp/dormflow-v3-2-release-check
cd /tmp/dormflow-v3-2-release-check/dormflow-bills-tracker
npm install
npm test
npm run check
```

Expected: same green suite and safety check from the archived copy.

- [ ] **Step 6: Commit release/docs changes**

```bash
git add README.md docs/DEPLOYMENT.md RELEASE-CHECKLIST.md package.json scripts tests
git commit -m "release: prepare DormFlow v3.2 premium banking PWA"
```
