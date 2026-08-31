import {hydrateIcons, icon} from './icons.js';
import {navigate,currentRoute,navigateBack} from './router.js';
import {bootstrapIdentity,login,logout} from './auth.js';
import {loadMemberHome,renderMemberHome} from './member-home.js';
import {loadMemberBalance,renderMemberBalance} from './member-balance.js';
import {renderMemberMore} from './member-more.js';
import {loadMemberPayments,renderMemberPayments,openReportPaymentSheet,withdrawClaim} from './member-payments.js';
import {loadAdminOverview,renderAdminOverview,renderAddSheet} from './admin-overview-v3.js';
import {loadAdminExpenses,renderExpenseRows,smartDeleteExpense} from './admin-expenses-v3.js';
import {openUtilitySheet} from './admin-utilities-v3.js';
import {loadReviewQueue,renderReviewQueue,openClaimReview} from './admin-review.js';
import {loadActiveAnnouncements,renderAnnouncementTicker,loadAdminAnnouncements,renderAdminAnnouncements,openAnnouncementSheet} from './announcements-v3.js';
import {loadPayLater,renderPayLater,openPayLaterSheet} from './paylater-v3.js';
import {renderProfile,openProfileSheet,openPaymentMethodSheet,renderHouseholdPaymentProfiles,openPaymentProfileSheet,renderSecurity,renderNotificationPreferences,saveNotificationPreferenceForm,promptAndSetPin,clearAppLock,enablePush,disablePush} from './people-settings.js';
import {loadNotifications,renderNotifications,markRead,notificationRoute,requestPushForTarget} from './notifications.js';
import {setActiveMonth,formatBillingMonth} from './months.js';
import {pushCapabilityStatus} from './push.js';
import {openGenericExpenseSheet,openAdminPaymentSheet,openExpenseEditSheet,duplicateExpense,renderManagePeople,renderMonthlySetup,renderReports,loadAdminPayments,renderAdminPayments,openAdminPaymentEditSheet} from './admin-generic-v3.js';
import {loadHouseholdExpenses,renderHouseholdExpenses,loadUtilities,renderUtilities} from './household-views-v3.js';
import {openExpenseAttachmentSheet} from './attachments.js';
import {getLockConfig,verifyLocalPin} from './app-lock.js';
import {supabase} from './auth.js';
import {initBankingCarousels} from './banking-carousel.js';
import {resolveAvatar} from './household-media.js';
import {startHouseholdRealtime,stopHouseholdRealtime} from './realtime.js';
import {openPinVerification} from './pin-screen.js';

export const state = { session:null, identity:null, online:navigator.onLine, route:currentRoute(), unlocked:false };
const ROOT_ROUTES=new Set(['home','overview']);
function injectBackControl(root,route){if(!root||ROOT_ROUTES.has(route))return;const screen=root.querySelector('.screen');if(!screen||screen.querySelector('[data-action="navigate-back"]'))return;screen.insertAdjacentHTML('afterbegin',`<button class="screen-back-button" type="button" data-action="navigate-back" aria-label="Go back">‹ <span>Back</span></button>`);}
async function renderHeaderAvatar(identity){const button=document.querySelector('#profile-button'),fallback=(identity?.displayName||identity?.display_name||'D').slice(0,1).toUpperCase();if(!button)return;try{const avatar=await resolveAvatar(identity);button.innerHTML=avatar?.url?`<img class="header-avatar" src="${avatar.url}" alt="Profile photo">`:`<span id="profile-initial">${fallback}</span>`;button.classList.toggle('has-avatar',!!avatar?.url);}catch{button.innerHTML=`<span id="profile-initial">${fallback}</span>`;button.classList.remove('has-avatar');}}

