import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {equalSplit,buildUtilityPayload,ADMIN_ADD_ACTIONS} from '../js/admin-actions.js';

test('admin add sheet exposes approved mobile actions',()=>{
 assert.deepEqual(ADMIN_ADD_ACTIONS.map(x=>x.label),['Utility bill','Grocery','PayLater','Other expense','Record payment','Announcement']);
});
test('equal split reconciles exact centavos deterministically',()=>{
 const rows=equalSplit(218437,['jace','kean','aerian','aexy']);
 assert.equal(rows.reduce((s,x)=>s+x.amount_cents,0),218437);
 assert.deepEqual(rows.map(x=>x.amount_cents),[54610,54609,54609,54609]);
});
test('utility payload defaults to authenticated admin payer and checked participants',()=>{
 const p=buildUtilityPayload({householdId:'h',periodId:'p',adminMemberId:'jace',activeMemberIds:['jace','kean','aerian','aexy'],utilityType:'electricity',description:'Meralco',amountCents:218437,dueDate:'2026-09-14',expenseDate:'2026-09-02',idempotencyKey:'k'});
 assert.equal(p.p_utility_type,'electricity'); assert.equal(p.p_payers[0].member_id,'jace'); assert.equal(p.p_payers[0].amount_cents,218437); assert.equal(p.p_splits.length,4); assert.equal(p.p_splits.reduce((s,x)=>s+x.amount_cents,0),218437);
});
test('admin expense UI uses edit plus overflow pattern and smart delete',()=>{const src=fs.readFileSync('js/admin-expenses-v3.js','utf8');assert.match(src,/>Edit</);assert.match(src,/data-action="expense-menu"/);assert.match(src,/delete_or_void_expense_v3/);});
