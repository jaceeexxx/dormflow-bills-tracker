import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrate-history.sql','utf8');
for(const [label,value] of [['total','2394422'],['settled','2206229'],['outstanding','188193']]){
  if(!sql.includes(value)) throw new Error(`Missing ${label} verification target ${value}`);
}
if(/public\.members\b|expense_categories|public_obligation_balances|app_state/i.test(sql)) throw new Error('History migration depends on obsolete v1/v2 schema');
console.log('DormFlow v3 history migration contract verified.');
