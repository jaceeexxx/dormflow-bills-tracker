import {userRequest,currentIdentityFromToken} from '../lib/server-supabase.js';

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const identity=await currentIdentityFromToken(token);
    const memberId=identity.member_id||identity.memberId;
    const s=req.body?.subscription;
    if(!s?.endpoint||!s?.keys?.p256dh||!s?.keys?.auth)throw new Error('Invalid push subscription');
    await userRequest(token,'/rest/v1/push_subscriptions?on_conflict=member_id,endpoint',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:{member_id:memberId,endpoint:s.endpoint,p256dh:s.keys.p256dh,auth_secret:s.keys.auth,user_agent:req.headers['user-agent']||'',is_active:true}});
    res.status(200).json({ok:true,memberId});
  }catch(err){res.status(400).json({error:err.message});}
}
