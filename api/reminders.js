import {serviceRequest} from '../lib/server-supabase.js';
import {sendPushWithCleanup} from '../lib/push-server.js';

const TZ='Asia/Manila';
function ymdInManila(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=t=>parts.find(p=>p.type===t)?.value;return `${get('year')}-${get('month')}-${get('day')}`;
}
function ymdUtcMs(value){const [y,m,d]=String(value).split('-').map(Number);return Date.UTC(y,m-1,d);}
function addDays(value,n){return new Date(ymdUtcMs(value)+n*86400000).toISOString().slice(0,10);}
function dayDelta(from,to){return Math.round((ymdUtcMs(to)-ymdUtcMs(from))/86400000);}
function reminderStage(today,due){const d=dayDelta(today,due);return d===3?'due_in_3_days':d===1?'due_tomorrow':d===0?'due_today':d<0?'overdue':null;}
function dedupeKey(id,stage,due,today){if(stage==='due_in_3_days')return `due:${id}:3d:${due}`;if(stage==='due_tomorrow')return `due:${id}:1d:${due}`;if(stage==='due_today')return `due:${id}:today:${due}`;if(stage==='overdue')return `overdue:${id}:${today}`;throw new Error('Unknown reminder stage');}
function copy(stage,amount){const money=`₱${(Number(amount)/100).toFixed(2)}`;if(stage==='due_in_3_days')return ['Due in 3 days',`${money} remains due in 3 days.`];if(stage==='due_tomorrow')return ['Due tomorrow',`${money} remains due tomorrow.`];if(stage==='due_today')return ['Due today',`${money} is due today.`];return ['Balance overdue',`${money} remains overdue. Please settle it as soon as you can.`];}

export default async function handler(req,res){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!process.env.CRON_SECRET||token!==process.env.CRON_SECRET)return res.status(401).json({error:'Unauthorized'});
  try{
    const today=ymdInManila(),through=addDays(today,3);
    const obligations=await serviceRequest(`/rest/v1/obligation_balances_v3?select=id,household_id,debtor_member_id,outstanding_cents,due_date&outstanding_cents=gt.0&due_date=not.is.null&due_date=lte.${through}`);
    let created=0,attempted=0,delivered=0;
    for(const o of obligations){
      const stage=reminderStage(today,o.due_date);if(!stage)continue;
      const key=dedupeKey(o.id,stage,o.due_date,today),[title,body]=copy(stage,o.outstanding_cents);
      let inserted=await serviceRequest(`/rest/v1/notifications?on_conflict=recipient_member_id,dedupe_key`,{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:{household_id:o.household_id,recipient_member_id:o.debtor_member_id,type:stage,title,body,target_type:'obligation',target_id:o.id,dedupe_key:key}});
      let note=inserted?.[0];if(note)created++;
      if(!note){const existing=await serviceRequest(`/rest/v1/notifications?select=id,push_attempted_at,push_sent_at&recipient_member_id=eq.${o.debtor_member_id}&dedupe_key=eq.${encodeURIComponent(key)}&limit=1`);note=existing?.[0];}
      if(!note||note.push_attempted_at)continue;
      const prefs=await serviceRequest(`/rest/v1/notification_preferences?select=due_reminders&member_id=eq.${o.debtor_member_id}&limit=1`);if(prefs?.[0]?.due_reminders===false)continue;
      const subs=await serviceRequest(`/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth_secret&member_id=eq.${o.debtor_member_id}&is_active=eq.true`);
      attempted++;let noteDelivered=0;
      for(const sub of subs){try{const result=await sendPushWithCleanup(sub,{title,body,notificationId:note.id,url:'/#/balance'});if(result.delivered){delivered++;noteDelivered++;}}catch{}}
      const stamp=new Date().toISOString();await serviceRequest(`/rest/v1/notifications?id=eq.${note.id}`,{method:'PATCH',body:{push_attempted_at:stamp,...(noteDelivered?{push_sent_at:stamp}:{})}});
    }
    res.status(200).json({ok:true,timeZone:TZ,calendarDate:today,created,attempted,delivered});
  }catch(err){res.status(500).json({error:err.message});}
}
