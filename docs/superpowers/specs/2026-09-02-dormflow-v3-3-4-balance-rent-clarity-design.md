# DormFlow v3.3.4 Balance, Rent, and Repayment Clarity Design

**Status:** Draft written after stakeholder-approved direction on 2026-09-02.  
**Date:** 2026-09-02  
**Household:** 20 St. Paul  
**Product:** DormFlow  
**Primary stakeholder/admin:** Jace  
**Baseline:** DormFlow v3.3.3 beta stabilization with server-authoritative financial writes, repaired push registration, and additive Supabase migration flow.

## 1. Purpose

DormFlow v3.3.4 makes the Balance and payment surfaces easier to understand before anyone sends money. The current beta accurately calculates balances, but several surfaces are too vague or visually cramped:

- credit balance is shown as one total without explaining where the credit sits;
- tapping a person to pay shows payment QR details but not the obligations behind that transfer;
- the Balance due schedule is scattered and hard to scan;
- the "You owe" rows can overlap on iPhone-width screens;
- Balance rows still use letter avatars even when profile photos exist;
- rent is missing even though Jace fronts rent for the household;
- due dates need visible overdue and 5-day warning states;
- icons and category presentation can feel more premium and finance-native.

The target is: **a Balance screen that answers who to pay, why, by when, and what the payment covers without making the user mentally reconstruct the ledger.**

## 2. Release Constraints

- Ship as an additive v3.3.4 update after v3.3.3.
- Do not reset Supabase, rerun `schema.sql`, or rewrite settled payment/allocation history.
- All money remains integer centavos.
- Supabase RPCs remain authoritative for balance truth; client rendering may group and format but must not invent balances.
- Push notification delivery remains post-save and non-blocking.
- Existing `member_balance_v3`, `open_obligations_v3`, `create_expense_v3`, `record_payment_v3`, and `submit_payment_claim_v3` contracts stay compatible.
- Rent is paid by Jace and split as a normal household obligation unless Jace deliberately changes the payer in an admin correction flow.

## 3. Rent Model

Rent should use the existing expense and obligation engine rather than a separate rent ledger.

Admin gets a new first-class Add action:

- label: `Rent`;
- icon: rent/home/building style, consistent with the existing custom SVG icon family;
- default payer: Jace/current admin;
- category: `Rent`;
- source type: `rent`;
- source label: optional, such as `Monthly rent`;
- fields: amount, rent month, due date, split-with members, optional description.

When Jace records rent:

1. `create_expense_v3` creates an active expense in the current billing period, using the rent month as the expense date's month anchor.
2. The payer row is Jace for the full amount.
3. Splits cover selected active household members.
4. `generate_expense_obligations_v3` creates reimbursement obligations only where a selected member owes Jace.
5. Jace's own share is represented in the split math but does not create a self-payment obligation.

This makes rent appear naturally in:

- member outstanding balance;
- "You owe Jace";
- due schedule;
- category breakdown;
- reports;
- admin expenses/history.

## 4. Balance Read Model

The existing Balance screen currently combines `member_balance_v3`, `open_obligations_v3`, and client-side expense split reads. v3.3.4 adds this additive detailed read RPC:

```sql
public.member_balance_detail_v3(p_today date default current_date)
```

It returns one JSON payload shaped for the Balance page while preserving the older RPCs for compatibility.

Required top-level fields:

- `member_id`
- `outstanding_cents`
- `owed_to_me_cents`
- `credit_cents`
- `net_position_cents`
- `credit_breakdown`
- `creditors`
- `due_groups`
- `category_breakdown`

### 4.1 Creditor Breakdown

Each creditor item should include:

- `member_id`
- `display_name`
- `avatar_path`
- `amount_cents`
- `breakdown`
- `oldest_due_date`
- `due_status`

Each `breakdown` item should include:

- `category`
- `label`
- `source_type`
- `amount_cents`
- `due_date`
- `status`

Example concept:

```json
{
  "display_name": "Jace",
  "amount_cents": 524226,
  "breakdown": [
    {"category": "Rent", "label": "September rent", "amount_cents": 400000, "status": "due_soon"},
    {"category": "Groceries", "label": "Puregold groceries", "amount_cents": 35600, "status": "later"},
    {"category": "Electricity", "label": "Meralco", "amount_cents": 65000, "status": "overdue"}
  ]
}
```

### 4.2 Credit Breakdown

Credit remains an unapplied balance tied to a creditor, not a fake category allocation. The UI should explain it as credit held against a specific roommate/payee.

Each credit item should include:

- `credit_id`
- `creditor_member_id`
- `creditor_display_name`
- `original_amount_cents`
- `remaining_amount_cents`
- `source_payment_id`
- `source_payment_date`
- `source_payment_method`

Display concept:

- `Credit with Jace`
- `Remaining from Bank Transfer on Aug 31`
- amount remaining

If there are no credits, show a quiet empty state rather than a zero-only card.

### 4.3 Due Status Rules

Due status is calculated from `due_date` against `p_today` in the database read model. The optional date argument exists so automated tests can classify due states deterministically. The client calls the function without arguments.

- `overdue`: due date is before today's local calendar date and outstanding amount is greater than zero;
- `due_soon`: due date is today through 5 calendar days from today;
- `later`: due date is more than 5 days away;
- `no_due_date`: obligation has no due date.

