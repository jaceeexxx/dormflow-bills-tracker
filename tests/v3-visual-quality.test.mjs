import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync('css/styles.css','utf8');
const html=fs.readFileSync('index.html','utf8');
test('premium mobile UI has deliberate focus, compact inline actions, and touch targets',()=>{
  assert.match(css,/:focus-visible/);
  assert.match(css,/\.inline-actions/);
  assert.match(css,/\.toggle-row/);
  assert.match(css,/min-height:44px/);
});
test('app shell avoids generic marketing captions and raw database copy',()=>{
  assert.doesNotMatch(html,/powered by|dashboard template|housing_utilities/i);
  assert.doesNotMatch(html,/<footer/i);
});
