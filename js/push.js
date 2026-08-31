import {config} from './config.js';
import {supabase} from './auth.js';
export function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));}

export async function pushCapabilityStatus(){
  const supported=typeof window!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  if(!supported)return {supported:false,permission:'unsupported',subscribed:false};
  const permission=Notification.permission;
  let subscribed=false;
  try{const reg=await navigator.serviceWorker.ready;subscribed=!!(await reg.pushManager.getSubscription());}catch{}
  return {supported:true,permission,subscribed};
}

export async function enablePush(identity){
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('Push notifications are not supported on this device.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notification permission was not granted.');
  if(!config.vapidPublicKey)throw new Error('Push is not configured yet.');
  const reg=await navigator.serviceWorker.ready;let subscription=await reg.pushManager.getSubscription();
  if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(config.vapidPublicKey)});
  const json=subscription.toJSON();const memberId=identity.memberId||identity.member_id;const existing=await supabase.select('push_subscriptions',`select=id&member_id=eq.${memberId}&endpoint=eq.${encodeURIComponent(subscription.endpoint)}`);const row={member_id:memberId,endpoint:subscription.endpoint,p256dh:json.keys.p256dh,auth_secret:json.keys.auth,user_agent:navigator.userAgent,is_active:true,updated_at:new Date().toISOString()};if(existing.length)await supabase.update('push_subscriptions',`id=eq.${existing[0].id}`,row);else await supabase.insert('push_subscriptions',row);return subscription;
}
export async function disablePush(identity){if(!('serviceWorker' in navigator))return;const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(sub){await sub.unsubscribe();const memberId=identity.memberId||identity.member_id;await supabase.update('push_subscriptions',`member_id=eq.${memberId}&endpoint=eq.${encodeURIComponent(sub.endpoint)}`,{is_active:false,updated_at:new Date().toISOString()});}}
