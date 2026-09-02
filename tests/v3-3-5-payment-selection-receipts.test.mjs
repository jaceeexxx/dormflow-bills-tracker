import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildClaimPayload,
  buildSelectedAllocations,
  normalizePaymentTargets
} from '../js/payment-form.js';
import {renderMemberPayments} from '../js/member-payments.js';
import {renderReceiptAttachment} from '../js/attachments.js';
import {notificationRoute, pushPreferenceForType} from '../js/notifications.js';

const read=path=>fs.readFileSync(path,'utf8');
const latestFunctionBlock=(sql,name)=>{
  const re=new RegExp(`create or replace function public\\.${name}\\b`,'gi');
  let match,start=-1;
  while((match=re.exec(sql))) start=match.index;
  assert.notEqual(start,-1, `${name} should be defined`);
  const end=sql.indexOf('$$;',start);
  assert.notEqual(end,-1, `${name} should use a dollar-quoted body`);
  return sql.slice(start,end+3);
};

test('payment form builds exact partial allocations from selected balance rows',()=>{
  const targets=normalizePaymentTargets([
    {
      obligation_id:'groceries-sep-5',
      due_date:'2026-09-05',
      source_category:'Groceries',
      label:'Groceries',
      source_type:'expense',
      outstanding_cents:100000
    },
    {
      obligation_id:'paylater-sep-5',
      due_date:'2026-09-05',
      source_category:'PayLater / Loans',
      label:'PayLater / Loans',
      source_type:'paylater',
      outstanding_cents:100000
    }
  ]);

  const allocations=buildSelectedAllocations([
    {obligation_id:'groceries-sep-5',amount:'500'}
  ],targets);
  assert.deepEqual(allocations,[{
    obligation_id:'groceries-sep-5',
    amount_cents:50000,
    category:'Groceries',
    label:'Groceries',
    source_type:'expense',
    due_date:'2026-09-05'
  }]);

  const payload=buildClaimPayload({
    payeeId:'aerian',
    paidAt:'2026-09-05',
    method:'MariBank',
    allocations
  },{idempotencyKey:'claim-exact-1'});
  assert.equal(payload.p_amount_cents,50000);
  assert.equal(payload.p_suggested_allocations[0].obligation_id,'groceries-sep-5');
});

test('payment form rejects empty, excessive, and unknown exact allocations',()=>{
  const targets=normalizePaymentTargets([{obligation_id:'groceries',source_category:'Groceries',outstanding_cents:100000}]);
  assert.throws(()=>buildSelectedAllocations([],targets),/Choose at least one balance item/i);
  assert.throws(()=>buildSelectedAllocations([{obligation_id:'groceries',amount:'1000.01'}],targets),/cannot exceed/i);
  assert.throws(()=>buildSelectedAllocations([{obligation_id:'missing',amount:'50'}],targets),/no longer available/i);
  assert.throws(()=>buildSelectedAllocations([{obligation_id:'groceries',amount:'50'},{obligation_id:'groceries',amount:'25'}],targets),/duplicated/i);
});

test('member payment report UI uses exact payment targets instead of oldest auto-allocation',()=>{
  const src=read('js/member-payments.js');
  assert.match(src,/payment_target_options_v3/);
  assert.match(src,/data-payment-targets/);
  assert.match(src,/data-payment-target-option/);
  assert.doesNotMatch(src,/suggestOldest\(open,\s*provisional\.p_amount_cents\)/);
});

test('payment profile can launch report payment with the selected payee already pinned',()=>{
  const people=read('js/people-settings.js');
  const app=read('js/app.js');
  assert.match(people,/data-payee-id="\$\{row\.memberId\}"/);
  assert.match(app,/payeeId:actionButton\?\.dataset\.payeeId/);
});

test('admin review and payment history expose receipt details after approval',()=>{
  const review=read('js/admin-review.js');
  const payments=read('js/member-payments.js');
  const app=read('js/app.js');
  assert.match(review,/receipt_attachment_id/);
  assert.match(review,/data-claim-receipt/);
  assert.match(review,/allocation-title/);
  assert.match(payments,/data-claim-receipt/);
  assert.match(app,/openClaimReceiptSheet/);
});

test('unclaimed admin-recorded payments do not open claim receipt details',()=>{
  const html=renderMemberPayments({claims:[],payments:[{
    id:'payment-only',
    claim_id:null,
    amount_cents:2500,
    paid_at:'2026-09-05T12:00:00+08:00',
    method:'Cash',
    status:'approved'
  }]});
  assert.doesNotMatch(html,/data-claim-receipt="payment-only"/);
});

