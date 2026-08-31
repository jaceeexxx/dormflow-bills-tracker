import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildEqualPayLaterSchedule,validateCustomPayLaterSchedule,splitPayLaterInstallment} from '../js/paylater-v3.js';

const read=p=>fs.readFileSync(p,'utf8');

test('equal PayLater schedule preserves principal in integer centavos',()=>{
  const rows=buildEqualPayLaterSchedule(10001,3,'2026-09-15');
  assert.deepEqual(rows.map(x=>x.amount_cents),[3334,3334,3333]);
  assert.equal(rows.reduce((s,x)=>s+x.amount_cents,0),10001);
});

test('custom schedule must total the principal exactly',()=>{
  assert.equal(validateCustomPayLaterSchedule(120000,[{amount_cents:70000,due_date:'2026-09-15'},{amount_cents:50000,due_date:'2026-10-15'}]),true);
  assert.throws(()=>validateCustomPayLaterSchedule(120000,[{amount_cents:70000,due_date:'2026-09-15'},{amount_cents:49999,due_date:'2026-10-15'}]),/principal/i);
});

test('each installment has four economic shares but no borrower self obligation',()=>{
  const members=['a','b','c','d'];
  const split=splitPayLaterInstallment(120000,members,'b');
  assert.equal(split.economicShares.length,4);
  assert.equal(split.economicShares.reduce((s,x)=>s+x.amount_cents,0),120000);
  assert.equal(split.borrowerShare.member_id,'b');
  assert.equal(split.borrowerShare.amount_cents,30000);
  assert.deepEqual(split.obligations.map(x=>[x.debtor_member_id,x.creditor_member_id,x.amount_cents]),[['a','b',30000],['c','b',30000],['d','b',30000]]);
  assert.equal(split.obligations.some(x=>x.debtor_member_id===x.creditor_member_id),false);
});

test('centavo remainder is deterministic and still reconciles four economic shares',()=>{
  const split=splitPayLaterInstallment(101,['d','b','a','c'],'b');
  assert.deepEqual(split.economicShares.map(x=>[x.member_id,x.amount_cents]),[['a',26],['b',25],['c',25],['d',25]]);
  assert.equal(split.economicShares.reduce((s,x)=>s+x.amount_cents,0),101);
});

test('database PayLater RPC creates reimbursement obligations linked to installments',()=>{
  const sql=read('supabase/migrate-v3.3.1.sql');
  assert.match(sql,/source_paylater_installment_id/i);
  assert.match(sql,/create or replace function public\.create_paylater_v3/i);
  assert.match(sql,/creditor_member_id[^;]*p_borrower/is);
  assert.match(sql,/v_member\.id<>p_borrower/i);
  assert.match(sql,/create or replace function public\.edit_paylater_v3/i);
  assert.match(sql,/create or replace function public\.archive_paylater_v3/i);
  assert.match(sql,/payment_allocations/i);
});

test('PayLater UI supports equal custom edit and archive',()=>{
  const src=read('js/paylater-v3.js');
  assert.match(src,/Equal installments/);
  assert.match(src,/Custom installments/);
  assert.match(src,/data-paylater-edit/);
  assert.match(src,/data-paylater-archive/);
  assert.match(src,/openPayLaterSheet\(\{identity,existing/);
  assert.match(read('js/app.js'),/edit_paylater_v3|archive_paylater_v3/);
});
