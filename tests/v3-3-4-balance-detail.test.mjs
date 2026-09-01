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

test('v3.3.4 migration creates additive member balance detail RPC',()=>{
  const sql=read('supabase/migrate-v3.3.4.sql');
  const fn=latestFunctionBlock(sql,'member_balance_detail_v3');
  assert.match(fn,/p_today date default current_date/i);
  for(const key of ['member_id','outstanding_cents','owed_to_me_cents','credit_cents','net_position_cents','credit_breakdown','creditors','due_groups','category_breakdown']){
    assert.match(fn,new RegExp(`'${key}'`,'i'), key);
  }
  assert.match(sql,/grant execute on function public\.member_balance_detail_v3\(date\) to authenticated/i);
  assert.doesNotMatch(sql,/drop table|truncate|delete from public\.(payments|payment_allocations|obligations|expenses|credits)/i);
});

test('balance detail groups creditors with avatar paths and category breakdown',()=>{
  for(const file of ['supabase/migrate-v3.3.4.sql','supabase/schema.sql']){
    const fn=latestFunctionBlock(read(file),'member_balance_detail_v3');
    assert.match(fn,/avatar_path/i);
    assert.match(fn,/jsonb_agg[\s\S]*breakdown/i);
    assert.match(fn,/source_type/i);
    assert.match(fn,/source_category/i);
    assert.match(fn,/category_breakdown/i);
    assert.match(fn,/count\(\*\)::int/i);
  }
});

test('balance detail classifies due status by overdue five day later and no due date',()=>{
  const fn=latestFunctionBlock(read('supabase/migrate-v3.3.4.sql'),'member_balance_detail_v3');
  assert.match(fn,/when .*due_date is null then 'no_due_date'/is);
  assert.match(fn,/when .*due_date < p_today then 'overdue'/is);
  assert.match(fn,/when .*due_date <= p_today \+ 5 then 'due_soon'/is);
  assert.match(fn,/else 'later'/is);
  assert.match(fn,/'overdue'/i);
  assert.match(fn,/'due_soon'/i);
  assert.match(fn,/'later'/i);
  assert.match(fn,/'no_due_date'/i);
});

test('credit breakdown includes creditor identity and source payment metadata',()=>{
  const fn=latestFunctionBlock(read('supabase/migrate-v3.3.4.sql'),'member_balance_detail_v3');
  for(const key of ['credit_id','creditor_member_id','creditor_display_name','original_amount_cents','remaining_amount_cents','source_payment_id','source_payment_date','source_payment_method']){
    assert.match(fn,new RegExp(`'${key}'`,'i'), key);
  }
  assert.match(fn,/from public\.credits c/i);
  assert.match(fn,/left join public\.payments pay/i);
});
