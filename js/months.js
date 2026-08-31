import {supabase} from './auth.js';

export function formatBillingMonth(month){
  if(!month)return 'No active month';
  const iso=String(month).slice(0,10);
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-PH',{month:'long',year:'numeric'});
}

export function nextBillingMonth(month){
  const base=month?new Date(`${String(month).slice(0,10)}T00:00:00`):new Date();
  base.setDate(1);base.setMonth(base.getMonth()+1);
  return base.toISOString().slice(0,7)+'-01';
}

export async function setActiveMonth(month){return supabase.rpc('set_active_month_v3',{p_month:month});}
