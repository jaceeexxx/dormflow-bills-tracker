import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderMemberBalance} from '../js/member-balance.js';
import {renderMemberPayments} from '../js/member-payments.js';
import {renderMemberMore} from '../js/member-more.js';
import {renderReviewQueue} from '../js/admin-review.js';
import {renderSecurity} from '../js/people-settings.js';

test('member balance renders banking summary cards and relationship list',()=>{
  const html=renderMemberBalance({outstanding_cents:183131,owed_to_me_cents:42000,credit_cents:0,creditors:[{label:'Jace',amount_cents:161331},{label:'Aerian',amount_cents:14800}]});
  assert.match(html,/bank-balance-card/);
  assert.match(html,/balance-summary-grid/);
  assert.match(html,/payee-card/);
  assert.match(html,/Net position/);
});

test('member payments renders banking activity surfaces and prominent report action',()=>{
  const html=renderMemberPayments({claims:[{id:'c1',amount_cents:100000,paid_at:'2026-08-31',method:'GCash',status:'pending'}],payments:[{id:'p1',amount_cents:50000,paid_at:'2026-08-30',method:'Maya',status:'verified'}]});
  assert.match(html,/payments-hero-card/);
  assert.match(html,/bank-transaction-card/);
  assert.match(html,/data-action="report-payment"/);
});

test('member more groups financial and account services into banking menu cards',()=>{
  const html=renderMemberMore({displayName:'Aerian'});
  assert.match(html,/service-menu-grid/);
  assert.match(html,/service-menu-card/);
  assert.match(html,/Utilities/);
  assert.match(html,/Security/);
});

test('admin review renders queue metrics and review cards',()=>{
  const html=renderReviewQueue([{id:'c1',amount_cents:100000,paid_at:'2026-08-31',method:'GCash',status:'pending'}]);
  assert.match(html,/review-summary-card/);
  assert.match(html,/review-claim-card/);
  assert.match(html,/data-review-claim="c1"/);
});

test('profile and security render banking settings cards',()=>{
  const peopleSource=fs.readFileSync('js/people-settings.js','utf8');
  assert.match(peopleSource,/profile-bank-card/);
  assert.match(peopleSource,/settings-card-list/);
  const security=renderSecurity();
  assert.match(security,/security-bank-card/);
});

test('banking redesign CSS supports premium service cards and responsive desktop/mobile layouts',()=>{
  const css=fs.readFileSync('css/styles.css','utf8');
  for(const marker of ['.balance-summary-grid','.payments-hero-card','.bank-transaction-card','.service-menu-grid','.review-summary-card','.profile-bank-card','.settings-card-list']){
    assert.match(css,new RegExp(marker.replace('.','\\.')));
  }
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
});
