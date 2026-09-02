# DormFlow v3 Supabase Setup

Use a **fresh Supabase project**.

1. Run `schema.sql` once in SQL Editor.
2. In Authentication, manually create Jace, KD, Aerian, and Aexy with separate email/password credentials. Disable public sign-ups.
3. Run `seed-members.sql` and confirm Jace=`admin`; the other three=`member`.
4. Run `migrate-history.sql` once.
5. Confirm the final queries return 2,394,422 total / 2,206,229 settled / 188,193 outstanding centavos for August 2026.

The `financial-documents` Storage bucket is private. Do not make it public. Member receipt/payment-reference privacy is enforced with RLS and Storage policies, not only frontend hiding.

## Existing v3.2 household -> v3.3

Run `migrate-v3.3.sql` once. Do not rerun `schema.sql`, `seed-members.sql`, `migrate-history.sql`, or `migrate-v3.2.sql` on an already-configured v3.2 project. The upgrade preserves all historical obligations/payments and adds active-month plus Inbox/push behavior.

## Existing v3.3 household -> v3.3.1

Run `migrate-v3.3.1.sql` **once** in the Supabase SQL Editor. Do not rerun `schema.sql`, `seed-members.sql`, `migrate-history.sql`, `migrate-v3.2.sql`, or `migrate-v3.3.sql` on an already-configured v3.3 project. The v3.3.1 migration is additive: it adds the beta-stabilization audit, PayLater reimbursement, edit/archive, and notification support while preserving historical obligations, payments, and the active-month/carry-forward model.

## Existing v3.3.1 household -> v3.3.2

Run `migrate-v3.3.2.sql` **once** in Supabase SQL Editor. Do not rerun `schema.sql`, `seed-members.sql`, `migrate-history.sql`, `migrate-v3.2.sql`, `migrate-v3.3.sql`, or `migrate-v3.3.1.sql` on the existing project.

The v3.3.2 migration is targeted to the second beta stabilization: it filters current read models through the active billing month and reconciles only legacy migrated PayLater accounts (`created_by is null`) to the canonical workbook schedule. It rebuilds only scheduled reimbursement obligations with no payment/credit history and preserves posted August and settled history.

## Existing v3.3.2 household -> v3.3.3

Run `migrate-v3.3.3.sql` **once** in Supabase SQL Editor. Do not rerun `schema.sql`, `seed-members.sql`, `migrate-history.sql`, `migrate-v3.2.sql`, `migrate-v3.3.sql`, `migrate-v3.3.1.sql`, or `migrate-v3.3.2.sql` on the existing project.

The v3.3.3 migration repairs financial-write idempotency, same-household member directory reads, profile read policy coverage, and push registration privilege boundaries.

## Existing v3.3.3 household -> v3.3.4

Run `migrate-v3.3.4.sql` **once** in Supabase SQL Editor. Do not rerun `schema.sql`, `seed-members.sql`, `migrate-history.sql`, `migrate-v3.2.sql`, `migrate-v3.3.sql`, `migrate-v3.3.1.sql`, `migrate-v3.3.2.sql`, or `migrate-v3.3.3.sql` on the existing project.

The v3.3.4 migration adds the `member_balance_detail_v3()` read model for Home, Balance, QR payment breakdowns, credit breakdown, and due-status grouping. It is additive and does not modify settled financial data.

If an earlier v3.3.4 draft was already applied, rerun the current `migrate-v3.3.4.sql` once. The migration only replaces the read function and reapplies its execute grant, so it cannot duplicate payments, obligations, expenses, or credits.
