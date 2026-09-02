import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {icon} from '../js/icons.js';
import {
  classifyDueStatus,
  loadMemberBalance,
  renderMemberBalance,
  summarizeCategories
} from '../js/member-balance.js';
import {supabase} from '../js/auth.js';
import {
  applyBalanceDetailToMemberHome,
  reconcileBalanceDetail,
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

test('member home keeps the authoritative balance when detailed rows are incomplete', () => {
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
      {
        member_id:'aerian',
        display_name:'Aerian',
        amount_cents:14822,
        avatar_url:'aerian.jpg',
        breakdown:[
          {category:'Groceries', amount_cents:14822, due_date:'2026-09-05', status:'due_soon'}
        ]
      }
    ],
    due_groups:{
      overdue:[],
      due_soon:[{source_category:'Groceries', display_name:'Aerian', outstanding_cents:14822, due_date:'2026-09-05'}],
      later:[],
      no_due_date:[]
    }
  });

  assert.equal(vm.name, 'KD');
  assert.equal(vm.balance, 16200);
  assert.equal(vm.dueSoon, 14822);
  assert.deepEqual(vm.creditors.map(x=>[x.memberId,x.name,x.amount,x.avatarUrl]), [['aerian','Aerian',16200,'aerian.jpg']]);
  assert.equal(vm.creditors[0].breakdown.reduce((sum,item)=>sum+Number(item.amount_cents||0),0), 16200);
  assert.equal(vm.creditors[0].breakdown.at(-1).amount_cents, 1378);

  const html = renderMemberHome({vm});
  assert.match(html, /Aerian/);
  assert.match(html, /162\.00/);
});

test('balance and payment sheet loader reconcile incomplete detail to the authoritative RPC', async () => {
  const originalRpc=supabase.rpc;
  supabase.rpc=async name=>{
    if(name==='member_balance_detail_v3')return {
      member_id:'kd',
      outstanding_cents:14822,
      owed_to_me_cents:0,
      credit_cents:0,
      creditors:[{
        member_id:'aerian',
        display_name:'Aerian',
        amount_cents:14822,
        breakdown:[{category:'Groceries',amount_cents:14822,due_date:'2026-09-05',status:'due_soon'}]
      }],
      due_groups:{overdue:[],due_soon:[],later:[],no_due_date:[]},
      category_breakdown:[{label:'Groceries',amount_cents:14822}]
    };
    if(name==='member_balance_v3')return {
      member_id:'kd',
      outstanding_cents:16200,
      owed_to_me_cents:0,
      credit_cents:0,
      creditors:[{member_id:'aerian',label:'Aerian',amount_cents:16200}]
    };
    throw new Error(`Unexpected RPC: ${name}`);
  };

  try{
    const balance=await loadMemberBalance();
    assert.equal(balance.outstanding_cents,16200);
    assert.equal(balance.creditors[0].amount_cents,16200);
    assert.equal(balance.creditors[0].breakdown.reduce((sum,item)=>sum+Number(item.amount_cents||0),0),16200);
    assert.equal(balance.due_groups.no_due_date.reduce((sum,item)=>sum+Number(item.outstanding_cents||0),0),1378);
    assert.equal(balance.category_breakdown.find(item=>item.label==='Other open balance')?.amount_cents,1378);
  }finally{
    supabase.rpc=originalRpc;
  }
});

test('balance loader never renders detail when the authoritative RPC is unavailable', async () => {
  const originalRpc=supabase.rpc;
  supabase.rpc=async name=>{
    if(name==='member_balance_detail_v3')return {
      member_id:'kd',
      outstanding_cents:14822,
      creditors:[{member_id:'aerian',display_name:'Aerian',amount_cents:14822}],
      due_groups:{overdue:[],due_soon:[],later:[],no_due_date:[]}
    };
    if(name==='member_balance_v3')throw new Error('Authoritative balance unavailable');
    throw new Error(`Unexpected RPC: ${name}`);
  };

  try{
    await assert.rejects(loadMemberBalance(),/Authoritative balance unavailable/);
  }finally{
    supabase.rpc=originalRpc;
  }
});

test('balance reconciliation is authoritative and idempotent for excess and unmatched detail', () => {
  const summary={
    outstanding_cents:16200,
    owed_to_me_cents:0,
    credit_cents:0,
    creditors:[{member_id:'aerian',label:'Aerian Rose',amount_cents:16200}]
  };
  const detail={
    outstanding_cents:19000,
    creditors:[
      {
        member_id:'aerian',
        display_name:'Aerian',
        amount_cents:18000,
        breakdown:[
          {category:'Groceries',amount_cents:10000,due_date:'2026-09-05',status:'due_soon'},
          {category:'PayLater / Loans',amount_cents:8000,due_date:'2026-09-15',status:'later'}
        ]
      },
      {member_id:'jace',display_name:'Jace',amount_cents:1000,breakdown:[{category:'Rent',amount_cents:1000}]}
    ],
    due_groups:{overdue:[],due_soon:[],later:[],no_due_date:[]},
    category_breakdown:[]
  };

  const first=reconcileBalanceDetail(summary,detail);
  const second=reconcileBalanceDetail(summary,first);
  assert.equal(first.creditors.length,1);
  assert.equal(first.creditors[0].member_id,'aerian');
  assert.equal(first.creditors[0].display_name,'Aerian Rose');
  assert.equal(first.creditors[0].amount_cents,16200);
  assert.equal(first.creditors[0].breakdown.reduce((sum,item)=>sum+item.amount_cents,0),16200);
  assert.equal(first.due_groups.due_soon.reduce((sum,item)=>sum+item.outstanding_cents,0),10000);
  assert.equal(first.due_groups.later.reduce((sum,item)=>sum+item.outstanding_cents,0),6200);
  assert.deepEqual(second,first);
});

test('balance reconciliation uses an explicit label key for legacy null-id creditors', () => {
  const result=reconcileBalanceDetail({
    outstanding_cents:5000,
    creditors:[{member_id:null,label:'Property manager',amount_cents:5000}]
  },{
    creditors:[{
      member_id:null,
      creditor_label:'Property manager',
      display_name:'Household member',
      amount_cents:5000,
      breakdown:[{category:'Rent',amount_cents:5000,due_date:'2026-09-24',status:'later'}]
    }],
    due_groups:{},
    category_breakdown:[]
  });

  assert.equal(result.creditors.length,1);
  assert.equal(result.creditors[0].display_name,'Property manager');
  assert.equal(result.creditors[0].breakdown[0].category,'Rent');
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
