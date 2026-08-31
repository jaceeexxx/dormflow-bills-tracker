import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
test('sign in form is intentionally minimal',()=>{
  assert.match(html,/20 St\. Paul/);
  assert.match(html,/id="signin-form"/);
  assert.match(html,/Sign in/);
  assert.doesNotMatch(html,/Forgot password\?/i);
});
