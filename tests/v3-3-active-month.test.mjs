import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.existsSync('supabase/migrate-v3.3.sql') ? fs.readFileSync('supabase/migrate-v3.3.sql','utf8') : '';
const schema = fs.readFileSync('supabase/schema.sql','utf8');

for (const [name,src] of [['migration',migration],['schema',schema]]) {
  test(`${name} enforces one active billing period per household`,()=>{
    assert.match(src,/create\s+unique\s+index[\s\S]*billing_periods[\s\S]*where\s*\(?\s*status\s*=\s*'active'\s*\)?/i);
  });
  test(`${name} defines set_active_month_v3 and refuses closed reactivation`,()=>{
    assert.match(src,/set_active_month_v3/i);
    assert.match(src,/if\s+v_target_status\s*=\s*'closed'[\s\S]*raise exception/i);
  });
  test(`${name} current read models expose period_month`,()=>{
    assert.match(src,/member_home_v3[\s\S]*period_month/i);
    assert.match(src,/admin_overview_v3[\s\S]*period_month/i);
  });
}

test('migration preserves cross-period obligations instead of moving them',()=>{
  assert.doesNotMatch(migration,/update\s+public\.obligations[\s\S]*period_id\s*=/i);
  assert.doesNotMatch(migration,/delete\s+from\s+public\.obligations/i);
  assert.match(migration,/balance_carry_forward/);
});

test('member/admin UI uses active period month instead of hard-coded August',()=>{
  const read=fs.readFileSync('js/read-model-v3.js','utf8');
  const member=fs.readFileSync('js/member-home.js','utf8');
  const admin=fs.readFileSync('js/admin-overview-v3.js','utf8');
  const setup=fs.readFileSync('js/admin-generic-v3.js','utf8');
  assert.match(read,/periodMonth\s*:\s*raw\.period_month/);
  assert.doesNotMatch(member,/August 2026/);
  assert.match(member,/periodMonth/);
  assert.match(admin,/periodMonth/);
  assert.match(setup,/Make current/);
  assert.match(setup,/data-month-activate/);
  assert.match(setup,/closed/i);
});
