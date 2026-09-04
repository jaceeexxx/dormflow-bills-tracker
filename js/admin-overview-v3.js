import {supabase} from './auth.js';
import {formatPeso,escapeHtml} from './read-model-v3.js';
import {ADMIN_ADD_ACTIONS} from './admin-actions.js';
import {buildAdminDashboard} from './dashboard-model.js';
import {icon} from './icons.js';
import {formatBillingMonth} from './months.js';
import {householdMemberDirectory} from './member-directory.js';
import {signedHouseholdMediaUrl} from './household-media.js';

const palette=['#0f6b57','#f39a3d','#294c7a','#b7a164'];
const categoryIcon=label=>label.includes('Housing')?'utilities':label.includes('Grocer')?'grocery':label.includes('PayLater')?'paylater':'wallet';
const addActionIcon=action=>action.id==='rent'?'rent':action.id==='utility'?'utilities':action.id==='grocery'?'grocery':action.id==='paylater'?'paylater':action.id==='other'?'wallet':action.id==='payment'?'transfer':'announcement';

export async function loadAdminOverview(){
  const raw=await supabase.rpc('admin_overview_v3');const base=Array.isArray(raw)?raw[0]:raw;
  const periodId=base?.period_id;
  const [expenses,obligationBalances,obligationMeta,allocations,memberRows,memberLinks,profileRows,payments,announcements,periods,paylaterAccounts,paylaterInstallments]=await Promise.all([
    supabase.select('expenses',`select=id,period_id,description,category,amount_cents,due_date,expense_date,created_at,status&status=eq.active${periodId?`&period_id=eq.${periodId}`:''}&order=amount_cents.desc`),
    supabase.select('obligation_balances_v3','select=id,household_id,period_id,source_expense_id,debtor_member_id,creditor_member_id,creditor_label,original_amount_cents,due_date,source_category,outstanding_cents&outstanding_cents=gt.0'),
    supabase.select('obligations','select=id,source_paylater_installment_id'),
    supabase.select('payment_allocations','select=obligation_id,amount_cents'),
    householdMemberDirectory(),
    supabase.select('household_members','select=id,profile_id'),
    supabase.select('profiles','select=id,avatar_path'),
    supabase.select('payments','select=id,payer_member_id,payee_member_id,amount_cents,paid_at,method,status,created_at&order=paid_at.desc&limit=8'),
    supabase.select('announcements','select=id,title,priority,is_active,starts_at,ends_at&order=created_at.desc&limit=8').catch(()=>[]),
    supabase.select('billing_periods','select=id,month,status&order=month.asc'),
    supabase.select('paylater_accounts','select=id,provider,borrower_member_id,borrower_label,status&status=neq.void'),
    supabase.select('paylater_installments',`select=id,account_id,period_id,due_date,amount_cents,sequence_no,status&status=neq.void${periodId?`&period_id=eq.${periodId}`:''}&order=due_date.asc`)
  ]);
  const paylaterByObligation=new Map((obligationMeta||[]).map(row=>[row.id,row.source_paylater_installment_id]));
  const obligations=(obligationBalances||[]).map(row=>({...row,source_paylater_installment_id:paylaterByObligation.get(row.id)||null}));
  const profileIdByMember=new Map((memberLinks||[]).map(row=>[row.id,row.profile_id]));
  const avatarPathByProfile=new Map((profileRows||[]).map(row=>[row.id,row.avatar_path]));
  const members=await Promise.all(memberRows.map(async r=>{const avatarPath=r.avatarPath||avatarPathByProfile.get(profileIdByMember.get(r.id))||'';return {id:r.id,name:r.name||r.displayName||'Member',accent:r.accent,role:r.role,avatarUrl:avatarPath?await signedHouseholdMediaUrl(avatarPath).catch(()=> ''):''};}));
  return {...buildAdminDashboard({base,expenses,obligations,allocations,members,payments,periods,paylaterAccounts,paylaterInstallments}),activeAnnouncements:(announcements||[]).filter(a=>a.is_active).length,latestAnnouncements:announcements||[]};
}

function donutGradient(categories=[]){
  let cursor=0;const stops=[];
  categories.slice(0,4).forEach((c,i)=>{const start=cursor,end=cursor+(c.share||0)*100;stops.push(`${palette[i%palette.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`);cursor=end;});
  if(cursor<100)stops.push(`#e9eeeb ${cursor.toFixed(2)}% 100%`);
  return `conic-gradient(${stops.join(',')})`;
}

