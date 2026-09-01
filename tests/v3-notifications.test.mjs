import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultNotificationPreferences,shouldNotify,dueReminderKey} from '../js/notifications.js';

test('notification defaults match stakeholder choices',()=>assert.deepEqual(defaultNotificationPreferences(),{payment_updates:true,due_reminders:true,announcements:true,expense_updates:true,month_balance_updates:true}));
test('preference gate maps notification types',()=>{const p=defaultNotificationPreferences();assert.equal(shouldNotify('payment_verified',p),true);assert.equal(shouldNotify('expense_added',p),true);assert.equal(shouldNotify('month_activated',p),true);});
test('due reminder dedupe keys are stage-aware',()=>{assert.equal(dueReminderKey('o1','due_in_3_days','2026-09-14'),'due:o1:3d:2026-09-14');assert.equal(dueReminderKey('o1','overdue','2026-09-14','2026-09-16'),'overdue:o1:2026-09-16');});
test('push is opt-in and server delivery is separate from financial writes',()=>{const client=fs.readFileSync('js/push.js','utf8');const server=fs.readFileSync('api/push-deliver.js','utf8');const helper=fs.readFileSync('lib/push-server.js','utf8');assert.match(client,/Notification\.requestPermission/);assert.match(client,/pushManager\.subscribe/);assert.match(server,/sendPushWithCleanup/);assert.match(helper,/web-push/);assert.doesNotMatch(server,/create_expense_v3|review_payment_claim_v3/);});
test('cron reminder endpoint is secret protected and dedupe aware',()=>{const src=fs.readFileSync('api/reminders.js','utf8');assert.match(src,/CRON_SECRET/);assert.match(src,/dedupe_key/);assert.match(src,/due:/);});
