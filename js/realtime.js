import {supabase} from './auth.js';

const TABLE_TOPICS={
  expenses:['expenses','utilities','home','balance'],
  expense_splits:['expenses','utilities','home','balance'],
  obligations:['payments','paylater','home','balance'],
  payments:['payments','home','balance'],
  payment_allocations:['payments','home','balance'],
  payment_claims:['payments','notifications','home','balance'],
  paylater_accounts:['paylater','home','balance'],
  paylater_installments:['paylater','home','balance'],
  profiles:['profile'],
  member_payment_methods:['profile','payments'],
  billing_periods:['month','home','balance','utilities','expenses','paylater'],
  announcements:['notifications','home'],
  notifications:['notifications']
};
const CHANGES=Object.keys(TABLE_TOPICS).map(table=>({event:'*',schema:'public',table}));
let active=null,activeKey='',flushTimer=null,pending=new Set();

export function topicsForRealtimeChange(change={}){return TABLE_TOPICS[change.table]||[];}
export function stopHouseholdRealtime(){if(active)active.close();active=null;activeKey='';clearTimeout(flushTimer);flushTimer=null;pending.clear();}
export function startHouseholdRealtime({householdId,memberId,onInvalidate=()=>{}}={}){
  const key=`${householdId||''}:${memberId||''}`;if(!householdId||!memberId)return null;if(active&&key===activeKey)return active;stopHouseholdRealtime();activeKey=key;
  const flush=()=>{flushTimer=null;const topics=[...pending];pending.clear();if(topics.length)onInvalidate(topics);};
  active=supabase.createRealtimeChannel({name:`dormflow-${householdId}`,changes:CHANGES,onChange:change=>{const row=change.record||change.new||change;const old=change.old_record||change.old||{};if((row.household_id||old.household_id)&&(row.household_id||old.household_id)!==householdId)return;if(change.table==='notifications'&&(row.member_id||old.member_id)&&(row.member_id||old.member_id)!==memberId)return;for(const topic of topicsForRealtimeChange(change))pending.add(topic);clearTimeout(flushTimer);flushTimer=setTimeout(flush,120);}});
  return active;
}
