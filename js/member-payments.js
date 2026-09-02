import {supabase} from './auth.js';
import {formatPeso,escapeHtml} from './read-model-v3.js';
import {cleanActivityMethod} from './dashboard-model.js';
import {icon} from './icons.js';
import {buildClaimPayload,buildSelectedAllocations,canEditClaim,cents,normalizePaymentTargets} from './payment-form.js';
import {uploadClaimReceipt,bindFileReadiness} from './attachments.js';
import {queuePushForTarget} from './notifications.js';
import {bindSaveFlow,bindDirtyClose} from './form-flow.js';

export async function loadMemberPayments(){
  const [claims,payments]=await Promise.all([
    supabase.select('payment_claims','select=id,payer_member_id,payee_member_id,amount_cents,paid_at,method,status,note,suggested_allocations,receipt_attachment_id,version,created_at&order=created_at.desc'),
    supabase.select('payments','select=id,payer_member_id,payee_member_id,claim_id,amount_cents,paid_at,method,status&order=paid_at.desc')
  ]);
  return {claims,payments};
}

export function renderPayeeOptions(payees=[],selectedPayeeId=''){
  if(!payees.length)return '<option value="" selected disabled>No outstanding payees</option>';
  return payees.map(p=>`<option value="${escapeHtml(p.member_id||'')}" ${selectedPayeeId===p.member_id?'selected':''}>${escapeHtml(p.label||'Household member')}</option>`).join('');
}

export function renderMemberPayments({claims=[],payments=[]}={}){
  const pending=claims.filter(x=>x.status==='pending');
  const paymentClaimIds=new Set(payments.map(payment=>payment.claim_id).filter(Boolean));
  const claimHistory=claims.filter(x=>x.status!=='pending'&&!paymentClaimIds.has(x.id));
  const history=[...claimHistory,...payments].sort((a,b)=>String(b.paid_at||b.created_at).localeCompare(String(a.paid_at||a.created_at)));
  const pendingTotal=pending.reduce((sum,x)=>sum+Number(x.amount_cents||0),0);
  return `<section class="screen banking-dashboard payments-screen">
    <div class="bank-page-head"><div><span class="screen-kicker">Money movement</span><h1>Payments</h1></div><button class="mode-switch-card compact-mode" type="button" data-action="report-payment"><span>${icon('transfer')}</span><div><strong>Report payment</strong><small>Submit for verification</small></div><b>&rsaquo;</b></button></div>
    <section class="payments-hero-card"><div><span>Pending verification</span><strong>${formatPeso(pendingTotal)}</strong><small>${pending.length} ${pending.length===1?'claim':'claims'} awaiting review</small></div><button class="payments-hero-action" data-action="report-payment" type="button">${icon('add')} New payment</button></section>
    ${pending.length?`<article class="bank-panel"><div class="panel-head"><div><span>Pending</span><h2>Waiting for admin</h2></div><span class="panel-badge">${pending.length}</span></div><div class="bank-transaction-list">${pending.map(renderClaim).join('')}</div></article>`:''}
    <article class="bank-panel"><div class="panel-head"><div><span>Activity</span><h2>Transaction history</h2></div><span class="panel-badge">${history.length}</span></div><div class="bank-transaction-list">${history.length?history.map(renderHistory).join(''):'<div class="empty-state-bank"><strong>No payment history yet</strong><span>Your verified payments will appear here.</span></div>'}</div></article>
  </section>`;
}

function renderClaim(c){
  const receipt=c.receipt_attachment_id?`<button class="text-action" data-claim-receipt="${escapeHtml(c.id)}" type="button">View receipt</button>`:'';
  return `<div class="bank-transaction-card pending-claim" data-claim-id="${c.id}"><span class="activity-icon warm">${icon('transfer')}</span><div class="transaction-copy"><strong>${formatPeso(c.amount_cents)}</strong><small>${escapeHtml(cleanActivityMethod(c.method))} &middot; ${new Date(c.paid_at).toLocaleDateString('en-PH')}</small><em class="status-pill pending">Pending review</em></div><div class="transaction-actions">${receipt}<button class="text-action" data-claim-edit="${c.id}" type="button">Edit</button><button class="text-action danger-text" data-claim-withdraw="${c.id}" type="button">Withdraw</button></div></div>`;
}

function renderHistory(c){
  const claimId=c.claim_id||(c.suggested_allocations!==undefined?c.id:'');
  const receipt=claimId?`<button class="text-action" data-claim-receipt="${escapeHtml(claimId)}" type="button">View details</button>`:'';
  return `<div class="bank-transaction-card"><span class="activity-icon">${icon('payments')}</span><div class="transaction-copy"><strong>${formatPeso(c.amount_cents)}</strong><small>${escapeHtml(cleanActivityMethod(c.method))} &middot; ${new Date(c.paid_at||c.created_at).toLocaleDateString('en-PH')}</small></div><div class="transaction-actions">${receipt}<em class="status-pill ${escapeHtml(c.status||'verified')}">${escapeHtml(c.status||'verified')}</em></div></div>`;
}

