import {serviceRequest,currentIdentityFromToken} from '../lib/server-supabase.js';
import {sendPushWithCleanup} from '../lib/push-server.js';

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const identity=await currentIdentityFromToken(token);
    const memberId=identity.member_id||identity.memberId;
    const subs=await serviceRequest(`/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth_secret&member_id=eq.${memberId}&is_active=eq.true`);
    if(!subs?.length)return res.status(409).json({error:'No active server push subscription. Re-enable push on this device first.'});
    await new Promise(resolve=>setTimeout(resolve,5000));
    let delivered=0,failed=0,expired=0;
    for(const sub of subs){
      try{
        const result=await sendPushWithCleanup(sub,{title:'DormFlow test notification',body:'Background push is working on this device.',notificationId:`test-${Date.now()}`,url:'/#/notifications'});
        if(result.delivered)delivered++;
        else if(result.expired)expired++;
      }catch{failed++;}
    }
    return res.status(delivered?200:502).json({ok:delivered>0,attempted:subs.length,delivered,failed,expired});
  }catch(err){return res.status(400).json({error:err.message});}
}
