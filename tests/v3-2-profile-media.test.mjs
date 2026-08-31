import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const media=()=>fs.readFileSync('js/household-media.js','utf8');
const profile=()=>fs.readFileSync('js/people-settings.js','utf8');
const client=()=>fs.readFileSync('js/supabase-client.js','utf8');

test('v3.2 has authenticated household media helpers',()=>{
  assert.ok(fs.existsSync('js/household-media.js'));
  assert.match(media(),/uploadAvatar/);
  assert.match(media(),/removeAvatar/);
  assert.match(media(),/uploadPaymentQr/);
  assert.match(media(),/removePaymentQr/);
  assert.match(client(),/removeStorageObject|removeObject/);
});

test('profile and payment method UI use uploads instead of raw QR paths',()=>{
  const src=profile();
  assert.match(src,/Upload photo/);
  assert.match(src,/Remove photo/);
  assert.match(src,/MariBank/);
  assert.match(src,/Upload QR/);
  assert.match(src,/Remove QR/);
  assert.doesNotMatch(src,/QR image path/i);
  assert.doesNotMatch(src,/private_account/);
  assert.doesNotMatch(src,/qr_object_path/);
});
