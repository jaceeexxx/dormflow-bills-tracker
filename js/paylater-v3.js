import {supabase} from './auth.js';
import {parseMoneyCents} from './admin-actions.js';
import {formatPeso,escapeHtml} from './read-model-v3.js';
import {icon} from './icons.js';
import {bindDirtyClose,bindSaveFlow} from './form-flow.js';
import {queuePushForTarget} from './notifications.js';
import {householdMemberDirectory} from './member-directory.js';

function asPositiveInt(value,label='Amount'){
  const n=Number(value);
  if(!Number.isInteger(n)||n<=0)throw new Error(`${label} must be a positive integer.`);
  return n;
}
function isoDate(value){
  const text=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(Date.parse(`${text}T00:00:00Z`)))throw new Error('Each installment needs a valid due date.');
  return text;
}
function addMonths(dateText,offset){
  const [year,month,day]=isoDate(dateText).split('-').map(Number);
  const target=new Date(Date.UTC(year,month-1+offset,1));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(day,last));
  return target.toISOString().slice(0,10);
}

export function buildEqualPayLaterSchedule(totalCents,count,firstDueDate){
  const total=asPositiveInt(totalCents,'Principal'),n=asPositiveInt(Number(count),'Installment count');
  if(n>60)throw new Error('Installment count is too large.');
  const base=Math.floor(total/n),remainder=total%n;
  return Array.from({length:n},(_,index)=>({
    sequence_no:index+1,
    due_date:addMonths(firstDueDate,index),
    amount_cents:base+(index<remainder?1:0)
  }));
}

export function validateCustomPayLaterSchedule(totalCents,rows){
  const principal=asPositiveInt(totalCents,'Principal');
  if(!Array.isArray(rows)||!rows.length)throw new Error('Add at least one installment.');
  const normalized=rows.map((row,index)=>({
    sequence_no:index+1,
    due_date:isoDate(row.due_date),
    amount_cents:asPositiveInt(Number(row.amount_cents),`Installment ${index+1}`)
  }));
  const sum=normalized.reduce((s,row)=>s+row.amount_cents,0);
  if(sum!==principal)throw new Error(`Custom installments must equal the principal exactly (${formatPeso(principal)}).`);
  return true;
}

export function splitPayLaterInstallment(amountCents,memberIds,borrowerId){
  const total=asPositiveInt(amountCents,'Installment');
  const members=[...new Set((memberIds||[]).map(String))].sort();
  const borrower=String(borrowerId||'');
  if(members.length!==4)throw new Error('PayLater requires exactly four active dormies.');
  if(!members.includes(borrower))throw new Error('Borrower must be an active dormie.');
  const base=Math.floor(total/4),remainder=total%4;
  const economicShares=members.map((member_id,index)=>({member_id,amount_cents:base+(index<remainder?1:0)}));
  const borrowerShare=economicShares.find(x=>x.member_id===borrower);
  const obligations=economicShares.filter(x=>x.member_id!==borrower).map(x=>({
    debtor_member_id:x.member_id,
    creditor_member_id:borrower,
    amount_cents:x.amount_cents
  }));
  return {economicShares,borrowerShare,obligations};
}

export async function loadPayLater(){
  return supabase.select('paylater_accounts','select=id,provider,borrower_member_id,borrower_label,creditor_member_id,original_total_cents,schedule_mode,status,created_at,updated_at,paylater_installments(id,due_date,amount_cents,sequence_no,status)&order=created_at.desc');
}

export function renderPayLater(rows=[],{admin=false}={}){
  const active=rows.filter(a=>a.status!=='void');
  const total=active.reduce((sum,a)=>sum+Number(a.original_total_cents||0),0);
  const upcoming=active.reduce((sum,a)=>sum+(a.paylater_installments?.filter(x=>x.status==='scheduled').length||0),0);
  return `<section class="screen banking-dashboard paylater-screen"><div class="bank-page-head"><div><span class="screen-kicker">Installments</span><h1>PayLater</h1></div><span class="member-status-pill">${upcoming} upcoming</span></div><section class="payments-hero-card paylater-hero"><div><span>Active schedules</span><strong>${formatPeso(total)}</strong><small>${active.length} ${active.length===1?'account':'accounts'}</small></div><span class="summary-icon warm">${icon('paylater')}</span></section><div class="paylater-card-grid">${rows.map(a=>{const scheduled=a.paylater_installments?.filter(x=>x.status==='scheduled')||[],next=[...scheduled].sort((x,y)=>String(x.due_date).localeCompare(String(y.due_date)))[0];return `<article class="paylater-bank-card ${a.status==='void'?'is-archived':''}"><div class="paylater-card-head"><span>${icon('paylater')}</span><div><strong>${escapeHtml(a.provider)}</strong><small>${escapeHtml(a.borrower_label||'Dormie borrower')} · ${a.schedule_mode==='custom'?'Custom':'Equal'} installments</small></div><em>${escapeHtml(a.status||'active')}</em></div><div class="paylater-card-amount"><small>Original total</small><strong>${formatPeso(a.original_total_cents)}</strong></div><div class="paylater-card-foot"><span>${scheduled.length} upcoming</span><b>${next?`Next ${new Date(next.due_date+'T00:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}`:'No scheduled installment'}</b></div>${admin&&a.status!=='void'?`<div class="record-actions"><button type="button" class="secondary-action compact" data-paylater-edit="${a.id}">Edit</button><button type="button" class="danger-text compact" data-paylater-archive="${a.id}">Archive</button></div>`:''}</article>`}).join('')||'<div class="empty-state-bank"><strong>No PayLater schedules</strong><span>Installments will appear here once added.</span></div>'}</div></section>`;
}

