import {serviceRequest,authUser} from '../lib/server-supabase.js';
import {sendPushWithCleanup} from '../lib/push-server.js';

function preferenceForType(type=''){
  if(['payment_claim','payment_verified','payment_rejected','payment_recorded'].includes(type))return 'payment_updates';
  if(['due_in_3_days','due_tomorrow','due_today','overdue'].includes(type))return 'due_reminders';
  if(type==='announcement')return 'announcements';
  if(['expense_added','utility_added','paylater_added','paylater_updated','paylater_archived'].includes(type))return 'expense_updates';
  if(['month_activated','balance_carry_forward'].includes(type))return 'month_balance_updates';
  return null;
}
function routeForType(type=''){
  if(type==='payment_claim')return '/#/review';
  if(type.startsWith('payment_'))return '/#/payments';
  if(type==='utility_added')return '/#/utilities';
  if(type==='expense_added')return '/#/expenses';
  if(['paylater_added','paylater_updated','paylater_archived'].includes(type))return '/#/paylater';
  if(['due_in_3_days','due_tomorrow','due_today','overdue','month_activated','balance_carry_forward'].includes(type))return '/#/balance';
  return '/#/notifications';
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const user=await authUser(token);const profiles=await serviceRequest(`/rest/v1/profiles?select=id,household_members(id,role,household_id,is_active)&user_id=eq.${user.id}`);
    const membership=profiles?.[0]?.household_members?.find?.(m=>m.is_active!==false)||profiles?.[0]?.household_members?.[0];
    if(!membership?.household_id)return res.status(403).json({error:'Household membership required'});
    const targetType=String(req.body?.targetType||'').trim(),targetId=String(req.body?.targetId||'').trim();
    if(!targetType||!targetId)return res.status(400).json({error:'targetType and targetId are required'});

    const notes=await serviceRequest(`/rest/v1/notifications?select=id,type,title,body,recipient_member_id,push_attempted_at,push_sent_at&household_id=eq.${membership.household_id}&target_type=eq.${encodeURIComponent(targetType)}&target_id=eq.${targetId}&order=created_at.asc`);
    let attempted=0,delivered=0,skipped=0;
    for(const note of notes||[]){
      if(note.push_attempted_at)continue;
      const prefKey=preferenceForType(note.type),stamp=new Date().toISOString();
      if(!prefKey){await serviceRequest(`/rest/v1/notifications?id=eq.${note.id}`,{method:'PATCH',body:{push_attempted_at:stamp}});skipped++;continue;}
      const prefs=await serviceRequest(`/rest/v1/notification_preferences?select=${prefKey}&member_id=eq.${note.recipient_member_id}&limit=1`);
      if(prefs?.[0]?.[prefKey]===false){await serviceRequest(`/rest/v1/notifications?id=eq.${note.id}`,{method:'PATCH',body:{push_attempted_at:stamp}});skipped++;continue;}
      const subs=await serviceRequest(`/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth_secret&member_id=eq.${note.recipient_member_id}&is_active=eq.true`);
      attempted++;let noteDelivered=0;
      for(const sub of subs||[]){try{const result=await sendPushWithCleanup(sub,{title:note.title,body:note.body,notificationId:note.id,url:routeForType(note.type)});if(result.delivered){delivered++;noteDelivered++;}}catch{}}
      await serviceRequest(`/rest/v1/notifications?id=eq.${note.id}`,{method:'PATCH',body:{push_attempted_at:stamp,...(noteDelivered?{push_sent_at:stamp}:{})}});
    }
    res.status(200).json({ok:true,attempted,delivered,skipped});
  }catch(err){res.status(400).json({error:err.message});}
}