function identityMemberId(){return state.identity?.memberId||state.identity?.member_id;}
function identityHouseholdId(){return state.identity?.householdId||state.identity?.household_id;}
export const ADMIN_PERSONAL_ROUTES=['home','balance','payments','more','utilities','expenses','paylater','payment-methods'];
export function isAdminPersonalRoute(role,route){return role==='admin'&&ADMIN_PERSONAL_ROUTES.includes(route);}
function navButton(route,current,label,iconName){return `<button type="button" data-route="${route}" class="${current===route?'active':''}"><span data-icon="${iconName}"></span><em>${label}</em></button>`;}
function renderDesktopNav(role,route){
  if(role==='admin')return `<div class="nav-group"><span>ADMIN</span>${navButton('overview',route,'Overview','home')}${navButton('manage-expenses',route,'Expenses','wallet')}${navButton('review',route,'Review','review')}${navButton('manage',route,'Manage','analytics')}</div><div class="nav-group personal-nav-group"><span>MY FINANCES</span>${navButton('home',route,'My home','home')}${navButton('balance',route,'My balance','balance')}${navButton('payments',route,'My activity','payments')}</div>`;
  return `<div class="nav-group"><span>MY DORMFLOW</span>${navButton('home',route,'Home','home')}${navButton('balance',route,'Balance','balance')}${navButton('payments',route,'Activity','payments')}${navButton('more',route,'More','more')}</div>`;
}


let realtimeRefreshTimer=null;
function ensureHouseholdRealtime(appState=state){
  if(!appState.session||!appState.identity){stopHouseholdRealtime();return;}
  startHouseholdRealtime({householdId:identityHouseholdId(),memberId:identityMemberId(),onInvalidate:topics=>{clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=setTimeout(()=>{if(!state.session||document.visibilityState==='hidden')return;const route=state.route;if(topics.includes('profile'))renderHeaderAvatar(state.identity);if(topics.includes('notifications'))refreshNotificationBadge();const relevant=route==='home'||route==='overview'||topics.some(topic=>route.includes(topic)||({utilities:'utilities',expenses:'expenses',paylater:'paylater',payments:'payments',balance:'balance',month:'setup',profile:'profile',notifications:'notification'}[topic]||'')&&route.includes(({utilities:'utilities',expenses:'expenses',paylater:'paylater',payments:'payments',balance:'balance',month:'setup',profile:'profile',notifications:'notification'}[topic]||'')));if(relevant)renderApp();},140);}});
}

async function refreshNotificationBadge(){
  const button=document.querySelector('#notification-button');if(!button||!state.session)return;
  try{const rows=await loadNotifications(),count=rows.filter(n=>!n.read_at).length,label=count>99?'99+':String(count);button.innerHTML=`${icon('notifications')}${count?`<span class="notification-badge">${label}</span>`:''}`;}catch{button.innerHTML=icon('notifications');}
}
async function injectPushEnablePrompt(root){
  if(!root||!state.session)return;try{const status=await pushCapabilityStatus();if(!status.supported||status.subscribed||status.permission!=='default'||root.querySelector('.push-enable-card'))return;root.insertAdjacentHTML('afterbegin',`<section class="push-enable-card"><span class="quick-icon">${icon('notifications')}</span><div><strong>Stay updated</strong><small>Enable DormFlow push for payments, bills, due dates, and household updates.</small></div><button class="secondary-action" type="button" data-action="enable-push">Enable notifications</button></section>`);}catch{}
}
async function ensureUnlocked(appState=state){
  if(!appState.identity)return true;
  const memberId=appState.identity.memberId||appState.identity.member_id;
  const lock=getLockConfig(memberId);
  if(lock.mode!=='pin'){appState.unlocked=true;return true;}
  if(appState.unlocked)return true;
  const result=await openPinVerification({verify:pin=>verifyLocalPin(memberId,pin)});
  if(result?.action==='password'){stopHouseholdRealtime();await logout(appState.identity);appState.session=null;appState.identity=null;appState.unlocked=false;return false;}
  if(result?.action!=='pin')return false;
  appState.unlocked=true;return true;
}