function quickAction(action){return `<button type="button" class="bank-quick-action" data-admin-add="${action.id}"><span class="quick-icon">${icon(addActionIcon(action))}</span><strong>${escapeHtml(action.label.replace(' bill',''))}</strong></button>`;}

function settlementRow(row){
  const net=row.netPositionCents||0;
  const netText=net<0?`−${formatPeso(Math.abs(net))}`:formatPeso(net);
  const netClass=net<0?'negative':net>0?'positive':'neutral';
  const categories=(row.payableBreakdown||[]).map(item=>`<div><span>${escapeHtml(item.label)}</span><b>${formatPeso(item.amountCents)}</b></div>`).join('');
  const creditors=(row.creditorBreakdown||[]).map(item=>`${escapeHtml(item.name)} ${formatPeso(item.amountCents)}`).join(' · ');
  const avatar=row.avatarUrl?`<img src="${escapeHtml(row.avatarUrl)}" alt="${escapeHtml(row.name)} profile photo">`:escapeHtml(row.name.slice(0,1));
  return `<details class="settlement-row settlement-financial-row"><summary><div class="member-avatar${row.avatarUrl?' has-photo':''}" style="--member-accent:${escapeHtml(row.accent||'#64756f')}">${avatar}</div><div class="settlement-main"><div class="settlement-name"><strong>${escapeHtml(row.name)}</strong><span class="status-pill ${row.status}">${row.status==='settled'?'Settled':'Open'}</span></div><div class="settlement-metrics"><span><small>Needs to pay</small><b>${formatPeso(row.needsToPayCents||0)}</b></span><span><small>Owed to member</small><b>${formatPeso(row.owedToMemberCents||0)}</b></span><span><small>Net position</small><b class="${netClass}">${netText}</b></span></div></div></summary><div class="settlement-detail"><strong>Open obligations by category</strong>${categories||'<span class="empty-line">No open obligations.</span>'}${creditors?`<small>Payees: ${creditors}</small>`:''}</div></details>`;
}

