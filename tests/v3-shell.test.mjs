import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html','utf8');
const css = fs.readFileSync('css/styles.css','utf8');

test('v3 exposes one private authenticated app shell', () => {
  assert.match(html, /id="auth-screen"/);
  assert.match(html, /id="app-shell"/);
  assert.doesNotMatch(html, /href="\/admin|admin\.html/i);
  assert.match(html, /type="email"/);
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /sign\s*up|create account/i);
});

test('v3 contains focused member and admin mobile navigation', () => {
  for (const value of ['Home','Balance','Pay','Activity','More']) assert.match(html, new RegExp(`>${value}<`));
  for (const value of ['Overview','Add','Review','Manage']) assert.match(html, new RegExp(`>${value}<`));
});

test('visual shell includes safe-area nav and no explanatory footer caption', () => {
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(html, /visual prototype|powered by|premium banking-inspired|dashboard preview/i);
});
