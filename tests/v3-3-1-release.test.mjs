import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const sw=fs.readFileSync('service-worker.js','utf8');
const readme=fs.readFileSync('README.md','utf8');
const checklist=fs.readFileSync('RELEASE-CHECKLIST.md','utf8');
const supabaseReadme=fs.readFileSync('supabase/README.md','utf8');

const docs=[readme,checklist,supabaseReadme].join('\n');

test('v3.3.1 release metadata and cache namespace are current',()=>{
  assert.equal(pkg.version,'3.3.1');
  assert.match(sw,/dormflow-v3-3-1/);
});

test('v3.3.1 upgrade docs require only the additive migration',()=>{
  assert.match(readme,/migrate-v3\.3\.1\.sql/i);
  assert.match(supabaseReadme,/existing v3\.3.*v3\.3\.1/is);
  assert.match(supabaseReadme,/migrate-v3\.3\.1\.sql/i);
  assert.match(docs,/do not rerun[^\n]*(schema\.sql|earlier|migrate-v3\.3\.sql)/i);
});

test('release checklist explicitly verifies the installed iPhone PWA and push',()=>{
  assert.match(checklist,/iPhone[\s\S]*PWA/i);
  assert.match(checklist,/push notification/i);
});
