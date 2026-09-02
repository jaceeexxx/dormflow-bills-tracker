import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMemberHome,makeOfflineSummary,formatPeso} from '../js/read-model-v3.js';

test('member home normalizes personal finance before household totals',()=>{
 const vm=normalizeMemberHome({display_name:'Kean',outstanding_cents:183131,due_soon_cents:60000,household_total_cents:2394422,owed_to_me_cents:42000,credit_cents:0,creditors:[{label:'Jace',amount_cents:161331},{label:'Aerian',amount_cents:14800}],categories:{'Housing & Utilities':1402714,'Groceries':821108,'PayLater / Loans':170600}});
 assert.equal(vm.name,'Kean'); assert.equal(vm.balance,183131); assert.equal(vm.creditors[0].name,'Jace'); assert.equal(vm.household.total,2394422); assert.equal(vm.household.categories[0].amount,1402714);
});
test('member home preserves an explicit creditor label when no member id exists',()=>{
 const vm=normalizeMemberHome({creditors:[{member_id:null,label:'Property manager',amount_cents:5000}]});
 assert.deepEqual(vm.creditors[0],{memberId:null,creditorLabel:'Property manager',name:'Property manager',amount:5000});
});
test('safe offline summary excludes detailed financial records',()=>{
 const summary=makeOfflineSummary({memberId:'m1',name:'Kean',balance:183131,dueSoon:60000,creditors:[{name:'Jace',amount:1}],payments:[{reference:'secret'}]},{now:123});
 assert.deepEqual(summary,{memberId:'m1',displayName:'Kean',lastKnownBalance:183131,dueSoonTotal:60000,lastSyncedAt:123});
 assert.equal(JSON.stringify(summary).includes('secret'),false);
});
test('peso formatter is centavo safe',()=>assert.equal(formatPeso(188193),'₱1,881.93'));
