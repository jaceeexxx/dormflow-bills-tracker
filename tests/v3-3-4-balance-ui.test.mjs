import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {icon} from '../js/icons.js';
import {
  classifyDueStatus,
  renderMemberBalance,
  summarizeCategories
} from '../js/member-balance.js';

const read = path => fs.readFileSync(path, 'utf8');

test('balance helpers classify due dates and summarize transfer categories', () => {
  assert.equal(classifyDueStatus({due_date:'2026-09-01'}, '2026-09-02'), 'overdue');
  assert.equal(classifyDueStatus({due_date:'2026-09-07'}, '2026-09-02'), 'due_soon');
  assert.equal(classifyDueStatus({due_date:'2026-09-08'}, '2026-09-02'), 'later');
  assert.equal(classifyDueStatus({}, '2026-09-02'), 'no_due_date');

  assert.equal(summarizeCategories([{category:'Rent'}]), 'Rent');
  assert.equal(summarizeCategories([{category:'Rent'}, {category:'Groceries'}, {category:'Utilities'}]), 'Rent + 2 more');
});

test('balance transfer rows show avatars, category breakdown, and due flags without overlapping copy', () => {
  const html = renderMemberBalance({
    outstanding_cents: 524226,
    owed_to_me_cents: 560618,
    credit_cents: 12000,
    net_position_cents: -484392,
    credit_breakdown: [
      {member_id:'jace', display_name:'Jace', amount_cents:12000}
    ],
    creditors: [
      {
        member_id:'jace',
        display_name:'Jace',
        avatar_url:'avatar.jpg',
        amount_cents:35600,
        due_status:'due_soon',
        earliest_due_date:'2026-09-07',
        breakdown:[
          {category:'Rent', amount_cents:30000, due_date:'2026-09-07'},
          {category:'Groceries', amount_cents:5600, due_date:'2026-09-10'}
        ]
      }
    ],
    due_groups: [
      {
        key:'due_soon',
        label:'Due within 5 days',
        amount_cents:35600,
        items:[{category:'Rent', display_name:'Jace', due_date:'2026-09-07', outstanding_cents:30000}]
      }
    ],
    category_breakdown:[{category:'Rent', amount_cents:30000}, {category:'Groceries', amount_cents:5600}]
  });

  assert.match(html, /class="payee-card balance-payee-v2 due-status-due_soon"/);
  assert.match(html, /avatar\.jpg/);
  assert.match(html, /Rent \+ 1 more/);
  assert.match(html, /Due within 5 days/);
  assert.match(html, /Credit with Jace/);
  assert.match(html, /data-credit-breakdown/);
  assert.doesNotMatch(html, /Outstanding transfer/);
});

test('balance due schedule keeps deadline groups in scan order', () => {
  const html = renderMemberBalance({
    due_groups: [
      {key:'later', label:'Later this month', amount_cents:1, items:[]},
      {key:'overdue', label:'Overdue', amount_cents:1, items:[]},
      {key:'no_due_date', label:'No due date', amount_cents:1, items:[]},
      {key:'due_soon', label:'Due within 5 days', amount_cents:1, items:[]}
    ]
  });
  const order = ['Overdue', 'Due within 5 days', 'Later this month', 'No due date'];
  let cursor = -1;
  for (const label of order) {
    const next = html.indexOf(label);
    assert.ok(next > cursor, `${label} should appear after previous group`);
    cursor = next;
  }
});

test('payment profile sheet source includes obligation breakdown next to the QR', () => {
  const source = read('js/people-settings.js');
  assert.match(source, /balanceDetail/);
  assert.match(source, /payment-obligation-breakdown/);
  assert.match(source, /Total owed/);
  assert.match(source, /data-action="report-payment"/);
});

test('premium balance icons and mobile grid guardrails are present', () => {
  for (const name of ['overdue', 'dueSoon', 'credit', 'category']) {
    assert.match(icon(name), /<svg class="app-icon /);
  }
  const css = read('css/styles.css');
  assert.match(css, /\.balance-payee-v2/);
  assert.match(css, /grid-template-columns:44px minmax\(0,1fr\) auto/);
  assert.match(css, /\.payee-amount-block/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*\.balance-payee-v2\{grid-template-columns:44px minmax\(0,1fr\)/);
});
