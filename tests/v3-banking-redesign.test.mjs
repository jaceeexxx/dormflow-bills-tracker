import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {buildAdminDashboard,buildMemberDashboard} from '../js/dashboard-model.js';
import {renderAdminOverview} from '../js/admin-overview-v3.js';
import {renderMemberHome} from '../js/member-home.js';
import {icon} from '../js/icons.js';

const members=[
  {id:'jace',name:'Jace',accent:'#203449'},
  {id:'kean',name:'Kean',accent:'#2e7268'},
  {id:'aerian',name:'Aerian',accent:'#9d772f'},
  {id:'aexy',name:'Aexy',accent:'#6b5f92'}
];

test('admin dashboard model produces banking summary, relationships, categories and member settlement',()=>{
  const vm=buildAdminDashboard({
    base:{display_name:'Jace',period_id:'aug',outstanding_cents:188193,pending_claims:2,overdue_count:3},
    members,
    expenses:[
      {id:'e1',period_id:'aug',description:'Meralco',category:'housing_utilities',amount_cents:1402914,due_date:'2026-08-21'},
      {id:'e2',period_id:'aug',description:'Groceries',category:'groceries',amount_cents:821108},
      {id:'e3',period_id:'aug',description:'PayLater',category:'paylater',amount_cents:170400}
    ],
    obligations:[
      {id:'o1',period_id:'aug',debtor_member_id:'kean',creditor_member_id:'jace',original_amount_cents:200000,due_date:'2026-08-21',source_category:'housing_utilities'},
      {id:'o2',period_id:'aug',debtor_member_id:'aerian',creditor_member_id:'jace',original_amount_cents:13431,due_date:'2026-08-21',source_category:'groceries'}
    ],
    allocations:[{obligation_id:'o1',amount_cents:100000}],
    payments:[{id:'p1',payer_member_id:'kean',payee_member_id:'jace',amount_cents:100000,paid_at:'2026-08-20T10:00:00Z',method:'GCash'}]
  });
  assert.equal(vm.totalCents,2394422);
  assert.equal(vm.settledCents,2206229);
  assert.equal(vm.categories[0].label,'Housing & Utilities');
  assert.deepEqual(vm.relationships.map(x=>[x.debtorName,x.creditorName,x.amountCents]),[['Kean','Jace',100000],['Aerian','Jace',13431]]);
  assert.equal(vm.memberSettlement.find(x=>x.name==='Kean').outstandingCents,100000);
  assert.equal(vm.recent[0].kind,'payment');
});

test('member dashboard model groups personal shares and recent activity',()=>{
  const vm=buildMemberDashboard({
    home:{vm:{memberId:'aerian',name:'Aerian',balance:13431,dueSoon:0,creditors:[{memberId:'jace',name:'Jace',amount:13431}],household:{total:2394422,categories:[{name:'Housing & Utilities',amount:1402914},{name:'Groceries',amount:821108}]},periodId:'aug'}},
    splits:[
      {amount_cents:350000,expenses:{category:'housing_utilities',period_id:'aug',status:'active'}},
      {amount_cents:205000,expenses:{category:'groceries',period_id:'aug',status:'active'}}
    ],
    claims:[{id:'c1',amount_cents:50000,paid_at:'2026-08-31',method:'GCash',status:'pending'}],
    payments:[{id:'p1',amount_cents:100000,paid_at:'2026-08-30',method:'GCash',status:'verified'}]
  });
  assert.deepEqual(vm.personalCategories.map(x=>[x.label,x.amountCents]),[['Housing & Utilities',350000],['Groceries',205000]]);
  assert.equal(vm.recent.length,2);
  assert.equal(vm.recent[0].status,'pending');
});

test('admin and member home render premium banking surfaces rather than wireframe-only sections',()=>{
  const admin=renderAdminOverview({displayName:'Jace',totalCents:2394422,outstandingCents:188193,settledCents:2206229,settledRate:92.1,pendingClaims:0,overdueCount:7,categories:[],relationships:[],memberSettlement:[],recent:[],upcoming:[]});
  assert.match(admin,/bank-balance-card/);
  assert.match(admin,/banking-kpi-grid/);
  assert.match(admin,/Who needs to pay whom/);
  assert.match(admin,/data-route="home"/);

  const member=renderMemberHome({vm:{name:'Aerian',balance:13431,dueSoon:0,creditors:[{name:'Jace',amount:13431}],household:{total:2394422,categories:[]},personalCategories:[],recent:[]}});
  assert.match(member,/member-balance-card/);
  assert.match(member,/bank-quick-actions/);
  assert.match(member,/Household overview/);
});

test('custom banking icon family includes household finance actions',()=>{
  for(const name of ['utilities','grocery','paylater','announcement','transfer','analytics','admin']){
    assert.match(icon(name),/<svg/);
    assert.doesNotMatch(icon(name),/>…</);
  }
});

test('stylesheet includes deliberate original banking visual system and admin-personal mode switch',()=>{
  const css=fs.readFileSync('css/styles.css','utf8');
  const app=fs.readFileSync('js/app.js','utf8');
  for(const marker of ['.bank-balance-card','.banking-kpi-grid','.bank-panel','.bank-quick-actions','.mode-switcher','.finance-donut','.settlement-progress']) assert.match(css,new RegExp(marker.replace('.','\\.')));
  assert.match(app,/isAdminPersonalRoute/);
  assert.match(app,/My home/);
  assert.match(app,/My balance/);
  assert.match(app,/My activity/);
});
