import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseClient} from '../js/supabase-client.js';
import {hashPinVerifier} from '../js/app-lock.js';

test('password sign in uses Supabase token endpoint and publishable key', async()=>{
  const calls=[];
  const fetcher=async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({access_token:'a',refresh_token:'r',expires_in:3600,user:{id:'u1'}})}};
  const client=createSupabaseClient({url:'https://example.supabase.co',key:'sb_publishable_test',fetcher,storage:null});
  const session=await client.signIn('kean@example.com','secret');
  assert.equal(session.access_token,'a');
  assert.match(calls[0].url,/\/auth\/v1\/token\?grant_type=password$/);
  assert.equal(calls[0].opts.headers.apikey,'sb_publishable_test');
  assert.deepEqual(JSON.parse(calls[0].opts.body),{email:'kean@example.com',password:'secret'});
});

test('client has no public signup helper',()=>{
  const client=createSupabaseClient({url:'x',key:'y',fetcher:async()=>{},storage:null});
  assert.equal(client.signUp,undefined);
});

test('local pin verifier is salted and deterministic for same inputs', async()=>{
  const one=await hashPinVerifier('4826','salt-A');
  const two=await hashPinVerifier('4826','salt-A');
  const three=await hashPinVerifier('4826','salt-B');
  assert.equal(one,two);
  assert.notEqual(one,three);
  assert.notEqual(one,'4826');
});

test('auth requests time out instead of leaving sign in pending forever', async()=>{
  const fetcher=async()=>new Promise(()=>{});
  const client=createSupabaseClient({url:'https://example.supabase.co',key:'sb_publishable_test',fetcher,storage:null,requestTimeoutMs:20});
  await assert.rejects(client.signIn('jace@example.com','secret'),/taking too long/i);
});

test('network fetch failures become a useful Supabase reachability error', async()=>{
  const fetcher=async()=>{throw new TypeError('Failed to fetch');};
  const client=createSupabaseClient({url:'https://example.supabase.co',key:'sb_publishable_test',fetcher,storage:null,requestTimeoutMs:20});
  await assert.rejects(client.signIn('jace@example.com','secret'),/could not reach supabase/i);
});
