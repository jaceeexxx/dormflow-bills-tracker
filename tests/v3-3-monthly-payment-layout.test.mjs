import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderPayeeOptions} from '../js/member-payments.js';

test('monthly setup rows reserve real width for the Make current action',()=>{
  const css=fs.readFileSync('css/styles.css','utf8');
  assert.match(css,/\.report-period-card\{[^}]*grid-template-columns:36px minmax\(0,1fr\) auto/);
  assert.match(css,/\.report-period-card \.secondary-action\{[^}]*white-space:nowrap/);
});

test('payment payee select explains when there are no valid outstanding payees',()=>{
  const html=renderPayeeOptions([]);
  assert.match(html,/value=""/);
  assert.match(html,/No outstanding payees/);
  assert.match(html,/disabled/);
});

test('payment payee select renders creditor names with a safe fallback label',()=>{
  const html=renderPayeeOptions([
    {member_id:'jace',label:'Jace'},
    {member_id:'aerian',label:null}
  ],'aerian');
  assert.match(html,/>Jace<\/option>/);
  assert.match(html,/value="aerian" selected>Household member<\/option>/);
});

test('bottom-sheet selects have an explicit readable foreground color',()=>{
  const css=fs.readFileSync('css/styles.css','utf8');
  assert.match(css,/\.bottom-sheet \.field select\{[^}]*color:var\(--ink\)/);
  assert.match(css,/\.bottom-sheet \.field select option\{[^}]*color:var\(--ink\)/);
});
