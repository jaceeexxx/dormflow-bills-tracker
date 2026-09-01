function submitButton(form){return form.querySelector('button[type="submit"],input[type="submit"]');}
export function snapshotForm(form){const data=new FormData(form);return JSON.stringify([...data.entries()].map(([k,v])=>[k,v instanceof File?`${v.name}:${v.size}:${v.lastModified}`:String(v)]));}
function notifyDefault(message,type='success'){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('dormflow:toast',{detail:{message,type}}));}
export function saveErrorMessage(error){return error?.message||'Could not save changes. Try again.';}
export function ensureFormError(form){
  let error=form?.querySelector?.('[data-form-error]');
  if(error)return error;
  const doc=form?.ownerDocument||(typeof document!=='undefined'?document:null);
  if(!doc?.createElement)return null;
  error=doc.createElement('p');
  error.className='form-error';
  error.setAttribute('data-form-error','');
  error.setAttribute('role','alert');
  error.setAttribute('aria-live','polite');
  error.hidden=true;
  const button=submitButton(form);
  if(button?.before)button.before(error);else form.append?.(error);
  return error;
}
export function clearFormError(form){const error=form?.querySelector?.('[data-form-error]');if(!error)return;error.textContent='';error.hidden=true;error.setAttribute?.('hidden','');}
export function showFormError(form,message){const error=ensureFormError(form);if(!error)return;error.textContent=message;error.hidden=false;error.removeAttribute?.('hidden');}

export function requireActivePeriod(periodId){if(!periodId)throw new Error('No active billing month is available. Open Monthly setup and make a month current first.');return periodId;}

export function bindDirtyClose({form,closeButtons=[],close=()=>{},confirmDiscard=()=>globalThis.confirm?.('Discard changes?')??true,isDirty}={}){
  const initial=snapshotForm(form);
  const dirty=()=>typeof isDirty==='function'?!!isDirty():snapshotForm(form)!==initial;
  const requestClose=()=>{if(dirty()&&!confirmDiscard())return false;close();return true;};
  for(const button of closeButtons.filter(Boolean))button.addEventListener('click',requestClose);
  return {isDirty:dirty,requestClose,initial};
}

export function bindSaveFlow(form,{idleLabel='Save',savingLabel='Saving…',successMessage='Successfully saved',save,close=()=>{},onSaved=()=>{},notify=notifyDefault}={}){
  if(!form||typeof save!=='function')throw new Error('A form and save handler are required.');
  const button=submitButton(form);let busy=false;
  const setButton=(label,disabled)=>{if(!button)return;button.disabled=disabled;if(button.tagName==='INPUT')button.value=label;else button.textContent=label;};
  const handler=async event=>{
    event.preventDefault();if(busy)return;busy=true;setButton(savingLabel,true);
    clearFormError(form);
    let result;
    try{
      try{
        result=await save(new FormData(form),form);
      }catch(error){const message=saveErrorMessage(error);showFormError(form,message);notify(message,'error');throw error;}
      try{
        notify(successMessage,'success');close();await onSaved(result);
      }catch(error){notify(error?.message||'Saved, but the screen could not refresh.','error');}
      return result;
    }finally{busy=false;setButton(idleLabel,false);}
  };
  form.addEventListener('submit',event=>{handler(event).catch(()=>{});});
  return {submit:handler,isSaving:()=>busy};
}
