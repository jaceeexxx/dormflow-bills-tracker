import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');

test('Admin Add routes use the normalized active periodId, never stale period_id',()=>{
  const app=read('js/app.js');
  assert.match(app,/openUtilitySheet\(\{identity:state\.identity,periodId:overview\.periodId/);
  assert.match(app,/openGenericExpenseSheet\(\{identity:state\.identity,periodId:overview\.periodId,kind:'grocery'/);
  assert.match(app,/openGenericExpenseSheet\(\{identity:state\.identity,periodId:overview\.periodId,kind:'other'/);
  assert.doesNotMatch(app,/periodId:overview\.period_id/);
  assert.doesNotMatch(app,/overview\.period_id/,'Admin screens must use normalized periodId everywhere');
});

test('financial Admin create forms fail clearly when there is no active billing period',()=>{
  const flow=read('js/form-flow.js');
  assert.match(flow,/export function requireActivePeriod/);
  assert.match(flow,/No active billing month/i);
  for(const file of ['js/admin-utilities-v3.js','js/admin-generic-v3.js']){
    const src=read(file);
    assert.match(src,/requireActivePeriod/);
  }
});

test('announcement create and edit use the same observable save lifecycle as financial forms',()=>{
  const src=read('js/announcements-v3.js');
  assert.match(src,/bindSaveFlow/);
  assert.match(src,/bindDirtyClose/);
  assert.match(src,/successMessage:'Successfully saved'/);
  assert.doesNotMatch(src,/form\.onsubmit\s*=/);
});

test('avatar cropper enters the browser top layer above the profile bottom sheet',()=>{
  const crop=read('js/avatar-cropper.js');
  assert.match(crop,/createElement\(['"]dialog['"]\)/);
  assert.match(crop,/showModal\(\)/);
  assert.match(crop,/Use Photo/);
});

test('file inputs expose immediate Ready to upload feedback before Save',()=>{
  const attachments=read('js/attachments.js');
  assert.match(attachments,/export function fileReadiness/);
  assert.match(attachments,/Ready to upload/);
  assert.match(attachments,/bindFileReadiness/);
  assert.match(attachments,/data-file-readiness/);
  const payments=read('js/member-payments.js');
  assert.match(payments,/bindFileReadiness/);
  assert.match(payments,/data-file-readiness/);
  const settings=read('js/people-settings.js');
  assert.match(settings,/data-profile-upload-state/);
  assert.match(settings,/Ready to upload/);
});