async function renderAdminManage(appState,root){
  const route=appState.route;
  if(route==='manage-announcements'){root.innerHTML=renderAdminAnnouncements(await loadAdminAnnouncements());return;}
  if(route==='manage-paylater'){root.innerHTML=renderPayLater(await loadPayLater(),{admin:true});return;}
  if(route==='manage-utilities'){root.innerHTML=renderUtilities(await loadUtilities(),{admin:true});return;}
  if(route==='manage-payments'){root.innerHTML=renderAdminPayments(await loadAdminPayments());return;}
  if(route==='manage-people'){root.innerHTML=await renderManagePeople();return;}
  if(route==='manage-setup'){root.innerHTML=await renderMonthlySetup(appState.identity);return;}
  if(route==='manage-reports'){root.innerHTML=await renderReports();return;}
  if(route==='manage-expenses'||route==='manage-groceries'||route==='manage-other'){
    const overview=await loadAdminOverview();let rows=await loadAdminExpenses(overview.period_id);
    if(route==='manage-groceries')rows=rows.filter(x=>String(x.category).toLowerCase().includes('grocer'));
    if(route==='manage-other')rows=rows.filter(x=>String(x.category).toLowerCase().includes('other'));
    const title=route==='manage-groceries'?'Groceries':route==='manage-other'?'Other expenses':'All expenses';
    root.innerHTML=`<section class="screen banking-dashboard manage-route-screen"><div class="bank-page-head"><div><span class="screen-kicker">Admin records</span><h1>${title}</h1></div><button class="mode-switch-card compact-mode" type="button" data-action="open-add"><span>${icon('add')}</span><div><strong>Add</strong><small>Create a new record</small></div><b>›</b></button></div><article class="bank-panel manage-expense-card"><div class="panel-head"><div><span>Current period</span><h2>${title}</h2></div><span class="panel-badge">${rows.length} records</span></div>${renderExpenseRows(rows)}</article></section>`;return;
  }
  const overview=await loadAdminOverview();
  const manageCard=(id,label,detail,iconName)=>`<button class="service-menu-card manage-service-card" data-manage="${id}" type="button"><span class="service-menu-icon">${icon(iconName)}</span><div><strong>${label}</strong><small>${detail}</small></div><b>›</b></button>`;
  root.innerHTML=`<section class="screen banking-dashboard manage-screen"><div class="bank-page-head"><div><span class="screen-kicker">Administration</span><h1>Manage</h1></div><span class="member-status-pill">20 St. Paul</span></div><article class="bank-panel"><div class="panel-head"><div><span>Money</span><h2>Household finances</h2></div></div><div class="manage-service-grid">${manageCard('utilities','Utilities','Electricity, water and WiFi','utilities')}${manageCard('payments','Payments','Recorded transfers and corrections','payments')}${manageCard('groceries','Groceries','Shared food and household items','grocery')}${manageCard('paylater','PayLater','Installments and schedules','paylater')}${manageCard('other','Other expenses','Miscellaneous shared costs','wallet')}</div></article><article class="bank-panel"><div class="panel-head"><div><span>Household</span><h2>Operations</h2></div></div><div class="manage-service-grid">${manageCard('announcements','Announcements','Post notices to roommates','announcement')}${manageCard('people','People & splits','Members and default shares','users')}${manageCard('setup','Monthly setup','Start and carry forward periods','calendar')}${manageCard('reports','Reports','Review billing periods','analytics')}<button class="service-menu-card manage-service-card" data-route="profile" type="button"><span class="service-menu-icon">${icon('settings')}</span><div><strong>Settings</strong><small>Account and security preferences</small></div><b>›</b></button></div></article><article class="bank-panel manage-expense-card"><div class="panel-head"><div><span>Current period</span><h2>Latest expenses</h2></div><button class="panel-link" data-manage="expenses">View all</button></div>${renderExpenseRows((await loadAdminExpenses(overview.period_id)).slice(0,6))}</article></section>`;
}

