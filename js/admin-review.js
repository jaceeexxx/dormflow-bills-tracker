import {supabase} from './auth.js';
import {formatPeso,escapeHtml} from './read-model-v3.js';
import {icon} from './icons.js';
import {cents,normalizePaymentTargets,suggestOldest} from './payment-form.js';
import {loadAttachmentById,renderReceiptAttachment} from './attachments.js';
import {queuePushForTarget} from './notifications.js';
import {bindSaveFlow,bindDirtyClose} from './form-flow.js';

export async function loadReviewQueue(){
  return supabase.select('payment_claims','select=id,payer_member_id,payee_member_id,amount_cents,paid_at,method,status,note,suggested_allocations,receipt_attachment_id,version,created_at&status=eq.pending&order=created_at.asc');
}

export function renderReviewQueue(rows=[]){
  const total=rows.reduce((sum,x)=>sum+Number(x.amount_cents||0),0);
  return `<section class="screen banking-dashboard review-screen"><div class="bank-page-head"><div><span class="screen-kicker">Admin review</span><h1>Review</h1></div><span class="member-status-pill">${rows.length} pending</span></div><section class="review-summary-card"><span class="summary-icon warm">${icon('review')}</span><div><small>Pending claims</small><strong>${rows.length}</strong></div><div><small>Amount awaiting review</small><strong>${formatPeso(total)}</strong></div></section><article class="bank-panel"><div class="panel-head"><div><span>Queue</span><h2>Payment claims</h2></div></div><div class="review-claim-list">${rows.map(c=>`<button class="review-claim-card" data-review-claim="${c.id}" type="button"><span class="activity-icon warm">${icon(c.receipt_attachment_id?'receipt':'transfer')}</span><div><strong>${formatPeso(c.amount_cents)}</strong><small>${escapeHtml(c.method)} &middot; ${new Date(c.paid_at).toLocaleDateString('en-PH')}${c.receipt_attachment_id?' &middot; receipt attached':''}</small></div><em>Review</em><b>&rsaquo;</b></button>`).join('')||'<div class="empty-state-bank"><strong>Nothing waiting for review</strong><span>New roommate payment claims will appear here.</span></div>'}</div></article></section>`;
}

function displayDate(value){
  const date=String(value||'').slice(0,10);
  if(!date)return 'No due date';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH',{month:'short',day:'numeric'});
}

function enrichAllocations(allocations=[],targets=[]){
  const targetById=new Map(normalizePaymentTargets(targets).map(target=>[target.obligation_id,target]));
  return (allocations||[]).map((allocation,index)=>{
    const target=targetById.get(String(allocation.obligation_id||''))||{};
    const category=allocation.category||allocation.source_category||target.source_category||`Balance ${index+1}`;
    const label=allocation.label||target.label||category;
    return {
      obligation_id:allocation.obligation_id,
      amount_cents:Number(allocation.amount_cents||0),
      category,
      label,
      source_type:allocation.source_type||target.source_type||'expense',
      due_date:allocation.due_date||target.due_date||null,
      outstanding_cents:Number(target.outstanding_cents||allocation.amount_cents||0)
    };
  }).filter(row=>row.obligation_id&&row.amount_cents>0);
}

function renderAllocationEditor(allocations=[]){
  if(!allocations.length)return '<div class="empty-line">No open obligation match</div>';
  return allocations.map((a,i)=>`<label class="review-allocation-row"><span><strong class="allocation-title">${escapeHtml(displayDate(a.due_date))} &middot; ${escapeHtml(a.category)}</strong><small>${escapeHtml(a.label)} &middot; open ${formatPeso(a.outstanding_cents)}</small></span><input name="alloc-${i}" inputmode="decimal" value="${(a.amount_cents/100).toFixed(2)}" data-obligation="${escapeHtml(a.obligation_id)}" data-category="${escapeHtml(a.category)}" data-label="${escapeHtml(a.label)}" data-source-type="${escapeHtml(a.source_type)}" data-due-date="${escapeHtml(a.due_date||'')}"></label>`).join('');
}

function collectAllocations(form){
  return [...form.querySelectorAll('[data-obligation]')].map(input=>({
    obligation_id:input.dataset.obligation,
    amount_cents:String(input.value||'').trim()?cents(input.value):0,
    category:input.dataset.category||'Payment item',
    label:input.dataset.label||input.dataset.category||'Payment item',
    source_type:input.dataset.sourceType||'expense',
    due_date:input.dataset.dueDate||null
  })).filter(row=>row.obligation_id&&row.amount_cents>0);
}

