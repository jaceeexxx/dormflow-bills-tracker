const url=()=>process.env.SUPABASE_URL?.replace(/\/$/,'');
const key=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
const browserKey=()=>process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||key();

async function readJsonResponse(res){
  const text=await res.text();
  const data=text?JSON.parse(text):null;
  if(!res.ok)throw new Error(data?.message||data?.error||`Supabase request failed (${res.status})`);
  return data;
}

export async function serviceRequest(path,{method='GET',body,headers={}}={}){
  if(!url()||!key())throw new Error('Supabase server environment is not configured');
  const res=await fetch(`${url()}${path}`,{method,headers:{apikey:key(),Authorization:`Bearer ${key()}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return readJsonResponse(res);
}

export async function userRequest(accessToken,path,{method='GET',body,headers={}}={}){
  if(!url()||!browserKey())throw new Error('Supabase browser environment is not configured');
  if(!accessToken)throw new Error('Invalid session');
  const res=await fetch(`${url()}${path}`,{method,headers:{apikey:browserKey(),Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return readJsonResponse(res);
}

export async function authUser(accessToken){
  if(!url()||!browserKey())throw new Error('Supabase browser environment is not configured');
  const res=await fetch(`${url()}/auth/v1/user`,{headers:{apikey:browserKey(),Authorization:`Bearer ${accessToken}`}});
  if(!res.ok)throw new Error('Invalid session');
  return res.json();
}

export async function currentIdentityFromToken(accessToken){
  const identity=await userRequest(accessToken,'/rest/v1/rpc/current_identity_v3',{method:'POST',body:{}});
  const row=Array.isArray(identity)?identity[0]:identity;
  if(!row?.member_id&&!row?.memberId)throw new Error('Household membership required');
  return row;
}
