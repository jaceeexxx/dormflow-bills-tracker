# DormFlow v3 PWA Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild DormFlow as one private authenticated PWA for Jace, Kean, Aerian, and Aexy, with role-aware member/admin experiences, fresh Supabase schema/RLS, clean history migration, safe financial RPCs, private receipts, notifications, offline-safe PWA behavior, and premium custom mobile UI.

**Architecture:** Replace the public/admin split with one dependency-light authenticated SPA. Browser code talks to Supabase Auth/PostgREST/RPC/Storage using a small focused client; server-only Vercel functions handle push delivery and scheduled reminders. Accounting remains centavo-based and server-authoritative; member privacy is enforced in SQL RLS and Storage policies.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node.js built-in test runner, Supabase Auth/PostgreSQL/RLS/Storage, Vercel serverless functions and Cron, PWA manifest/service worker, Web Crypto/Web Push.

**Spec:** `docs/superpowers/specs/2026-08-31-dormflow-v3-pwa-rebuild-design.md`

## Global Constraints

- Four accounts only: Jace=`admin`; Kean/Aerian/Aexy=`member`; no public signup UI.
- Fresh Supabase project; do not require v1/v2 patch migrations.
- Hybrid privacy enforced by RLS/Storage, not frontend hiding.
- All money is integer centavos.
- No offline financial writes or detailed private financial caching.
- Mobile member navigation: `Home / Balance / Payments / More`.
- Mobile admin navigation: `Overview / + Add / Review / Manage`.
- Utilities combine electricity/Meralco, water, and WiFi with admin default payer and checkbox/preset splitting.
- Important writes use idempotency and stale-edit/concurrency guards.
- Premium banking-like visual language; no stock/template logo treatment, icon clutter, unnecessary subtitles, or footer captions.
- Release ZIP must contain no `.env`, secret/service-role credential, private push key, `.git`, or worktree metadata.

---

### Task 1: Rebuild Test Contract and App Shell

**Files:**
- Create: `tests/v3-shell.test.mjs`
- Create: `tests/v3-auth-ui.test.mjs`
- Replace: `index.html`
- Create: `js/app.js`
- Create: `js/router.js`
- Create: `js/icons.js`
- Replace: `css/styles.css`

**Interfaces:**
- Produces `navigate(view)`, `renderApp(state)`, and custom inline SVG icon helpers.
- Provides DOM anchors consumed by later auth/member/admin modules.

- [ ] Write tests asserting a single authenticated SPA shell, no public dashboard/admin page split, four member tabs, admin action tabs, no signup link, and no raw template/footer copy.
- [ ] Run targeted tests and confirm failure against v2.2.
- [ ] Implement the minimal premium sign-in/app shell and responsive bottom navigation.
- [ ] Run targeted tests and make them pass.
- [ ] Commit `feat: add authenticated v3 app shell`.

### Task 2: Supabase Auth Client and Session/App Lock State

**Files:**
- Create: `tests/v3-auth-client.test.mjs`
- Create: `js/supabase-client.js`
- Create: `js/auth.js`
- Create: `js/app-lock.js`
- Modify: `js/app.js`
- Replace: `js/config.js`

**Interfaces:**
- Produces `signIn(email,password)`, `signOut()`, `getSession()`, `refreshSession()`, `getIdentity()`, `rpc()`, `select()`, `insert()`, `update()`, `createSignedUrl()`.
- Produces `hashPinVerifier()`, `setLocalPin()`, `verifyLocalPin()`, `clearLocalSecurity()`.

- [ ] Write tests for password sign-in request shape, persisted session namespace, sign-out cleanup, no signup function/UI, and salted local-PIN verifier behavior.
- [ ] Run targeted tests and confirm expected failures.
- [ ] Implement minimal REST-based Supabase Auth/PostgREST/Storage client and local app-lock helpers.
- [ ] Run targeted tests and make them pass.
- [ ] Commit `feat: add v3 authentication and app lock`.

### Task 3: Fresh Supabase v3 Schema, RLS, Storage, and Transaction RPCs

**Files:**
- Create: `tests/v3-schema.test.mjs`
- Replace: `supabase/schema.sql`
- Create: `supabase/seed-members.sql`
- Replace: `supabase/README.md`

**Interfaces:**
- Creates identity, billing, expense, obligation, payment, utility, PayLater, announcement, attachment, notification, push, preset, audit tables.
- Produces RPCs `create_expense_v3`, `submit_payment_claim_v3`, `review_payment_claim_v3`, `delete_or_void_expense_v3`, `edit_expense_v3`, `initialize_month_v3`, `member_home_v3`, `member_balance_v3`, `admin_overview_v3`.

