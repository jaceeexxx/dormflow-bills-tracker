import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const people=fs.readFileSync('js/people-settings.js','utf8');
const more=fs.readFileSync('js/member-more.js','utf8');
const balance=fs.readFileSync('js/member-balance.js','utf8');
const app=fs.readFileSync('js/app.js','utf8');

test('household payment profiles are discoverable and MariBank-first',()=>{
  assert.match(people,/renderHouseholdPaymentProfiles/);
  assert.match(people,/openPaymentProfileSheet/);
  assert.match(people,/MariBank/);
  assert.match(more,/Payment Methods/);
  assert.match(balance,/data-payment-profile/);
  assert.match(app,/payment-methods/);
  assert.match(app,/data-payment-profile/);
});
