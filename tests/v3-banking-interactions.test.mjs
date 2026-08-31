import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('js/app.js','utf8');

test('Jace admin personal mode keeps household detail routes in personal experience',()=>{
  const match=app.match(/ADMIN_PERSONAL_ROUTES=\[([^\]]+)\]/);
  assert.ok(match);
  for(const route of ['home','balance','payments','more','utilities','expenses','paylater']) assert.match(match[1],new RegExp(`['"]${route}['"]`));
});

test('announcement edit and activation controls are wired in delegated admin interactions',()=>{
  assert.match(app,/announcementEdit/);
  assert.match(app,/announcementToggle/);
  assert.match(app,/openAnnouncementSheet/);
  assert.match(app,/is_active/);
});
