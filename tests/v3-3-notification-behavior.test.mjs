import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultNotificationPreferences,pushPreferenceForType,notificationRoute} from '../js/notifications.js';

test('v3.3 push defaults are all on',()=>{
  assert.deepEqual(defaultNotificationPreferences(),{
    payment_updates:true,
    due_reminders:true,
    announcements:true,
    expense_updates:true,
    month_balance_updates:true
  });
});

test('approved notification types map to push categories only',()=>{
  assert.equal(pushPreferenceForType('payment_verified'),'payment_updates');
  assert.equal(pushPreferenceForType('payment_claim'),'payment_updates');
  assert.equal(pushPreferenceForType('due_in_3_days'),'due_reminders');
  assert.equal(pushPreferenceForType('overdue'),'due_reminders');
  assert.equal(pushPreferenceForType('announcement'),'announcements');
  assert.equal(pushPreferenceForType('expense_added'),'expense_updates');
  assert.equal(pushPreferenceForType('utility_added'),'expense_updates');
  assert.equal(pushPreferenceForType('month_activated'),'month_balance_updates');
  assert.equal(pushPreferenceForType('balance_carry_forward'),'month_balance_updates');
  assert.equal(pushPreferenceForType('unknown_type'),null);
});

test('header implements unread notification badge with 99+ cap',()=>{
  const app=fs.readFileSync('js/app.js','utf8');
  const css=fs.readFileSync('css/styles.css','utf8');
  assert.match(app,/notification-badge/);
  assert.match(app,/99\+/);
  assert.match(css,/\.notification-badge/);
});

test('notification settings say Inbox is always on and include month balance push',()=>{
  const settings=fs.readFileSync('js/people-settings.js','utf8');
  assert.match(settings,/Inbox/i);
  assert.match(settings,/Always on/i);
  assert.match(settings,/month_balance_updates/);
  assert.match(settings,/Enable push/);
});

test('push permission is requested only by explicit enable function',()=>{
  const push=fs.readFileSync('js/push.js','utf8');
  assert.match(push,/pushCapabilityStatus/);
  assert.match(push,/Notification\.requestPermission/);
  assert.match(push,/enablePush/);
});

test('push-event is authenticated, household scoped, preference aware, and separate from financial writes',()=>{
  const src=fs.existsSync('api/push-event.js')?fs.readFileSync('api/push-event.js','utf8'):'';
  assert.match(src,/authUser/);
  assert.match(src,/household_id/);
  assert.match(src,/notification_preferences/);
  assert.match(src,/push_attempted_at/);
  assert.match(src,/push_sent_at/);
  assert.match(src,/sendPush/);
  assert.doesNotMatch(src,/create_expense_v3|review_payment_claim_v3|record_payment_v3|insert into public\.expenses/i);
});

test('database creates approved Inbox event types without preference-gated recipient loops',()=>{
  const migration=fs.readFileSync('supabase/migrate-v3.3.sql','utf8');
  const schema=fs.readFileSync('supabase/schema.sql','utf8');
  for(const [name,src] of [['migration',migration],['schema',schema]]){
    for(const type of ['payment_claim','payment_verified','payment_rejected','payment_recorded','expense_added','utility_added','announcement'])assert.match(src,new RegExp(type),`${name} should include ${type}`);
    const announcementBlock=src.match(/create or replace function public\.create_announcement_v3[\s\S]*?grant execute on function public\.create_announcement_v3/i)?.[0]||'';
    assert.doesNotMatch(announcementBlock,/join\s+public\.notification_preferences|coalesce\(np\.announcements/i,`${name} announcement Inbox must not be preference-gated`);
  }
});

test('client requests target push after financial writes',()=>{
  const files=['js/member-payments.js','js/admin-review.js','js/admin-generic-v3.js','js/admin-utilities-v3.js','js/announcements-v3.js'];
  const combined=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
  assert.match(combined,/requestPushForTarget/);
  assert.match(combined,/targetType/);
  assert.match(combined,/targetId/);
});

test('notification taps route approved event types to useful screens',()=>{
  const member={role:'member'},admin={role:'admin'};
  assert.equal(notificationRoute({type:'payment_claim'},admin),'review');
  assert.equal(notificationRoute({type:'payment_verified'},member),'payments');
  assert.equal(notificationRoute({type:'payment_rejected'},member),'payments');
  assert.equal(notificationRoute({type:'payment_recorded'},member),'payments');
  assert.equal(notificationRoute({type:'utility_added'},member),'utilities');
  assert.equal(notificationRoute({type:'expense_added'},member),'expenses');
  assert.equal(notificationRoute({type:'announcement'},admin),'manage-announcements');
  assert.equal(notificationRoute({type:'announcement'},member),'notifications');
  for(const type of ['due_in_3_days','due_tomorrow','due_today','overdue','month_activated','balance_carry_forward'])assert.equal(notificationRoute({type},member),'balance');
  assert.equal(notificationRoute({type:'future_unknown'},member),'notifications');
});

test('service worker opens the push payload URL instead of always opening Inbox',()=>{
  const sw=fs.readFileSync('service-worker.js','utf8');
  assert.match(sw,/data:\s*\{\s*url:\s*data\.url\s*\|\|\s*['"]\/#\/notifications['"]\s*\}/);
  assert.match(sw,/event\.notification\.data\?\.url\s*\|\|\s*['"]\/#\/notifications['"]/);
  assert.match(sw,/client\.navigate\(url\)/);
  assert.match(sw,/openWindow\(url\)/);
});

