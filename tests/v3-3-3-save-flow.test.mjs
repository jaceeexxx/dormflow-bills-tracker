import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSaveFlow} from '../js/form-flow.js';

function fakeElement(tag='div'){
  return {
    tagName:tag.toUpperCase(),
    hidden:false,
    textContent:'',
    className:'',
    dataset:{},
    attributes:{},
    setAttribute(name,value){
      this.attributes[name]=String(value);
      if(name==='data-form-error')this.dataset.formError=String(value);
      if(name==='role')this.role=String(value);
      if(name==='aria-live')this.ariaLive=String(value);
    },
    removeAttribute(name){
      delete this.attributes[name];
      if(name==='hidden')this.hidden=false;
    }
  };
}

function fakeForm(){
  const nodes=[];
  const listeners=new Map();
  const button=fakeElement('button');
  button.textContent='Save';
  button.before=node=>nodes.push(node);
  const form={
    ownerDocument:{createElement:fakeElement},
    querySelector(selector){
      if(selector.includes('button[type="submit"]')||selector.includes('input[type="submit"]'))return button;
      if(selector==='[data-form-error]')return nodes.find(node=>Object.hasOwn(node.dataset,'formError'))||null;
      return null;
    },
    addEventListener(type,handler){listeners.set(type,handler);},
    append(node){nodes.push(node);},
    submit(){return listeners.get('submit')?.({preventDefault(){},currentTarget:form});}
  };
  return {form,button,nodes};
}

test('bindSaveFlow shows inline save errors and keeps the sheet open', async()=>{
  const originalFormData=globalThis.FormData;
  globalThis.FormData=class { constructor(form){this.form=form;} };
  try{
    const {form,button}=fakeForm();
    let closed=false;
    const toasts=[];
    const flow=bindSaveFlow(form,{
      idleLabel:'Save',
      save:async()=>{throw new Error('permission denied for table profiles');},
      close:()=>{closed=true;},
      notify:(message,type)=>toasts.push({message,type})
    });

    await assert.rejects(()=>flow.submit({preventDefault(){},currentTarget:form}),/permission denied/);

    const error=form.querySelector('[data-form-error]');
    assert.equal(closed,false);
    assert.equal(button.disabled,false);
    assert.equal(button.textContent,'Save');
    assert.ok(error,'inline form error should be created');
    assert.equal(error.hidden,false);
    assert.equal(error.textContent,'permission denied for table profiles');
    assert.deepEqual(toasts.at(-1),{message:'permission denied for table profiles',type:'error'});
  }finally{
    globalThis.FormData=originalFormData;
  }
});

test('bindSaveFlow clears a previous inline error before retrying a save', async()=>{
  const originalFormData=globalThis.FormData;
  globalThis.FormData=class { constructor(form){this.form=form;} };
  try{
    const {form}=fakeForm();
    let attempt=0;
    const flow=bindSaveFlow(form,{
      save:async()=>{attempt++;if(attempt===1)throw new Error('first failure');return 'ok';},
      notify:()=>{}
    });

    await assert.rejects(()=>flow.submit({preventDefault(){},currentTarget:form}),/first failure/);
    assert.equal(form.querySelector('[data-form-error]').hidden,false);

    await flow.submit({preventDefault(){},currentTarget:form});

    assert.equal(form.querySelector('[data-form-error]').hidden,true);
    assert.equal(form.querySelector('[data-form-error]').textContent,'');
  }finally{
    globalThis.FormData=originalFormData;
  }
});
