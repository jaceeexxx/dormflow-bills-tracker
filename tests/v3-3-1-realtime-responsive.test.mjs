import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSupabaseClient} from '../js/supabase-client.js';

const read=p=>fs.readFileSync(p,'utf8');

test('supabase client can open authenticated postgres-change channels',()=>{
  class FakeSocket{
    static last=null;
    constructor(url){this.url=url;this.sent=[];FakeSocket.last=this;queueMicrotask(()=>this.onopen?.());}
    send(value){this.sent.push(JSON.parse(value));}
    close(){this.onclose?.();}
  }
  const storage={getItem:()=>JSON.stringify({access_token:'access-token'}),setItem(){},removeItem(){}};
  const client=createSupabaseClient({url:'https://example.supabase.co',key:'public-key',storage,WebSocketImpl:FakeSocket});
  const channel=client.createRealtimeChannel({name:'beta',changes:[{table:'expenses'}],onChange:()=>{}});
  assert.equal(typeof channel.close,'function');
  return new Promise(resolve=>setTimeout(()=>{
    const join=FakeSocket.last.sent.find(x=>x.event==='phx_join');
    assert.ok(join);
    assert.equal(join.payload.access_token,'access-token');
    assert.equal(join.payload.config.postgres_changes[0].table,'expenses');
    channel.close();resolve();
  },5));
});

test('shared realtime module maps financial tables to focused invalidation topics',()=>{
  assert.ok(fs.existsSync('js/realtime.js'));
  const src=read('js/realtime.js');
  assert.match(src,/startHouseholdRealtime/);
  assert.match(src,/expenses.*utilities.*home.*balance/s);
  assert.match(src,/paylater_accounts.*paylater.*home.*balance/s);
  assert.match(src,/notifications.*notifications/s);
  assert.match(read('js/app.js'),/startHouseholdRealtime/);
  assert.match(read('js/app.js'),/stopHouseholdRealtime/);
});

test('dense banking rows stack actions on narrow screens instead of overlapping copy',()=>{
  const css=read('css/styles.css');
  assert.match(css,/@media\(max-width:560px\).*?\.settings-card/s);
  assert.match(css,/@media\(max-width:560px\).*?\.notification-bank-card/s);
  assert.match(css,/@media\(max-width:560px\).*?\.relationship-row/s);
  assert.match(css,/@media\(max-width:560px\).*?\.admin-record/s);
});
