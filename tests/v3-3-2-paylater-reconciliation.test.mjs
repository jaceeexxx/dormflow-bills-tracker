import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');

test('v3.3.2 migration pins the canonical September PayLater workbook schedule',()=>{
  assert.ok(fs.existsSync('supabase/migrate-v3.3.2.sql'));
  const sql=read('supabase/migrate-v3.3.2.sql');
  const expected=[
    ["SPayLater","Aerian","2026-09-05",59200,14800],
    ["SPayLater","Jace","2026-09-05",466000,116500],
    ["SPayLater","Aexy","2026-09-15",28000,7000],
    ["SPayLater","Kean","2026-09-15",42800,10700],
    ["TikTok PayLater","Jace","2026-09-16",36000,9000]
  ];
  for(const [provider,borrower,date,total,each] of expected){
    assert.match(sql,new RegExp(`['"]${provider}['"],['"]${borrower}['"],['"]${date}['"]::date,${total}::bigint,${each}::bigint`));
  }
  assert.match(sql,/Kean[^\n]+128400::bigint/i);
});

test('legacy reconciliation is provenance-scoped and preserves posted August and settled history',()=>{
  const sql=read('supabase/migrate-v3.3.2.sql');
  assert.match(sql,/created_by is null/i);
  assert.match(sql,/r\.installment_status='scheduled'/i);
  assert.match(sql,/payment_allocations/i);
  assert.match(sql,/credit_applications/i);
  assert.match(sql,/delete from public\.obligations where source_paylater_installment_id=v_installment/i);
  assert.match(sql,/Posted August remains represented by the frozen imported expense\/payment ledger/i);
  assert.doesNotMatch(sql,/delete from public\.expenses/i);
  assert.doesNotMatch(sql,/truncate\s+/i);
});

test('canonical scheduled installment creates exactly the three non-borrower reimbursement shares',()=>{
  const sql=read('supabase/migrate-v3.3.2.sql');
  assert.match(sql,/debtor_member_id <> v_borrower/i);
  assert.match(sql,/v_member\.debtor_member_id,v_borrower,r\.each_cents/i);
  assert.match(sql,/source_paylater_installment_id/i);
  assert.match(sql,/'PayLater \/ Loans','active'/i);
});

test('current member and admin balances exclude future draft billing periods',()=>{
  for(const file of ['supabase/migrate-v3.3.2.sql','supabase/schema.sql']){
    const sql=read(file);
    assert.match(sql,/join public\.billing_periods bp on bp\.id=ob\.period_id/i);
    assert.match(sql,/bp\.month <= v_active_month/i);
  }
  const migration=read('supabase/migrate-v3.3.2.sql');
  assert.match(migration,/create or replace function public\.open_obligations_v3/i);
  assert.match(migration,/create or replace function public\.admin_overview_v3/i);
});