function customRowsMarkup(rows=[]){
  return rows.map((row,index)=>`<div class="paylater-custom-row" data-custom-row><span>${index+1}</span><label class="field"><small>Due date</small><input name="customDue" type="date" value="${escapeHtml(row.due_date||'')}" required></label><label class="field"><small>Amount</small><input name="customAmount" inputmode="decimal" value="${row.amount_cents?Number(row.amount_cents/100).toFixed(2):''}" required></label></div>`).join('');
}

export async function openPayLaterSheet({identity,existing=null,onDone=()=>{}}){
  const members=await householdMemberDirectory();
  const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');
  const existingRows=[...(existing?.paylater_installments||[])].filter(x=>x.status!=='void').sort((a,b)=>a.sequence_no-b.sequence_no);
  const initialMode=existing?.schedule_mode||'equal',initialCount=Math.max(1,existingRows.length||3);
  const firstDue=existingRows[0]?.due_date||'';
  content.innerHTML=`<form class="sheet-body" id="paylater-form"><div class="sheet-grabber"></div><div class="sheet-head"><h2>${existing?'Edit PayLater':'PayLater'}</h2><button type="button" class="icon-plain" data-close-sheet>×</button></div><label class="field"><span>Provider</span><input name="provider" value="${escapeHtml(existing?.provider||'SPayLater')}" required></label><label class="field"><span>Borrower</span><select name="borrower">${members.map(m=>`<option value="${m.id}" ${m.id===existing?.borrower_member_id?'selected':''}>${escapeHtml(m.name||'Member')}</option>`).join('')}</select><small>The borrower pays the provider. Their own 25% share is automatically settled.</small></label><label class="field amount-field"><span>Total principal</span><input name="amount" inputmode="decimal" value="${existing?.original_total_cents?Number(existing.original_total_cents/100).toFixed(2):''}" required></label><fieldset class="paylater-mode"><legend>Schedule</legend><label><input type="radio" name="scheduleMode" value="equal" ${initialMode==='equal'?'checked':''}> <span><strong>Equal installments</strong><small>Divide the principal evenly across months.</small></span></label><label><input type="radio" name="scheduleMode" value="custom" ${initialMode==='custom'?'checked':''}> <span><strong>Custom installments</strong><small>Set the actual amount and due date for each month.</small></span></label></fieldset><div data-equal-fields><label class="field"><span>Installments</span><input name="count" type="number" min="1" max="24" value="${initialCount}" required></label><label class="field"><span>First due date</span><input name="firstDue" type="date" value="${firstDue}" required></label></div><div data-custom-fields><div class="paylater-custom-head"><strong>Custom installments</strong><button type="button" class="panel-link" data-add-custom>Add installment</button></div><div data-custom-list>${customRowsMarkup(existingRows.length?existingRows:Array.from({length:initialCount},()=>({due_date:'',amount_cents:0})))}</div><small class="form-hint" data-custom-total></small></div><button class="primary-action" type="submit">Save</button></form>`;
  sheet.showModal();
  const form=content.querySelector('form'),closeButton=content.querySelector('[data-close-sheet]'),equalFields=content.querySelector('[data-equal-fields]'),customFields=content.querySelector('[data-custom-fields]'),list=content.querySelector('[data-custom-list]'),totalHint=content.querySelector('[data-custom-total]');
  const syncMode=()=>{const custom=form.scheduleMode.value==='custom';equalFields.hidden=custom;customFields.hidden=!custom;form.count.required=!custom;form.firstDue.required=!custom;list.querySelectorAll('input').forEach(input=>input.required=custom);};
  const syncCustomTotal=()=>{let cents=0;for(const input of list.querySelectorAll('[name="customAmount"]')){try{cents+=input.value?parseMoneyCents(input.value):0;}catch{}}totalHint.textContent=`Custom total: ${formatPeso(cents)}`;};
  form.querySelectorAll('[name="scheduleMode"]').forEach(x=>x.addEventListener('change',syncMode));
  content.querySelector('[data-add-custom]').addEventListener('click',()=>{const index=list.querySelectorAll('[data-custom-row]').length;list.insertAdjacentHTML('beforeend',customRowsMarkup([{due_date:'',amount_cents:0}]).replace('<span>1</span>',`<span>${index+1}</span>`));syncMode();});
  list.addEventListener('input',syncCustomTotal);syncMode();syncCustomTotal();
  bindDirtyClose({form,closeButtons:[closeButton],close:()=>sheet.close()});
  bindSaveFlow(form,{idleLabel:'Save',successMessage:'Successfully saved',close:()=>sheet.close(),save:async data=>{
    if(!navigator.onLine)throw new Error('Reconnect before saving PayLater.');
    const total=parseMoneyCents(data.get('amount')),mode=String(data.get('scheduleMode')||'equal');let items;
    if(mode==='equal')items=buildEqualPayLaterSchedule(total,Number(data.get('count')),String(data.get('firstDue')));
    else{
      const dues=data.getAll('customDue'),amounts=data.getAll('customAmount');
      items=dues.map((due_date,index)=>({sequence_no:index+1,due_date:String(due_date),amount_cents:parseMoneyCents(amounts[index])}));
      validateCustomPayLaterSchedule(total,items);
    }
    const payload={p_provider:String(data.get('provider')).trim(),p_borrower:String(data.get('borrower')),p_total_cents:total,p_schedule:{mode,items}};
    const id=existing?await supabase.rpc('edit_paylater_v3',{p_account:existing.id,...payload}):await supabase.rpc('create_paylater_v3',payload);
    const targetId=typeof id==='string'?id:id?.id||existing?.id;
    return targetId;
  },onSaved:async id=>{if(id)queuePushForTarget({targetType:'paylater',targetId:id});await onDone(id);}});
}
