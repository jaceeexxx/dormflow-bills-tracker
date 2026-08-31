import {supabase} from './auth.js';
import {attachmentPath} from './payment-form.js';
export async function uploadClaimReceipt({identity,claimId,file}){
  if(!file)return null;if(file.size>10*1024*1024)throw new Error('Receipt must be 10 MB or smaller.');
  const allowed=['image/jpeg','image/png','image/webp','application/pdf'];if(!allowed.includes(file.type))throw new Error('Use JPG, PNG, WebP, or PDF.');
  const path=attachmentPath(identity.householdId||identity.household_id,'claim',claimId,file.name);
  await supabase.upload('financial-documents',path,file);
  const rows=await supabase.insert('attachments',{household_id:identity.householdId||identity.household_id,owner_member_id:identity.memberId||identity.member_id,parent_type:'payment_claim',parent_id:claimId,bucket:'financial-documents',object_path:path,mime_type:file.type,file_size:file.size,created_by:identity.memberId||identity.member_id});
  const attachment=Array.isArray(rows)?rows[0]:rows;await supabase.update('payment_claims',`id=eq.${claimId}&status=eq.pending`,{receipt_attachment_id:attachment.id});return attachment;
}
export async function signedAttachmentUrl(attachment){const signed=await supabase.createSignedUrl(attachment.bucket,attachment.object_path,300);return signed.signedURL||signed.signedUrl;}
export async function uploadExpenseAttachment({identity,expenseId,file}){
  if(!file)return null;if(file.size>10*1024*1024)throw new Error('Attachment must be 10 MB or smaller.');
  const allowed=['image/jpeg','image/png','image/webp','application/pdf'];if(!allowed.includes(file.type))throw new Error('Use JPG, PNG, WebP, or PDF.');
  const householdId=identity.householdId||identity.household_id,memberId=identity.memberId||identity.member_id;
  const safe=String(file.name||'attachment').replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${householdId}/expenses/${expenseId}/${crypto.randomUUID()}-${safe}`;
  await supabase.upload('financial-documents',path,file);
  const rows=await supabase.insert('attachments',{household_id:householdId,owner_member_id:memberId,parent_type:'expense',parent_id:expenseId,bucket:'financial-documents',object_path:path,mime_type:file.type,file_size:file.size,created_by:memberId});
  return Array.isArray(rows)?rows[0]:rows;
}
export function openExpenseAttachmentSheet({identity,expenseId,onDone=()=>{}}){const sheet=document.querySelector('#sheet'),content=document.querySelector('#sheet-content');content.innerHTML=`<form class="sheet-body"><div class="sheet-grabber"></div><div class="sheet-head"><h2>Add receipt</h2><button type="button" class="icon-plain" data-close-sheet>×</button></div><label class="field"><span>Receipt or bill</span><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label><button class="primary-action" type="submit">Upload</button></form>`;sheet.showModal();content.querySelector('[data-close-sheet]').onclick=()=>sheet.close();content.querySelector('form').onsubmit=async e=>{e.preventDefault();const file=new FormData(e.currentTarget).get('file');await uploadExpenseAttachment({identity,expenseId,file});sheet.close();onDone();};}