export async function openClaimReview(claim,{onDone=()=>{}}={}){
  let targets=[];
  try{targets=await supabase.rpc('payment_target_options_v3',{p_debtor:claim.payer_member_id,p_creditor:claim.payee_member_id});}
  catch{targets=await supabase.rpc('open_obligations_v3',{p_debtor:claim.payer_member_id,p_creditor:claim.payee_member_id});}
  let allocations=enrichAllocations(claim.suggested_allocations||[],targets);
  if(!allocations.length)allocations=enrichAllocations(suggestOldest(targets,claim.amount_cents).allocations,targets);
  const allocated=allocations.reduce((s,x)=>s+Number(x.amount_cents||0),0),credit=Math.max(0,claim.amount_cents-allocated);
  const receipt=claim.receipt_attachment_id?await loadAttachmentById(claim.receipt_attachment_id).catch(()=>null):null;
  const receiptBlock=claim.receipt_attachment_id?`<div class="claim-receipt-panel"><div class="payment-total-row"><small>Receipt</small><button class="text-action" type="button" data-claim-receipt="${escapeHtml(claim.id)}">View receipt</button></div>${renderReceiptAttachment(receipt)}</div>`:'';
  const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');
  content.innerHTML=`<form class="sheet-body" id="review-form"><div class="sheet-grabber"></div><div class="sheet-head"><h2>Payment claim</h2><button type="button" class="icon-plain" data-close-sheet>&times;</button></div><input type="hidden" name="decision" value="verify"><div class="review-amount">${formatPeso(claim.amount_cents)}</div><div class="claim-reconciliation"><div><small>Reported payment</small><strong>${formatPeso(claim.amount_cents)}</strong></div><div><small>Applied to obligations</small><strong>${formatPeso(allocated)}</strong></div>${credit?`<div><small>Remaining credit</small><strong>${formatPeso(credit)}</strong></div>`:''}</div>${receiptBlock}<div class="allocation-editor"><span>Apply to</span>${renderAllocationEditor(allocations)}</div>${credit?`<div class="metric-line"><span>Keep as credit</span><strong>${formatPeso(credit)}</strong></div>`:''}<label class="field rejection-field" hidden><span>Reason</span><textarea name="reason" rows="2"></textarea></label><div class="review-actions"><button type="button" class="danger-action" data-reject>Reject</button><button type="submit" class="primary-action" data-verify>Verify & apply</button></div></form>`;
  if(!sheet.open)sheet.showModal();
  const form=content.querySelector('#review-form'),closeButton=content.querySelector('[data-close-sheet]'),decision=form.querySelector('[name="decision"]'),reason=form.querySelector('[name="reason"]');
  bindDirtyClose({form,closeButtons:[closeButton],close:()=>sheet.close()});
  const flow=bindSaveFlow(form,{idleLabel:'Verify & apply',savingLabel:'Saving...',successMessage:'Successfully saved',close:()=>sheet.close(),save:async data=>{
    if(data.get('decision')==='reject'){
      await supabase.rpc('review_payment_claim_v3',{p_claim:claim.id,p_decision:'reject',p_allocations:[],p_rejection_reason:data.get('reason')||'Not verified',p_idempotency_key:null,p_credit_cents:0});
      return claim.id;
    }
    const edited=collectAllocations(form),sum=edited.reduce((s,x)=>s+x.amount_cents,0),creditCents=Math.max(0,claim.amount_cents-sum);
    await supabase.rpc('review_payment_claim_v3',{p_claim:claim.id,p_decision:'verify',p_allocations:edited,p_rejection_reason:null,p_idempotency_key:`claim:${claim.id}`,p_credit_cents:creditCents});
    return claim.id;
  },onSaved:async id=>{queuePushForTarget({targetType:'payment_claim',targetId:id});await onDone(id);}});
  content.querySelector('[data-verify]').addEventListener('click',()=>{decision.value='verify';reason.value='';});
  content.querySelector('[data-reject]').addEventListener('click',()=>{const value=prompt('Reason for rejection?');if(value===null)return;decision.value='reject';reason.value=value||'Not verified';void flow.submit({preventDefault(){},currentTarget:form}).catch(()=>{});});
}