export async function renderApp(appState=state) {
  const auth=document.querySelector('#auth-screen');
  const shell=document.querySelector('#app-shell');
  const root=document.querySelector('#view-root');
  if (!appState.session || !appState.identity) { auth.hidden=false; shell.hidden=true; return; }
  auth.hidden=true; shell.hidden=false;
  ensureHouseholdRealtime(appState);
  const role=appState.identity.role;
  const adminPersonal=isAdminPersonalRoute(role,appState.route);
  document.querySelector('#member-bottom-nav').hidden=role==='admin'&&!adminPersonal;
  document.querySelector('#admin-bottom-nav').hidden=role!=='admin'||adminPersonal;
  const mode=document.querySelector('#mode-switcher');
  if(mode){mode.hidden=role!=='admin';mode.innerHTML=role==='admin'?`<button type="button" data-route="overview" class="${adminPersonal?'':'active'}">Admin</button><button type="button" data-route="home" class="${adminPersonal?'active':''}">Personal</button>`:'';}
  await renderHeaderAvatar(appState.identity);
  document.querySelector('#desktop-nav').innerHTML=renderDesktopNav(role,appState.route);
  root.innerHTML='<section class="screen"><div class="skeleton-block"></div><div class="skeleton-list"><i></i><i></i><i></i></div></section>';
  try {
    if(appState.route==='security') root.innerHTML=renderSecurity();
    else if(appState.route==='notification-settings') root.innerHTML=await renderNotificationPreferences(appState.identity);
    else if(appState.route==='notifications') root.innerHTML=renderNotifications(await loadNotifications());
    else if(appState.route==='profile') root.innerHTML=await renderProfile(appState.identity);
    else if(appState.route==='payment-methods') root.innerHTML=await renderHouseholdPaymentProfiles(appState.identity);
    else if((role!=='admin'||adminPersonal) && appState.route==='balance') root.innerHTML=renderMemberBalance(await loadMemberBalance());
    else if((role!=='admin'||adminPersonal) && appState.route==='payments') root.innerHTML=renderMemberPayments(await loadMemberPayments());
    else if((role!=='admin'||adminPersonal) && appState.route==='more') root.innerHTML=renderMemberMore(appState.identity);
    else if((role!=='admin'||adminPersonal) && appState.route==='paylater') root.innerHTML=renderPayLater(await loadPayLater());
    else if((role!=='admin'||adminPersonal) && appState.route==='utilities') root.innerHTML=renderUtilities(await loadUtilities());
    else if((role!=='admin'||adminPersonal) && appState.route==='expenses') root.innerHTML=renderHouseholdExpenses(await loadHouseholdExpenses());
    else if(role!=='admin'||adminPersonal) {root.innerHTML=renderMemberHome(await loadMemberHome());const slot=root.querySelector('#announcement-slot');if(slot)loadActiveAnnouncements().then(rows=>slot.innerHTML=renderAnnouncementTicker(rows)).catch(()=>{});}
    else if(appState.route==='review') root.innerHTML=renderReviewQueue(await loadReviewQueue());
    else if(appState.route==='manage'||appState.route.startsWith('manage-')) await renderAdminManage(appState,root);
    else root.innerHTML=renderAdminOverview(await loadAdminOverview());
  } catch(err) { root.innerHTML=`<section class="screen"><div class="error-state"><h1>Couldn't refresh.</h1><p>${String(err.message||'Try again when you are connected.')}</p><button class="primary-action" data-action="retry" type="button">Try again</button></div></section>`; }
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===appState.route));
  hydrateIcons();
  initBankingCarousels(root);
  injectBackControl(root,appState.route);
  await refreshNotificationBadge();
  await injectPushEnablePrompt(root);
}

