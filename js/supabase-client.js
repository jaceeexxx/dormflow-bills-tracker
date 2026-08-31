const SESSION_KEY='dormflow:v3:session';
const safeStorage=()=>typeof localStorage!=='undefined'?localStorage:null;

async function readJson(response){
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(body.msg||body.message||body.error_description||'Request failed');error.status=response.status;error.body=body;throw error;}
  return body;
}

export function createSupabaseClient({url,key,fetcher=globalThis.fetch,storage=safeStorage(),requestTimeoutMs=15000,WebSocketImpl=globalThis.WebSocket}={}){
  const base=String(url||'').replace(/\/$/,'');
  let session=storage?.getItem(SESSION_KEY)?JSON.parse(storage.getItem(SESSION_KEY)):null;
  const headers=(extra={})=>({apikey:key,'Content-Type':'application/json',...(session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{}),...extra});
  async function fetchWithTimeout(input,init={}){
    const timeout=Math.max(100,Number(requestTimeoutMs)||15000);
    const controller=typeof AbortController!=='undefined'?new AbortController():null;
    let timer;
    const timeoutPromise=new Promise((_,reject)=>{
      timer=setTimeout(()=>{
        controller?.abort();
        const error=new Error('Supabase is taking too long to respond. Check your connection and try again.');
        error.code='DORMFLOW_TIMEOUT';
        reject(error);
      },timeout);
    });
    try{
      return await Promise.race([Promise.resolve(fetcher(input,{...init,...(controller?{signal:controller.signal}:{})})),timeoutPromise]);
    }catch(error){
      if(error?.code==='DORMFLOW_TIMEOUT'||error?.name==='AbortError') throw new Error('Supabase is taking too long to respond. Check your connection and try again.');
      if(error instanceof TypeError||/failed to fetch|networkerror|network request failed/i.test(String(error?.message||error))) throw new Error('Could not reach Supabase. Check your internet connection, VPN/DNS, or browser extensions and try again.');
      throw error;
    }finally{clearTimeout(timer);}
  }

  async function request(path,{method='GET',body,headers:extra={}}={}){
    const res=await fetchWithTimeout(`${base}${path}`,{method,headers:headers(extra),body:body===undefined?undefined:JSON.stringify(body)});
    return readJson(res);
  }
  async function signIn(email,password){
    const next=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
    session={...next,expires_at:Math.floor(Date.now()/1000)+(next.expires_in||3600)};
    storage?.setItem(SESSION_KEY,JSON.stringify(session));return session;
  }
  async function refreshSession(){
    if(!session?.refresh_token) return null;
    const next=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}});
    session={...next,expires_at:Math.floor(Date.now()/1000)+(next.expires_in||3600)};storage?.setItem(SESSION_KEY,JSON.stringify(session));return session;
  }
  async function signOut(){
    if(session?.access_token){try{await request('/auth/v1/logout',{method:'POST'});}catch{}}
    session=null;storage?.removeItem(SESSION_KEY);
  }
  async function getIdentity(){return request('/rest/v1/rpc/current_identity_v3',{method:'POST',body:{}});}
  async function rpc(name,args={}){return request(`/rest/v1/rpc/${encodeURIComponent(name)}`,{method:'POST',body:args});}
  async function select(table,query=''){return request(`/rest/v1/${table}${query?`?${query}`:''}`);}
  async function insert(table,row,{returning=true}={}){return request(`/rest/v1/${table}`,{method:'POST',body:row,headers:returning?{Prefer:'return=representation'}:{}});}
  async function update(table,query,patch){return request(`/rest/v1/${table}?${query}`,{method:'PATCH',body:patch,headers:{Prefer:'return=representation'}});}
  async function remove(table,query){return request(`/rest/v1/${table}?${query}`,{method:'DELETE',headers:{Prefer:'return=representation'}});}
  async function upload(bucket,path,file){
    const res=await fetchWithTimeout(`${base}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${session?.access_token||''}`,'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file});
    return readJson(res);
  }
  async function removeStorageObject(bucket,path){
    const res=await fetchWithTimeout(`${base}/storage/v1/object/${bucket}/${path}`,{method:'DELETE',headers:{apikey:key,Authorization:`Bearer ${session?.access_token||''}`}});
    if(res.status===204)return true;
    return readJson(res);
  }
  async function createSignedUrl(bucket,path,expiresIn=300){
    const data=await request(`/storage/v1/object/sign/${bucket}/${path}`,{method:'POST',body:{expiresIn}});
    const raw=data.signedURL||data.signedUrl||'';
    const absolute=raw.startsWith('http')?raw:raw.startsWith('/storage/v1')?`${base}${raw}`:`${base}/storage/v1${raw}`;
    return {...data,signedURL:absolute,signedUrl:absolute};
  }
  function createRealtimeChannel({name='household',changes=[],onChange=()=>{},onStatus=()=>{}}={}){
    if(!WebSocketImpl||!base||!key)return {close(){},status:'unsupported'};
    const wsBase=base.replace(/^http/i,'ws');let socket=null,heartbeat=null,reconnectTimer=null,active=true,ref=0;
    const topic=`realtime:${name}`;
    const nextRef=()=>String(++ref);
    const send=(event,payload={},target=topic)=>{if(socket?.readyState===1||socket?.readyState===undefined)socket.send(JSON.stringify({topic:target,event,payload,ref:nextRef(),join_ref:'1'}));};
    const connect=()=>{
      if(!active)return;
      socket=new WebSocketImpl(`${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`);
      socket.onopen=()=>{
        onStatus('connected');
        send('phx_join',{config:{broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:changes.map(change=>({event:change.event||'*',schema:change.schema||'public',table:change.table,...(change.filter?{filter:change.filter}:{})}))},access_token:session?.access_token||null});
        heartbeat=setInterval(()=>send('heartbeat',{},'phoenix'),25000);
      };
      socket.onmessage=event=>{try{const message=JSON.parse(event.data);if(message.event==='postgres_changes'){const data=message.payload?.data||message.payload||{};onChange({...data,table:data.table||message.payload?.table,eventType:data.type||data.eventType||data.event});}}catch{}};
      socket.onerror=()=>onStatus('error');
      socket.onclose=()=>{clearInterval(heartbeat);heartbeat=null;onStatus('closed');if(active)reconnectTimer=setTimeout(connect,1800);};
    };
    connect();
    return {close(){active=false;clearInterval(heartbeat);clearTimeout(reconnectTimer);try{send('phx_leave',{});}catch{}try{socket?.close();}catch{}},get socket(){return socket;}};
  }
  return {signIn,signOut,refreshSession,getSession:()=>session,getIdentity,rpc,select,insert,update,remove,upload,removeStorageObject,createSignedUrl,createRealtimeChannel};
}
