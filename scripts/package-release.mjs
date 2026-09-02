import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target='/mnt/data/DormFlow_v3_3_5_Exact_Payment_Receipts_PWA_20_St_Paul.zip';
const forbiddenReleasePaths=['admin.html','api/payment-claims.js','supabase/migrate-v1.sql','supabase/migrate-v2.2.sql','assets/qr/','data/seed.json','.env.local','.git/','.worktrees/','node_modules/'];
function run(cmd,args,opts={}){const r=spawnSync(cmd,args,{cwd:root,encoding:'utf8',stdio:opts.capture?'pipe':'inherit'});if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed${r.stderr?`:\n${r.stderr}`:''}`);return r.stdout||'';}

run('npm',['test']);
run('npm',['run','check']);
const status=run('git',['status','--porcelain'],{capture:true}).trim();
if(status)throw new Error(`Release requires a clean Git worktree. Commit or remove these changes first:\n${status}`);

const files=run('git',['ls-files'],{capture:true}).trim().split('\n').filter(Boolean);
for(const forbidden of forbiddenReleasePaths){if(files.some(f=>f===forbidden||f.startsWith(forbidden)))throw new Error(`Forbidden release path is tracked: ${forbidden}`);}
for(const f of files){
  const full=path.join(root,f);if(!existsSync(full))continue;
  if(!/\.(?:js|mjs|json|html|css|md|sql|svg|example|gitignore)$/.test(f)&&path.basename(f)!=='.env.example')continue;
  const text=readFileSync(full,'utf8');
  if(/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)||/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(text)||/-----BEGIN (?:PRIVATE KEY|RSA PRIVATE KEY)-----/.test(text))throw new Error(`Secret-like token detected in ${f}`);
}

if(existsSync(target))rmSync(target);
run('git',['archive','--format=zip','--prefix=dormflow-bills-tracker/','-o',target,'HEAD']);
run('unzip',['-t',target]);
const zipList=run('unzip',['-Z1',target],{capture:true}).split('\n').filter(Boolean).map(f=>f.replace(/^dormflow-bills-tracker\//,''));
for(const forbidden of forbiddenReleasePaths){if(zipList.some(f=>f===forbidden||f.startsWith(forbidden)))throw new Error(`Forbidden path found in ZIP: ${forbidden}`);}
if(!zipList.includes('supabase/schema.sql')||!zipList.includes('supabase/seed-members.sql')||!zipList.includes('supabase/migrate-history.sql')||!zipList.includes('supabase/migrate-v3.2.sql')||!zipList.includes('supabase/migrate-v3.3.sql')||!zipList.includes('supabase/migrate-v3.3.1.sql')||!zipList.includes('supabase/migrate-v3.3.2.sql')||!zipList.includes('supabase/migrate-v3.3.3.sql')||!zipList.includes('supabase/migrate-v3.3.4.sql')||!zipList.includes('supabase/migrate-v3.3.5.sql'))throw new Error('DormFlow v3.3.5 Supabase setup/upgrade files missing from ZIP.');
console.log(`DormFlow v3.3.5 release ZIP ready: ${target} (${zipList.filter(Boolean).length} archived paths)`);
