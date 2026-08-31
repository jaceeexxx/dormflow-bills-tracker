import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const home=fs.readFileSync('js/member-home.js','utf8');
const balance=fs.readFileSync('js/member-balance.js','utf8');
const css=fs.readFileSync('css/styles.css','utf8');

test('member Home uses a three-card banking carousel',()=>{
  assert.ok(fs.existsSync('js/banking-carousel.js'));
  assert.match(home,/My Balance/);
  assert.match(home,/Household This Month/);
  assert.match(home,/My Monthly Share/);
  assert.match(home,/banking-card-carousel/);
  assert.match(home,/carousel-dot/);
  const carousel=fs.readFileSync('js/banking-carousel.js','utf8');
  assert.match(carousel,/pointerdown/);
  assert.match(carousel,/ArrowLeft/);
  assert.match(carousel,/rotateY/);
});

test('Balance is a detailed account-position screen, not a Home duplicate',()=>{
  assert.match(balance,/You owe/);
  assert.match(balance,/Owed to you/);
  assert.match(balance,/Credits/);
  assert.match(balance,/Due schedule/);
  assert.match(balance,/Category breakdown/);
  assert.match(balance,/Previous months/);
  assert.doesNotMatch(balance,/banking-card-carousel/);
});

test('carousel has reduced-motion fallback',()=>{
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/banking-card-carousel/);
  assert.match(css,/scroll-snap/);
});


test('Balance current outstanding hero keeps a visible dark banking-card treatment',()=>{
  const generic=css.lastIndexOf('.account-position-card{');
  const override=css.lastIndexOf('.account-position-card.bank-balance-card{');
  assert.ok(override>generic,'combined Balance hero override must appear after the generic account-position card');
  const ruleEnd=css.indexOf('}',override);
  const rule=css.slice(override,ruleEnd+1);
  assert.match(rule,/background:linear-gradient/);
  assert.match(rule,/color:#fff/);
});
