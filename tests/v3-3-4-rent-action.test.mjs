import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {icon} from '../js/icons.js';

const read=path=>fs.readFileSync(path,'utf8');

test('admin add actions expose rent as a first class Jace paid charge',()=>{
  const actions=read('js/admin-actions.js');
  assert.match(actions,/id:\s*'rent'/);
  assert.match(actions,/label:\s*'Rent'/);
  const overview=read('js/admin-overview-v3.js');
  assert.match(overview,/action\.id==='rent'\?'rent'/);
  assert.match(overview,/ADMIN_ADD_ACTIONS\.slice\(0,6\)/);
  assert.match(overview,/data-admin-add="\$\{a\.id\}"/);
});

test('rent sheet writes a rent expense through the authoritative expense RPC',()=>{
  const src=read('js/admin-generic-v3.js');
  assert.match(src,/export async function openRentSheet/);
  assert.match(src,/requireActivePeriod\(periodId\)/);
  assert.match(src,/bindSaveFlow/);
  assert.match(src,/p_category:\s*'Rent'/);
  assert.match(src,/p_source_type:\s*'rent'/);
  assert.match(src,/p_source_label:\s*'Monthly rent'/);
  assert.match(src,/p_payers:\s*\[\{member_id:\s*identity\.memberId\|\|identity\.member_id,\s*amount_cents:amount\}\]/);
  assert.match(src,/p_utility_type:\s*null/);
  assert.match(src,/queuePushForTarget\(\{targetType:'expense',targetId:id\}\)/);
});

test('app routes admin add rent to the rent sheet',()=>{
  const src=read('js/app.js');
  assert.match(src,/openRentSheet/);
  assert.match(src,/if\(adminAdd==='rent'\) return openRentSheet/);
});

test('rent icon renders as custom svg',()=>{
  const svg=icon('rent');
  assert.match(svg,/<svg/);
  assert.match(svg,/app-icon/);
  assert.doesNotMatch(svg,/>Rent</);
});