The app should use the same Asia/Manila calendar assumption already used by reminders. The UI text should not say "overdue" for settled obligations.

## 5. Balance Screen Experience

The Balance screen should become a repayment workspace organized by intent.

### 5.1 Top Summary

Keep:

- current outstanding;
- owed to you;
- credits;
- net position.

Improve:

- make the credit card expandable in place to show `credit_breakdown`;
- label net position as positive/negative in human terms, such as `You owe overall` or `You are ahead overall`;
- avoid negative-value confusion where possible.

### 5.2 You Owe

Replace the cramped row layout with a mobile-safe structure:

- real avatar photo when `avatar_path` exists;
- fallback initial only when no avatar exists;
- name and due badge on the first line;
- category summary on the second line;
- amount in a dedicated right column or second row on narrow screens;
- chevron remains visually separate and does not collide with the amount.

The current overlapping phrase `Outstanding transfer` should be removed or shortened. Better labels:

- `Rent + 2 more`;
- `Groceries`;
- `Utilities + PayLater`;
- `3 open items`.

### 5.3 Pay Person Detail Sheet

When tapping a person from Balance or Home, the sheet should show:

1. person identity and payment method;
2. MariBank QR if available;
3. total amount owed to that person;
4. obligation breakdown grouped by category;
5. due badges for overdue/due soon items;
6. actions: copy details, report payment.

The sheet should not force the user to leave the payment context to understand what they are paying.

### 5.4 Due Schedule

Due schedule should be grouped for scanability:

- Overdue
- Due within 5 days
- Later this month
- No due date

Within each group, sort by due date, then category, then amount descending.

Rows should show:

- category icon;
- label/description;
- payee;
- due date;
- amount;
- status badge.

The list should be compact but not dense enough to overlap under iPhone viewport widths.

### 5.5 Category Breakdown

Category breakdown should include current open obligations, not just assigned expense splits, so paid-down categories do not look larger than what is still owed.

Recommended categories:

- Rent
- Electricity / Meralco
- Water
- WiFi
- Groceries
- PayLater / Loans
- Other

The card should sort by open amount descending and show both amount and item count.

## 6. Admin Experience

Admin Add should include Rent alongside Utility, Grocery, Other Expense, Announcement, PayLater, and Record Payment.

Rent form behavior:

- uses the same `bindSaveFlow` lifecycle as other financial forms;
- validates active billing period before calling the RPC;
- defaults payer to Jace/current admin;
- defaults split to all active members;
- supports due date because overdue/due-soon flags depend on it;
- queues push after successful save without blocking financial success.

Admin reports/expense history should render rent as `Rent`, not `Other Expenses`.

## 7. Icon And Visual System

Add or refine custom SVG icons in `js/icons.js` for:

- rent;
- overdue;
- due soon;
- credit;
- category group;
- external receipt or bill where useful.

Keep the same stroke weight, rounded joins, viewBox, and geometry language as the existing custom icon family. Do not introduce a second icon library or emoji.

CSS goals:

- remove amount/text overlap on iPhone-width Balance cards;
- keep all rows stable under 390px viewport width;
- use fixed avatar/icon dimensions;
- no viewport-width font scaling;
- no negative letter spacing in new compact components;
- avoid one-color monotony by using the existing emerald, navy, warm amber, and red state colors with restraint.

## 8. Migration Strategy

Create a new additive migration:

```text
supabase/migrate-v3.3.4.sql
```

It should:

- add or replace only functions/views needed for the detailed balance read model;
- preserve existing table data;
- preserve existing RPC signatures;
- add grants for any new RPC to `authenticated`;
- avoid destructive table changes;
- avoid reseeding household data.

Fresh-install `supabase/schema.sql` should mirror the final v3.3.4 state, but existing deployments should run only the v3.3.4 migration.

## 9. Testing And Acceptance

Automated tests should cover:

1. Rent is available as an admin add action and writes `category = 'Rent'`, `source_type = 'rent'`, with Jace/current admin as default payer.
2. Detailed balance read model returns creditor breakdown by category with avatar paths.
3. Credit breakdown identifies creditor, remaining amount, and source payment metadata.
4. Due status rules classify overdue, due within 5 days, later, and no due date correctly.
5. Balance "You owe" rows do not render the old overlapping `Outstanding transfer` label.
6. Payment profile/detail sheet includes the amount owed and category breakdown when opened from a payee row.
7. Due schedule groups are rendered in the required order.
8. Category breakdown uses open outstanding obligations, not raw assigned split totals.
9. New icons render valid custom SVGs through `icon(name)`.
10. Full `npm.cmd test` and `npm.cmd run check` pass before release.

Manual beta checks should include:

1. On iPhone-width viewport, "You owe" rows do not overlap amount, name, category, badge, or chevron.
2. Profile photos appear in Balance payee rows when uploaded.
3. Tapping Jace from "You owe" shows QR plus rent/utility/grocery/PayLater breakdown.
4. Overdue items show red status and due-within-5-days items show amber status.
5. Recording rent as Jace updates member balances and Jace receivables without creating a Jace-owes-Jace row.

## 10. Non-Goals

- No automatic bank transfer integration.
- No landlord portal.
- No recurring rent automation in v3.3.4 unless added explicitly later.
- No financial data reset.
- No change to push opt-in behavior.
- No new visual framework or stock icon family.
