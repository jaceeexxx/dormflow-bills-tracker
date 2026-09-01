# DormFlow v3.3.2 Admin & Accounting Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Beta Test 2.0 with an Admin-first write/save stabilization, authoritative PayLater reconciliation, mobile layout/media feedback fixes, and verifiable iPhone push delivery.

**Architecture:** Keep the existing v3.3.1 SPA/RPC model. Centralize form-state feedback in shared helpers, repair financial read models and legacy PayLater data in an additive migration, derive Admin overview semantics from the authoritative ledger, and add a targeted authenticated push-test endpoint rather than changing financial event delivery.

**Tech Stack:** HTML/CSS/ES modules, Node test runner, Supabase Postgres/Auth/Storage/Realtime, Vercel Functions, Web Push.

**Spec:** `docs/superpowers/specs/2026-09-01-dormflow-v3-3-2-admin-accounting-stabilization-design.md`

## Global Constraints

- Upgrade existing v3.3.1 only through `supabase/migrate-v3.3.2.sql`.
- Preserve verified settlement/payment history.
- Never expose server secrets in browser code or release ZIPs.
- Current balance includes prior + active period, never future draft periods.
- Realtime invalidates/refetches; it does not compute financial state.
- All financial calculations use integer centavos.

---

### Task 1: Admin save lifecycle and media readiness

**Files:**
- Modify: `js/form-flow.js`
- Modify: `js/admin-utilities-v3.js`
- Modify: `js/admin-generic-v3.js`
- Modify: `js/announcements-v3.js`
- Modify: `js/paylater-v3.js`
- Modify: `js/attachments.js`
- Modify: `js/people-settings.js`
- Test: `tests/v3-3-2-admin-save-media.test.mjs`

**Interfaces:**
- Produces `validateFinancialContext(periodId)` and immediate selected-file/crop readiness UI.
- All Admin create forms close only after a successful authoritative write and call `onDone` after close.

- [ ] Write focused failing tests for all Admin add/save forms, active-period validation, announcement shared Save flow, attachment readiness, and crop-before-save preview.
- [ ] Run the test and confirm RED failures are caused by missing v3.3.2 behavior.
- [ ] Implement the minimal shared/form/media changes.
- [ ] Run focused + neighboring Admin/profile tests and JS syntax checks.
- [ ] Commit the green task.

### Task 2: PayLater reconciliation and period-safe balances

**Files:**
- Create: `supabase/migrate-v3.3.2.sql`
- Modify: `supabase/schema.sql`
- Test: `tests/v3-3-2-paylater-reconciliation.test.mjs`

**Interfaces:**
- Produces canonical workbook reconciliation for legacy schedules only.
- `member_balance_v3`, `open_obligations_v3`, and `admin_overview_v3` exclude future draft periods from current outstanding state.

- [ ] Write RED contract tests for canonical Sep 5/Sep 15/Sep 16 values, borrower self-settlement, three reimbursement obligations, legacy-only scope, and future-period filtering.
- [ ] Run and verify RED.
- [ ] Implement additive migration and fresh-install schema equivalents.
- [ ] Run PayLater, member balance, active-month, payment, and migration regressions.
- [ ] Commit the green task.

### Task 3: Admin settlement/upcoming read model

**Files:**
- Modify: `js/admin-overview-v3.js`
- Modify: `js/dashboard-model.js`
- Test: `tests/v3-3-2-admin-overview.test.mjs`

**Interfaces:**
- Settlement rows expose `needsToPayCents`, `owedToMemberCents`, `netPositionCents`, and status.
- Upcoming derives from active-period open obligations and includes all current-period due dates, including Sep 5.

- [ ] Write failing semantic/render tests.
- [ ] Verify RED.
- [ ] Implement focused read-model/render changes without rewriting ledger rows.
- [ ] Run overview/member/dashboard regressions.
- [ ] Commit.

### Task 4: Mobile schedule/logo/back/dense-row stabilization

**Files:**
- Modify: `css/styles.css`
- Modify: `index.html` only if a bounded header-logo markup adjustment is required.
- Test: `tests/v3-3-2-mobile-layout.test.mjs`

**Interfaces:**
- Shared narrow-screen rules prevent collisions and keep controls within cards.

- [ ] Write failing source/CSS contract tests for PayLater schedule cards, Back 44px target, logo bounds, Notification/Upcoming/Settlement row stacking.
- [ ] Verify RED.
- [ ] Add minimal shared responsive CSS and markup changes.
- [ ] Run CSS parser and existing shell/responsive regressions.
- [ ] Commit.

### Task 5: Push diagnostics and 5-second device test

**Files:**
- Create: `api/push-test.js`
- Modify: `js/push.js`
- Modify: `js/people-settings.js`
- Modify: `lib/push-server.js` if needed for a shared delivery helper.
- Modify: `js/app.js`
- Test: `tests/v3-3-2-push-diagnostics.test.mjs`

**Interfaces:**
- Authenticated `/api/push-test` targets only the caller's subscriptions, waits five seconds server-side, sends a test payload, and deactivates permanent invalid endpoints.
- Notifications UI exposes permission/subscription state and a test action.

- [ ] Write RED endpoint/UI/cleanup tests.
- [ ] Verify RED.
- [ ] Implement minimal authenticated test delivery and diagnostic UI.
- [ ] Run notification/reminder/PWA/security regressions.
- [ ] Commit.

### Task 6: Release v3.3.2 and artifact verification

**Files:**
- Modify: `package.json`
- Modify: `service-worker.js`
- Modify: `README.md`
- Modify: `RELEASE-CHECKLIST.md`
- Modify: `docs/MIGRATION.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `scripts/check-project.mjs`
- Modify: `scripts/package-release.mjs`
- Test: `tests/v3-3-2-release.test.mjs`

**Interfaces:**
- Produces v3.3.2 full release and focused v3.3.1 -> v3.3.2 upgrade patch.

- [ ] Write RED release contract.
- [ ] Bump version/cache and document one-time migration/re-enable-push beta test.
- [ ] Run full `npm test`, `npm run check`, all JS syntax, CSS parser, migration safety scan.
- [ ] Build full release and focused upgrade ZIP.
- [ ] Overlay the focused patch on a pristine v3.3.1 snapshot and rerun full verification.
- [ ] Commit final release metadata and report artifacts.
