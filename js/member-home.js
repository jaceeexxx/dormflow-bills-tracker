import {supabase} from './auth.js';
import {normalizeMemberHome,formatPeso,saveOfflineSummary,loadOfflineSummary,escapeHtml} from './read-model-v3.js';
import {buildMemberDashboard} from './dashboard-model.js';
import {icon} from './icons.js';
import {signedHouseholdMediaUrl} from './household-media.js';
import {formatBillingMonth} from './months.js';
import {householdMemberDirectory} from './member-directory.js';

export async function loadMemberHome(){
  if(!navigator.onLine){const cached=loadOfflineSummary();if(!cached)throw new Error('Reconnect to view your balance.');return {offline:true,vm:{memberId:cached.memberId,name:cached.displayName,balance:cached.lastKnownBalance,dueSoon:cached.dueSoonTotal,creditors:[],household:{total:0,categories:[]},personalCategories:[],recent:[]},lastSyncedAt:cached.lastSyncedAt};}
  const raw=await supabase.rpc('member_home_v3');const base=normalizeMemberHome(Array.isArray(raw)?raw[0]:raw);saveOfflineSummary(base);
  const [splits,claims,payments,householdMembers,balanceDetail0]=await Promise.all([
    supabase.select('expense_splits',`select=amount_cents,expenses(category,period_id,status)&member_id=eq.${base.memberId}`),
    supabase.select('payment_claims','select=id,amount_cents,paid_at,method,status,created_at&order=created_at.desc&limit=5'),
    supabase.select('payments','select=id,amount_cents,paid_at,method,status,created_at&order=paid_at.desc&limit=5'),
    householdMemberDirectory(),
    supabase.rpc('member_balance_detail_v3',{}).catch(()=>null)
  ]);
  const balanceDetail=Array.isArray(balanceDetail0)?balanceDetail0[0]:balanceDetail0;
  let vm=applyBalanceDetailToMemberHome(buildMemberDashboard({home:{vm:base},splits,claims,payments}),balanceDetail);
  const avatarPathByMemberId=new Map((householdMembers||[]).map(member=>[member.id,member.avatarPath||member.avatar_path||'']));
  vm.creditors=await Promise.all((vm.creditors||[]).map(async creditor=>{
    if(creditor.avatarUrl)return creditor;
    const path=creditor.avatarPath||avatarPathByMemberId.get(creditor.memberId||creditor.member_id)||'';
    if(!path)return creditor;
    const avatarUrl=await signedHouseholdMediaUrl(path).catch(()=> '');
    return avatarUrl?{...creditor,avatarUrl}:creditor;
  }));
  return {offline:false,vm};
}

function categoryIcon(label=''){return label.includes('Housing')?'utilities':label.includes('Grocer')?'grocery':label.includes('PayLater')?'paylater':'wallet';}
function householdMix(categories=[],total=0){let cursor=0;const colors=['#0f6b57','#f39a3d','#294c7a','#b7a164'];const stops=[];categories.slice(0,4).forEach((c,i)=>{const pct=total?c.amount/total*100:0;stops.push(`${colors[i]} ${cursor}% ${cursor+pct}%`);cursor+=pct;});if(cursor<100)stops.push(`#e8eeeb ${cursor}% 100%`);return `conic-gradient(${stops.join(',')})`;}
function activityMeta(row){const method=String(row?.method||'').trim();const date=new Date(row.date).toLocaleDateString('en-PH',{month:'short',day:'numeric'});return method&&method.toLowerCase()!=='payment'?`${escapeHtml(method)} · ${date}`:date;}
const detailCents=item=>Number(item?.amount_cents??item?.outstanding_cents??item?.amount??0);
function detailDueSoonCents(detail={}){const groups=detail.due_groups||detail.dueGroups;if(!groups)return null;const items=Array.isArray(groups)?(groups.find(group=>group.key==='due_soon')?.items||[]):(groups.due_soon||[]);return items.reduce((sum,item)=>sum+detailCents(item),0);}
export function applyBalanceDetailToMemberHome(vm={},detail=null){if(!detail||!Array.isArray(detail.creditors))return vm;const dueSoon=detailDueSoonCents(detail);return {...vm,balance:Number(detail.outstanding_cents??vm.balance??0),credit:Number(detail.credit_cents??vm.credit??0),owedToMe:Number(detail.owed_to_me_cents??vm.owedToMe??0),dueSoon:dueSoon===null?Number(vm.dueSoon||0):dueSoon,creditors:detail.creditors.map(x=>({memberId:x.member_id||x.memberId||null,name:x.display_name||x.name||x.label||'Household member',amount:detailCents(x),avatarUrl:x.avatar_url||x.avatarUrl||'',avatarPath:x.avatar_path||x.avatarPath||'',breakdown:x.breakdown||[]})).filter(x=>x.amount>0)};}

