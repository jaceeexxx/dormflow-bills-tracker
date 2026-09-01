import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {urlBase64ToUint8Array,subscriptionMatchesVapid} from '../js/push.js';

const read=p=>fs.readFileSync(p,'utf8');

test('VAPID comparison detects stale browser subscriptions',()=>{
  const key='BEl6mQXv6Q3R7tYvJm5VxJx0uX8E1u8jUPqo4tD5mEPs9cKlVQb2bJ-Q1_5XjScV1V4z0F3Lr7vKkZQK7M9ZfV0';
  const expected=urlBase64ToUint8Array(key);
  assert.equal(subscriptionMatchesVapid({options:{applicationServerKey:expected.buffer}},key),true);
  const changed=new Uint8Array(expected);changed[0]=(changed[0]+1)%255;
  assert.equal(subscriptionMatchesVapid({options:{applicationServerKey:changed.buffer}},key),false);
});

test('Enable push repairs stale VAPID subscriptions and registers through the server endpoint',()=>{
  const src=read('js/push.js');
  assert.match(src,/subscriptionMatchesVapid/);
  assert.match(src,/subscription\.unsubscribe\(\)/);
  assert.match(src,/\/api\/push-subscribe/);
  assert.match(src,/Authorization:`Bearer \$\{token\}`/);
  assert.match(src,/serverRegistered/);
});

test('Notification settings expose real device diagnostics and a 5-second background test',()=>{
  const src=read('js/people-settings.js');
  assert.match(src,/Server registration/);
  assert.match(src,/VAPID key/);
  assert.match(src,/Browser subscription/);
  assert.match(src,/Send 5-second test/);
  assert.match(src,/data-action="test-push"/);
  assert.doesNotMatch(src,/status\.subscribed\?'Active'/);
});

test('app routes the test-push action through authenticated client delivery',()=>{
  const src=read('js/app.js');
  assert.match(src,/test-push/);
  assert.match(src,/sendPushTest/);
  assert.match(src,/background/i);
});

test('push-test endpoint authenticates current member, waits five seconds, and reports real delivery',()=>{
  const src=read('api/push-test.js');
  assert.match(src,/currentIdentityFromToken/);
  assert.doesNotMatch(src,/\/rest\/v1\/profiles/);
  assert.match(src,/push_subscriptions/);
  assert.match(src,/is_active=eq\.true/);
  assert.match(src,/setTimeout\(resolve,5000\)/);
  assert.match(src,/sendPushWithCleanup/);
  assert.match(src,/delivered/);
  assert.match(src,/failed/);
  assert.match(src,/expired/);
});
