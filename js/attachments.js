import {supabase} from './auth.js';
import {attachmentPath} from './payment-form.js';
import {bindSaveFlow,bindDirtyClose} from './form-flow.js';
import {formatPeso,escapeHtml} from './read-model-v3.js';

const allowedTypes=['image/jpeg','image/png','image/webp','application/pdf'];
export function fileReadiness(file){
  if(!(file instanceof File)||!file.size)return {ready:false,name:'',kind:'',message:'No file selected'};
  if(file.size>10*1024*1024)throw new Error('Attachment must be 10 MB or smaller.');
  if(!allowedTypes.includes(file.type))throw new Error('Use JPG, PNG, WebP, or PDF.');
  return {ready:true,name:file.name||'attachment',kind:file.type.startsWith('image/')?'image':'pdf',message:'Ready to upload'};
}
export function bindFileReadiness(input,container){
  if(!input||!container)return ()=>{};
  let objectUrl='';
  const clearUrl=()=>{if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}};
  const render=()=>{
    clearUrl();
    const file=input.files?.[0];
    if(!file){container.hidden=true;container.replaceChildren();return;}
    try{
      const state=fileReadiness(file);container.hidden=false;container.replaceChildren();
      if(state.kind==='image'){
        objectUrl=URL.createObjectURL(file);const img=document.createElement('img');img.src=objectUrl;img.alt='Selected upload preview';container.append(img);
      }else{const mark=document.createElement('span');mark.className='file-ready-mark';mark.textContent='PDF';container.append(mark);}
      const copy=document.createElement('span'),name=document.createElement('strong'),status=document.createElement('small');name.textContent=state.name;status.textContent=state.message;copy.append(name,status);container.append(copy);
      container.dataset.ready='true';
    }catch(error){container.hidden=false;container.replaceChildren();const msg=document.createElement('small');msg.className='file-ready-error';msg.textContent=error.message;container.append(msg);container.dataset.ready='false';}
  };
  input.addEventListener('change',render);
  return ()=>{clearUrl();input.removeEventListener('change',render);};
}
export async function uploadClaimReceipt({identity,claimId,file}){
  if(!file)return null;fileReadiness(file);
  const path=attachmentPath(identity.householdId||identity.household_id,'claim',claimId,file.name);
  let attachment;
  try{
    await supabase.upload('financial-documents',path,file);
    const rows=await supabase.insert('attachments',{household_id:identity.householdId||identity.household_id,owner_member_id:identity.memberId||identity.member_id,parent_type:'payment_claim',parent_id:claimId,bucket:'financial-documents',object_path:path,mime_type:file.type,file_size:file.size,created_by:identity.memberId||identity.member_id});
    attachment=Array.isArray(rows)?rows[0]:rows;
    await supabase.rpc('attach_payment_claim_receipt_v3',{p_claim:claimId,p_attachment:attachment.id});
    return attachment;
  }catch(error){
    await supabase.removeStorageObject('financial-documents',path).catch(()=>{});
    if(attachment?.id)await supabase.remove('attachments',`id=eq.${attachment.id}`).catch(()=>{});
    throw error;
  }
}
export async function signedAttachmentUrl(attachment){const signed=await supabase.createSignedUrl(attachment.bucket,attachment.object_path,300);return signed.signedURL||signed.signedUrl;}
export async function loadAttachmentById(id){
  if(!id)return null;
  const rows=await supabase.select('attachments',`select=id,bucket,object_path,mime_type,file_size,created_at&id=eq.${id}&limit=1`);
  const attachment=rows?.[0];
  if(!attachment)return null;
  const url=await signedAttachmentUrl(attachment);
  const fileName=String(attachment.object_path||'receipt').split('/').pop()||'receipt';
  return {...attachment,url,file_name:fileName};
}
export async function loadClaimReceipt(claimId){
  const claims=await supabase.select('payment_claims',`select=id,payer_member_id,payee_member_id,amount_cents,paid_at,method,note,reference_private,status,suggested_allocations,receipt_attachment_id&id=eq.${claimId}&limit=1`);
  const claim=claims?.[0];
  if(!claim)throw new Error('Payment claim not found.');
  const receipt=claim.receipt_attachment_id?await loadAttachmentById(claim.receipt_attachment_id):null;
  return {claim,receipt};
}
export function renderReceiptAttachment(attachment){
  if(!attachment?.url)return '<div class="receipt-empty">No receipt attached.</div>';
  const name=escapeHtml(attachment.file_name||String(attachment.object_path||'receipt').split('/').pop()||'receipt');
  const url=escapeHtml(attachment.url);
  const type=String(attachment.mime_type||'');
  if(type.startsWith('image/'))return `<div class="receipt-preview-card"><img src="${url}" alt="${name}"><span>${name}</span></div>`;
  return `<div class="receipt-preview-card pdf-receipt"><strong>${name}</strong><a href="${url}" target="_blank" rel="noopener">Open receipt</a></div>`;
}
function receiptAllocationLabel(item={}){
  const category=String(item.category||item.source_category||item.label||'Payment item').replaceAll('_',' ');
  const due=String(item.due_date||'').slice(0,10);
  return due?`${new Date(`${due}T00:00:00`).toLocaleDateString('en-PH',{month:'short',day:'numeric'})} · ${category}`:category;
}
function renderClaimReceiptDetails(claim={}){
  const allocations=(claim.suggested_allocations||[]).filter(item=>Number(item.amount_cents||0)>0);
  return `<div class="claim-receipt-details"><div class="payment-total-row"><small>Total paid</small><strong>${formatPeso(claim.amount_cents)}</strong></div>${allocations.length?`<div class="payment-obligation-list">${allocations.map(item=>`<div><span><strong>${escapeHtml(receiptAllocationLabel(item))}</strong><small>${escapeHtml(String(claim.method||'Payment'))}</small></span><b>${formatPeso(item.amount_cents)}</b></div>`).join('')}</div>`:'<p>Allocation details were not saved with this claim.</p>'}</div>`;
}
export async function openClaimReceiptSheet({claimId}){
  const {claim,receipt}=await loadClaimReceipt(claimId);
  const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');
  content.innerHTML=`<div class="sheet-body receipt-detail-sheet"><div class="sheet-grabber"></div><div class="sheet-head"><div><span class="sheet-kicker">Payment receipt</span><h2>${formatPeso(claim.amount_cents)}</h2></div><button type="button" class="icon-plain" data-close-sheet>&times;</button></div>${renderClaimReceiptDetails(claim)}${renderReceiptAttachment(receipt)}</div>`;
  if(!sheet.open)sheet.showModal();
  content.querySelector('[data-close-sheet]').onclick=()=>sheet.close();
}
export async function uploadExpenseAttachment({identity,expenseId,file}){
  if(!file)return null;fileReadiness(file);
  const householdId=identity.householdId||identity.household_id,memberId=identity.memberId||identity.member_id;
  const safe=String(file.name||'attachment').replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${householdId}/expenses/${expenseId}/${crypto.randomUUID()}-${safe}`;
  await supabase.upload('financial-documents',path,file);
  const rows=await supabase.insert('attachments',{household_id:householdId,owner_member_id:memberId,parent_type:'expense',parent_id:expenseId,bucket:'financial-documents',object_path:path,mime_type:file.type,file_size:file.size,created_by:memberId});
  return Array.isArray(rows)?rows[0]:rows;
}
export function openExpenseAttachmentSheet({identity,expenseId,onDone=()=>{}}){
  const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');
  content.innerHTML=`<form class="sheet-body"><div class="sheet-grabber"></div><div class="sheet-head"><h2>Add receipt</h2><button type="button" class="icon-plain" data-close-sheet>×</button></div><label class="field"><span>Receipt or bill</span><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label><div class="file-readiness" data-file-readiness hidden></div><button class="primary-action" type="submit">Upload</button></form>`;
  sheet.showModal();const form=content.querySelector('form'),closeButton=content.querySelector('[data-close-sheet]');
  const cleanup=bindFileReadiness(form.file,content.querySelector('[data-file-readiness]'));
  bindDirtyClose({form,closeButtons:[closeButton],close:()=>{cleanup();sheet.close();}});
  bindSaveFlow(form,{idleLabel:'Upload',successMessage:'Successfully uploaded',close:()=>{cleanup();sheet.close();},save:async data=>uploadExpenseAttachment({identity,expenseId,file:data.get('file')}),onSaved:onDone});
}
