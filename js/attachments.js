import {supabase} from './auth.js';
import {attachmentPath} from './payment-form.js';
import {bindSaveFlow,bindDirtyClose} from './form-flow.js';

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
  await supabase.upload('financial-documents',path,file);
  const rows=await supabase.insert('attachments',{household_id:identity.householdId||identity.household_id,owner_member_id:identity.memberId||identity.member_id,parent_type:'payment_claim',parent_id:claimId,bucket:'financial-documents',object_path:path,mime_type:file.type,file_size:file.size,created_by:identity.memberId||identity.member_id});
  const attachment=Array.isArray(rows)?rows[0]:rows;await supabase.update('payment_claims',`id=eq.${claimId}&status=eq.pending`,{receipt_attachment_id:attachment.id});return attachment;
}
export async function signedAttachmentUrl(attachment){const signed=await supabase.createSignedUrl(attachment.bucket,attachment.object_path,300);return signed.signedURL||signed.signedUrl;}
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
