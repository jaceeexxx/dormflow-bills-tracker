import {access,readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=[
  'index.html','css/styles.css','manifest.webmanifest','service-worker.js','offline.html',
  'assets/brand/dormflow-mark.svg','assets/brand/icon-192.png','assets/brand/icon-512.png','assets/brand/apple-touch-icon.png',
  'js/app.js','js/router.js','js/icons.js','js/config.js','js/supabase-client.js','js/auth.js','js/app-lock.js',
  'js/read-model-v3.js','js/member-home.js','js/member-balance.js','js/member-payments.js','js/member-more.js','js/payment-form.js','js/attachments.js','js/banking-carousel.js','js/household-media.js',
  'js/admin-overview-v3.js','js/admin-actions.js','js/admin-expenses-v3.js','js/admin-utilities-v3.js','js/admin-generic-v3.js','js/admin-review.js',
  'js/household-views-v3.js','js/announcements-v3.js','js/paylater-v3.js','js/people-settings.js','js/notifications.js','js/push.js','js/months.js',
  'api/health.js','api/push-subscribe.js','api/push-deliver.js','api/push-event.js','api/push-test.js','api/reminders.js','lib/server-supabase.js','lib/push-server.js',
  'supabase/schema.sql','supabase/seed-members.sql','supabase/migrate-history.sql','supabase/migrate-v3.2.sql','supabase/migrate-v3.3.sql','supabase/migrate-v3.3.1.sql','supabase/migrate-v3.3.2.sql','supabase/migrate-v3.3.3.sql','supabase/migrate-v3.3.4.sql','supabase/README.md',
  'scripts/verify-v3-history.mjs','vercel.json','package.json','README.md','docs/DEPLOYMENT.md','docs/MIGRATION.md','.env.example','RELEASE-CHECKLIST.md'
];
const forbidden=[
  'admin.html','api/payment-claims.js','lib/claim-validation.js','supabase/migrate-v1.sql','supabase/migrate-v2.2.sql',
  'js/admin-app.js','js/admin-forms.js','js/public-app.js','js/data-client.js','js/migrate-v1.js','js/read-model.js','js/ledger.js','js/charts.js',
  'data/seed-data.js','data/seed.json','assets/qr/jace.jpg','assets/qr/kean.jpg','assets/qr/aerian.jpg','assets/qr/aexy.jpg'
];
for(const f of required)await access(path.join(root,f));
for(const f of forbidden){try{await access(path.join(root,f));throw new Error(`Obsolete/private v2 artifact must not ship: ${f}`);}catch(err){if(err?.code!=='ENOENT')throw err;}}

async function walk(dir){const out=[];for(const d of await readdir(dir,{withFileTypes:true})){if(['.git','.worktrees','node_modules','.vercel'].includes(d.name))continue;const p=path.join(dir,d.name);if(d.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
const all=await walk(root);
const jsFiles=all.filter(f=>f.endsWith('.js')||f.endsWith('.mjs'));
for(const file of jsFiles){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0)throw new Error(`Syntax check failed for ${path.relative(root,file)}:\n${r.stderr}`);}

const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
if(pkg.version!=='3.3.4')throw new Error('package.json must be v3.3.4');
if(pkg.dependencies?.['web-push']!=='^3.6.7')throw new Error('web-push dependency missing from v3 package');
if(pkg.scripts?.test!=='node --test tests/v3-*.test.mjs')throw new Error('npm test must run only the v3 contract suite');

const config=await readFile(path.join(root,'js/config.js'),'utf8');
if(/sb_secret_|service[_-]?role|VAPID_PRIVATE_KEY|CRON_SECRET|SUPABASE_SECRET_KEY/i.test(config))throw new Error('Server-only secret name/token found in browser config.');
if(!/supabasePublishableKey/.test(config)||!/vapidPublicKey/.test(config))throw new Error('Browser-safe Supabase/VAPID configuration missing.');

const index=await readFile(path.join(root,'index.html'),'utf8');
if(!/id="auth-screen"/.test(index)||!/id="app-shell"/.test(index)||!/manifest\.webmanifest/.test(index))throw new Error('Authenticated PWA shell markers missing.');
if(/sign\s*up|register/i.test(index))throw new Error('Public registration UI must not ship.');

const schema=await readFile(path.join(root,'supabase/schema.sql'),'utf8');
for(const table of ['profiles','households','household_members','billing_periods','expenses','expense_payers','expense_splits','obligations','payments','payment_allocations','payment_claims','credits','utility_records','paylater_accounts','paylater_installments','announcements','attachments','notifications','notification_preferences','push_subscriptions','split_presets','audit_log']){
  if(!new RegExp(`create table public\\.${table}\\s*\\(`,'i').test(schema))throw new Error(`Missing v3 table: ${table}`);
}
for(const fn of ['create_expense_v3','submit_payment_claim_v3','review_payment_claim_v3','record_payment_v3','delete_or_void_expense_v3','edit_expense_v3','initialize_month_v3','set_active_month_v3','create_paylater_v3','edit_paylater_v3','archive_paylater_v3','household_member_directory_v3','member_home_v3','member_balance_v3','member_balance_detail_v3','admin_overview_v3'])if(!new RegExp(`function public\\.${fn}`,'i').test(schema))throw new Error(`Missing v3 RPC: ${fn}`);
if(!/financial-documents','financial-documents',false/i.test(schema))throw new Error('financial-documents Storage bucket must remain private.');
if((schema.match(/enable row level security/gi)||[]).length<15)throw new Error('Expected RLS across private v3 tables.');


const v33=await readFile(path.join(root,'supabase/migrate-v3.3.sql'),'utf8');
for(const marker of ['set_active_month_v3','billing_periods_one_active_per_household','month_balance_updates','push_attempted_at'])if(!v33.includes(marker))throw new Error(`Missing v3.3 migration marker: ${marker}`);
const v331=await readFile(path.join(root,'supabase/migrate-v3.3.1.sql'),'utf8');
for(const marker of ['source_paylater_installment_id','edit_paylater_v3','archive_paylater_v3','paylater_added'])if(!v331.includes(marker))throw new Error(`Missing v3.3.1 migration marker: ${marker}`);
const v332=await readFile(path.join(root,'supabase/migrate-v3.3.2.sql'),'utf8');
for(const marker of ['2026-09-05','59200','466000','bp.month <= v_active_month','created_by is null'])if(!v332.includes(marker))throw new Error(`Missing v3.3.2 migration marker: ${marker}`);
const v333=await readFile(path.join(root,'supabase/migrate-v3.3.3.sql'),'utf8');
for(const marker of ['household_member_directory_v3','submit_payment_claim_v3','record_payment_v3','push_subscriptions'])if(!v333.includes(marker))throw new Error(`Missing v3.3.3 migration marker: ${marker}`);
const v334=await readFile(path.join(root,'supabase/migrate-v3.3.4.sql'),'utf8');
for(const marker of ['member_balance_detail_v3','credit_breakdown','due_groups','coalesce(e.category','coalesce(e.due_date'])if(!v334.includes(marker))throw new Error(`Missing v3.3.4 migration marker: ${marker}`);
const vercel=JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8'));
if(!vercel.crons?.some(c=>c.path==='/api/reminders'&&c.schedule==='0 0 * * *'))throw new Error('Daily reminders must run at 00:00 UTC / 08:00 PHT.');
const sw=await readFile(path.join(root,'service-worker.js'),'utf8');
if(!/dormflow-v3-3-4/i.test(sw))throw new Error('Service worker cache must be versioned for v3.3.4.');

const migration=await readFile(path.join(root,'supabase/migrate-history.sql'),'utf8');
for(const value of ['2394422','2206229','188193'])if(!migration.includes(value))throw new Error(`Missing August migration verification target: ${value}`);
if(/app_state|public_obligation_balances|public\.members\b/i.test(migration))throw new Error('History migration depends on obsolete schema.');

const env=await readFile(path.join(root,'.env.example'),'utf8');
for(const name of ['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_PUBLISHABLE_KEY','VAPID_SUBJECT','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','CRON_SECRET']){
  if(!new RegExp(`^${name}=$`,'m').test(env))throw new Error(`${name} must be present and blank in .env.example`);
}

const textExt=new Set(['.js','.mjs','.json','.html','.css','.md','.sql','.svg','.example','.gitignore']);
for(const file of all.filter(f=>textExt.has(path.extname(f))||path.basename(f)==='.env.example')){
  const text=await readFile(file,'utf8');
  if(/sb_secret_[A-Za-z0-9_-]{8,}/.test(text))throw new Error(`Supabase secret-like token committed in ${path.relative(root,file)}.`);
  if(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(text))throw new Error(`JWT-like secret committed in ${path.relative(root,file)}.`);
  if(/-----BEGIN (?:PRIVATE KEY|RSA PRIVATE KEY)-----/.test(text))throw new Error(`Private key committed in ${path.relative(root,file)}.`);
}

console.log(`DormFlow v3.3.4 project check passed: ${required.length} required files; ${jsFiles.length} JavaScript files syntax-valid; fresh schema/RLS/PWA/deployment markers present; no forbidden v2/private artifacts or committed secret-like credentials found.`);
