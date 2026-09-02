import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');

test('release metadata is v3.3.5 and service-worker cache is bumped',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'3.3.5');
  assert.match(read('service-worker.js'),/dormflow-v3-3-5/);
});

test('project/release checks require v3.3.5 migration and push test endpoint',()=>{
  const check=read('scripts/check-project.mjs');
  const pack=read('scripts/package-release.mjs');
  assert.match(check,/api\/push-test\.js/);
  assert.match(check,/migrate-v3\.3\.5\.sql/);
  assert.match(check,/package\.json must be v3\.3\.5/);
  assert.match(pack,/DormFlow_v3_3_5_Exact_Payment_Receipts_PWA_20_St_Paul\.zip/);
  assert.match(pack,/migrate-v3\.3\.5\.sql/);
});

test('deployment docs describe one-time v3.3.4 to v3.3.5 upgrade and real iPhone push test',()=>{
  for(const file of ['README.md','docs/DEPLOYMENT.md','supabase/README.md','RELEASE-CHECKLIST.md']){
    const src=read(file);
    assert.match(src,/v3\.3\.5/i,`${file} must mention v3.3.5`);
    assert.match(src,/migrate-v3\.3\.5\.sql/i,`${file} must name migration`);
  }
  const readme=read('README.md');
  assert.match(readme,/Send 5-second test/i);
  assert.match(readme,/September 5|Sep 5/i);
});

test('v3.3.2 migration keeps canonical September schedule and current-period balance filter',()=>{
  const sql=read('supabase/migrate-v3.3.2.sql');
  for(const marker of [
    "('SPayLater','Aerian','2026-09-05'::date,59200::bigint,14800::bigint",
    "('SPayLater','Jace','2026-09-05'::date,466000::bigint,116500::bigint",
    "('TikTok PayLater','Jace','2026-09-16'::date,36000::bigint,9000::bigint",
    'bp.month <= v_active_month',
    'created_by is null'
  ]) assert.ok(sql.includes(marker),`missing ${marker}`);
});
