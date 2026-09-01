import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');

test('all financial sheets use the shared observable save flow',()=>{
  const files=[
    'js/member-payments.js',
    'js/admin-generic-v3.js',
    'js/admin-utilities-v3.js',
    'js/admin-review.js',
    'js/announcements-v3.js',
    'js/paylater-v3.js'
  ];
  for(const file of files){
    const src=read(file);
    assert.match(src,/bindSaveFlow/, `${file} should use bindSaveFlow`);
    assert.doesNotMatch(src,/\.onsubmit\s*=/, `${file} should not hide form errors behind a raw onsubmit handler`);
  }
});

test('financial save blocks do not await push delivery before resolving',()=>{
  const files=[
    'js/member-payments.js',
    'js/admin-generic-v3.js',
    'js/admin-utilities-v3.js',
    'js/admin-review.js',
    'js/announcements-v3.js',
    'js/paylater-v3.js'
  ];
  for(const file of files){
    assert.doesNotMatch(read(file),/await\s+requestPushForTarget/, `${file} should schedule push after save instead of awaiting it`);
  }
});

test('admin review keeps completion refresh pinned to the review route',()=>{
  const app=read('js/app.js');
  assert.match(app,/openClaimReview\(.*onDone:\(\)=>\{state\.route='review';renderApp\(\);\}/s);
});

test('utility save callback uses the provided onDone callback',()=>{
  const src=read('js/admin-utilities-v3.js');
  assert.match(src,/onSaved:async id=>\{queuePushForTarget\(\{targetType:'expense',targetId:id\}\);await onDone\(id\);\}/);
  assert.doesNotMatch(src,/\bonSaved\}\);/);
});