test('approved claim-backed payments render once in member history',()=>{
  const html=renderMemberPayments({claims:[{
    id:'claim-1',
    amount_cents:50000,
    paid_at:'2026-09-05T12:00:00+08:00',
    method:'MariBank',
    status:'verified',
    suggested_allocations:[{obligation_id:'grocery',amount_cents:50000}]
  }],payments:[{
    id:'payment-1',
    claim_id:'claim-1',
    amount_cents:50000,
    paid_at:'2026-09-05T12:00:00+08:00',
    method:'MariBank',
    status:'approved'
  }]});
  assert.equal((html.match(/data-claim-receipt="claim-1"/g)||[]).length,1);
});

test('payment claim mutation is routed through validated RPCs',()=>{
  const memberPayments=read('js/member-payments.js');
  const attachments=read('js/attachments.js');
  const schema=read('supabase/schema.sql');
  assert.match(memberPayments,/edit_payment_claim_v3/);
  assert.match(memberPayments,/withdraw_payment_claim_v3/);
  assert.match(attachments,/attach_payment_claim_receipt_v3/);
  assert.doesNotMatch(memberPayments,/supabase\.update\('payment_claims'/);
  assert.doesNotMatch(attachments,/supabase\.update\('payment_claims'/);
  assert.doesNotMatch(schema,/create policy "payment_claims owner pending update"/i);
  assert.doesNotMatch(schema,/grant update on public\.payment_claims/i);
});

test('receipt attachment renderer previews images and links PDFs',()=>{
  assert.match(renderReceiptAttachment({url:'receipt.png',mime_type:'image/png',file_name:'receipt.png'}),/<img[^>]+receipt\.png/);
  assert.match(renderReceiptAttachment({url:'receipt.pdf',mime_type:'application/pdf',file_name:'receipt.pdf'}),/Open receipt/);
});

test('payment received notifications route and push like payment updates',()=>{
  assert.equal(pushPreferenceForType('payment_received'),'payment_updates');
  assert.equal(notificationRoute({type:'payment_received'},{role:'member'}),'payments');
  assert.match(read('api/push-event.js'),/payment_received/);
});

test('v3.3.5 migration adds exact payment targets, payee receipt access, and approved-only payee notification',()=>{
  const migration=read('supabase/migrate-v3.3.5.sql');
  const schema=read('supabase/schema.sql');
  for(const sql of [migration,schema]){
    const targetFn=latestFunctionBlock(sql,'payment_target_options_v3');
    assert.match(targetFn,/p_debtor uuid default null/i);
    assert.match(targetFn,/p_creditor uuid default null/i);
    assert.match(targetFn,/returns table\(\s*obligation_id uuid/i);
    assert.match(targetFn,/coalesce\(e\.due_date,\s*ob\.due_date\)\s+as due_date/i);
    assert.match(targetFn,/coalesce\(e\.category,\s*ob\.source_category,\s*'Expense'\)\s+as source_category/i);

    const validatorFn=latestFunctionBlock(sql,'validated_payment_allocations_v3');
    assert.match(validatorFn,/returns jsonb/i);
    assert.match(validatorFn,/current_member_id_v3/i);
    assert.match(validatorFn,/is_household_admin_v3/i);
    assert.match(validatorFn,/for update of o/i);
    assert.match(validatorFn,/allocation amount must be positive/i);
    assert.match(validatorFn,/selected payment item no longer available/i);
    assert.match(validatorFn,/selected payment item was duplicated/i);
    assert.match(validatorFn,/selected payment total must match payment amount/i);

    const submitFn=latestFunctionBlock(sql,'submit_payment_claim_v3');
    assert.match(submitFn,/validated_payment_allocations_v3[\s\S]*p_suggested_allocations/i);
    assert.match(submitFn,/v_allocations/i);

    const reviewFn=latestFunctionBlock(sql,'review_payment_claim_v3');
    assert.match(reviewFn,/validated_payment_allocations_v3[\s\S]*p_allocations/i);
    assert.match(reviewFn,/suggested_allocations\s*=\s*v_allocations/i);
    assert.match(reviewFn,/payment_received/i);
    assert.match(reviewFn,/Yehey, /);
    assert.match(reviewFn,/Please check the receipt and details for your reference!/);

    assert.match(sql,/edit_payment_claim_v3/);
    assert.match(sql,/withdraw_payment_claim_v3/);
    assert.match(sql,/attach_payment_claim_receipt_v3/);
    assert.match(sql,/revoke all on function public\.validated_payment_allocations_v3/i);
    assert.match(sql,/drop policy if exists "payment_claims owner pending update"/i);
    assert.match(sql,/revoke update on public\.payment_claims from authenticated/i);
    assert.match(sql,/payment_claims payer payee or admin/i);
    assert.match(sql,/attachments payment claim participant read/i);
    assert.match(sql,/attachments private read/i);
  }
});
