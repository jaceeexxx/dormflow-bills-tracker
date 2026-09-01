import {normalizeCategory,formatPeso} from './read-model-v3.js';

const asNum=v=>Number(v||0);
const byDate=(a,b)=>String(b.date||'').localeCompare(String(a.date||''));
export function cleanActivityMethod(value){const raw=String(value||'').trim();return !raw||/legacy|workbook|migration|histor/i.test(raw)?'Payment':raw;}

function memberMap(members=[]){return new Map(members.map(m=>[m.id,{...m,name:m.name||m.display_name||m.profiles?.display_name||'Member'}]));}
function allocationMap(rows=[]){const map=new Map();for(const row of rows)map.set(row.obligation_id,(map.get(row.obligation_id)||0)+asNum(row.amount_cents));return map;}

export function buildAdminDashboard({base={},expenses=[],obligations=[],allocations=[],members=[],payments=[],periods=[],paylaterAccounts=[],paylaterInstallments=[]}={}){
  const people=memberMap(members),paid=allocationMap(allocations),periodId=base.period_id||base.periodId||null,periodMonth=base.period_month||base.periodMonth||null;
  const totalCents=expenses.reduce((sum,row)=>sum+asNum(row.amount_cents),0);
  const periodById=new Map((periods||[]).map(row=>[row.id,row]));
  const throughActive=(row)=>{
    if(!periodMonth||!row?.period_id)return true;
    const month=periodById.get(row.period_id)?.month;
    return !month||String(month).slice(0,10)<=String(periodMonth).slice(0,10);
  };
  const visibleObligations=(obligations||[]).filter(throughActive);
  const open=visibleObligations.map(row=>({...row,outstandingCents:Math.max(0,asNum(row.original_amount_cents)-asNum(paid.get(row.id)))})).filter(row=>row.outstandingCents>0);
  const outstandingCents=asNum(base.outstanding_cents??base.outstandingCents??open.reduce((s,x)=>s+x.outstandingCents,0));
  const settledCents=Math.max(0,totalCents-outstandingCents);
  const settledRate=totalCents?Math.max(0,Math.min(100,(settledCents/totalCents)*100)):0;

  const catMap=new Map();
  for(const row of expenses){const label=normalizeCategory(row.category);catMap.set(label,(catMap.get(label)||0)+asNum(row.amount_cents));}
  const categories=[...catMap.entries()].map(([label,amountCents])=>({label,amountCents,share:totalCents?amountCents/totalCents:0})).sort((a,b)=>b.amountCents-a.amountCents);

  const relMap=new Map();
  for(const row of open){
    const debtorName=people.get(row.debtor_member_id)?.name||'Member';
    const creditorName=people.get(row.creditor_member_id)?.name||row.creditor_label||'Household';
    const key=`${row.debtor_member_id||debtorName}|${row.creditor_member_id||creditorName}`;
    const prev=relMap.get(key)||{debtorId:row.debtor_member_id,creditorId:row.creditor_member_id,debtorName,creditorName,amountCents:0};prev.amountCents+=row.outstandingCents;relMap.set(key,prev);
  }
  const relationships=[...relMap.values()].sort((a,b)=>b.amountCents-a.amountCents);

  const currentOpen=open.filter(row=>!periodId||row.period_id===periodId);
  const memberSettlement=members.map(member=>{
    const needsToPayCents=open.filter(x=>x.debtor_member_id===member.id).reduce((s,x)=>s+x.outstandingCents,0);
    const owedToMemberCents=open.filter(x=>x.creditor_member_id===member.id).reduce((s,x)=>s+x.outstandingCents,0);
    const netPositionCents=owedToMemberCents-needsToPayCents;
    return {
      id:member.id,
      name:people.get(member.id)?.name||'Member',
      accent:member.accent||'#6b7d76',
      needsToPayCents,
      owedToMemberCents,
      netPositionCents,
      outstandingCents:needsToPayCents,
      status:needsToPayCents>0?'open':'settled'
    };
  }).sort((a,b)=>b.needsToPayCents-a.needsToPayCents||b.owedToMemberCents-a.owedToMemberCents||a.name.localeCompare(b.name));

  const accountById=new Map((paylaterAccounts||[]).map(row=>[row.id,row]));
  const paylaterUpcoming=(paylaterInstallments||[])
    .filter(row=>(!periodId||row.period_id===periodId)&&row.status!=='void'&&row.due_date)
    .map(row=>{
      const account=accountById.get(row.account_id)||{};
      const borrowerName=account.borrower_label||people.get(account.borrower_member_id)?.name||'Borrower';
      const reimbursementCents=currentOpen
        .filter(ob=>ob.source_paylater_installment_id===row.id)
        .reduce((sum,ob)=>sum+ob.outstandingCents,0);
      return {
        id:row.id,
        date:row.due_date,
        label:`${account.provider||'PayLater'} · ${borrowerName}`,
        detail:`${borrowerName} pays provider · roommates reimburse ${formatPeso(reimbursementCents)}`,
        amountCents:asNum(row.amount_cents),
        category:'PayLater / Loans',
        kind:'paylater'
      };
    });
  const obligationUpcoming=currentOpen
    .filter(row=>row.due_date&&!row.source_paylater_installment_id)
    .map(row=>({
      id:row.id,
      date:row.due_date,
      label:`${people.get(row.debtor_member_id)?.name||'Member'} → ${people.get(row.creditor_member_id)?.name||row.creditor_label||'Household'}`,
      detail:'Outstanding household obligation',
      amountCents:row.outstandingCents,
      category:normalizeCategory(row.source_category),
      kind:'obligation'
    }));
  const upcoming=[...paylaterUpcoming,...obligationUpcoming]
    .sort((a,b)=>String(a.date).localeCompare(String(b.date))||b.amountCents-a.amountCents);

  const expenseActivity=expenses.map(x=>({kind:'expense',id:x.id,date:x.expense_date||x.created_at||'',title:x.description||normalizeCategory(x.category),subtitle:normalizeCategory(x.category),amountCents:asNum(x.amount_cents)}));
  const paymentActivity=payments.map(x=>({kind:'payment',id:x.id,date:x.paid_at||x.created_at||'',title:`${people.get(x.payer_member_id)?.name||'Member'} paid ${people.get(x.payee_member_id)?.name||'Member'}`,subtitle:cleanActivityMethod(x.method),amountCents:asNum(x.amount_cents)}));
  const recent=[...paymentActivity,...expenseActivity].filter(x=>x.date).sort(byDate).slice(0,6);

  return {
    displayName:base.display_name||base.displayName||'Jace',periodId,periodMonth,totalCents,outstandingCents,settledCents,settledRate,
    pendingClaims:asNum(base.pending_claims??base.pendingClaims),overdueCount:asNum(base.overdue_count??base.overdueCount),categories,relationships,memberSettlement,upcoming,recent
  };
}

export function buildMemberDashboard({home={},splits=[],claims=[],payments=[]}={}){
  const vm=home.vm||home||{};
  const catMap=new Map();
  for(const row of splits){
    const expense=row.expenses||{};
    if(vm.periodId&&expense.period_id&&expense.period_id!==vm.periodId)continue;
    if(expense.status&&expense.status!=='active')continue;
    const label=normalizeCategory(expense.category||'Other');catMap.set(label,(catMap.get(label)||0)+asNum(row.amount_cents));
  }
  const personalCategories=[...catMap.entries()].map(([label,amountCents])=>({label,amountCents})).sort((a,b)=>b.amountCents-a.amountCents);
  const recentClaims=claims.map(x=>({kind:'claim',id:x.id,date:x.paid_at||x.created_at||'',amountCents:asNum(x.amount_cents),method:cleanActivityMethod(x.method),status:x.status||'pending'}));
  const recentPayments=payments.map(x=>({kind:'payment',id:x.id,date:x.paid_at||x.created_at||'',amountCents:asNum(x.amount_cents),method:cleanActivityMethod(x.method),status:x.status||'verified'}));
  return {...vm,personalCategories,recent:[...recentClaims,...recentPayments].sort(byDate).slice(0,5)};
}
