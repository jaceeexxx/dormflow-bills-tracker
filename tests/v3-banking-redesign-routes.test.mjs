import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderHouseholdExpenses,renderUtilities} from '../js/household-views-v3.js';
import {renderPayLater} from '../js/paylater-v3.js';
import {renderAdminAnnouncements} from '../js/announcements-v3.js';
import {renderNotifications} from '../js/notifications.js';

test('mobile member nav follows banking pattern with central Pay and Activity',()=>{
  const html=fs.readFileSync('index.html','utf8');
  for(const label of ['Home','Balance','Pay','Activity','More']) assert.match(html,new RegExp(`>${label}<`));
  assert.match(html,/member-pay-action/);
});

test('household expense and utility routes render card-based finance surfaces',()=>{
  const expenses=renderHouseholdExpenses([{id:'e1',description:'Puregold',category:'groceries',amount_cents:250000,due_date:'2026-09-01',status:'active'}]);
  assert.match(expenses,/finance-list-card/);
  assert.match(expenses,/expense-summary-strip/);
  const utilities=renderUtilities([{utility_type:'electricity',expenses:{id:'e1',description:'Meralco',amount_cents:218437,due_date:'2026-09-14',status:'active'}}]);
  assert.match(utilities,/utility-summary-grid/);
  assert.match(utilities,/utility-bank-card/);
});

test('paylater announcements and notifications use premium banking cards',()=>{
  const paylater=renderPayLater([{id:'p1',provider:'SPayLater',borrower_label:'Kean',original_total_cents:65400,paylater_installments:[{status:'scheduled'}]}]);
  assert.match(paylater,/paylater-bank-card/);
  const announcements=renderAdminAnnouncements([{id:'a1',title:'Water interruption',priority:'important',is_active:true}]);
  assert.match(announcements,/announcement-bank-card/);
  const notes=renderNotifications([{id:'n1',title:'Payment verified',body:'Your payment was approved',created_at:'2026-08-31',read_at:null}]);
  assert.match(notes,/notification-bank-card/);
});

test('desktop admin nav exposes useful grouped finance destinations without returning to overloaded v2 sidebar',()=>{
  const app=fs.readFileSync('js/app.js','utf8');
  assert.match(app,/navButton\('manage-expenses',route,'Expenses','wallet'\)/);
  assert.match(app,/navButton\('review',route,'Review','review'\)/);
  assert.match(app,/navButton\('manage',route,'Manage','analytics'\)/);
  assert.match(app,/navButton\('balance',route,'My balance','balance'\)/);
  assert.match(app,/MY FINANCES|PERSONAL/);
});

test('admin manage hub and expense routes keep premium card hierarchy',()=>{
  const app=fs.readFileSync('js/app.js','utf8');
  assert.match(app,/manage-service-grid/);
  assert.match(app,/manage-expense-card/);
  assert.match(app,/People & splits/);
  assert.match(app,/Monthly setup/);
  assert.match(app,/Reports/);
});

test('people monthly setup and reports use banking cards instead of plain list-only pages',()=>{
  const generic=fs.readFileSync('js/admin-generic-v3.js','utf8');
  assert.match(generic,/people-bank-grid/);
  assert.match(generic,/monthly-setup-card/);
  assert.match(generic,/report-period-card/);
});
