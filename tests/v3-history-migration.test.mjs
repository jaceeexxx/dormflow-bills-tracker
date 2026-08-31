import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const path='supabase/migrate-history.sql';
const sql=fs.existsSync(path)?fs.readFileSync(path,'utf8').toLowerCase():'';

test('history migration targets exact August reconciliation',()=>{
  assert.match(sql,/2394422/);
  assert.match(sql,/2206229/);
  assert.match(sql,/188193/);
  assert.match(sql,/august total obligations/);
  assert.match(sql,/august outstanding/);
});
test('history migration depends only on v3 identities and tables',()=>{
  assert.match(sql,/household_members/);
  assert.match(sql,/profiles/);
  assert.doesNotMatch(sql,/public\.members\b|expense_categories|public_obligation_balances|app_state/);
});
test('legacy PayLater ambiguity is labeled rather than invented',()=>{
  assert.match(sql,/legacy borrower not recorded/);
  assert.match(sql,/paylater_accounts/);
  assert.match(sql,/paylater_installments/);
});