- [ ] Write static schema tests for required tables, UUID relationships, integer centavos, RLS enablement/policies, private storage policies, idempotency constraints, version guards, and role helpers.
- [ ] Run schema tests and confirm they fail against v2 schema.
- [ ] Implement fresh v3 schema/RLS/functions and account-link seed script using actual Auth emails/UUID lookup.
- [ ] Run schema tests and make them pass.
- [ ] Commit `feat: add fresh authenticated v3 schema`.

### Task 4: Clean August History Migration

**Files:**
- Create: `tests/v3-history-migration.test.mjs`
- Create: `supabase/migrate-history.sql`
- Create: `scripts/verify-v3-history.mjs`

**Interfaces:**
- Migration resolves linked household members, inserts August source events/open obligations/settlement allocations/PayLater history, and verifies 2,394,422 / 2,206,229 / 188,193 centavo targets.

- [ ] Write tests that assert exact verification targets and forbid obsolete v1/v2 table dependencies.
- [ ] Run tests and confirm failure before migration exists.
- [ ] Implement clean migration using new UUID relationships and explicit legacy labels where person mapping is unsupported.
- [ ] Run migration tests and make them pass.
- [ ] Commit `feat: add clean v3 financial history migration`.

### Task 5: Authenticated Read Models and Hybrid Privacy UI

**Files:**
- Create: `tests/v3-member-read-model.test.mjs`
- Create: `js/read-model-v3.js`
- Create: `js/member-home.js`
- Create: `js/member-balance.js`
- Create: `js/member-more.js`
- Modify: `js/app.js`

**Interfaces:**
- Produces normalized member Home/Balance/household summary view models from RPC results.
- Caches only `{memberId,displayName,lastKnownBalance,dueSoonTotal,lastSyncedAt}`.

- [ ] Write tests for personalized-first ordering, exact creditor relationships, household summary visibility, and safe offline-summary shape excluding private history/reference data.
- [ ] Run tests and confirm expected failures.
- [ ] Implement read-model normalization and member screens.
- [ ] Run tests and make them pass.
- [ ] Commit `feat: add personalized member finance views`.

### Task 6: Member Payments, Pending Claims, Receipts, and Idempotency

**Files:**
- Create: `tests/v3-payment-claims.test.mjs`
- Create: `js/member-payments.js`
- Create: `js/payment-form.js`
- Create: `js/attachments.js`
- Modify: `js/app.js`

**Interfaces:**
- Produces claim form with authenticated payer fixed, oldest-first suggestion, receipt upload, unique idempotency key, pending-only edit/withdraw actions.
- Uses private Storage signed URLs for authorized receipt reads.

- [ ] Write tests for payer non-selectability, offline blocking, idempotency key reuse on retry, pending-only edit/withdraw, and private receipt path generation.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement member payment/receipt workflow against v3 RPC/storage endpoints.
- [ ] Run tests and make them pass.
- [ ] Commit `feat: add authenticated member payment claims`.

### Task 7: Mobile Admin Overview, Add Sheet, Utilities, and Expense CRUD

**Files:**
- Create: `tests/v3-admin.test.mjs`
- Create: `js/admin-overview-v3.js`
- Create: `js/admin-actions.js`
- Create: `js/admin-expenses-v3.js`
- Create: `js/admin-utilities-v3.js`
- Modify: `js/app.js`

**Interfaces:**
- Admin navigation `Overview/+ Add/Review/Manage`.
- Add sheet actions Utility/Grocery/PayLater/Other Expense/Payment/Announcement.
- Utility form defaults payer to authenticated admin, checks all active members, and uses `All 4 Equally` preset.

- [ ] Write tests for mobile nav, Add sheet, utility types, default payer/checkbox participants, `Edit | •••`, and Smart Delete action dispatch.
- [ ] Run targeted tests and confirm failure.
- [ ] Implement role-aware admin screens/forms and expense RPC calls.
- [ ] Run tests and make them pass.
- [ ] Commit `feat: add mobile-first admin operations`.

### Task 8: Admin Claim Review, Announcements, Member Management, and PayLater

**Files:**
- Create: `tests/v3-admin-workflows.test.mjs`
- Create: `js/admin-review.js`
- Create: `js/announcements-v3.js`
- Create: `js/paylater-v3.js`
- Create: `js/people-settings.js`

