import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>readFile(path.join(root,f),'utf8');

const obsolete=[
  'admin.html','js/admin-app.js','js/admin-forms.js','js/public-app.js','js/read-model.js','js/data-client.js','js/migrate-v1.js',
  'data/seed-data.js','data/seed.json','api/payment-claims.js','lib/claim-validation.js','supabase/migrate-v1.sql','supabase/migrate-v2.2.sql',
  'assets/qr/jace.jpg','assets/qr/kean.jpg','assets/qr/aerian.jpg','assets/qr/aexy.jpg'
];

async function exists(f){try{await access(path.join(root,f));return true;}catch{return false;}}

test('release metadata describes only the fresh authenticated v3 app',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  const readme=await read('README.md');
  assert.equal(pkg.version,'3.3.0');
  assert.match(pkg.scripts.test,/v3-\*\.test\.mjs/);
  assert.match(readme,/DormFlow v3/i);
  assert.match(readme,/schema\.sql[\s\S]*four Auth accounts[\s\S]*seed-members\.sql[\s\S]*migrate-history\.sql/i);
  assert.doesNotMatch(readme,/public site has no viewer login|migrate-v1\.sql|migrate-v2\.2\.sql|separate\s+`?\/admin\b/i);
});

test('deployment docs separate browser-safe and server-only configuration',async()=>{
  const deploy=await read('docs/DEPLOYMENT.md');
  const env=await read('.env.example');
  const config=await read('js/config.js');
  for(const name of ['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_PUBLISHABLE_KEY','VAPID_SUBJECT','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','CRON_SECRET']) assert.match(env,new RegExp(`^${name}=$`,'m'));
  assert.match(deploy,/js\/config\.js[\s\S]*Supabase project URL[\s\S]*publishable key[\s\S]*VAPID public key/i);
  assert.match(deploy,/Vercel[\s\S]*SUPABASE_SECRET_KEY[\s\S]*VAPID_PRIVATE_KEY[\s\S]*CRON_SECRET/i);
  assert.doesNotMatch(config,/sb_secret_|service[_-]?role|VAPID_PRIVATE_KEY|CRON_SECRET/i);
});

test('fresh v3 package source removes obsolete public-v2 artifacts and public QR files',async()=>{
  for(const file of obsolete) assert.equal(await exists(file),false,`${file} should not ship in v3`);
  for(const file of ['index.html','manifest.webmanifest','service-worker.js','supabase/schema.sql','supabase/seed-members.sql','supabase/migrate-history.sql','api/reminders.js','api/push-subscribe.js','api/push-deliver.js']) assert.equal(await exists(file),true,`${file} is required`);
});

test('migration guide has one clean Supabase sequence and exact August checks',async()=>{
  const migration=await read('docs/MIGRATION.md');
  assert.match(migration,/schema\.sql[\s\S]*create the four Auth accounts[\s\S]*seed-members\.sql[\s\S]*migrate-history\.sql/i);
  assert.match(migration,/2,394,422[\s\S]*2,206,229[\s\S]*188,193/);
  assert.doesNotMatch(migration,/migrate-v1|migrate-v2\.2|app_state|public dashboard/i);
});

test('release script targets the v3 ZIP and validates its contents',async()=>{
  const script=await read('scripts/package-release.mjs');
  assert.match(script,/DormFlow_v3_3_Notifications_Active_Month_PWA_20_St_Paul\.zip/);
  assert.match(script,/unzip/);
  assert.match(script,/migrate-v3\.3\.sql/i);
  assert.match(script,/SUPABASE_SECRET_KEY|secret-like/i);
  assert.match(script,/assets\/qr|admin\.html|migrate-v2\.2/);
});
