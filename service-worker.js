const CACHE_NAME='dormflow-v3-3-shell-1';
const STATIC_ASSETS=[
  '/','/index.html','/offline.html','/css/styles.css','/manifest.webmanifest',
  '/js/app.js','/js/router.js','/js/icons.js','/js/config.js','/js/auth.js','/js/supabase-client.js',
  '/js/banking-carousel.js','/js/household-media.js','/js/people-settings.js','/js/member-home.js','/js/member-balance.js','/js/member-payments.js','/js/member-more.js',
  '/assets/brand/dormflow-mark.svg','/assets/brand/icon-192.png','/assets/brand/icon-512.png'
];

async function updateCache(request,response){
  if(response?.ok){
    const cache=await caches.open(CACHE_NAME);
    await cache.put(request,response.clone());
  }
  return response;
}
async function networkFirst(request,{fallback=null}={}){
  try{return await updateCache(request,await fetch(request));}
  catch{
    const cached=await caches.match(request);
    if(cached)return cached;
    if(fallback)return await caches.match(fallback);
    throw new Error('Offline and no cached response is available.');
  }
}
async function cacheFirst(request){
  const cached=await caches.match(request);
  if(cached)return cached;
  return updateCache(request,await fetch(request));
}

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC_ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')||url.hostname.includes('supabase.co')){
    event.respondWith(fetch(request));
    return;
  }
  if(url.origin!==self.location.origin)return;
  const releaseCritical=request.mode==='navigate'||url.pathname.endsWith('.css')||url.pathname.endsWith('.js');
  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,{fallback:'/index.html'}).then(response=>response||caches.match('/offline.html')));
    return;
  }
  if(releaseCritical){
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
self.addEventListener('push',event=>{
  let data={title:'DormFlow',body:'You have a new notification.',url:'/#/notifications'};
  try{data={...data,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'/assets/brand/icon-192.png',badge:'/assets/brand/icon-192.png',data:{url:data.url||'/#/notifications'},tag:data.notificationId||undefined}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=event.notification.data?.url||'/#/notifications';
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{for(const client of clients){if('focus' in client){client.navigate(url);return client.focus();}}return self.clients.openWindow(url);}));
});