function displayTargetDate(value){
  const date=String(value||'').slice(0,10);
  if(!date)return 'No due date';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH',{month:'short',day:'numeric'});
}

function renderPaymentTargetOptions(targets=[],selected=[]){
  if(!targets.length)return '<div class="empty-state-bank compact"><strong>No open items</strong><span>This payee has no payable rows right now.</span></div>';
  const selectedById=new Map((selected||[]).map(row=>[String(row.obligation_id||''),Number(row.amount_cents||0)]));
  return targets.map(target=>{
    const selectedCents=selectedById.get(target.obligation_id)||0;
    const checked=selectedCents>0;
    return `<label class="payment-target-option" data-payment-target-option data-obligation-id="${escapeHtml(target.obligation_id)}">
      <input type="checkbox" data-payment-target-check ${checked?'checked':''}>
      <span><strong>${escapeHtml(displayTargetDate(target.due_date))} &middot; ${escapeHtml(target.source_category)}</strong><small>${escapeHtml(target.label)} &middot; open ${formatPeso(target.outstanding_cents)}</small></span>
      <input data-payment-target-amount inputmode="decimal" value="${checked?(selectedCents/100).toFixed(2):''}" placeholder="0.00" aria-label="${escapeHtml(target.label)} payment amount">
    </label>`;
  }).join('');
}

function collectPaymentEntries(form){
  return [...form.querySelectorAll('[data-payment-target-option]')].map(row=>{
    const checked=row.querySelector('[data-payment-target-check]')?.checked;
    const amount=String(row.querySelector('[data-payment-target-amount]')?.value||'').trim();
    return checked||amount?{obligation_id:row.dataset.obligationId,amount}:null;
  }).filter(Boolean);
}

function looseCents(value){
  const s=String(value||'').trim().replace(/,/g,'');
  if(!/^\d+(?:\.\d{0,2})?$/.test(s))return 0;
  return cents(s);
}

function updatePaymentTotal(form){
  const total=[...form.querySelectorAll('[data-payment-target-option]')].reduce((sum,row)=>{
    const checked=row.querySelector('[data-payment-target-check]')?.checked;
    return checked?sum+looseCents(row.querySelector('[data-payment-target-amount]')?.value):sum;
  },0);
  form.amount.value=total?(total/100).toFixed(2):'';
  const totalLabel=form.querySelector('[data-payment-total-label]');
  if(totalLabel)totalLabel.textContent=formatPeso(total);
}

