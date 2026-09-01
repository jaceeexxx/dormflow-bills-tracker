import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('css/styles.css','utf8');

test('PayLater schedule choices render as separate banking cards instead of inline text',()=>{
  assert.match(css,/\.paylater-mode\s*\{[^}]*display:grid[^}]*border:0/s);
  assert.match(css,/\.paylater-mode>label\s*\{[^}]*grid-template-columns:[^;}]*24px[^;}]*minmax\(0,1fr\)[^}]*border-radius/s);
  assert.match(css,/\.paylater-mode>label>span\s*\{[^}]*display:grid[^}]*min-width:0/s);
});

test('Back control has a full mobile touch target',()=>{
  assert.match(css,/\.screen-back-button\s*\{[^}]*min-height:44px[^}]*min-width:88px/s);
  assert.match(css,/\.screen-back-button span\s*\{[^}]*font-size:14px/s);
});

test('mobile DormFlow header mark uses bounded geometry instead of scaled overflowing artwork',()=>{
  assert.match(css,/\.compact-brand \.brand-mark\.tiny\s*\{[^}]*transform:none[^}]*overflow:hidden/s);
  assert.match(css,/\.compact-brand \.brand-mark\.tiny span\s*\{[^}]*width:18px[^}]*left:6px/s);
});

test('notification, upcoming and settlement text have explicit non-overlap layouts',()=>{
  assert.match(css,/\.toggle-row>span\s*\{[^}]*display:grid[^}]*min-width:0/s);
  assert.match(css,/\.upcoming-row>div\s*\{[^}]*display:grid[^}]*min-width:0/s);
  assert.match(css,/\.settlement-metrics\s*\{[^}]*display:grid[^}]*grid-template-columns/s);
  assert.match(css,/@media\(max-width:560px\)[^{]*\{[\s\S]*?\.settlement-metrics\s*\{[^}]*grid-template-columns:1fr/s);
});

test('crop dialog and selected-file readiness are visible before save',()=>{
  assert.match(css,/\.avatar-cropper-overlay\s*\{[^}]*border:0[^}]*margin:0[^}]*width:100vw[^}]*height:100dvh/s);
  assert.match(css,/\.avatar-cropper-overlay::backdrop/);
  assert.match(css,/\.file-readiness\s*\{[^}]*display:grid[^}]*border:/s);
  assert.match(css,/\.file-readiness-thumb/);
});
