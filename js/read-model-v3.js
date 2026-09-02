export const peso = new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',minimumFractionDigits:2});
export function formatPeso(cents=0){return peso.format(Number(cents||0)/100).replace('PHP','₱').replace(/\s/g,'');}
export function normalizeCategory(label=''){const map={housing_utilities:'Housing & Utilities',groceries:'Groceries',paylater:'PayLater / Loans',paylater_loans:'PayLater / Loans'};return map[String(label).toLowerCase()]||String(label).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}
export function normalizeMemberHome(raw={}){
  const cats=raw.categories||{};
  return {
    memberId:raw.member_id||raw.memberId||null,
    name:raw.display_name||raw.name||'Member',
    balance:Number(raw.outstanding_cents??raw.balance??0),
    dueSoon:Number(raw.due_soon_cents??raw.dueSoon??0),
    owedToMe:Number(raw.owed_to_me_cents??0),
    credit:Number(raw.credit_cents??0),
    creditors:(raw.creditors||[]).map(x=>{
      const memberId=x.member_id||x.memberId||null;
      const name=x.label||x.display_name||x.name||'Household member';
      return {memberId,creditorLabel:memberId?null:(x.creditor_label||x.creditorLabel||x.label||null),name,amount:Number(x.amount_cents||x.amount||0)};
    }),
    household:{total:Number(raw.household_total_cents||0),categories:Object.entries(cats).map(([name,amount])=>({name:normalizeCategory(name),amount:Number(amount||0)})).sort((a,b)=>b.amount-a.amount)},
    periodId:raw.period_id||null,
    periodMonth:raw.period_month||raw.periodMonth||null
  };
}
export function makeOfflineSummary(vm,{now=Date.now()}={}){return {memberId:vm.memberId,displayName:vm.name,lastKnownBalance:Number(vm.balance||0),dueSoonTotal:Number(vm.dueSoon||0),lastSyncedAt:now};}
export function saveOfflineSummary(vm,storage=localStorage){const safe=makeOfflineSummary(vm);storage.setItem('dormflow:v3:offline-summary',JSON.stringify(safe));return safe;}
export function loadOfflineSummary(storage=localStorage){const raw=storage.getItem('dormflow:v3:offline-summary');return raw?JSON.parse(raw):null;}
export const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
