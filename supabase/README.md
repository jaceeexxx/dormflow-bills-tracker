# DormFlow v3 Supabase Setup

Use a **fresh Supabase project**.

1. Run `schema.sql` once in SQL Editor.
2. In Authentication, manually create Jace, Kean, Aerian, and Aexy with separate email/password credentials. Disable public sign-ups.
3. Run `seed-members.sql` (already configured for `jace@gmail.com`, `kean@gmail.com`, `aerian@gmail.com`, and `aexy@gmail.com`) and confirm Jace=`admin`; the other three=`member`.
4. Run `migrate-history.sql` once.
5. Confirm the final queries return 2,394,422 total / 2,206,229 settled / 188,193 outstanding centavos for August 2026.

The `financial-documents` Storage bucket is private. Do not make it public. Member receipt/payment-reference privacy is enforced with RLS and Storage policies, not only frontend hiding.

## Existing v3.2 household → v3.3

Run `migrate-v3.3.sql` once. Do not rerun `schema.sql`, `seed-members.sql`, `migrate-history.sql`, or `migrate-v3.2.sql` on an already-configured v3.2 project. The upgrade preserves all historical obligations/payments and adds active-month plus Inbox/push behavior.
