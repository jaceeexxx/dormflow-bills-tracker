import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {icon} from '../js/icons.js';
import {
  classifyDueStatus,
  renderMemberBalance,
  summarizeCategories
} from '../js/member-balance.js';
import {
  applyBalanceDetailToMemberHome,
  renderMemberHome
} from '../js/member-home.js';

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

test('balance renderer understands object-shaped member balance detail RPC groups', () => {
  const html = renderMemberBalance({
    credit_cents:7000,
    credit_breakdown:[
      {
        creditor_display_name:'Jace',
        remaining_amount_cents:7000,
        source_payment_method:'MariBank'
      }
    ],
    category_breakdown:[
      {label:'Groceries', amount_cents:35600, item_count:1}
    ],
    due_groups:{
      overdue:[],
      due_soon:[
        {
          id:'obligation-1',
          source_category:'Rent',
          display_name:'Jace',
          outstanding_cents:30000,
          due_date:'2026-09-07',
          due_status:'due_soon'
        }
      ],
      later:[],
      no_due_date:[]
    }
  });

  assert.match(html, /Rent/);
  assert.match(html, /Jace &middot; Sep 7/);
  assert.match(html, /Credit with Jace/);
  assert.match(html, /Groceries/);
  assert.doesNotMatch(html, /No due within 5 days/);
});

test('member home payees use the same balance detail source as the payment sheet', () => {
  const vm = applyBalanceDetailToMemberHome({
    memberId:'kd',
    name:'KD',
    balance:16200,
    dueSoon:0,
    credit:0,
    creditors:[{memberId:'aerian', name:'Aerian', amount:16200}],
    household:{total:0,categories:[]},
    personalCategories:[],
    recent:[]
  }, {
    outstanding_cents:14822,
    credit_cents:0,
    owed_to_me_cents:0,
    creditors:[
      {member_id:'aerian', display_name:'Aerian', amount_cents:14822, avatar_url:'aerian.jpg'}
    ],
    due_groups:{
      overdue:[],
      due_soon:[{source_category:'Groceries', display_name:'Aerian', outstanding_cents:14822, due_date:'2026-09-05'}],
      later:[],
      no_due_date:[]
    }
  });

  assert.equal(vm.name, 'KD');
  assert.equal(vm.balance, 14822);
  assert.equal(vm.dueSoon, 14822);
  assert.deepEqual(vm.creditors.map(x=>[x.memberId,x.name,x.amount,x.avatarUrl]), [['aerian','Aerian',14822,'aerian.jpg']]);

  const html = renderMemberHome({vm});
  assert.match(html, /Aerian/);
  assert.match(html, /148\.22/);
  assert.doesNotMatch(html, /162\.00/);
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

test('announcement ticker uses a calmer readable speed', () => {
  const css = read('css/styles.css');
  assert.match(css, /animation:dormflowTicker 72s linear infinite/);
});
