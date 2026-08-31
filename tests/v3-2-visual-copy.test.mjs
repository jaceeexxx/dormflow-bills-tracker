import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=[...fs.readdirSync('js').filter(f=>f.endsWith('.js')).map(f=>fs.readFileSync(`js/${f}`,'utf8'))].join('\n');
const icons=fs.readFileSync('js/icons.js','utf8');

test('normal UI contains no migration/debug copy',()=>{
  for(const bad of ['Legacy workbook','Imported history','Historical record','v1 migration'])assert.doesNotMatch(ui,new RegExp(bad,'i'));
});

test('custom icon family covers v3.2 account and payment actions',()=>{
  for(const name of ['qr','profile','camera','copy','edit','reports','members','logout'])assert.match(icons,new RegExp(`${name}:`));
});

test('legacy import payment method is normalized to a banking-friendly label',async()=>{
  const {cleanActivityMethod}=await import('../js/dashboard-model.js');
  assert.equal(cleanActivityMethod('Legacy workbook'),'Payment');
  assert.equal(cleanActivityMethod('Imported history'),'Payment');
  assert.equal(cleanActivityMethod('GCash'),'GCash');
});
