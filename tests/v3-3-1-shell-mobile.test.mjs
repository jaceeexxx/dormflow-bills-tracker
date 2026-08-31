import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router=fs.readFileSync('js/router.js','utf8');
const app=fs.readFileSync('js/app.js','utf8');
const carousel=fs.readFileSync('js/banking-carousel.js','utf8');
const css=fs.readFileSync('css/styles.css','utf8');

test('secondary routes expose history-aware back navigation',()=>{
  assert.match(router,/export function navigateBack\(/);
  assert.match(router,/history\.back\(\)/);
  assert.match(app,/data-action="navigate-back"/);
  assert.match(app,/action==='navigate-back'/);
});

test('mobile banking cards prefer native touch swipe and snap',()=>{
  assert.match(css,/scroll-snap-type\s*:\s*x mandatory/);
  assert.match(css,/-webkit-overflow-scrolling\s*:\s*touch/);
  assert.match(css,/@media\s*\(hover\s*:\s*none\).*?\.carousel-arrow\s*\{[^}]*display\s*:\s*none/s);
  assert.match(carousel,/pointer\s*===\s*'coarse'|pointer:coarse|matchMedia\?\.\('\(pointer: coarse\)'\)/);
});

test('mobile header constrains brand and renders uploaded avatar when available',()=>{
  assert.match(css,/\.compact-brand[^}]*min-width\s*:\s*0/s);
  assert.match(css,/\.header-avatar[^}]*object-fit\s*:\s*cover/s);
  assert.match(app,/resolveAvatar/);
  assert.match(app,/header-avatar/);
  assert.match(app,/profile-initial/);
});
