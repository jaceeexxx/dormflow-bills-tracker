import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');

test('client member pickers use household_member_directory_v3 instead of profiles joins',()=>{
  assert.ok(fs.existsSync('js/member-directory.js'),'member directory helper should exist');
  const helper=read('js/member-directory.js');
  assert.match(helper,/household_member_directory_v3/);
  const pickerFiles=[
    'js/admin-generic-v3.js',
    'js/admin-utilities-v3.js',
    'js/admin-overview-v3.js',
    'js/member-home.js',
    'js/people-settings.js',
    'js/paylater-v3.js'
  ];
  for(const file of pickerFiles){
    const src=read(file);
    assert.doesNotMatch(src,/household_members['"][^;\n]*profiles\(/, `${file} should not use nested profiles selects for member directory data`);
  }
});

test('v3.3.3 migration adds a security-definer member directory and restores profile read defense in depth',()=>{
  assert.ok(fs.existsSync('supabase/migrate-v3.3.3.sql'),'v3.3.3 migration should exist');
  const sql=read('supabase/migrate-v3.3.3.sql');
  assert.match(sql,/create or replace function public\.household_member_directory_v3/i);
  assert.match(sql,/security definer/i);
  assert.match(sql,/member_id/i);
  assert.match(sql,/display_name/i);
  assert.match(sql,/avatar_path/i);
  assert.match(sql,/grant select on public\.profiles to authenticated/i);
  assert.match(sql,/profiles household read/i);
  const profilePolicy=sql.match(/create policy "profiles household read"[\s\S]*?\);/i)?.[0]||'';
  assert.doesNotMatch(profilePolicy,/join\s+public\.profiles/i,'profile read policy must not recursively query profiles');
});

test('push APIs identify current member without direct profiles REST joins',()=>{
  const server=read('lib/server-supabase.js');
  assert.match(server,/currentIdentityFromToken/);
  for(const file of ['api/push-subscribe.js','api/push-test.js','api/push-event.js','api/push-deliver.js']){
    const src=read(file);
    assert.match(src,/currentIdentityFromToken/, `${file} should use the identity RPC`);
    assert.doesNotMatch(src,/\/rest\/v1\/profiles/, `${file} should not query profiles directly`);
  }
});

test('push-subscribe registers through the caller JWT instead of the server credential',()=>{
  const src=read('api/push-subscribe.js');
  assert.match(src,/currentIdentityFromToken/);
  assert.match(src,/userRequest/);
  assert.match(src,/userRequest\(token,\s*['"`]\/rest\/v1\/push_subscriptions/);
  assert.doesNotMatch(src,/serviceRequest\(.*push_subscriptions/s);
});

test('health endpoint reports granular readiness including verified server credentials',()=>{
  const src=read('api/health.js');
  assert.match(src,/checks/);
  for(const key of ['supabaseUrl','browserKey','serverCredential','vapidKeys','cron']){
    assert.match(src,new RegExp(key));
  }
  assert.match(src,/serviceRequest/);
});

test('notification diagnostics include the push server readiness hop',()=>{
  const src=read('js/people-settings.js');
  assert.match(src,/Push server/);
  assert.match(src,/health/i);
});

test('notification screen keeps server health out of the enable-push critical path',()=>{
  const app=read('js/app.js');
  const settings=read('js/people-settings.js');
  assert.doesNotMatch(app,/loadPushServerReady/);
  assert.match(settings,/data-push-server-state/);
  assert.match(settings,/loadPushServerReady/);
});

test('notification settings exposes enable push even if health never responds',async()=>{
  const originals=new Map(['fetch','window','navigator','Notification'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const restore=()=>{for(const [name,descriptor] of originals)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];};
  try{
    globalThis.fetch=async url=>{
      const requestUrl=String(url);
      if(requestUrl==='/api/health')return new Promise(()=>{});
      if(requestUrl.includes('/rest/v1/notification_preferences'))return {ok:true,json:async()=>[]};
      throw new Error(`Unexpected fetch: ${requestUrl}`);
    };
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{ready:Promise.resolve({pushManager:{getSubscription:async()=>null}})},standalone:false}});
    Object.defineProperty(globalThis,'window',{configurable:true,value:{PushManager:function PushManager(){},matchMedia:()=>({matches:false}),navigator:globalThis.navigator}});
    Object.defineProperty(globalThis,'Notification',{configurable:true,value:{permission:'default'}});

    const settings=await import(`../js/people-settings.js?health-hang-${Date.now()}`);
    const html=await Promise.race([
      settings.renderNotificationPreferences({memberId:'member-1',member_id:'member-1'}),
      new Promise(resolve=>setTimeout(()=>resolve('__timeout__'),50))
    ]);

    assert.notEqual(html,'__timeout__');
    assert.match(html,/data-action="enable-push"/);
  }finally{
    restore();
  }
});

test('v3.3.3 migration includes service-role grants required by the push backend',()=>{
  const sql=read('supabase/migrate-v3.3.3.sql');
  assert.match(sql,/grant usage on schema public to service_role/i);
  for(const table of ['profiles','household_members','push_subscriptions','notification_preferences','notifications']){
    assert.match(sql,new RegExp(`public\\.${table}`,'i'),`service role grants should mention ${table}`);
  }
  assert.match(sql,/grant select on table[\s\S]*to service_role/i);
  assert.match(sql,/grant update on table[\s\S]*public\.push_subscriptions[\s\S]*public\.notifications[\s\S]*to service_role/i);
});

test('v3.3.3 migration restores authenticated own-device push subscription writes',()=>{
  const sql=read('supabase/migrate-v3.3.3.sql');
  assert.match(sql,/grant select,insert,update,delete on public\.push_subscriptions to authenticated/i);
  assert.match(sql,/drop policy if exists "push_subscriptions own" on public\.push_subscriptions/i);
  assert.match(sql,/create policy "push_subscriptions own"[\s\S]*with check\(member_id=public\.current_member_id_v3\(\)\)/i);
});

test('enable push trusts a successful server registration instead of requiring a browser table re-read',()=>{
  const src=read('js/push.js');
  const block=src.match(/export async function enablePush[\s\S]*?\n}\n\nexport async function disablePush/)?.[0]||'';
  assert.match(block,/await registerWithServer\(subscription\)/);
  assert.doesNotMatch(block,/pushCapabilityStatus\(identity\)/);
  assert.doesNotMatch(block,/status\.serverRegistered/);
});
