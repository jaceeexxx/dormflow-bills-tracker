import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dueReminderKey} from '../js/notifications.js';

test('reminder keys distinguish every approved stage',()=>{
  assert.equal(dueReminderKey('o1','due_in_3_days','2026-09-14'),'due:o1:3d:2026-09-14');
  assert.equal(dueReminderKey('o1','due_tomorrow','2026-09-14'),'due:o1:1d:2026-09-14');
  assert.equal(dueReminderKey('o1','due_today','2026-09-14'),'due:o1:today:2026-09-14');
  assert.equal(dueReminderKey('o1','overdue','2026-09-14','2026-09-16'),'overdue:o1:2026-09-16');
});

test('cron runs 8 AM Manila and reminder code uses Manila calendar',()=>{
  const vercel=fs.readFileSync('vercel.json','utf8');
  const reminders=fs.readFileSync('api/reminders.js','utf8');
  assert.match(vercel,/"schedule"\s*:\s*"0 0 \* \* \*"/);
  assert.match(reminders,/Asia\/Manila/);
  assert.match(reminders,/due_in_3_days/);
  assert.match(reminders,/due_tomorrow/);
  assert.match(reminders,/due_today/);
  assert.match(reminders,/overdue/);
  assert.match(reminders,/push_attempted_at/);
});
