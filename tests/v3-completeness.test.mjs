import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('js/app.js','utf8');
const payments=fs.readFileSync('js/member-payments.js','utf8');
const people=fs.readFileSync('js/people-settings.js','utf8');
const schema=fs.readFileSync('supabase/schema.sql','utf8');

test('all seven admin add actions are wired in the authenticated app shell',()=>{
  for (const id of ['utility','rent','grocery','paylater','other','payment','announcement']) {
    assert.match(app,new RegExp(`adminAdd===['"]${id}['"]`));
  }
});

test('member pending claims expose edit and withdraw actions',()=>{
  assert.match(payments,/data-claim-edit/);
  assert.match(payments,/data-claim-withdraw/);
  assert.match(app,/claim-edit/);
  assert.match(app,/claim-withdraw/);
});

test('profile exposes payment method editing, notification preferences, and app lock security',()=>{
  assert.match(people,/openPaymentMethodSheet/);
  assert.match(people,/renderSecurity/);
  assert.match(people,/renderNotificationPreferences/);
  assert.match(app,/payment-method/);
  assert.match(app,/route==='security'/);
});

test('admin manage routes include monthly setup, people, reports, and expense editing',()=>{
  assert.match(app,/manage-setup/);
  assert.match(app,/manage-people/);
  assert.match(app,/manage-reports/);
  assert.match(app,/data-edit-expense/);
});

test('fresh schema avoids recursive household member RLS and supports paylater/preset reads',()=>{
  assert.match(schema,/current_household_id_v3/);
  assert.match(schema,/paylater installments household read/i);
  assert.match(schema,/split presets household read/i);
});
