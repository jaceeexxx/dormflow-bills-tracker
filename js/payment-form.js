export function cents(value){
  const s=String(value??'').trim().replace(/,/g,'');
  if(!/^\d+(?:\.\d{0,2})?$/.test(s))throw new Error('Enter a valid amount.');
  const [w,f='']=s.split('.');
  return Number(w)*100+Number((f+'00').slice(0,2));
}

const dateOnly=value=>String(value||'').slice(0,10);
const cleanText=(value,fallback='')=>String(value??fallback).trim()||fallback;

export function normalizePaymentTargets(rows=[]){
  return (rows||[]).map(row=>{
    const obligationId=cleanText(row.obligation_id||row.obligationId||row.id);
    const category=cleanText(row.source_category||row.category,'Expense');
    return {
      obligation_id:obligationId,
      due_date:dateOnly(row.due_date||row.earliest_due_date),
      source_category:category,
      label:cleanText(row.label||row.description||category,category),
      source_type:cleanText(row.source_type||row.sourceType,'expense'),
      outstanding_cents:Number(row.outstanding_cents??row.amount_cents??0)
    };
  }).filter(row=>row.obligation_id&&row.outstanding_cents>0);
}

export function allocationTotalCents(allocations=[]){
  return (allocations||[]).reduce((sum,row)=>sum+Number(row.amount_cents||0),0);
}

function entryAmountCents(entry={}){
  if(entry.amount_cents!==undefined&&entry.amount_cents!==null)return Number(entry.amount_cents||0);
  return cents(entry.amount);
}

export function buildSelectedAllocations(entries=[],targets=[]){
  const targetById=new Map(normalizePaymentTargets(targets).map(target=>[target.obligation_id,target]));
  const seen=new Set();
  const allocations=[];
  for(const entry of entries||[]){
    const obligationId=cleanText(entry.obligation_id||entry.obligationId);
    if(!obligationId)continue;
    if(seen.has(obligationId))throw new Error('Selected payment item was duplicated.');
    seen.add(obligationId);
    const target=targetById.get(obligationId);
    if(!target)throw new Error('Selected payment item is no longer available.');
    const amountCents=entryAmountCents(entry);
    if(amountCents<=0)continue;
    if(amountCents>target.outstanding_cents)throw new Error(`${target.label} cannot exceed the open balance.`);
    allocations.push({
      obligation_id:target.obligation_id,
      amount_cents:amountCents,
      category:target.source_category,
      label:target.label,
      source_type:target.source_type,
      due_date:target.due_date||null
    });
  }
  if(!allocations.length)throw new Error('Choose at least one balance item to pay.');
  return allocations;
}

export function buildClaimPayload(input,{idempotencyKey=crypto.randomUUID()}={}){
  const allocations=input.allocations||[];
  const allocationTotal=allocationTotalCents(allocations);
  const amount=input.amount!==undefined&&String(input.amount).trim()!==''?cents(input.amount):allocationTotal;
  if(amount<=0)throw new Error('Payment amount must be positive.');
  if(allocations.length&&allocationTotal!==amount)throw new Error('Selected payment total must match payment amount.');
  return {
    p_payee:input.payeeId,
    p_amount_cents:amount,
    p_paid_at:new Date(`${input.paidAt}T12:00:00+08:00`).toISOString(),
    p_method:input.method,
    p_reference:input.reference||'',
    p_note:input.note||'',
    p_suggested_allocations:allocations,
    p_idempotency_key:idempotencyKey
  };
}

export function canEditClaim(claim){return claim?.status==='pending';}

export function attachmentPath(householdId,type,parentId,fileName){
  const safe=String(fileName||'receipt').replace(/[^a-zA-Z0-9._-]/g,'-').slice(-80);
  const dir=type==='claim'?'payment-claims':type;
  return `${householdId}/${dir}/${parentId}/${safe}`;
}

export function suggestOldest(obligations=[],amountCents=0){
  let left=amountCents;
  const result=[];
  for(const o of [...obligations].sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')))){
    if(left<=0)break;
    const take=Math.min(left,Number(o.outstanding_cents||0));
    if(take>0){
      result.push({obligation_id:o.id||o.obligation_id,amount_cents:take});
      left-=take;
    }
  }
  return {allocations:result,unallocatedCents:left};
}
