import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/seed-members.sql','utf8');

test('member seed uses the four agreed Auth emails and links profiles before household members',()=>{
  for(const email of ['jace@gmail.com','kean@gmail.com','aerian@gmail.com','aexy@gmail.com']) assert.match(sql,new RegExp(email.replace('.','\\.')));
  assert.doesNotMatch(sql,/EMAIL_HERE/);
  assert.doesNotMatch(sql,/linked\s+as\s*\(\s*insert into public\.profiles/i);
  const profileInsert=sql.indexOf('insert into public.profiles');
  const memberInsert=sql.indexOf('insert into public.household_members');
  assert.ok(profileInsert>=0&&memberInsert>profileInsert);
});

test('member seed qualifies notification member id and verifies four linked members',()=>{
  assert.match(sql,/select\s+hm\.id\s+from public\.household_members hm/i);
  assert.match(sql,/notification_preferences_count/i);
  assert.match(sql,/count\(\*\)/i);
});
