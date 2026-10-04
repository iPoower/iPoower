// Vrai Service Worker : installation, Cache Storage, fallback 503/offline, confidentialité cross-origin et reprise réseau.
'use strict';
const fs=require('fs'),http=require('http'),path=require('path'),pw=require('playwright');
const NAME=(process.env.BROWSER||'chromium').toLowerCase(),ROOT=process.cwd(),SITE=path.join(ROOT,'site');
const LOCAL='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fail=0;const rows=[],check=(n,ok,d='')=>{rows.push((ok?'✅':'❌')+' '+n+(d?' · '+d:''));if(!ok)fail++};
const type=f=>f.endsWith('.js')?'text/javascript':f.endsWith('.json')||f.endsWith('.webmanifest')?'application/json':f.endsWith('.png')?'image/png':'text/html';
let dataFail=false,seq=1,calHits=0;
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/race-control/harness.html'){
    res.writeHead(200,{'content-type':'text/html'});return res.end('<!doctype html><meta charset="utf-8"><title>SW harness</title><script>window.boot=navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).then(()=>navigator.serviceWorker.ready).then(()=>new Promise(r=>navigator.serviceWorker.controller?r():navigator.serviceWorker.addEventListener("controllerchange",r,{once:true})));</script>');
  }
  if(u.pathname==='/race-control/calendar.sealed.json'){
    calHits++; if(dataFail){res.writeHead(503,{'content-type':'text/plain'});return res.end('indisponible');}
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({sealed:{c:'fake-'+seq},seq}));
  }
  if(u.pathname==='/race-control/obs.json'){
    if(dataFail){res.writeHead(503,{'content-type':'text/plain'});return res.end('indisponible');}
    res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({updated:new Date().toISOString(),stations:{}}));
  }
  let rel=u.pathname.replace(/^\/race-control\/?/,'')||'index.html';
  const file=path.join(SITE,rel);
  if(!file.startsWith(SITE)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('not found');}
  res.writeHead(200,{'content-type':type(file),'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
let extHits=0;
const external=http.createServer((req,res)=>{extHits++;res.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});res.end('{"external":true}');});
const listen=s=>new Promise((ok,ko)=>s.listen(0,'127.0.0.1',()=>ok(s.address().port)).on('error',ko));
(async()=>{
  const port=await listen(server),extPort=await listen(external),base='http://localhost:'+port+'/race-control/';
  const proxy={server:'http://127.0.0.1:9',bypass:'localhost,127.0.0.1'};
  const launch={proxy};
  if(NAME==='chromium'&&fs.existsSync(LOCAL))Object.assign(launch,{executablePath:LOCAL,args:['--no-sandbox']});
  const browser=NAME==='webkit'?await pw.webkit.launch(launch):await pw.chromium.launch(launch);
  const c=await browser.newContext({serviceWorkers:'allow'}),p=await c.newPage();
  p.on('pageerror',e=>rows.push('ERR '+e.message));

  await p.goto(base+'harness.html');await p.evaluate(()=>window.boot);
  const controlled=await p.evaluate(()=>!!navigator.serviceWorker.controller);
  const keys=await p.evaluate(()=>caches.keys());
  check('37.1 · vrai Service Worker installé et page contrôlée',controlled&&keys.includes('twrc-static-v7'),JSON.stringify(keys));

  const first=await p.evaluate(async()=>({status:(r=>r.status)(await fetch('./calendar.sealed.json?t=111')),body:await (await fetch('./calendar.sealed.json?t=112')).json()}));
  const cacheState=await p.evaluate(async()=>{
    const ks=await caches.keys(),urls=[];for(const k of ks){const ca=await caches.open(k);for(const r of await ca.keys())urls.push(r.url);}
    return {ks,urls};
  });
  check('37.2 · agenda mis en cache sous URL canonique sans query',first.status===200&&first.body.seq===1&&cacheState.urls.some(u=>/calendar\.sealed\.json$/.test(u))&&!cacheState.urls.some(u=>/calendar\.sealed\.json\?/.test(u)),JSON.stringify(cacheState.urls.filter(u=>/calendar/.test(u))));

  await p.evaluate(async u=>{const r=await fetch(u);if(!r.ok)throw new Error('external');},'http://127.0.0.1:'+extPort+'/probe?gps=49.000,2.000');
  const extCached=await p.evaluate(async()=>{for(const k of await caches.keys()){const ca=await caches.open(k);for(const r of await ca.keys())if(/127\.0\.0\.1/.test(r.url)&&/probe/.test(r.url))return true;}return false;});
  check('37.3 · origine externe jamais persistée par le SW',extHits===1&&!extCached);

  dataFail=true;
  const degraded=await p.evaluate(async()=>{const r=await fetch('./calendar.sealed.json?t=503');return {status:r.status,j:await r.json()};});
  check('37.4 · HTTP 503 : dernière donnée valide servie depuis Cache Storage',degraded.status===200&&degraded.j.seq===1,JSON.stringify(degraded));

  await c.setOffline(true);
  const nav=await p.goto(base+'index.html',{waitUntil:'domcontentloaded'}).catch(()=>null);
  const title=await p.title().catch(()=>''),offlineCal=await p.evaluate(async()=>{const r=await fetch('./calendar.sealed.json?t=offline');return {status:r.status,j:await r.json()};}).catch(()=>null);
  check('37.5 · vraie navigation hors ligne : shell PWA + agenda restent disponibles',!!nav&&nav.status()===200&&/RACE CONTROL/i.test(title)&&offlineCal&&offlineCal.status===200&&offlineCal.j.seq===1,(nav&&nav.status())+' '+title+' '+JSON.stringify(offlineCal));

  await c.setOffline(false);dataFail=false;seq=2;
  await p.goto(base+'harness.html');await p.evaluate(()=>window.boot);
  const fresh=await p.evaluate(async()=>{const r=await fetch('./calendar.sealed.json?t=back');return {status:r.status,j:await r.json()};});
  await c.setOffline(true);
  const cached2=await p.evaluate(async()=>{const r=await fetch('./calendar.sealed.json?t=again');return (await r.json()).seq;});
  check('37.6 · retour réseau : cache remplacé par la donnée fraîche',fresh.status===200&&fresh.j.seq===2&&cached2===2,'hits='+calHits);

  console.log(rows.join('\n')+'\n\n'+(rows.length-fail)+'/'+rows.length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
  await c.close();await browser.close();await new Promise(r=>server.close(r));await new Promise(r=>external.close(r));
  process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);
})().catch(async e=>{console.error(e);try{server.close();external.close();}catch(_){}process.exit(1);});
