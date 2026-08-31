import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {activeAnnouncement,buildAnnouncementPayload} from '../js/announcements-v3.js';
import {canMemberManagePaymentMethod,normalizeInstallmentSchedule} from '../js/people-settings.js';

test('announcement schedule respects active window',()=>{
 const now=Date.parse('2026-09-01T12:00:00Z');
 assert.equal(activeAnnouncement({is_active:true,starts_at:'2026-09-01T00:00:00Z',ends_at:'2026-09-02T00:00:00Z'},now),true);
 assert.equal(activeAnnouncement({is_active:true,starts_at:'2026-09-02T00:00:00Z'},now),false);
});
test('announcement payload keeps notify-household decision',()=>{const p=buildAnnouncementPayload({householdId:'h',title:'Water interruption',body:'10 PM',priority:'important',startsAt:'2026-09-01T10:00',endsAt:'',notifyHousehold:true,actorId:'j'});assert.equal(p.notify_household,true);assert.equal(p.priority,'important');});
test('member may manage only own payment method',()=>{assert.equal(canMemberManagePaymentMethod('m1','m1','member'),true);assert.equal(canMemberManagePaymentMethod('m1','m2','member'),false);assert.equal(canMemberManagePaymentMethod('m1','m2','admin'),true);});
test('PayLater schedule keeps integer centavos',()=>{assert.deepEqual(normalizeInstallmentSchedule(65400,3,'2026-09-15').map(x=>x.amount_cents),[21800,21800,21800]);});
test('admin review UI calls server review RPC and supports verify/reject',()=>{const src=fs.readFileSync('js/admin-review.js','utf8');assert.match(src,/review_payment_claim_v3/);assert.match(src,/verify/i);assert.match(src,/reject/i);assert.match(src,/allocations/i);});
