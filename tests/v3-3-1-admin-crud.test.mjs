import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');

test('v3.3.1 ships an additive admin-management migration',()=>{
  assert.ok(fs.existsSync('supabase/migrate-v3.3.1.sql'));
  const sql=read('supabase/migrate-v3.3.1.sql');
  assert.match(sql,/create or replace function public\.delete_or_void_expense_v3/i);
  assert.doesNotMatch(sql,/delete from public\.expenses/i);
  assert.match(sql,/create or replace function public\.edit_admin_payment_v3/i);
  assert.match(sql,/create or replace function public\.void_admin_payment_v3/i);
  assert.match(sql,/audit_log/i);
});

test('admin utility and expense records expose edit and archive actions',()=>{
  const views=read('js/household-views-v3.js');
  const expenses=read('js/admin-expenses-v3.js');
  const app=read('js/app.js');
  assert.match(views,/renderUtilities\(rows=\[\],\{admin=false\}/);
  assert.match(views,/data-edit-expense/);
  assert.match(views,/data-expense-delete/);
  assert.match(expenses,/Archive/);
  assert.match(app,/Archive this expense/i);
});

test('admin payments have a manageable list and safe edit void actions',()=>{
  const generic=read('js/admin-generic-v3.js');
  const app=read('js/app.js');
  assert.match(generic,/loadAdminPayments/);
  assert.match(generic,/renderAdminPayments/);
  assert.match(generic,/openAdminPaymentEditSheet/);
  assert.match(app,/manage-payments/);
  assert.match(app,/data-edit-admin-payment/);
  assert.match(app,/data-void-admin-payment/);
});

test('admin add and edit forms use shared save flow',()=>{
  for(const file of ['js/admin-utilities-v3.js','js/admin-generic-v3.js']){
    assert.match(read(file),/bindSaveFlow/);
  }
});
