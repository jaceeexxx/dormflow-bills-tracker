import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/schema.sql','utf8').toLowerCase();
const seed=fs.existsSync('supabase/seed-members.sql')?fs.readFileSync('supabase/seed-members.sql','utf8').toLowerCase():'';
const required=['profiles','households','household_members','member_payment_methods','billing_periods','expenses','expense_payers','expense_splits','obligations','payments','payment_allocations','payment_claims','credits','utility_records','paylater_accounts','paylater_installments','split_presets','announcements','attachments','notifications','notification_preferences','push_subscriptions','audit_log'];

test('fresh v3 schema contains authenticated domain tables',()=>{for(const table of required) assert.match(sql,new RegExp(`create table(?: if not exists)? public\\.${table}\\b`),table);});
test('money and concurrency invariants are explicit',()=>{assert.match(sql,/amount_cents bigint/);assert.match(sql,/version integer[^;]*default 1/);assert.match(sql,/idempotency_key text/);assert.match(sql,/unique[^;]*idempotency_key/);});
test('rls is enabled across private financial tables',()=>{for(const table of ['profiles','household_members','payments','payment_claims','credits','attachments','notifications','audit_log']) assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`),table);assert.match(sql,/create policy[^;]+payment_claims/);assert.match(sql,/create policy[^;]+attachments/);});
test('v3 exposes transactional RPC contract',()=>{for(const fn of ['current_identity_v3','create_expense_v3','submit_payment_claim_v3','review_payment_claim_v3','delete_or_void_expense_v3','edit_expense_v3','initialize_month_v3','member_home_v3','member_balance_v3','admin_overview_v3']) assert.match(sql,new RegExp(`function public\\.${fn}\\b`),fn);});
test('storage is private and member seed links auth users instead of creating auth rows',()=>{assert.match(sql,/financial-documents/);assert.doesNotMatch(sql,/public\s*:\s*true/);assert.match(seed,/auth\.users/);assert.match(seed,/jace/i);assert.match(seed,/role[^\n]+admin/);assert.doesNotMatch(seed,/insert into auth\.users/);});
