import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildClaimPayload,canEditClaim,attachmentPath} from '../js/payment-form.js';

test('member claim payload never accepts a payer identity field',()=>{
 const p=buildClaimPayload({payeeId:'p2',amount:'1000',method:'GCash',paidAt:'2026-08-31',reference:'1234',note:'ok',allocations:[]},{idempotencyKey:'idem-1'});
 assert.equal(p.p_payee,'p2'); assert.equal(p.p_amount_cents,100000); assert.equal(p.p_idempotency_key,'idem-1'); assert.equal('payerId' in p,false); assert.equal('p_payer' in p,false);
});
test('only pending member claims can be edited or withdrawn',()=>{assert.equal(canEditClaim({status:'pending'}),true);for(const s of ['verified','rejected','withdrawn']) assert.equal(canEditClaim({status:s}),false);});
test('private receipt path is namespaced to household and claim',()=>{assert.equal(attachmentPath('h1','claim','c1','receipt.png'),'h1/payment-claims/c1/receipt.png');});
test('payment screen does not render a member-selectable payer field',()=>{const src=fs.readFileSync('js/member-payments.js','utf8');assert.doesNotMatch(src,/name=["']payer|id=["']payer/i);assert.match(src,/Report payment/i);assert.match(src,/navigator\.onLine/);});
