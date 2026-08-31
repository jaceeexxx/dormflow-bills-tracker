import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateLocalPin} from '../js/app-lock.js';

const read=p=>fs.readFileSync(p,'utf8');

test('local app lock accepts exactly six numeric digits',()=>{
  assert.equal(validateLocalPin('123456'),true);
  for(const bad of ['12345','1234567','12a456','',' 123456 ']) assert.equal(validateLocalPin(bad),false,bad);
});

test('banking PIN screen uses six dots keypad auto submit and password fallback',()=>{
  const src=read('js/pin-screen.js');
  assert.match(src,/pin-dot/);
  assert.match(src,/data-pin-key/);
  assert.match(src,/length===6|length >= 6/);
  assert.match(src,/Use password instead/);
  assert.match(src,/Incorrect PIN|incorrect/i);
  const app=read('js/app.js');
  assert.doesNotMatch(app,/prompt\('DormFlow is locked/);
  assert.match(app,/openPinVerification|openPinScreen/);
  const people=read('js/people-settings.js');
  assert.doesNotMatch(people,/Choose a 4.?8 digit DormFlow PIN/);
  assert.match(people,/6-digit|six-digit/i);
});

test('service worker sends foreground push to the open app and reserves system notification for background',()=>{
  const sw=read('service-worker.js');
  assert.match(sw,/visibilityState===['"]visible['"]/);
  assert.match(sw,/postMessage\(\{type:['"]dormflow:push['"]/);
  assert.match(sw,/showNotification/);
  assert.match(read('js/app.js'),/navigator\.serviceWorker\.addEventListener\(['"]message['"]/);
  assert.match(read('js/app.js'),/foreground-push-banner/);
});

test('push delivery deactivates expired 404 or 410 subscriptions',()=>{
  const server=read('lib/push-server.js');
  assert.match(server,/404/);
  assert.match(server,/410/);
  assert.match(server,/is_active:false/);
  for(const path of ['api/push-event.js','api/push-deliver.js','api/reminders.js']){
    const src=read(path);
    assert.match(src,/id,endpoint|select=id/);
    assert.match(src,/sendPushWithCleanup/);
  }
});

test('PayLater notification type is routed and push-pref mapped',()=>{
  const client=read('js/notifications.js');
  const server=read('api/push-event.js');
  assert.match(client,/paylater_added/);
  assert.match(client,/paylater/);
  assert.match(server,/paylater_added/);
  assert.match(server,/\/#\/paylater/);
  const migration=read('supabase/migrate-v3.3.1.sql');
  assert.match(migration,/paylater_added/);
  assert.match(migration,/target_type[^;]*paylater/is);
});
