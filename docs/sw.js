/* Service worker: l’app funziona anche offline dopo la prima apertura */
const VERSION='2a30069fa8';
const CACHE='fiati-'+VERSION;
const SHELL=['./','index.html','app.css','app.js','config.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('fiati-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(/supabase\.(co|in)$/.test(url.hostname))return; // dati e accesso: sempre dalla rete
  const same=url.origin===location.origin;
  if(same&&/\/(sounds|vendor|icons)\//.test(url.pathname)){ // file pesanti e stabili: prima la cache
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));}return res;})));
    return;
  }
  if(same){ // pagina e codice: prima la rete, così gli aggiornamenti arrivano subito
    e.respondWith(fetch(req).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));}return res;})
      .catch(()=>caches.match(req,{ignoreSearch:true}).then(hit=>hit||(req.mode==='navigate'?caches.match('index.html'):undefined))));
    return;
  }
  // font e librerie esterne: risposta dalla cache e aggiornamento in sottofondo
  e.respondWith(caches.match(req).then(hit=>{
    const net=fetch(req).then(res=>{if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));}return res;}).catch(()=>hit);
    return hit||net;
  }));
});
