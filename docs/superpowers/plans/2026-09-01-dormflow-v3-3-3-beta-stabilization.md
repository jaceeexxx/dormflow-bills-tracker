# DormFlow V3.3.3 Beta Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix beta 3.0 save, review, and push failures by making financial writes visible, authoritative, and independent from push delivery.

**Architecture:** Shared sheet save lifecycle owns validation errors, button state, success closing, and refresh callbacks. Financial forms perform only Supabase writes and attachments inside `save`, then schedule push asynchronously from `onSaved`. Push server endpoints identify the authenticated member via `current_identity_v3`/directory RPCs instead of fragile `profiles` REST joins.

**Tech Stack:** Vanilla ES modules, Node test runner, Supabase SQL/RLS/RPC, Vercel serverless API routes, Web Push.

**Spec:** Beta 3.0 results in chat on 2026-09-01.

## Global Constraints

- Financial writes must show the real error inside the sheet and preserve entered form data on failure.
- Push delivery must never block, undo, or visually trap a successful financial write.
- Admin review save/reject must refresh the Review route rather than navigate to PIN or Admin Home.
- Push registration and test endpoints must not query `profiles` directly to identify the caller.
- v3.3.3 migration must restore authenticated same-household profile read as defense in depth.

---

### Task 1: Shared Save Flow

**Files:**
- Modify: `js/form-flow.js`
- Test: `tests/v3-3-3-save-flow.test.mjs`

**Interfaces:**
- Produces: `bindSaveFlow(form, options)` displays `[data-form-error]` on failure, clears it on retry, keeps the sheet open on failure, and restores the submit label.

- [ ] **Step 1: Write the failing test**

```js
test('bindSaveFlow shows inline save errors and keeps the sheet open', async()=>{});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/v3-3-3-save-flow.test.mjs`
Expected: FAIL because no inline form error is created.

- [ ] **Step 3: Write minimal implementation**

Add helper logic in `form-flow.js` to create/update a `.form-error[data-form-error]` node before the submit button.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/v3-3-3-save-flow.test.mjs`
Expected: PASS.

### Task 2: Financial Forms

**Files:**
- Modify: `js/member-payments.js`
- Modify: `js/admin-generic-v3.js`
- Modify: `js/admin-utilities-v3.js`
- Modify: `js/admin-review.js`
- Test: `tests/v3-3-3-financial-pipeline.test.mjs`

**Interfaces:**
- Consumes: `bindSaveFlow`.
- Produces: forms that call Supabase write RPCs before close and call push through non-blocking post-save scheduling.

- [ ] **Step 1: Write the failing test**

```js
test('financial save handlers do not await requestPushForTarget inside the authoritative save block',()=>{});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/v3-3-3-financial-pipeline.test.mjs`
Expected: FAIL because several save blocks await push.

- [ ] **Step 3: Write minimal implementation**

Move push calls to post-save callbacks and fix the `onSaved`/`onDone` typo in utility save.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/v3-3-3-financial-pipeline.test.mjs`
Expected: PASS.

### Task 3: Directory RPC

**Files:**
- Create: `js/member-directory.js`
- Modify: `js/admin-generic-v3.js`
- Modify: `js/admin-utilities-v3.js`
- Modify: `js/admin-overview-v3.js`
- Modify: `js/member-home.js`
- Modify: `js/people-settings.js`
- Modify: `js/paylater-v3.js`
- Modify: `supabase/migrate-v3.3.3.sql`
- Modify: `supabase/schema.sql`
- Test: `tests/v3-3-3-directory-push.test.mjs`

**Interfaces:**
- Produces: `householdMemberDirectory({includeInactive})`.
- Produces SQL function `public.household_member_directory_v3(p_include_inactive boolean default false)`.

- [ ] **Step 1: Write the failing test**

```js
test('client member pickers use household_member_directory_v3 instead of profiles joins',()=>{});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/v3-3-3-directory-push.test.mjs`
Expected: FAIL because client pickers still nest `profiles`.

- [ ] **Step 3: Write minimal implementation**

Create the directory helper, add the security-definer SQL RPC, and replace household member profile joins used by pickers/views.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/v3-3-3-directory-push.test.mjs`
Expected: PASS.

### Task 4: Push APIs And Diagnostics

**Files:**
- Modify: `lib/server-supabase.js`
- Modify: `api/push-subscribe.js`
- Modify: `api/push-test.js`
- Modify: `api/push-event.js`
- Modify: `api/push-deliver.js`
- Modify: `api/health.js`
- Modify: `js/people-settings.js`
- Test: `tests/v3-3-3-directory-push.test.mjs`

**Interfaces:**
- Produces: `currentIdentityFromToken(accessToken)` in `lib/server-supabase.js`.
- Produces health JSON with `checks.supabaseUrl`, `checks.browserKey`, `checks.serverCredential`, `checks.vapidKeys`, and `checks.cron`.

- [ ] **Step 1: Write the failing test**

```js
test('push APIs identify current member without direct profiles REST joins',()=>{});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/v3-3-3-directory-push.test.mjs`
Expected: FAIL because push APIs query `profiles`.

- [ ] **Step 3: Write minimal implementation**

Route push APIs through `currentIdentityFromToken`, keep service-role writes for push tables, and expand health diagnostics.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/v3-3-3-directory-push.test.mjs`
Expected: PASS.

### Task 5: Verification

**Files:**
- Modify only if tests reveal a regression.

- [ ] **Step 1: Run targeted tests**

Run: `node --test tests/v3-3-3-save-flow.test.mjs tests/v3-3-3-financial-pipeline.test.mjs tests/v3-3-3-directory-push.test.mjs`

- [ ] **Step 2: Run project checks**

Run: `npm test`
Run: `npm run check`

- [ ] **Step 3: Report results**

Summarize changed files, verified commands, and any deployment/migration notes.
