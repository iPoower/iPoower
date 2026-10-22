// Origine dédiée : vrai Service Worker servi par l'application (origine A) et données publiques du relais
// servies par l'ancien hébergement (origine B, CORS). Seuls obs/agenda/DATEX directement sous DATA_BASE
// sont gardés hors ligne ; aucun autre chemin, aucune réponse opaque, aucune autre origine.
// Playwright ne pilote les Service Workers que sous Chromium.
'use strict';
const fs=require('fs'),http=require('http'),path=require('path'),pw=require('playwright');
const ROOT=process.cwd(),SITE=path.join(ROOT,'site'),LOCAL='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fail=0;const rows=[],check=(n,ok,d='')=>{rows.push((ok?'✅':'❌')+' '+n+(d?' · '+d:''));if(!ok)fail++};
const type=f=>f.endsWith('.js')?'text/javascript':f.endsWith('.json')||f.endsWith('.webmanifest')?'application/json':f.endsWith('.png')?'image/png':'text/html';
let dataBase='',dataFail=false,cors=true,seq=1;const hits={};
// Même substitution que tools/build.js (qui n'accepte que https) ; marqueur unique vérifié.
const MARK="const DATA_BASE = '';",swSource=fs.readFileSync(path.join(SITE,'sw.js'),'utf8');
if(swSource.split(MARK).length!==2)throw new Error('Marqueur DATA_BASE absent du SW construit');
const app=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/race-control/harness.html'){res.writeHead(200,{'content-type':'text/html'});return res.end('<!doctype html><meta charset="utf-8"><title>SW harness</title><script>window.boot=navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).then(()=>navigator.serviceWorker.ready).then(()=>new Promise(r=>navigator.serviceWorker.controller?r():navigator.serviceWorker.addEventListener("controllerchange",r,{once:true})));</script>');}
  if(u.pathname==='/race-control/sw.js'){res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});return res.end(swSource.replace(MARK,'const DATA_BASE = '+JSON.stringify(dataBase)+';'));}
  const rel=u.pathname.replace(/^\/race-control\/?/,'')||'index.html',file=path.join(SITE,rel);
  if(!file.startsWith(SITE)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('not found');}
  res.writeHead(200,{'content-type':type(file),'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
const datex=()=>{const t=new Date().toISOString();return {schema:1,provider:'datex',complete:true,events:[],coverage:'fictif',checkedAt:t,publicationTime:t,seq};};
const data=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');hits[u.pathname]=(hits[u.pathname]||0)+1;
  const head={'content-type':'application/json','cache-control':'no-store',...(cors?{'access-control-allow-origin':'*'}:{})};
  if(dataFail){res.writeHead(503,head);return res.end('{}');}
  if(/\/road-datex\.json$/.test(u.pathname)){res.writeHead(200,head);return res.end(JSON.stringify(datex()));}
  res.writeHead(200,head);res.end(JSON.stringify({seq,path:u.pathname}));
});
const listen=s=>new Promise((ok,ko)=>s.listen(0,'127.0.0.1',()=>ok(s.address().port)).on('error',ko));
const cached=p=>p.evaluate(async()=>{const urls=[];for(const k of await caches.keys()){const ca=await caches.open(k);for(const r of await ca.keys())urls.push(r.url);}return urls;});
(async()=>{
  const portA=await listen(app),portB=await listen(data),base='http://localhost:'+portA+'/race-control/';
  dataBase='http://127.0.0.1:'+portB+'/race-control/';
  const browser=await pw.chromium.launch(fs.existsSync(LOCAL)?{executablePath:LOCAL,args:['--no-sandbox']}:{});
  const c=await browser.newContext({serviceWorkers:'allow'}),p=await c.newPage();
  p.on('pageerror',e=>rows.push('ERR '+e.message));
  await p.goto(base+'harness.html');await p.evaluate(()=>window.boot);
  check('84.1 · SW de l’origine applicative installé et page contrôlée',await p.evaluate(()=>!!navigator.serviceWorker.controller));

  const get=(u,o)=>p.evaluate(async([u,o])=>{try{const r=await fetch(u,o);return {s:r.status,t:r.type,j:r.type==='opaque'?null:await r.json().catch(()=>null)};}catch(e){return {err:String(e)};}},[u,o]);
  const first=await Promise.all(['obs.json?t=1','calendar.sealed.json?t=1','road-datex.json?t=1'].map(f=>get(dataBase+f)));
  let urls=await cached(p);
  check('84.2 · obs, agenda chiffré et DATEX de l’origine de données gardés sous URL canonique',
    first.every(r=>r.s===200)&&['obs.json','calendar.sealed.json','road-datex.json'].every(f=>urls.includes(dataBase+f))&&!urls.some(u=>u.includes('?')),JSON.stringify(urls));

  await get(dataBase+'sub/obs.json');await get('http://127.0.0.1:'+portB+'/autre/obs.json');await get(dataBase+'probe?gps=49.000,2.000');
  urls=await cached(p);
  check('84.3 · sous-dossier, autre chemin et URL avec coordonnées jamais persistés',!urls.some(u=>/sub\/obs|autre\/obs|probe/.test(u)),JSON.stringify(urls));

  dataFail=true;
  const degraded=await get(dataBase+'obs.json?t=503'),road=await get(dataBase+'road-datex.json?t=503');
  check('84.4 · origine de données en 503 : dernières copies valides servies',degraded.s===200&&degraded.j.seq===1&&road.s===200&&road.j.seq===1,JSON.stringify([degraded,road]));

  await c.setOffline(true);
  const off=await Promise.all(['obs.json?t=off','calendar.sealed.json?t=off'].map(f=>get(dataBase+f)));
  check('84.5 · hors ligne : données du relais toujours disponibles',off.every(r=>r.s===200&&r.j&&r.j.seq===1),JSON.stringify(off));
  await c.setOffline(false);dataFail=false;

  cors=false;seq=2;
  // Le SW relit en no-cors (opaque, non stockable) puis en CORS refusé : il sert la dernière copie valide.
  const opaque=await get(dataBase+'obs.json?t=opaque',{mode:'no-cors'}),refused=await get(dataBase+'obs.json?t=refused');
  const entry=await p.evaluate(async u=>{const r=await (await caches.open('twrc-data-v3')).match(u);return r?{type:r.type,j:await r.json()}:null;},dataBase+'obs.json');
  cors=true;
  check('84.6 · réponse opaque ou CORS refusé : copie valide conservée, jamais remplacée',entry&&entry.type==='cors'&&entry.j.seq===1&&refused.s===200&&refused.j.seq===1&&!opaque.err,JSON.stringify([opaque,refused,entry]));

  const fresh=await get(dataBase+'obs.json?t=back');await c.setOffline(true);const now=await get(dataBase+'obs.json?t=now');
  check('84.7 · retour réseau : copie remplacée par la donnée fraîche',fresh.s===200&&fresh.j.seq===2&&now.j&&now.j.seq===2,JSON.stringify([fresh,now]));

  console.log(rows.join('\n')+'\n\n'+(rows.length-fail)+'/'+rows.length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
  await c.close();await browser.close();await new Promise(r=>app.close(r));await new Promise(r=>data.close(r));
  process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);
})().catch(e=>{console.error(e);try{app.close();data.close();}catch(_){}process.exit(1);});
