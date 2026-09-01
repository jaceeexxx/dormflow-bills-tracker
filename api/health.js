import {serviceRequest} from '../lib/server-supabase.js';

async function verifyServerCredential(){
  try{
    await serviceRequest('/rest/v1/push_subscriptions?select=id&limit=1');
    return {ok:true,label:'Verified'};
  }catch(error){return {ok:false,label:'Needs attention',error:error.message};}
}

export default async function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.setHeader('Allow','GET');return res.end(JSON.stringify({error:'Method not allowed'}));}
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  const serverCredential=await verifyServerCredential();
  const checks={
    supabaseUrl:{ok:Boolean(process.env.SUPABASE_URL),label:process.env.SUPABASE_URL?'Ready':'Missing'},
    browserKey:{ok:Boolean(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),label:(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?'Ready':'Missing'},
    serverCredential,
    vapidKeys:{ok:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY),label:(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)?'Ready':'Missing'},
    cron:{ok:Boolean(process.env.CRON_SECRET),label:process.env.CRON_SECRET?'Ready':'Missing'}
  };
  const ok=checks.supabaseUrl.ok&&checks.browserKey.ok&&checks.serverCredential.ok&&checks.vapidKeys.ok;
  res.statusCode=ok?200:503;
  res.end(JSON.stringify({
    ok,
    checks,
    supabaseConfigured:checks.supabaseUrl.ok&&checks.serverCredential.ok,
    pushConfigured:checks.vapidKeys.ok,
    cronConfigured:checks.cron.ok
  }));
}
