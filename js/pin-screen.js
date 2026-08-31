function ensurePinDialog(){
  let dialog=document.querySelector('#pin-dialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='pin-dialog';dialog.className='pin-dialog';
  dialog.innerHTML='<div class="pin-screen" data-pin-screen></div>';
  document.body.append(dialog);return dialog;
}
function keypad(){return [1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-pin-key="${n}">${n}</button>`).join('')+'<span></span><button type="button" data-pin-key="0">0</button><button type="button" data-pin-back aria-label="Delete digit">⌫</button>';}
function dots(value){return Array.from({length:6},(_,i)=>`<i class="pin-dot ${i<value.length?'filled':''}"></i>`).join('');}

function capturePin({title='Enter your PIN',subtitle='Unlock DormFlow on this device.',allowPassword=false,verify=null}={}){
  const dialog=ensurePinDialog(),screen=dialog.querySelector('[data-pin-screen]');let value='',busy=false;
  return new Promise(resolve=>{
    const render=(message='')=>{screen.innerHTML=`<div class="pin-brand">DormFlow</div><h1>${title}</h1><p>${subtitle}</p><div class="pin-dots" aria-label="${value.length} of 6 digits entered">${dots(value)}</div><div class="pin-error" aria-live="polite">${message}</div><div class="pin-keypad">${keypad()}</div>${allowPassword?'<button class="pin-password-fallback" type="button" data-pin-password>Use password instead</button>':''}`;bind();};
    const finish=result=>{busy=false;dialog.close();resolve(result);};
    const submit=async()=>{if(value.length!==6||busy)return;busy=true;try{if(verify&&!(await verify(value))){value='';screen.classList.remove('pin-shake');void screen.offsetWidth;screen.classList.add('pin-shake');render('Incorrect PIN. Try again.');return;}finish({action:'pin',pin:value});}catch(error){value='';render(error?.message||'Could not verify PIN.');}finally{busy=false;}};
    const bind=()=>{
      screen.querySelectorAll('[data-pin-key]').forEach(button=>button.onclick=()=>{if(busy||value.length>=6)return;value+=button.dataset.pinKey;render();if(value.length===6)submit();});
      screen.querySelector('[data-pin-back]').onclick=()=>{if(!busy){value=value.slice(0,-1);render();}};
      const fallback=screen.querySelector('[data-pin-password]');if(fallback)fallback.onclick=()=>finish({action:'password'});
    };
    render();dialog.showModal();
  });
}

export async function openPinVerification({verify}={}){return capturePin({title:'Enter your PIN',subtitle:'Unlock DormFlow',allowPassword:true,verify});}
export async function openPinSetup(){
  const first=await capturePin({title:'Create a 6-digit PIN',subtitle:'This PIN protects DormFlow only on this device.',allowPassword:false});
  if(first?.action!=='pin')return null;
  const second=await capturePin({title:'Confirm your PIN',subtitle:'Enter the same 6 digits again.',allowPassword:false,verify:pin=>pin===first.pin});
  return second?.action==='pin'?first.pin:null;
}