**Interfaces:**
- Claim review supports verify/reject and editable exact allocations.
- Announcement CRUD supports schedule, priority, active flag, notify household.
- Member settings allow admin global management and members own profile/payment methods only.

- [ ] Write tests for admin-only review actions, announcement schedule filtering/input, PayLater installment metadata, and member self-management boundaries in UI helpers.
- [ ] Run tests and confirm failures.
- [ ] Implement workflows and role-aware controls.
- [ ] Run tests and make them pass.
- [ ] Commit `feat: add admin review and household management`.

### Task 9: In-App Notifications and Optional Web Push

**Files:**
- Create: `tests/v3-notifications.test.mjs`
- Create: `js/notifications.js`
- Create: `js/push.js`
- Create: `api/push-subscribe.js`
- Create: `api/push-deliver.js`
- Create: `api/reminders.js`
- Modify: `vercel.json`

**Interfaces:**
- Produces notification inbox/preferences APIs and progressive Web Push subscription.
- Cron endpoint generates non-duplicate due reminders and delivery attempts never affect financial commit correctness.

- [ ] Write tests for preference defaults, push opt-in, notification creation before push, reminder deduplication markers, and cron protection.
- [ ] Run tests and confirm failure.
- [ ] Implement notification/push modules and Vercel scheduled reminder endpoint with server-only secret configuration.
- [ ] Run tests and make them pass.
- [ ] Commit `feat: add notifications and optional push`.

### Task 10: PWA Manifest, Custom Brand Assets, Service Worker, and Offline Safety

**Files:**
- Create: `tests/v3-pwa.test.mjs`
- Create: `manifest.webmanifest`
- Create: `service-worker.js`
- Create: `offline.html`
- Create: `assets/brand/dormflow-mark.svg`
- Create: `assets/brand/icon-192.svg`
- Create: `assets/brand/icon-512.svg`
- Modify: `index.html`
- Modify: `js/app.js`

**Interfaces:**
- Cache-first static shell, network-first/non-durable financial requests, user-scoped safe summary, logout purge, no queued writes.

- [ ] Write tests for manifest standalone mode/icons/theme, custom SVG geometry, service-worker cache allowlist, no API response durable cache, offline write blocking, and logout cache purge hooks.
- [ ] Run tests and confirm failure.
- [ ] Implement custom DormFlow brand assets, manifest, service worker, offline page, install hooks.
- [ ] Run tests and make them pass.
- [ ] Commit `feat: make DormFlow an installable safe PWA`.

### Task 11: Premium Responsive Visual Polish and Accessibility

**Files:**
- Create: `tests/v3-visual.test.mjs`
- Modify: `css/styles.css`
- Modify: `index.html`
- Modify: `js/icons.js`

**Interfaces:**
- Final responsive design tokens and custom line icon language shared by member/admin screens.

- [ ] Write tests rejecting legacy generic-dashboard copy/raw labels/excessive visible buttons and asserting focus states, reduced-motion support, bottom-sheet structure, and mobile safe-area navigation.
- [ ] Run tests and confirm expected failures.
- [ ] Implement final quiet-luxury mobile/desktop styling and accessibility states.
- [ ] Run tests and make them pass.
- [ ] Commit `style: finish DormFlow v3 premium mobile design`.

### Task 12: Deployment Docs, Secret Safety, Full Verification, and Release ZIP

**Files:**
- Replace: `README.md`
- Replace: `docs/DEPLOYMENT.md`
- Replace: `docs/MIGRATION.md`
- Replace: `.env.example`
- Modify: `scripts/check-project.mjs`
- Modify: `scripts/package-release.mjs`
- Create: `tests/v3-release.test.mjs`

**Interfaces:**
- Operator sequence: schema -> four Auth accounts -> seed-members -> history migration -> verify totals -> env -> Vercel -> device install/test.
- Release output: `/mnt/data/DormFlow_v3_20_St_Paul_PWA_GitHub_Vercel.zip`.

- [ ] Write release tests for setup sequence, browser/server env separation, no secret-looking values in browser/ZIP, no obsolete patch-migration requirement, and package file list.
- [ ] Run release tests and confirm expected failures.
- [ ] Implement docs/config/safety/package updates.
- [ ] Run `npm test`, `npm run check`, and `npm run release`; inspect all outputs and ZIP integrity.
- [ ] Commit `release: package DormFlow v3 PWA rebuild`.
