import {supabase} from './auth.js';
import {escapeHtml} from './read-model-v3.js';
import {icon} from './icons.js';

export function defaultNotificationPreferences(){return {payment_updates:true,due_reminders:true,announcements:true,expense_updates:true,month_balance_updates:true};}

export function pushPreferenceForType(type=''){
  if(['payment_claim','payment_verified','payment_rejected','payment_recorded','payment_received'].includes(type))return 'payment_updates';
  if(['due_in_3_days','due_tomorrow','due_today','overdue'].includes(type))return 'due_reminders';
  if(type==='announcement')return 'announcements';
  if(['expense_added','utility_added','paylater_added','paylater_updated','paylater_archived'].includes(type))return 'expense_updates';
  if(['month_activated','balance_carry_forward'].includes(type))return 'month_balance_updates';
  return null;
}

// Compatibility helper: preferences now gate push only, never Inbox creation.
export function shouldNotify(type,prefs=defaultNotificationPreferences()){const key=pushPreferenceForType(type);return key?!!prefs[key]:false;}

export function dueReminderKey(obligationId,stage,dueDate,calendarDate=null){
  if(stage==='due_in_3_days')return `due:${obligationId}:3d:${dueDate}`;
  if(stage==='due_tomorrow')return `due:${obligationId}:1d:${dueDate}`;
  if(stage==='due_today')return `due:${obligationId}:today:${dueDate}`;
  if(stage==='overdue'&&calendarDate)return `overdue:${obligationId}:${calendarDate}`;
  throw new Error('Unknown reminder stage');
}
export async function loadNotifications(){return supabase.select('notifications','select=id,type,title,body,target_type,target_id,read_at,created_at&order=created_at.desc&limit=100');}
export async function loadPreferences(memberId){const rows=await supabase.select('notification_preferences',`select=*&member_id=eq.${memberId}`);return rows[0]||{member_id:memberId,...defaultNotificationPreferences()};}
export async function savePreferences(memberId,prefs){const existing=await supabase.select('notification_preferences',`select=member_id&member_id=eq.${memberId}`);if(existing.length)return supabase.update('notification_preferences',`member_id=eq.${memberId}`,prefs);return supabase.insert('notification_preferences',{member_id:memberId,...prefs});}
export async function markRead(id){return supabase.update('notifications',`id=eq.${id}`,{read_at:new Date().toISOString()});}

export function notificationRoute(note={},identity={}){
  const type=note.type||'';
  if(['payment_claim','payment_verified','payment_rejected','payment_recorded','payment_received'].includes(type))return identity.role==='admin'&&type==='payment_claim'?'review':'payments';
  if(type==='utility_added')return 'utilities';
  if(type==='expense_added')return 'expenses';
  if(['paylater_added','paylater_updated','paylater_archived'].includes(type))return 'paylater';
  if(type==='announcement')return identity.role==='admin'?'manage-announcements':'notifications';
  if(['due_in_3_days','due_tomorrow','due_today','overdue','month_activated','balance_carry_forward'].includes(type))return 'balance';
  return 'notifications';
}


export async function requestPushForTarget({targetType,targetId}={}){
  const token=supabase.getSession()?.access_token;
  if(!token||!targetType||!targetId)return {ok:false,skipped:true};
  try{
    const response=await fetch('/api/push-event',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({targetType,targetId})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return {ok:false,error:data.error||'Push delivery failed'};
    return data;
  }catch(error){return {ok:false,error:error?.message||String(error)};}
}
export function queuePushForTarget(target){
  const job=Promise.resolve().then(()=>requestPushForTarget(target)).catch(error=>({ok:false,error:error?.message||String(error)}));
  return {ok:true,queued:true,job};
}

function notificationIcon(type=''){if(type.includes('payment'))return 'payments';if(type==='announcement')return 'announcement';if(type.includes('due')||type==='overdue')return 'calendar';if(type.includes('expense')||type==='utility_added'||type.includes('paylater'))return 'wallet';return 'notifications';}
export function renderNotifications(rows=[]){const unread=rows.filter(n=>!n.read_at).length;return `<section class="screen banking-dashboard notifications-screen"><div class="bank-page-head"><div><span class="screen-kicker">Inbox · Always on</span><h1>Notifications</h1></div><button class="mode-switch-card compact-mode" data-route="notification-settings" type="button"><span>${icon('settings')}</span><div><strong>Push settings</strong><small>Choose which alerts reach your device</small></div><b>›</b></button></div><section class="review-summary-card notification-summary"><span class="summary-icon">${icon('notifications')}</span><div><small>Unread</small><strong>${unread}</strong></div><div><small>Total</small><strong>${rows.length}</strong></div></section><article class="bank-panel"><div class="notification-bank-list">${rows.map(n=>`<button class="notification-bank-card ${n.read_at?'':'unread'}" data-notification-id="${n.id}" data-notification-type="${escapeHtml(n.type)}"><span class="notification-card-icon">${icon(notificationIcon(n.type))}</span><div><strong>${escapeHtml(n.title)}</strong><small>${escapeHtml(n.body)}</small></div><time>${new Date(n.created_at).toLocaleDateString('en-PH',{month:'short',day:'numeric'})}</time>${n.read_at?'':'<i></i>'}</button>`).join('')||'<div class="empty-state-bank"><strong>No notifications</strong><span>Payment, due-date and household updates will appear here.</span></div>'}</div></article></section>`;}
