import {serviceRequest,currentIdentityFromToken} from '../lib/server-supabase.js';
import {sendPushWithCleanup} from '../lib/push-server.js';

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const identity=await currentIdentityFromToken(token);
    const householdId=identity.household_id||identity.householdId;
    if(identity.role!=='admin')return res.status(403).json({error:'Admin required'});
    const notificationId=req.body?.notificationId;
    const notes=await serviceRequest(`/rest/v1/notifications?select=id,title,body,recipient_member_id&household_id=eq.${householdId}&id=eq.${notificationId}`);
    const note=notes?.[0];
    if(!note)throw new Error('Notification not found');
    const subs=await serviceRequest(`/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth_secret&member_id=eq.${note.recipient_member_id}&is_active=eq.true`);
    let delivered=0;
    for(const sub of subs||[]){
      try{const result=await sendPushWithCleanup(sub,{title:note.title,body:note.body,notificationId:note.id,url:'/#/notifications'});if(result.delivered)delivered++;}
      catch{}
    }
    res.status(200).json({ok:true,attempted:subs.length,delivered});
  }catch(err){res.status(400).json({error:err.message});}
}