export function showToast(message){const t=document.querySelector('#toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}

async function handleAdminAdd(adminAdd){
  if(!adminAdd)return;
  const sheet=document.querySelector('#sheet');if(sheet.open)sheet.close();
  const overview=await loadAdminOverview();const done=()=>{state.route='overview';renderApp();};
  if(adminAdd==='utility') return openUtilitySheet({identity:state.identity,periodId:overview.period_id,onDone:done});
  if(adminAdd==='grocery') return openGenericExpenseSheet({identity:state.identity,periodId:overview.period_id,kind:'grocery',onDone:done});
  if(adminAdd==='other') return openGenericExpenseSheet({identity:state.identity,periodId:overview.period_id,kind:'other',onDone:done});
  if(adminAdd==='payment') return openAdminPaymentSheet({identity:state.identity,onDone:done});
  if(adminAdd==='announcement') return openAnnouncementSheet({identity:state.identity,onDone:()=>{state.route='manage-announcements';renderApp();}});
  if(adminAdd==='paylater') return openPayLaterSheet({identity:state.identity,onDone:()=>{state.route='manage-paylater';renderApp();}});
}

async function expenseById(id){const rows=await supabase.select('expenses',`select=id,period_id,description,category,amount_cents,due_date,source_type,source_label,status,version&status=eq.active&id=eq.${id}`);return rows[0];}

function openExpenseMenu(id){const sheet=document.querySelector('#sheet');document.querySelector('#sheet-content').innerHTML=`<div class="sheet-body"><div class="sheet-grabber"></div><div class="sheet-head"><h2>Expense actions</h2><button class="icon-plain" data-close-sheet>×</button></div><div class="add-sheet-list"><button data-expense-receipt="${id}">Add receipt</button><button data-expense-duplicate="${id}">Duplicate</button><button data-edit-expense="${id}">Adjust / edit</button><button class="danger-text" data-expense-delete="${id}">Archive</button></div></div>`;sheet.showModal();document.querySelector('[data-close-sheet]').onclick=()=>sheet.close();}

function bindShell(){
  hydrateIcons();document.querySelector('#notification-button').innerHTML=icon('notifications');
  document.addEventListener('submit',e=>{if(e.target.id==='notification-preferences-form'){e.preventDefault();saveNotificationPreferenceForm(state.identity,e.target).then(()=>showToast('Preferences saved')).catch(err=>showToast(err.message));}});
  document.addEventListener('click',async e=>{
    try{
      const profileMember=e.target.closest('[data-payment-profile]')?.dataset.paymentProfile;if(profileMember)return openPaymentProfileSheet(profileMember,{identity:state.identity});
      const editPaymentMember=e.target.closest('[data-edit-payment-profile]')?.dataset.editPaymentProfile;if(editPaymentMember)return openPaymentMethodSheet({identity:state.identity,targetMemberId:editPaymentMember,onDone:()=>renderApp()});
      const copyText=e.target.closest('[data-copy-text]')?.dataset.copyText;if(copyText){await navigator.clipboard?.writeText(copyText);showToast('Payment details copied');return;}
            const noteButton=e.target.closest('[data-notification-id]');const noteId=noteButton?.dataset.notificationId;if(noteId){const rows=await loadNotifications(),note=rows.find(n=>n.id===noteId);await markRead(noteId);await refreshNotificationBadge();if(note){state.route=notificationRoute(note,state.identity);return renderApp();}return renderApp();}
      const reviewId=e.target.closest('[data-review-claim]')?.dataset.reviewClaim;if(reviewId){const rows=await loadReviewQueue();return openClaimReview(rows.find(x=>x.id===reviewId),{onDone:()=>renderApp()});}
      const claimEdit=e.target.closest('[data-claim-edit]')?.dataset.claimEdit;if(claimEdit){const data=await loadMemberPayments(),claim=data.claims.find(x=>x.id===claimEdit);if(claim)return openReportPaymentSheet({identity:state.identity,existing:claim,onDone:()=>renderApp()});}
      const claimWithdraw=e.target.closest('[data-claim-withdraw]')?.dataset.claimWithdraw;if(claimWithdraw){if(confirm('Withdraw this pending payment claim?')){await withdrawClaim(claimWithdraw);showToast('Payment claim withdrawn');return renderApp();}}
      const announcementEdit=e.target.closest('[data-announcement-edit]')?.dataset.announcementEdit;if(announcementEdit){const rows=await loadAdminAnnouncements(),existing=rows.find(x=>x.id===announcementEdit);if(!existing)throw new Error('Announcement not found.');return openAnnouncementSheet({identity:state.identity,existing,onDone:()=>renderApp()});}
      const announcementToggle=e.target.closest('[data-announcement-toggle]')?.dataset.announcementToggle;if(announcementToggle){const button=e.target.closest('[data-announcement-toggle]'),active=button?.dataset.active==='true';await supabase.update('announcements',`id=eq.${announcementToggle}`,{is_active:!active,updated_by:identityMemberId(),updated_at:new Date().toISOString()});showToast(active?'Announcement deactivated':'Announcement activated');return renderApp();}
      const manage=e.target.closest('[data-manage]')?.dataset.manage;if(manage){state.route=`manage-${manage}`;return renderApp();}
      const adminAdd=e.target.closest('[data-admin-add]')?.dataset.adminAdd;if(adminAdd)return handleAdminAdd(adminAdd);
      const paylaterEdit=e.target.closest('[data-paylater-edit]')?.dataset.paylaterEdit;if(paylaterEdit){const rows=await loadPayLater(),existing=rows.find(x=>x.id===paylaterEdit);if(!existing)throw new Error('PayLater schedule not found.');return openPayLaterSheet({identity:state.identity,existing,onDone:()=>renderApp()});}
      const paylaterArchive=e.target.closest('[data-paylater-archive]')?.dataset.paylaterArchive;if(paylaterArchive&&confirm('Archive this PayLater schedule? Remaining obligations will stop affecting balances while payment history is preserved.')){await supabase.rpc('archive_paylater_v3',{p_account:paylaterArchive,p_reason:'Archived by admin'});showToast('PayLater archived');return renderApp();}
      const expenseMenu=e.target.closest('[data-expense-menu]')?.dataset.expenseMenu;if(expenseMenu)return openExpenseMenu(expenseMenu);
      const editId=e.target.closest('[data-edit-expense]')?.dataset.editExpense;if(editId){const expense=await expenseById(editId);if(!expense)throw new Error('Expense not found.');return openExpenseEditSheet({expense,onDone:()=>renderApp()});}
      const editPaymentId=e.target.closest('[data-edit-admin-payment]')?.dataset.editAdminPayment;if(editPaymentId){const rows=await loadAdminPayments(),payment=rows.find(p=>p.id===editPaymentId);if(!payment)throw new Error('Payment not found.');return openAdminPaymentEditSheet({payment,onDone:()=>renderApp()});}
      const voidPaymentId=e.target.closest('[data-void-admin-payment]')?.dataset.voidAdminPayment;if(voidPaymentId&&confirm('Void this payment? Applied balances will reopen and history will be preserved.')){await supabase.rpc('void_admin_payment_v3',{p_payment:voidPaymentId,p_reason:'Voided by admin'});showToast('Payment voided');return renderApp();}
      const receiptId=e.target.closest('[data-expense-receipt]')?.dataset.expenseReceipt;if(receiptId)return openExpenseAttachmentSheet({identity:state.identity,expenseId:receiptId,onDone:()=>showToast('Receipt uploaded')});
      const duplicateId=e.target.closest('[data-expense-duplicate]')?.dataset.expenseDuplicate;if(duplicateId){const expense=await expenseById(duplicateId);await duplicateExpense(expense,state.identity);document.querySelector('#sheet').close();showToast('Expense duplicated');return renderApp();}
      const del=e.target.closest('[data-expense-delete]')?.dataset.expenseDelete;if(del&&confirm('Archive this expense? Its financial history will be preserved.')){await smartDeleteExpense(del,'Archived by admin');document.querySelector('#sheet').close();showToast('Expense removed');return renderApp();}
      const month=e.target.closest('[data-month-activate],[data-month-create]')?.dataset.monthActivate||e.target.closest('[data-month-create]')?.dataset.monthCreate;if(month){if(!navigator.onLine)throw new Error('Reconnect before changing the billing month.');if(!confirm(`Make ${formatBillingMonth(month)} the current billing month? Previous unpaid balances will remain.`))return;const periodId=await setActiveMonth(month);await requestPushForTarget({targetType:'billing_period',targetId:periodId});showToast(`${formatBillingMonth(month)} is now current`);return renderApp();}
      const route=e.target.closest('[data-route]')?.dataset.route;if(route)return navigate(route);
      const action=e.target.closest('[data-action]')?.dataset.action;
      if(action==='navigate-back')return navigateBack();
      if(action==='retry')return renderApp();
      if(action==='report-payment')return openReportPaymentSheet({identity:state.identity,onDone:()=>{state.route='payments';renderApp();}});
      if(action==='payment-method')return openPaymentMethodSheet({identity:state.identity,onDone:()=>renderApp()});
      if(action==='edit-profile')return openProfileSheet({identity:state.identity,onDone:()=>renderApp()});
      if(action==='signout'){stopHouseholdRealtime();await logout(state.identity);state.session=null;state.identity=null;state.unlocked=false;return renderApp();}
      if(action==='set-app-pin'){if(await promptAndSetPin(state.identity)){state.unlocked=true;showToast('App PIN saved');}return;}
      if(action==='clear-app-lock'){clearAppLock(state.identity);state.unlocked=true;showToast('App lock turned off');return;}
      if(action==='enable-push'){await enablePush(state.identity);showToast('Push notifications enabled');await refreshNotificationBadge();return renderApp();}
      if(action==='disable-push'){await disablePush(state.identity);showToast('Push notifications disabled');return;}
      if(action==='open-add' && state.identity?.role==='admin'){const sheet=document.querySelector('#sheet');document.querySelector('#sheet-content').innerHTML=renderAddSheet();sheet.showModal();document.querySelector('[data-close-sheet]').onclick=()=>sheet.close();}
    }catch(err){showToast(err.message||String(err));}
  });
  window.addEventListener('dormflow:navigate',e=>{state.route=e.detail.route; renderApp();});
  window.addEventListener('dormflow:toast',e=>showToast(e.detail?.message||'Saved'));
  window.addEventListener('popstate',()=>{state.route=currentRoute();renderApp();});
  window.addEventListener('online',()=>{state.online=true;document.querySelector('#offline-strip').hidden=true;if(state.session)renderApp();});
  window.addEventListener('offline',()=>{state.online=false;document.querySelector('#offline-strip').hidden=false;});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.session&&navigator.onLine)renderApp();});
}

