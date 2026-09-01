# DormFlow v3.3.2 Admin & Accounting Stabilization Design

**Status:** Approved in conversation on 2026-09-01 after Beta Test 2.0.

## Goal

Stabilize the production beta by fixing Admin write/save workflows first, reconciling PayLater to the supplied workbook, then repairing shared mobile UI/media feedback and real iPhone push delivery diagnostics.

## Release constraints

- Upgrade from v3.3.1 with one additive `supabase/migrate-v3.3.2.sql` migration.
- Do not rerun earlier migrations or reset the schema.
- Preserve settled payment/allocation history and August reconciliation.
- Supabase remains source of truth; Realtime only invalidates/refetches views.
- All money remains integer centavos.

## 1. Admin write/save contract

Utility, Grocery, Other Expense, Announcement, PayLater, attachments, and supported edits use one observable lifecycle:

`Save -> Saving… -> database success -> Successfully saved -> close -> refetch/realtime`

Failures keep the form open, preserve inputs, restore the button, and show the real error. Admin forms must reject a missing active period before calling a financial RPC.

## 2. Immediate media feedback

Selecting an attachment immediately renders filename/type and an image thumbnail when possible with a `Ready to upload` state. Profile photo selection opens crop before the profile Save action and the cropped preview is visible in the profile form before Save. Successful upload changes the state to `Uploaded`/refreshes signed media URLs.

## 3. PayLater workbook reconciliation

For the legacy migrated workbook schedules only (`created_by IS NULL`), v3.3.2 reconciles the canonical schedule without rewriting user-created schedules or settled history.

Canonical September rows:

- SPayLater / Aerian / 2026-09-05 / installment ₱592.00 / each ₱148.00.
- SPayLater / Jace / 2026-09-05 / installment ₱4,660.00 / each ₱1,165.00.
- SPayLater / Aexy / 2026-09-15 / installment ₱280.00 / each ₱70.00.
- SPayLater / Kean / 2026-09-15 / installment ₱428.00 / each ₱107.00.
- TikTok PayLater / Jace / 2026-09-16 / installment ₱360.00 / each ₱90.00.

Each installment is economically split across four dormies; borrower self-share is auto-settled and only the other three create reimbursement obligations owed to the borrower.

Future draft-period obligations must not leak into the current balance. Current balance includes closed prior periods plus the active month only.

## 4. Admin overview semantics

`Household settlement` shows each member's `Needs to pay`, `Owed to member`, `Net position`, and Open/Settled status. `Who needs to pay whom` remains the actual debtor-to-creditor ledger.

`Upcoming` is a current-active-period due schedule, not only the 3-day reminder window. It must include open September PayLater obligations such as Sep 5 when September is active, sorted by due date.

## 5. Mobile stabilization

- PayLater schedule mode renders as two distinct touch cards, never an inline text collision.
- Back button is a minimum 44px touch target with readable text/icon.
- Notification rows, Who Pays Whom, Upcoming, Settlement, and shared dense rows stack at narrow widths rather than overlap.
- Mobile header logo is bounded and cannot clip/overflow the viewport.
- Bottom-sheet forms remain internally scrollable and safe-area aware.

## 6. Push delivery verification

Notifications page exposes device diagnostics: permission, active subscription, endpoint state, and last test result. `Enable push` replaces an invalid/old subscription when needed. A server-backed `Send 5-second test` delivers directly to the authenticated member's active subscriptions so the user can background the PWA before delivery. Permanent 404/410 endpoints are deactivated. Inbox behavior remains independent of push.

## Acceptance

Before release:

1. Utility/Grocery/Other/Announcement/PayLater Add -> Save tests pass and success closes the sheet.
2. Media selection/crop preview tests pass before Save.
3. Canonical September PayLater migration values and borrower reimbursement invariants pass.
4. Upcoming includes Sep 5 active-period PayLater and excludes future draft-period balance leakage.
5. Settlement semantics are explicit and mobile rows do not collide.
6. Push diagnostics/test endpoint contract passes.
7. Full suite, project/security check, JS syntax, CSS parsing, migration safety, and upgrade-artifact overlay verification pass.
