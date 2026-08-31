import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const readme=fs.readFileSync('README.md','utf8');
const deploy=fs.readFileSync('docs/DEPLOYMENT.md','utf8');
const checklist=fs.readFileSync('RELEASE-CHECKLIST.md','utf8');
const release=fs.readFileSync('scripts/package-release.mjs','utf8');

test('v3.3 release metadata and upgrade docs target the existing authenticated v3 database',()=>{
  assert.equal(pkg.version,'3.3.1');
  for(const text of [readme,deploy,checklist]){
    assert.match(text,/migrate-v3\.3\.1\.sql/i);
    assert.match(text,/do not rerun|do not run again|do not re-run/i);
  }
  assert.match(release,/DormFlow_v3_3_1_Beta_Stabilization_PWA_20_St_Paul\.zip/);
  assert.match(release,/migrate-v3\.3\.1\.sql/i);
});
