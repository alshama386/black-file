/* BLACK FILE service worker. Keeps app-shell offline, never caches private API responses. */
const CACHE='blackfile-shell-v4.0-20261018';
const SHELL=['./','./index.html','./style.css?v=3.1.0','./v3.css?v=3.1.0','./data.js?v=3.1.0','./app.js?v=3.1.0','./v3-config.js?v=3.1.0','./v3.js?v=4.0.0','./control.js?v=4.0.0','./control.css?v=4.0.0','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==self.location.origin)return; // Supabase + CDN never cached.
 if(e.request.mode==='navigate'){
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));}return r;}).catch(()=>caches.match('./index.html')));
  return;
 }
 // Prefer fresh assets after every GitHub Pages release; offline cache only as fallback.
 e.respondWith(fetch(e.request).then(response=>{
  if(response.ok){const copy=response.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}
  return response;
 }).catch(()=>caches.match(e.request)));
});
self.addEventListener('push',e=>{
 let data={title:'BLACK FILE',body:'عندك تحديث جديد في الملف الأسود'};
 try{if(e.data)data={...data,...e.data.json()};}catch{if(e.data)data.body=e.data.text();}
 e.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'./icon-192.png',badge:'./icon-192.png',tag:'blackfile-'+(data.id||'news'),data:{url:'./'}}));
});
self.addEventListener('notificationclick',e=>{
 e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async ws=>{
  for(const w of ws){if(w.url.includes(self.registration.scope)){await w.focus();return;}}
  return clients.openWindow('./');
 }));
});
