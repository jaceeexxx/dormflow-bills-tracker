import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));

test('v3.3.5 is a real release and service worker cache boundary', () => {
  const sw = read('service-worker.js');
  assert.equal(pkg.version, '3.3.5');
  assert.match(sw, /dormflow-v3-3-5/);
  assert.match(sw, /cache:\s*['"]reload['"]/);
  assert.doesNotMatch(sw, /CACHE_NAME='dormflow-v3-3-2/);
});

test('app registration asks the installed service worker to check for updates', () => {
  const app = read('js/app.js');
  assert.match(app, /navigator\.serviceWorker\.addEventListener\(['"]controllerchange['"]/);
  assert.match(app, /register\('\/service-worker\.js'\)/);
  assert.match(app, /\.update\(\)/);
});

test('v3.3.5 release tooling and docs point to the additive migration', () => {
  const check = read('scripts/check-project.mjs');
  const pack = read('scripts/package-release.mjs');
  const docs = [read('README.md'), read('docs/DEPLOYMENT.md'), read('supabase/README.md'), read('RELEASE-CHECKLIST.md')].join('\n');
  assert.match(check, /package\.json must be v3\.3\.5/);
  assert.match(pack, /DormFlow_v3_3_5_Exact_Payment_Receipts_PWA_20_St_Paul\.zip/);
  assert.match(pack, /migrate-v3\.3\.5\.sql/);
  assert.match(docs, /migrate-v3\.3\.5\.sql/i);
  assert.match(docs, /do\s+(?:\*\*)?not(?:\*\*)?\s+(?:re-?run|run again)/i);
});
