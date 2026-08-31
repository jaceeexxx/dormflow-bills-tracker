import {supabase} from './auth.js';
import {formatPeso,escapeHtml} from './read-model-v3.js';
import {icon} from './icons.js';

export async function loadMemberBalance(){
  const raw0=await supabase.rpc('member_balance_v3'),raw=Array.isArray(raw0)?raw0[0]:raw0;
  const memberId=raw?.member_id;const [open,splits]=await Promise.all([
    supabase.rpc('open_obligations_v3',{}).catch(()=>[]),
    memberId?supabase.select('expense_splits',`select=amount_cents,expenses(category,period_id,status,due_date)&member_id=eq.${memberId}`).catch(()=>[]):[]
  ]);
  const cats=new Map();for(const row of splits||[]){if(row.expenses?.status&&row.expenses.status!=='active')continue;const key=row.expenses?.category||'Other';cats.set(key,(cats.get(key)||0)+Number(row.amount_cents||0));}
  return {...raw,open_obligations:open||[],category_breakdown:[...cats.entries()].map(([label,amount_cents])=>({label,amount_cents}))};
}

export function renderMemberBalance(raw={}){
  const outstanding=Number(raw.outstanding_cents||0),owed=Number(raw.owed_to_me_cents||0),credit=Number(raw.credit_cents||0),net=outstanding-owed-credit;
  const creditors=(raw.creditors||[]).map(x=>`<button class="payee-card balance-payee" type="button" data-payment-profile="${x.member_id||''}"><div class="payee-avatar">${escapeHtml(String(x.label||'H').slice(0,1))}</div><div><strong>${escapeHtml(x.label)}</strong><small>Outstanding transfer</small></div><b>${formatPeso(x.amount_cents)}</b><span>›</span></button>`).join('')||'<div class="empty-state-bank compact"><strong>You are settled</strong><span>No outstanding balances right now.</span></div>';
  const due=(raw.open_obligations||[]).map(x=>`<div class="finance-detail-row"><span><strong>${escapeHtml(x.source_category||'Expense')}</strong><small>${x.due_date?new Date(x.due_date+'T00:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'}):'No due date'}</small></span><b>${formatPeso(x.outstanding_cents)}</b></div>`).join('')||'<div class="empty-state-bank compact"><strong>No due items</strong><span>Your current obligations have no upcoming due dates.</span></div>';
  const cats=(raw.category_breakdown||[]).sort((a,b)=>b.amount_cents-a.amount_cents).map(x=>`<div class="finance-detail-row"><span><strong>${escapeHtml(x.label.replaceAll('_',' '))}</strong><small>Your assigned share</small></span><b>${formatPeso(x.amount_cents)}</b></div>`).join('')||'<div class="empty-state-bank compact"><strong>No category data</strong><span>Category shares will appear here.</span></div>';
  return `<section class="screen banking-dashboard balance-screen"><div class="bank-page-head"><div><span class="screen-kicker">Personal finances</span><h1>Balance</h1></div><button class="mode-switch-card compact-mode" type="button" data-route="payments"><span>${icon('transfer')}</span><div><strong>Payments</strong><small>History & claims</small></div><b>›</b></button></div>
    <section class="account-position-card bank-balance-card"><div><span>Current outstanding</span><strong>${formatPeso(outstanding)}</strong><small>${outstanding>0?'Open household balance':'You are settled'}</small></div><button type="button" data-action="report-payment">${icon('transfer')} Report payment</button></section>
    <section class="balance-summary-grid"><article class="summary-bank-card"><span class="summary-icon">${icon('wallet')}</span><div><small>Owed to you</small><strong>${formatPeso(owed)}</strong></div></article><article class="summary-bank-card"><span class="summary-icon accent">${icon('balance')}</span><div><small>Credits</small><strong>${formatPeso(credit)}</strong></div></article><article class="summary-bank-card net-card"><span class="summary-icon navy">${icon('analytics')}</span><div><small>Net position</small><strong>${formatPeso(net)}</strong></div></article></section>
    <div class="banking-kpi-grid balance-main-grid"><article class="bank-panel"><div class="panel-head"><div><span>Transfers</span><h2>You owe</h2></div><span class="panel-badge">${(raw.creditors||[]).length} open</span></div><div class="payee-list">${creditors}</div></article><article class="bank-panel"><div class="panel-head"><div><span>Receivable</span><h2>Owed to you</h2></div></div><div class="balance-feature-amount"><strong>${formatPeso(owed)}</strong><span>Other roommates' open obligations to you</span></div></article></div>
    <div class="banking-kpi-grid"><article class="bank-panel"><div class="panel-head"><div><span>Timing</span><h2>Due schedule</h2></div></div><div class="finance-detail-list">${due}</div></article><article class="bank-panel"><div class="panel-head"><div><span>Your share</span><h2>Category breakdown</h2></div></div><div class="finance-detail-list">${cats}</div></article></div>
    <article class="bank-panel"><div class="panel-head"><div><span>History</span><h2>Previous months</h2></div><button class="panel-link" data-route="expenses">Browse expenses</button></div><p class="bank-panel-copy">Review earlier billing periods and compare how your household obligations changed over time.</p></article>
  </section>`;
}