export function renderMemberHome({vm,offline=false,lastSyncedAt}={}){
  const creditors=vm.creditors?.length?vm.creditors.map(x=>`<button class="payee-card" type="button" data-payment-profile="${x.memberId||x.member_id||''}"><div class="payee-avatar ${x.avatarUrl?'has-photo':''}">${x.avatarUrl?`<img src="${escapeHtml(x.avatarUrl)}" alt="${escapeHtml(x.name)} profile photo">`:escapeHtml(x.name.slice(0,1).toUpperCase())}</div><div><strong>${escapeHtml(x.name)}</strong><small>Outstanding</small></div><b>${formatPeso(x.amount)}</b><span>›</span></button>`).join(''):`<div class="empty-state-bank compact"><strong>You're settled</strong><span>No outstanding transfers right now.</span></div>`;
  const categories=vm.household.categories||[],personal=vm.personalCategories||[],recent=vm.recent||[];
  const personalTotal=personal.reduce((sum,x)=>sum+Number(x.amountCents||0),0);
  const activeMonth=formatBillingMonth(vm.periodMonth);
  return `<section class="screen banking-dashboard member-dashboard">
    ${offline?`<div class="last-known">Last synced ${new Date(lastSyncedAt).toLocaleString('en-PH')}</div>`:''}
    <div id="announcement-slot"></div>
    <div class="bank-page-head member-head"><div><span class="screen-kicker">20 St. Paul · ${escapeHtml(activeMonth)}</span><h1>Hi, ${escapeHtml(vm.name)}</h1></div><span class="member-status-pill">${offline?'Offline':'Updated now'}</span></div>

    <section class="banking-card-carousel" tabindex="0" aria-label="Banking cards">
      <div class="banking-card-track">
        <article class="banking-carousel-card balance-carousel-card member-balance-card" data-card-label="My Balance"><span class="carousel-card-kicker">My Balance</span><strong class="carousel-main-amount">${formatPeso(vm.balance)}</strong><div class="carousel-card-meta"><span>Due soon <b>${formatPeso(vm.dueSoon||0)}</b></span><span>Credit <b>${formatPeso(vm.credit||0)}</b></span></div><div class="carousel-card-actions"><button type="button" data-action="report-payment" ${offline?'disabled':''}>${icon('transfer')} Report payment</button><button type="button" data-route="balance">${icon('wallet')} View balance</button></div></article>
        <article class="banking-carousel-card household-carousel-card" data-card-label="Household This Month"><span class="carousel-card-kicker">Household This Month</span><strong class="carousel-main-amount">${formatPeso(vm.household.total)}</strong><div class="carousel-card-meta"><span>Categories <b>${categories.length}</b></span><span>Outstanding <b>${formatPeso(vm.householdOutstanding||0)}</b></span></div><div class="mini-composition-bar">${categories.slice(0,3).map((c,i)=>`<i style="width:${vm.household.total?Math.max(6,(c.amount/vm.household.total)*100):0}%;--seg:${['#0f6b57','#f39a3d','#294c7a'][i]}"></i>`).join('')}</div></article>
        <article class="banking-carousel-card share-carousel-card" data-card-label="My Monthly Share"><span class="carousel-card-kicker">My Monthly Share</span><strong class="carousel-main-amount">${formatPeso(personalTotal)}</strong><div class="carousel-share-list">${personal.slice(0,3).map(c=>`<span><em>${escapeHtml(c.label)}</em><b>${formatPeso(c.amountCents)}</b></span>`).join('')||'<span><em>No assigned expenses</em><b>₱0.00</b></span>'}</div></article>
      </div>
      <div class="carousel-controls"><button type="button" class="carousel-arrow" data-carousel-prev aria-label="Previous card">‹</button><div class="carousel-dots">${[0,1,2].map(i=>`<button type="button" class="carousel-dot ${i===0?'active':''}" aria-label="Show card ${i+1}"></button>`).join('')}</div><button type="button" class="carousel-arrow" data-carousel-next aria-label="Next card">›</button></div>
    </section>

    <section class="bank-quick-actions member-quick-actions"><button class="bank-quick-action" type="button" data-route="utilities"><span class="quick-icon">${icon('utilities')}</span><strong>Utilities</strong></button><button class="bank-quick-action" type="button" data-route="expenses"><span class="quick-icon">${icon('grocery')}</span><strong>Expenses</strong></button><button class="bank-quick-action" type="button" data-route="paylater"><span class="quick-icon">${icon('paylater')}</span><strong>PayLater</strong></button><button class="bank-quick-action" type="button" data-route="payments"><span class="quick-icon">${icon('receipt')}</span><strong>Payments</strong></button></section>

    <div class="banking-kpi-grid member-main-grid"><article class="bank-panel pay-panel"><div class="panel-head"><div><span>Personal</span><h2>Pay these people</h2></div>${!offline?'<button class="panel-link" type="button" data-action="report-payment">Report</button>':''}</div><div class="payee-list">${creditors}</div></article><article class="bank-panel household-overview"><div class="panel-head"><div><span>${escapeHtml(activeMonth)}</span><h2>Household overview</h2></div><strong>${formatPeso(vm.household.total)}</strong></div><div class="household-composition"><div class="finance-donut small-donut" style="background:${householdMix(categories,vm.household.total)}"><div><strong>${categories.length}</strong><span>groups</span></div></div><div class="composition-legend">${categories.slice(0,4).map((c,i)=>`<div><span class="legend-dot" style="background:${['#0f6b57','#f39a3d','#294c7a','#b7a164'][i]}"></span><div><strong>${escapeHtml(c.name)}</strong><small>${vm.household.total?((c.amount/vm.household.total)*100).toFixed(1):'0.0'}%</small></div><b>${formatPeso(c.amount)}</b></div>`).join('')||'<p class="empty-line">No household expenses yet</p>'}</div></div></article></div>
    <article class="bank-panel activity-panel"><div class="panel-head"><div><span>Latest</span><h2>Recent activity</h2></div><button class="panel-link" data-route="payments">View all</button></div><div class="activity-list">${recent.map(x=>`<div class="activity-row"><span class="activity-icon">${icon(x.kind==='payment'?'transfer':'receipt')}</span><div><strong>${x.kind==='claim'?'Payment claim':'Payment'}</strong><small>${activityMeta(x)}</small></div><b>${formatPeso(x.amountCents)}</b><em class="activity-status ${escapeHtml(x.status)}">${escapeHtml(x.status)}</em></div>`).join('')||'<div class="empty-state-bank"><strong>No recent activity</strong><span>Your payment activity will appear here.</span></div>'}</div></article>
  </section>`;
}