function showForegroundPush(payload={}){const existing=document.querySelector('.foreground-push-banner');if(existing)existing.remove();const banner=document.createElement('button');banner.type='button';banner.className='foreground-push-banner';banner.innerHTML=`<strong>${String(payload.title||'DormFlow')}</strong><span>${String(payload.body||'You have a new notification.')}</span>`;banner.onclick=()=>{const hash=new URL(payload.url||'/#/notifications',location.origin).hash.replace(/^#\/?/,'');banner.remove();if(hash){state.route=hash;navigate(hash);renderApp();}};document.body.append(banner);setTimeout(()=>banner.remove(),6000);}
async function registerPwa(){if('serviceWorker' in navigator){navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='dormflow:push')showForegroundPush(event.data.payload||{});});try{await navigator.serviceWorker.register('/service-worker.js');}catch{}}}

async function boot(){
  bindShell();registerPwa();
  const form=document.querySelector('#signin-form');
  form.addEventListener('submit',async e=>{e.preventDefault();const error=document.querySelector('#signin-error');const submit=document.querySelector('#signin-submit');error.hidden=true;submit.disabled=true;submit.textContent='Signing in…';try{Object.assign(state,await login(form.email.value.trim(),form.password.value));state.unlocked=true;renderApp();}catch(err){error.textContent=err.message||'Could not sign in.';error.hidden=false;}finally{submit.disabled=false;submit.textContent='Sign in';}});
  document.querySelector('#signout-button').addEventListener('click',async()=>{stopHouseholdRealtime();await logout(state.identity);state.session=null;state.identity=null;state.unlocked=false;renderApp();});
  try{Object.assign(state,await bootstrapIdentity());if(state.session&&state.identity)await ensureUnlocked(state);}catch(err){state.session=null;state.identity=null;state.unlocked=false;}
  renderApp();
}
boot();
