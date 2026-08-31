# DormFlow v3 Clean Migration

DormFlow v3 is a fresh authenticated schema. Use a new Supabase project and only the three v3 setup SQL files listed below.

## Order

1. Run `supabase/schema.sql` on a new Supabase project.
2. Create the four Auth accounts manually in **Authentication → Users** using the credentials you will privately give each roommate. Disable public sign-ups.
3. Run `supabase/seed-members.sql`. It is preconfigured for `jace@gmail.com`, `kean@gmail.com`, `aerian@gmail.com`, and `aexy@gmail.com`.
4. Confirm the result lists all four members and roles: Jace=`admin`; Kean/Aerian/Aexy=`member`.
5. Run `supabase/migrate-history.sql` once.
6. Read the three verification result sets at the end of the migration.

## August acceptance values

The clean history migration is required to reconcile to these exact integer-centavo values:

| Check | Centavos | Peso value |
|---|---:|---:|
| August total obligations | **2,394,422** | **₱23,944.22** |
| August settled | **2,206,229** | **₱22,062.29** |
| August outstanding | **188,193** | **₱1,881.93** |

If any value differs, stop before deploying and do not manually edit balances to force a match.

## What is migrated

The script rebuilds the useful August source expenses, splits, obligations, verified settlement allocations, open balances, and supported active PayLater schedules using the new household-member UUIDs.

Where the old tracker does not support a defensible borrower identity, the v3 migration uses the explicit label **Legacy borrower not recorded** rather than inventing a roommate relationship.

## Accounting rule

DormFlow derives balances from:

```text
obligations
− verified payment allocations
− applied credits
= current outstanding
```

There is no standalone editable `remaining_balance` source of truth. Open August obligations remain open until paid; month rollover does not duplicate them.

## QR/payment methods

Old QR images are intentionally not bundled as public static files in v3. Each member should add their own payment method/QR inside the authenticated app so the information remains private rather than being reachable from a public asset URL.
