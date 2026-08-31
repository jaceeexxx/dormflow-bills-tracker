import {serviceRequest} from './server-supabase.js';
let cached;
async function webpush(){if(!cached){const mod=await import('web-push');cached=mod.default||mod;const subject=process.env.VAPID_SUBJECT||'mailto:dormflow@example.invalid';cached.setVapidDetails(subject,process.env.VAPID_PUBLIC_KEY||'',process.env.VAPID_PRIVATE_KEY||'');}return cached;}
export async function sendPush(subscription,payload){const wp=await webpush();return wp.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth_secret}},JSON.stringify(payload),{TTL:3600});}
export function isExpiredPushError(error){const status=Number(error?.statusCode||error?.status);return status===404||status===410;}
export async function sendPushWithCleanup(subscription,payload){
  try{await sendPush(subscription,payload);return {delivered:true,expired:false};}
  catch(error){
    if(isExpiredPushError(error)&&subscription?.id){await serviceRequest(`/rest/v1/push_subscriptions?id=eq.${subscription.id}`,{method:'PATCH',body:{is_active:false,updated_at:new Date().toISOString()}});return {delivered:false,expired:true};}
    throw error;
  }
}
