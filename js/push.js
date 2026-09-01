import {config} from './config.js';
import {supabase} from './auth.js';

export function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

function keyBytes(value){
  if(!value)return null;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  try{return new Uint8Array(value);}catch{return null;}
}

export function subscriptionMatchesVapid(subscription,vapidPublicKey=config.vapidPublicKey){
  if(!subscription?.options?.applicationServerKey||!vapidPublicKey)return false;
  const actual=keyBytes(subscription.options.applicationServerKey),expected=urlBase64ToUint8Array(vapidPublicKey);
  if(!actual||actual.length!==expected.length)return false;
  for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])return false;
  return true;
}

function memberId(identity){return identity?.memberId||identity?.member_id||null;}
async function serverRegistration(identity,subscription){
  const id=memberId(identity);if(!id||!subscription?.endpoint)return false;
  try{
    const rows=await supabase.select('push_subscriptions',`select=id,is_active&member_id=eq.${id}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}&is_active=eq.true&limit=1`);
    return !!rows?.length;
  }catch{return false;}
}

export async function pushCapabilityStatus(identity=null){
  const supported=typeof window!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  if(!supported)return {supported:false,permission:'unsupported',subscribed:false,serverRegistered:false,vapidMatches:false,installed:false,active:false};
  const permission=Notification.permission;
  let subscription=null;
  try{const reg=await navigator.serviceWorker.ready;subscription=await reg.pushManager.getSubscription();}catch{}
  const subscribed=!!subscription;
  const vapidMatches=subscribed?subscriptionMatchesVapid(subscription):false;
  const serverRegistered=subscribed&&identity?await serverRegistration(identity,subscription):false;
  const installed=!!(window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator?.standalone===true);
  const active=permission==='granted'&&subscribed&&vapidMatches&&(!identity||serverRegistered);
  return {supported:true,permission,subscribed,serverRegistered,vapidMatches,installed,active};
}

async function registerWithServer(subscription){
  const token=supabase.getSession()?.access_token;
  if(!token)throw new Error('Sign in again before enabling push.');
  const json=subscription.toJSON();
  const response=await fetch('/api/push-subscribe',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({subscription:{endpoint:subscription.endpoint,keys:{p256dh:json.keys?.p256dh,auth:json.keys?.auth}}})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Could not register this device for push.');
  return data;
}

export async function enablePush(identity){
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('Push notifications are not supported on this device.');
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw new Error('Notification permission was not granted.');
  if(!config.vapidPublicKey)throw new Error('Push is not configured yet.');
  const reg=await navigator.serviceWorker.ready;
  let subscription=await reg.pushManager.getSubscription();
  if(subscription&&!subscriptionMatchesVapid(subscription,config.vapidPublicKey)){
    const oldEndpoint=subscription.endpoint;
    await subscription.unsubscribe();
    const id=memberId(identity);
    if(id&&oldEndpoint)await supabase.update('push_subscriptions',`member_id=eq.${id}&endpoint=eq.${encodeURIComponent(oldEndpoint)}`,{is_active:false,updated_at:new Date().toISOString()}).catch(()=>{});
    subscription=null;
  }
  if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(config.vapidPublicKey)});
  await registerWithServer(subscription);
  if(!subscriptionMatchesVapid(subscription,config.vapidPublicKey))throw new Error('Push subscription could not be verified. Tap Enable push again.');
  return subscription;
}

export async function disablePush(identity){
  if(!('serviceWorker' in navigator))return;
  const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();
  if(sub){
    const endpoint=sub.endpoint;await sub.unsubscribe();const id=memberId(identity);
    if(id)await supabase.update('push_subscriptions',`member_id=eq.${id}&endpoint=eq.${encodeURIComponent(endpoint)}`,{is_active:false,updated_at:new Date().toISOString()});
  }
}

export async function sendPushTest(){
  const token=supabase.getSession()?.access_token;if(!token)throw new Error('Sign in again before testing push.');
  const response=await fetch('/api/push-test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Push test failed.');
  if(!data.delivered)throw new Error(data.failed?'The push service rejected the test. Re-enable push and try again.':'No active device subscription accepted the test. Re-enable push and try again.');
  return data;
}
