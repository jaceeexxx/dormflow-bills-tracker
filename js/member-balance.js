import {supabase} from './auth.js';
import {formatPeso,escapeHtml} from './read-model-v3.js';
import {icon} from './icons.js';
import {signedHouseholdMediaUrl} from './household-media.js';

const DAY_MS=24*60*60*1000;
const DUE_ORDER=['overdue','due_soon','later','no_due_date'];
const DUE_META={
  overdue:{label:'Overdue',icon:'overdue'},
  due_soon:{label:'Due within 5 days',icon:'dueSoon'},
  later:{label:'Later this month',icon:'calendar'},
  no_due_date:{label:'No due date',icon:'calendar'}
};

const asNumber=value=>Number(value||0);
const todayIso=()=>new Date().toISOString().slice(0,10);
const dateOnly=value=>String(value||'').slice(0,10);
function parseDateKey(value){const date=dateOnly(value);const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);return m?Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])):null;}
function displayDate(value){const date=dateOnly(value);if(!date)return 'No due date';return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH',{month:'short',day:'numeric'});}
function categoryLabel(item={}){return String(item.category||item.source_category||item.label||item.source_type||'Expense').replaceAll('_',' ');}
function memberName(item={}){return String(item.display_name||item.creditor_display_name||item.name||item.label||'Housemate');}
function dueMeta(key){return DUE_META[key]||DUE_META.no_due_date;}

export function classifyDueStatus(item={},today=todayIso()){
  const due=parseDateKey(item.due_date||item.earliest_due_date);
  const now=parseDateKey(today);
  if(due===null||now===null)return 'no_due_date';
  const diff=Math.round((due-now)/DAY_MS);
  if(diff<0)return 'overdue';
  if(diff<=5)return 'due_soon';
  return 'later';
}

export function summarizeCategories(items=[]){
  const labels=[];
  for(const item of items){
    const label=categoryLabel(item);
    if(label&&!labels.includes(label))labels.push(label);
  }
  if(!labels.length)return 'Open items';
  return labels.length===1?labels[0]:`${labels[0]} + ${labels.length-1} more`;
}

function normalizeBreakdown(items=[]){
  return (items||[]).map(item=>({
    ...item,
    category:categoryLabel(item),
    amount_cents:asNumber(item.amount_cents??item.outstanding_cents??item.remaining_amount_cents),
    due_date:dateOnly(item.due_date||item.earliest_due_date),
    due_status:item.due_status||item.status||classifyDueStatus(item)
  })).filter(item=>item.amount_cents>0);
}

function strongestStatus(items=[]){
  const statuses=items.map(item=>item.due_status||classifyDueStatus(item));
  return DUE_ORDER.find(status=>statuses.includes(status))||'no_due_date';
}

async function enrichCreditorAvatars(creditors=[]){
  return Promise.all((creditors||[]).map(async creditor=>{
    if(creditor.avatar_url)return creditor;
    const path=creditor.avatar_path||creditor.avatarPath;
    if(!path)return creditor;
    const avatar_url=await signedHouseholdMediaUrl(path).catch(()=> '');
    return avatar_url?{...creditor,avatar_url}:creditor;
  }));
}

export async function loadMemberBalance(){
  try{
    const detail0=await supabase.rpc('member_balance_detail_v3',{});
    const detail=Array.isArray(detail0)?detail0[0]:detail0;
    if(detail?.member_id||detail?.creditors||detail?.due_groups){
      return {...detail,creditors:await enrichCreditorAvatars(detail.creditors||[])};
    }
  }catch{}

  const raw0=await supabase.rpc('member_balance_v3'),raw=Array.isArray(raw0)?raw0[0]:raw0;
  const memberId=raw?.member_id;const [open,splits]=await Promise.all([
    supabase.rpc('open_obligations_v3',{}).catch(()=>[]),
    memberId?supabase.select('expense_splits',`select=amount_cents,expenses(category,period_id,status,due_date)&member_id=eq.${memberId}`).catch(()=>[]):[]
  ]);
  const cats=new Map();for(const row of splits||[]){if(row.expenses?.status&&row.expenses.status!=='active')continue;const key=row.expenses?.category||'Other';cats.set(key,(cats.get(key)||0)+asNumber(row.amount_cents));}
  return {...raw,open_obligations:open||[],category_breakdown:[...cats.entries()].map(([label,amount_cents])=>({category:label,label,amount_cents}))};
}

function avatarMarkup(name,url){
  const initial=escapeHtml(String(name||'H').slice(0,1).toUpperCase());
  return `<div class="payee-avatar${url?' has-photo':''}">${url?`<img src="${escapeHtml(url)}" alt="${escapeHtml(name)} profile photo">`:initial}</div>`;
}

function renderStatusBadge(status){
  const meta=dueMeta(status);
  return `<span class="due-status-badge ${status}">${icon(meta.icon)} ${escapeHtml(meta.label)}</span>`;
}

function normalizeCreditors(creditors=[]){
  return (creditors||[]).map(creditor=>{
    const breakdown=normalizeBreakdown(creditor.breakdown||creditor.items||[]);
    const status=creditor.due_status||strongestStatus(breakdown.length?breakdown:[creditor]);
    return {
      ...creditor,
      display_name:memberName(creditor),
      amount_cents:asNumber(creditor.amount_cents),
      due_status:status,
      breakdown
    };
  }).filter(creditor=>creditor.amount_cents>0);
}

function deriveDueGroups(raw={}){
  const explicit=raw.due_groups||raw.dueGroups;
  if(Array.isArray(explicit)&&explicit.length){
    const byKey=new Map(explicit.map(group=>[group.key,{...group,items:normalizeBreakdown(group.items||[])}]));
    return DUE_ORDER.map(key=>({key,label:dueMeta(key).label,amount_cents:asNumber(byKey.get(key)?.amount_cents),items:byKey.get(key)?.items||[]}));
  }
  if(explicit&&typeof explicit==='object'){
    return DUE_ORDER.map(key=>{
      const items=normalizeBreakdown(explicit[key]||[]);
      return {key,label:dueMeta(key).label,amount_cents:items.reduce((sum,item)=>sum+asNumber(item.amount_cents),0),items};
    });
  }
  const byKey=new Map(DUE_ORDER.map(key=>[key,[]]));
  for(const item of raw.open_obligations||[]){
    const normalized=normalizeBreakdown([{...item,amount_cents:item.outstanding_cents??item.amount_cents}])[0];
    if(normalized)byKey.get(normalized.due_status)?.push(normalized);
  }
  return DUE_ORDER.map(key=>{
    const items=byKey.get(key)||[];
    return {key,label:dueMeta(key).label,amount_cents:items.reduce((sum,item)=>sum+asNumber(item.amount_cents),0),items};
  });
}

function renderCreditorRows(creditors=[]){
  if(!creditors.length)return '<div class="empty-state-bank compact"><strong>You are settled</strong><span>No outstanding balances right now.</span></div>';
  return creditors.map(creditor=>{
    const id=escapeHtml(creditor.member_id||creditor.memberId||'');
    const name=creditor.display_name;
    const categorySummary=summarizeCategories(creditor.breakdown);
    return `<button class="payee-card balance-payee-v2 due-status-${creditor.due_status}" type="button" data-payment-profile="${id}">
      ${avatarMarkup(name,creditor.avatar_url||creditor.avatarUrl)}
      <div class="payee-main-copy"><div class="payee-line"><strong>${escapeHtml(name)}</strong>${renderStatusBadge(creditor.due_status)}</div><small>${escapeHtml(categorySummary)}</small></div>
      <div class="payee-amount-block"><b>${formatPeso(creditor.amount_cents)}</b><span aria-hidden="true">&rsaquo;</span></div>
    </button>`;
  }).join('');
}

function renderDueItem(item){
  return `<div class="finance-detail-row balance-due-row due-status-${item.due_status}">
    <span class="due-row-icon">${icon(dueMeta(item.due_status).icon)}</span>
    <span><strong>${escapeHtml(categoryLabel(item))}</strong><small>${escapeHtml(memberName(item))} &middot; ${displayDate(item.due_date)}</small></span>
    <b>${formatPeso(item.amount_cents)}</b>
  </div>`;
}

function renderDueGroups(groups=[]){
  return groups.map(group=>{
    const meta=dueMeta(group.key);
    const items=group.items||[];
    return `<section class="balance-due-group ${group.key}"><div class="balance-due-group-head"><span>${icon(meta.icon)} ${escapeHtml(meta.label)}</span><b>${formatPeso(group.amount_cents)}</b></div>${items.length?items.map(renderDueItem).join(''):`<div class="empty-state-bank compact mini-empty"><strong>No ${escapeHtml(meta.label.toLowerCase())}</strong><span>This group is clear.</span></div>`}</section>`;
  }).join('');
}

function renderCategories(categories=[]){
  if(!categories.length)return '<div class="empty-state-bank compact"><strong>No category data</strong><span>Category shares will appear here.</span></div>';
  return [...categories].sort((a,b)=>asNumber(b.amount_cents)-asNumber(a.amount_cents)).map(item=>`<div class="finance-detail-row category-detail-row"><span class="due-row-icon">${icon('category')}</span><span><strong>${escapeHtml(categoryLabel(item))}</strong><small>Your assigned share</small></span><b>${formatPeso(item.amount_cents)}</b></div>`).join('');
}

function renderCreditBreakdown(items=[]){
  if(!items.length)return '';
  return `<div class="credit-breakdown-list" data-credit-breakdown>${items.map(item=>`<span><small>Credit with ${escapeHtml(memberName(item))}</small><b>${formatPeso(item.amount_cents)}</b></span>`).join('')}</div>`;
}

export function renderMemberBalance(raw={}){
  const creditors=normalizeCreditors(raw.creditors||[]);
  const dueGroups=deriveDueGroups(raw);
  const categories=(raw.category_breakdown||[]).map(item=>({...item,amount_cents:asNumber(item.amount_cents)})).filter(item=>item.amount_cents>0);
  const creditBreakdown=(raw.credit_breakdown||raw.creditBreakdown||[]).map(item=>({...item,amount_cents:asNumber(item.amount_cents??item.remaining_amount_cents)})).filter(item=>item.amount_cents>0);
  const outstanding=asNumber(raw.outstanding_cents),owed=asNumber(raw.owed_to_me_cents),credit=asNumber(raw.credit_cents),net=raw.net_position_cents===undefined?outstanding-owed-credit:asNumber(raw.net_position_cents);
  return `<section class="screen banking-dashboard balance-screen"><div class="bank-page-head"><div><span class="screen-kicker">Personal finances</span><h1>Balance</h1></div><button class="mode-switch-card compact-mode" type="button" data-route="payments"><span>${icon('transfer')}</span><div><strong>Payments</strong><small>History & claims</small></div><b>&rsaquo;</b></button></div>
    <section class="account-position-card bank-balance-card"><div><span>Current outstanding</span><strong>${formatPeso(outstanding)}</strong><small>${outstanding>0?'Open household balance':'You are settled'}</small></div><button type="button" data-action="report-payment">${icon('transfer')} Report payment</button></section>
    <section class="balance-summary-grid"><article class="summary-bank-card"><span class="summary-icon">${icon('wallet')}</span><div><small>Owed to you</small><strong>${formatPeso(owed)}</strong></div></article><article class="summary-bank-card credit-summary-card"><span class="summary-icon accent">${icon('credit')}</span><div><small>Credits</small><strong>${formatPeso(credit)}</strong></div>${renderCreditBreakdown(creditBreakdown)}</article><article class="summary-bank-card net-card"><span class="summary-icon navy">${icon('analytics')}</span><div><small>Net position</small><strong>${formatPeso(net)}</strong></div></article></section>
    <div class="banking-kpi-grid balance-main-grid"><article class="bank-panel"><div class="panel-head"><div><span>Transfers</span><h2>You owe</h2></div><span class="panel-badge">${creditors.length} open</span></div><div class="payee-list">${renderCreditorRows(creditors)}</div></article><article class="bank-panel"><div class="panel-head"><div><span>Receivable</span><h2>Owed to you</h2></div></div><div class="balance-feature-amount"><strong>${formatPeso(owed)}</strong><span>Other roommates' open obligations to you</span></div></article></div>
    <div class="banking-kpi-grid"><article class="bank-panel balance-due-panel"><div class="panel-head"><div><span>Timing</span><h2>Due schedule</h2></div></div><div class="finance-detail-list grouped-due-list">${renderDueGroups(dueGroups)}</div></article><article class="bank-panel"><div class="panel-head"><div><span>Your share</span><h2>Category breakdown</h2></div></div><div class="finance-detail-list">${renderCategories(categories)}</div></article></div>
    <article class="bank-panel"><div class="panel-head"><div><span>History</span><h2>Previous months</h2></div><button class="panel-link" data-route="expenses">Browse expenses</button></div><p class="bank-panel-copy">Review earlier billing periods and compare how your household obligations changed over time.</p></article>
  </section>`;
}
