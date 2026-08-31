import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/migrate-v3.2.sql';

test('v3.2 migration grants profile reads and creates household media',()=>{
  assert.ok(fs.existsSync(path),'v3.2 migration must exist');
  const sql=fs.readFileSync(path,'utf8');
  assert.match(sql,/grant\s+select\s+on\s+public\.profiles\s+to\s+authenticated/i);
  assert.match(sql,/household-media/i);
  assert.match(sql,/alter\s+table\s+public\.member_payment_methods/i);
  assert.match(sql,/provider/i);
  assert.match(sql,/account_name/i);
  assert.match(sql,/MariBank/i);
  assert.match(sql,/payment methods household read/i);
  assert.match(sql,/household media read/i);
});
