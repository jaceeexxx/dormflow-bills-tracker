import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');

const latestFunctionBlock=(sql,name)=>{
  const re=new RegExp(`create or replace function public\\.${name}\\b`,'gi');
  let match,start=-1;
  while((match=re.exec(sql))) start=match.index;
  assert.notEqual(start,-1, `${name} should be defined`);
  const end=sql.indexOf('$$;',start);
  assert.notEqual(end,-1, `${name} should use a dollar-quoted body`);
  return sql.slice(start,end+3);
};

test('all financial sheets use the shared observable save flow',()=>{
  const files=[
    'js/member-payments.js',
    'js/admin-generic-v3.js',
    'js/admin-utilities-v3.js',
    'js/admin-review.js',
    'js/announcements-v3.js',
    'js/paylater-v3.js'
  ];
  for(const file of files){
    const src=read(file);
    assert.match(src,/bindSaveFlow/, `${file} should use bindSaveFlow`);
    assert.doesNotMatch(src,/\.onsubmit\s*=/, `${file} should not hide form errors behind a raw onsubmit handler`);
  }
});

test('financial save blocks do not await push delivery before resolving',()=>{
  const files=[
    'js/member-payments.js',
    'js/admin-generic-v3.js',
    'js/admin-utilities-v3.js',
    'js/admin-review.js',
    'js/announcements-v3.js',
    'js/paylater-v3.js'
  ];
  for(const file of files){
    assert.doesNotMatch(read(file),/await\s+requestPushForTarget/, `${file} should schedule push after save instead of awaiting it`);
  }
});

test('admin review keeps completion refresh pinned to the review route',()=>{
  const app=read('js/app.js');
  assert.match(app,/openClaimReview\(.*onDone:\(\)=>\{state\.route='review';renderApp\(\);\}/s);
});

test('utility save callback uses the provided onDone callback',()=>{
  const src=read('js/admin-utilities-v3.js');
  assert.match(src,/onSaved:async id=>\{queuePushForTarget\(\{targetType:'expense',targetId:id\}\);await onDone\(id\);\}/);
  assert.doesNotMatch(src,/\bonSaved\}\);/);
});

test('open obligations lookup qualifies id output-column references used before payment saves',()=>{
  for(const file of ['supabase/migrate-v3.3.3.sql','supabase/schema.sql']){
    const fn=latestFunctionBlock(read(file),'open_obligations_v3');
    assert.match(fn,/returns table\(\s*id uuid,/i);
    assert.match(fn,/from public\.household_members hm\s+where hm\.id\s*=\s*v_debtor/is);
    assert.match(fn,/select bp\.month into v_active_month\s+from public\.billing_periods bp/is);
    assert.match(fn,/return query select\s+ob\.id,\s*ob\.due_date,\s*ob\.source_category,\s*ob\.outstanding_cents/is);
    assert.doesNotMatch(fn,/(?:where|and)\s+id\s*=/i);
    assert.doesNotMatch(fn,/select household_id into v_household\s+from public\.household_members\s+where id/i);
  }
});
