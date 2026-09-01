function submitButton(form){return form.querySelector('button[type="submit"],input[type="submit"]');}
export function snapshotForm(form){const data=new FormData(form);return JSON.stringify([...data.entries()].map(([k,v])=>[k,v instanceof File?`${v.name}:${v.size}:${v.lastModified}`:String(v)]));}
function notifyDefault(message,type='success'){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('dormflow:toast',{detail:{message,type}}));}

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
    try{
      const result=await save(new FormData(form),form);
      notify(successMessage,'success');
      close();
      await onSaved(result);
      return result;
    }catch(error){notify(error?.message||'Could not save changes. Try again.','error');throw error;}
    finally{busy=false;setButton(idleLabel,false);}
  };
  form.addEventListener('submit',event=>{handler(event).catch(()=>{});});
  return {submit:handler,isSaving:()=>busy};
}
