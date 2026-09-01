import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAdminDashboard} from '../js/dashboard-model.js';

const read=p=>fs.readFileSync(p,'utf8');

const members=[
  {id:'j',name:'Jace'}, {id:'a',name:'Aerian'}, {id:'k',name:'Kean'}, {id:'x',name:'Aexy'}
];
const periods=[
  {id:'aug',month:'2026-08-01',status:'closed'},
  {id:'sep',month:'2026-09-01',status:'active'},
  {id:'oct',month:'2026-10-01',status:'draft'}
];

function ob(id,period,debtor,creditor,amount,due,installment){return {id,period_id:period,debtor_member_id:debtor,creditor_member_id:creditor,original_amount_cents:amount,due_date:due,source_category:'PayLater / Loans',source_paylater_installment_id:installment};}

test('settlement exposes needs-to-pay, owed-to-member, and net position through active month only',()=>{
  const obligations=[
    ob('1','sep','j','a',14800,'2026-09-05','ia'),
    ob('2','sep','k','a',14800,'2026-09-05','ia'),
    ob('3','sep','x','a',14800,'2026-09-05','ia'),
    ob('4','sep','a','j',116500,'2026-09-05','ij'),
    ob('5','sep','k','j',116500,'2026-09-05','ij'),
    ob('6','sep','x','j',116500,'2026-09-05','ij'),
    ob('future','oct','j','a',14800,'2026-10-05','ioa')
  ];
  const vm=buildAdminDashboard({base:{period_id:'sep',period_month:'2026-09-01'},obligations,allocations:[],members,periods});
  const jace=vm.memberSettlement.find(x=>x.id==='j');
  const aerian=vm.memberSettlement.find(x=>x.id==='a');
  assert.deepEqual([jace.needsToPayCents,jace.owedToMemberCents,jace.netPositionCents],[14800,349500,334700]);
  assert.deepEqual([aerian.needsToPayCents,aerian.owedToMemberCents,aerian.netPositionCents],[116500,44400,-72100]);
  assert.equal(vm.relationships.some(x=>x.debtorId==='j'&&x.creditorId==='a'&&x.amountCents===29600),false,'October draft obligation must not leak into September relationship totals');
});

test('Upcoming represents current-period PayLater installments and includes Sep 5 schedule',()=>{
  const obligations=[ob('1','sep','j','a',14800,'2026-09-05','ia'),ob('2','sep','k','a',14800,'2026-09-05','ia'),ob('3','sep','x','a',14800,'2026-09-05','ia')];
  const paylaterAccounts=[{id:'acct-a',provider:'SPayLater',borrower_label:'Aerian',borrower_member_id:'a',status:'active'}];
  const paylaterInstallments=[
    {id:'ia',account_id:'acct-a',period_id:'sep',due_date:'2026-09-05',amount_cents:59200,status:'scheduled'},
    {id:'ioa',account_id:'acct-a',period_id:'oct',due_date:'2026-10-05',amount_cents:59200,status:'scheduled'}
  ];
  const vm=buildAdminDashboard({base:{period_id:'sep',period_month:'2026-09-01'},obligations,allocations:[],members,periods,paylaterAccounts,paylaterInstallments});
  assert.equal(vm.upcoming.length,1);
  assert.deepEqual(vm.upcoming[0],{
    id:'ia',date:'2026-09-05',label:'SPayLater · Aerian',detail:'Aerian pays provider · roommates reimburse ₱444.00',amountCents:59200,category:'PayLater / Loans',kind:'paylater'
  });
});

test('admin overview loads period and PayLater schedule metadata needed for authoritative filtering',()=>{
  const src=read('js/admin-overview-v3.js');
  assert.match(src,/source_paylater_installment_id/);
  assert.match(src,/paylater_installments/);
  assert.match(src,/paylater_accounts/);
  assert.match(src,/billing_periods/);
});

test('Admin Settlement and Upcoming copy is explicit instead of progress-only',()=>{
  const src=read('js/admin-overview-v3.js');
  assert.match(src,/Needs to pay/);
  assert.match(src,/Owed to member/);
  assert.match(src,/Net position/);
  assert.match(src,/x\.detail/);
  assert.doesNotMatch(src,/settlement-progress/);
});
