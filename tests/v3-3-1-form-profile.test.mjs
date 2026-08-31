import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');

test('shared form flow owns saving success close and dirty discard',()=>{
  assert.ok(fs.existsSync('js/form-flow.js'));
  const src=read('js/form-flow.js');
  assert.match(src,/export function bindSaveFlow/);
  assert.match(src,/Saving…/);
  assert.match(src,/Successfully saved/);
  assert.match(src,/Discard changes\?/);
  assert.match(src,/form\.reset|snapshotForm/);
});

test('profile editor loads current avatar and crops pending photo before upload',()=>{
  assert.ok(fs.existsSync('js/avatar-cropper.js'));
  const profile=read('js/people-settings.js');
  const crop=read('js/avatar-cropper.js');
  assert.match(profile,/openAvatarCropper/);
  assert.match(profile,/pendingAvatar/);
  assert.match(profile,/resolveAvatar\(identity\)/);
  assert.match(profile,/uploadAvatar\(identity,pendingAvatar/);
  assert.match(crop,/canvas/i);
  assert.match(crop,/Use Photo/);
  assert.match(crop,/pointermove|touchmove/);
  assert.doesNotMatch(profile,/Save & Exit/i);
});

test('avatar media helper exposes cache invalidation after replacement',()=>{
  const media=read('js/household-media.js');
  assert.match(media,/invalidateAvatar/);
  assert.match(media,/avatarCache/);
});