export async function openReportPaymentSheet({identity,existing=null,payeeId='',onDone=()=>{}}){
  if(!navigator.onLine)throw new Error("You're offline. Reconnect before reporting a payment.");
  const balance=await supabase.rpc('member_balance_v3');
  const b=Array.isArray(balance)?balance[0]:balance;
  const payees=(b.creditors||[]);
  const selectedPayeeId=existing?.payee_member_id||payeeId||'';
  const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');
  content.innerHTML=`<form id="claim-form" class="sheet-body"><div class="sheet-grabber"></div><div class="sheet-head"><h2>${existing?'Edit payment':'Report payment'}</h2><button type="button" class="icon-plain" data-close-sheet>&times;</button></div><label class="field"><span>To</span><select name="payeeId" required ${payees.length?'':'disabled'}>${renderPayeeOptions(payees,selectedPayeeId)}</select></label><label class="field amount-field"><span>Payment total</span><input name="amount" inputmode="decimal" placeholder="0.00" value="${existing?(existing.amount_cents/100).toFixed(2):''}" readonly required></label><div class="payment-target-picker"><div class="payment-target-head"><span>Choose what this payment covers</span><strong data-payment-total-label>${formatPeso(existing?.amount_cents||0)}</strong></div><div data-payment-targets><div class="empty-line">Choose a payee first.</div></div></div><label class="field"><span>Date paid</span><input name="paidAt" type="date" value="${existing?String(existing.paid_at).slice(0,10):new Date().toISOString().slice(0,10)}" required></label><label class="field"><span>Payment method</span><select name="method"><option>GCash</option><option>Maya</option><option>Bank Transfer</option><option>Cash</option><option>Other</option><option>MariBank</option></select></label><label class="field"><span>Reference <small>optional</small></span><input name="reference" maxlength="80"></label><label class="field"><span>Receipt <small>optional</small></span><input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><div class="file-readiness" data-file-readiness hidden></div><label class="field"><span>Note <small>optional</small></span><textarea name="note" rows="2">${escapeHtml(existing?.note||'')}</textarea></label><div class="sheet-context">Your current outstanding balance is <strong>${formatPeso(b.outstanding_cents)}</strong>.</div><button class="primary-action" type="submit" ${payees.length?'':'disabled'}>${payees.length?(existing?'Save changes':'Submit for review'):'No outstanding balance'}</button></form>`;
  if(!sheet.open)sheet.showModal();
  const claimForm=content.querySelector('#claim-form');
  const closeButton=content.querySelector('[data-close-sheet]');
  const targetsContainer=content.querySelector('[data-payment-targets]');
  const claimIdempotencyKey=existing?null:crypto.randomUUID();
  let currentTargets=[];
  bindFileReadiness(claimForm.receipt,content.querySelector('[data-file-readiness]'));
  bindDirtyClose({form:claimForm,closeButtons:[closeButton],close:()=>sheet.close()});

  async function loadTargets(selectedAllocations=[]){
    const creditor=claimForm.payeeId.value;
    if(!creditor){targetsContainer.innerHTML='<div class="empty-line">Choose a payee first.</div>';currentTargets=[];updatePaymentTotal(claimForm);return;}
    targetsContainer.innerHTML='<div class="empty-line">Loading open balance items...</div>';
    const rows=await supabase.rpc('payment_target_options_v3',{p_debtor:null,p_creditor:creditor});
    currentTargets=normalizePaymentTargets(rows);
    targetsContainer.innerHTML=renderPaymentTargetOptions(currentTargets,selectedAllocations);
    updatePaymentTotal(claimForm);
  }

  claimForm.payeeId.addEventListener('change',()=>loadTargets().catch(err=>{targetsContainer.innerHTML=`<div class="form-error">${escapeHtml(err.message||String(err))}</div>`;}));
  targetsContainer.addEventListener('change',event=>{
    const row=event.target.closest('[data-payment-target-option]');
    if(!row)return;
    const check=row.querySelector('[data-payment-target-check]'),amount=row.querySelector('[data-payment-target-amount]');
    const target=currentTargets.find(item=>item.obligation_id===row.dataset.obligationId);
    if(event.target===check){
      amount.value=check.checked&&target?(target.outstanding_cents/100).toFixed(2):'';
    }else if(event.target===amount&&amount.value){
      check.checked=true;
    }
    updatePaymentTotal(claimForm);
  });
  targetsContainer.addEventListener('input',event=>{
    const row=event.target.closest('[data-payment-target-option]');
    if(row&&event.target.matches('[data-payment-target-amount]')){
      row.querySelector('[data-payment-target-check]').checked=!!String(event.target.value||'').trim();
      updatePaymentTotal(claimForm);
    }
  });
  await loadTargets(existing?.suggested_allocations||[]);

  bindSaveFlow(claimForm,{idleLabel:existing?'Save changes':'Submit for review',savingLabel:existing?'Saving...':'Submitting...',successMessage:existing?'Payment updated':'Payment submitted',close:()=>sheet.close(),save:async data=>{
    const allocations=buildSelectedAllocations(collectPaymentEntries(claimForm),currentTargets);
    const input={payeeId:data.get('payeeId'),amount:data.get('amount'),paidAt:data.get('paidAt'),method:data.get('method'),reference:data.get('reference'),note:data.get('note'),allocations};
    if(existing){
      if(!canEditClaim(existing))throw new Error('Only pending claims can be edited.');
      const payload=buildClaimPayload(input,{idempotencyKey:'unused'});
      await supabase.rpc('edit_payment_claim_v3',{p_claim:existing.id,p_payee:payload.p_payee,p_amount_cents:payload.p_amount_cents,p_paid_at:payload.p_paid_at,p_method:payload.p_method,p_reference:payload.p_reference,p_note:payload.p_note,p_suggested_allocations:payload.p_suggested_allocations,p_expected_version:Number(existing.version||0)||null});
      const receipt=data.get('receipt');
      if(receipt instanceof File&&receipt.size)await uploadClaimReceipt({identity,claimId:existing.id,file:receipt});
      return existing.id;
    }
    const payload=buildClaimPayload(input,{idempotencyKey:claimIdempotencyKey});
    const claimId=await supabase.rpc('submit_payment_claim_v3',payload);
    const id=typeof claimId==='string'?claimId:claimId?.id||claimId;
    const receipt=data.get('receipt');
    if(receipt instanceof File&&receipt.size)await uploadClaimReceipt({identity,claimId:id,file:receipt});
    return id;
  },onSaved:async id=>{queuePushForTarget({targetType:'payment_claim',targetId:id});await onDone();}});
}

export async function withdrawClaim(id){
  if(!navigator.onLine)throw new Error('Reconnect before changing a payment claim.');
  return supabase.rpc('withdraw_payment_claim_v3',{p_claim:id,p_expected_version:null});
}