export function renderAdminOverview(vm={}){
  const categories=vm.categories||[],relationships=vm.relationships||[],members=vm.memberSettlement||[],recent=vm.recent||[],upcoming=vm.upcoming||[],activeMonth=formatBillingMonth(vm.periodMonth);
  return `<section class="screen banking-dashboard admin-banking-dashboard">
    <div class="bank-page-head"><div><span class="screen-kicker">20 St. Paul · ${escapeHtml(activeMonth)}</span><h1>Overview</h1></div><button class="mode-switch-card" type="button" data-route="home"><span>${icon('wallet')}</span><div><strong>My personal view</strong><small>See Jace's own balance</small></div><b>›</b></button></div>

    <section class="bank-balance-card admin-balance-card">
      <div class="balance-card-top"><div><span>Household outstanding</span><strong>${formatPeso(vm.outstandingCents||0)}</strong></div><span class="balance-chip">${Number(vm.settledRate||0).toFixed(1)}% settled</span></div>
      <div class="balance-card-progress"><i style="width:${Math.max(0,Math.min(100,Number(vm.settledRate||0))).toFixed(1)}%"></i></div>
      <div class="balance-card-meta"><div><span>Current-month expenses</span><strong>${formatPeso(vm.totalCents||0)}</strong></div><div><span>Settled value</span><strong>${formatPeso(vm.settledCents||0)}</strong></div><div><span>Overdue items</span><strong>${vm.overdueCount||0}</strong></div></div>
    </section>

    <section class="bank-quick-actions admin-quick-actions">
      ${ADMIN_ADD_ACTIONS.slice(0,6).map(quickAction).join('')}
      <button type="button" class="bank-quick-action" data-action="open-add"><span class="quick-icon">${icon('more')}</span><strong>More</strong></button>
    </section>

    <div class="banking-kpi-grid">
      <article class="bank-panel finance-composition"><div class="panel-head"><div><span>Monthly picture</span><h2>Expense composition</h2></div><button class="panel-link" data-manage="expenses">View all</button></div>
        <div class="composition-body"><div class="finance-donut" style="background:${donutGradient(categories)}"><div><strong>${formatPeso(vm.totalCents||0)}</strong><span>Total</span></div></div><div class="composition-legend">${categories.slice(0,4).map((c,i)=>`<div><span class="legend-dot" style="background:${palette[i%palette.length]}"></span><div><strong>${escapeHtml(c.label)}</strong><small>${((c.share||0)*100).toFixed(1)}%</small></div><b>${formatPeso(c.amountCents)}</b></div>`).join('')||'<p class="empty-line">No expenses yet</p>'}</div></div>
      </article>

      <article class="bank-panel"><div class="panel-head"><div><span>Household</span><h2>Settlement status</h2></div><button class="panel-link" data-route="review">Review</button></div><div class="settlement-list">${members.map(settlementRow).join('')||'<p class="empty-line">No settlement data yet</p>'}</div></article>
    </div>

    <div class="banking-kpi-grid lower-grid">
      <article class="bank-panel relationship-panel"><div class="panel-head"><div><span>Open obligations</span><h2>Who needs to pay whom</h2></div><span class="panel-badge">${relationships.length} open</span></div><div class="relationship-list">${relationships.slice(0,6).map(r=>`<div class="relationship-row"><div class="relationship-flow"><span class="mini-avatar">${escapeHtml(r.debtorName.slice(0,1))}</span><div><strong>${escapeHtml(r.debtorName)}</strong><small>pays ${escapeHtml(r.creditorName)}</small></div></div><b>${formatPeso(r.amountCents)}</b></div>`).join('')||'<div class="empty-state-bank"><strong>Household settled</strong><span>No outstanding transfers.</span></div>'}</div></article>

      <article class="bank-panel"><div class="panel-head"><div><span>Attention</span><h2>Upcoming</h2></div><button class="panel-link" data-route="review">Review</button></div><div class="upcoming-list">${upcoming.slice(0,8).map(x=>`<div class="upcoming-row ${x.kind==='paylater'?'is-paylater':''}"><span class="upcoming-icon">${icon(categoryIcon(x.category))}</span><div><strong>${escapeHtml(x.label)}</strong><small>${x.detail?`${escapeHtml(x.detail)} · `:''}${new Date(x.date+'T00:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'})}</small></div><b>${formatPeso(x.amountCents)}</b></div>`).join('')||'<div class="empty-state-bank"><strong>Nothing urgent</strong><span>No upcoming balances to review.</span></div>'}</div></article>
    </div>

    <div class="banking-kpi-grid admin-communication-grid"><article class="bank-panel announcement-overview-card"><div class="panel-head"><div><span>Household updates</span><h2>Announcements</h2></div><button class="panel-link" data-manage="announcements">Manage</button></div><div class="announcement-overview-body"><span class="summary-icon warm">${icon('announcement')}</span><div><strong>${vm.activeAnnouncements||0}</strong><small>active announcement${(vm.activeAnnouncements||0)===1?'':'s'}</small></div><button type="button" class="secondary-action" data-admin-add="announcement">Post announcement</button></div></article><article class="bank-panel activity-panel"><div class="panel-head"><div><span>Latest</span><h2>Recent activity</h2></div><span class="panel-badge">${vm.pendingClaims||0} pending claims</span></div><div class="activity-list">${recent.map(x=>`<div class="activity-row"><span class="activity-icon">${icon(x.kind==='payment'?'transfer':'wallet')}</span><div><strong>${escapeHtml(x.title)}</strong><small>${escapeHtml(x.subtitle)} · ${new Date(x.date).toLocaleDateString('en-PH',{month:'short',day:'numeric'})}</small></div><b>${x.kind==='payment'?'+':''}${formatPeso(x.amountCents)}</b></div>`).join('')||'<div class="empty-state-bank"><strong>No recent activity</strong><span>New payments and expenses will appear here.</span></div>'}</div></article></div>
  </section>`;
}

export function renderAddSheet(){return `<div class="sheet-body"><div class="sheet-grabber"></div><div class="sheet-head"><div><span class="sheet-kicker">Quick add</span><h2>Choose an action</h2></div><button class="icon-plain" data-close-sheet type="button">×</button></div><div class="add-sheet-grid">${ADMIN_ADD_ACTIONS.map(a=>`<button type="button" data-admin-add="${a.id}"><span class="quick-icon">${icon(addActionIcon(a))}</span><span>${escapeHtml(a.label)}</span><b>›</b></button>`).join('')}</div></div>`;}
