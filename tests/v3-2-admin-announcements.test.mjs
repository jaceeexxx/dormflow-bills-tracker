import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const overview=fs.readFileSync('js/admin-overview-v3.js','utf8');
const app=fs.readFileSync('js/app.js','utf8');
const announcements=fs.readFileSync('js/announcements-v3.js','utf8');
const migration=fs.readFileSync('supabase/migrate-v3.2.sql','utf8');

test('admin profile permission repair ships in v3.2 migration',()=>{
  assert.match(migration,/grant select on public\.profiles to authenticated/i);
});

test('announcements are obvious from both Overview and Manage',()=>{
  assert.match(overview,/Announcements/);
  assert.match(overview,/data-manage="announcements"/);
  assert.match(app,/manage-announcements/);
  assert.match(app,/data-admin-add/);
  assert.match(announcements,/data-announcement-edit/);
  assert.match(announcements,/data-announcement-toggle/);
});

test('Jace dual mode remains one authenticated role with personal routes',()=>{
  assert.match(app,/My home/);
  assert.match(app,/My balance/);
  assert.match(app,/My activity/);
  assert.match(overview,/My personal view/);
});
