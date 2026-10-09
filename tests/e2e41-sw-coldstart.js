// Démarrage à froid hors ligne avec le VRAI Service Worker et un profil persistant :
// installation → navigateur entièrement fermé → relance réseau coupé → app utilisable avec la dernière météo, datée, jamais LIVE.
// Aussi : purge d'un ancien cache à l'activation, et réseau qui ne répond pas (lie-fi) → shell servi en ≤ 3,5 s.
// Playwright ne pilote les Service Workers que sous Chromium : non applicable sur WebKit (e2e36 couvre l'offline applicatif).
'use strict';
const fs=require('fs'),os=require('os'),http=require('http'),path=require('path'),pw=require('playwright');
const NAME=(process.env.BROWSER||'chromium').toLowerCase(),SITE=path.join(process.cwd(),'site');
const LOCAL='/opt/pw-browsers/chromium-1194/chrome-linux/chrome',PW=fs.readFileSync('.passphrase','utf8').trim();
if(NAME!=='chromium'){console.log('↪️ démarrage à froid avec Service Worker : Chromium uniquement (non applicable sur '+NAME+')\n\n0/0 scénarios OK · erreurs JS : aucune');process.exit(0);}
let fail=0;const rows=[],check=(n,ok,d='')=>{rows.push((ok?'✅':'❌')+' '+n+(d?' · '+d:''));if(!ok)fail++};
const type=f=>f.endsWith('.js')?'text/javascript':f.endsWith('.json')||f.endsWith('.webmanifest')?'application/json':f.endsWith('.png')?'image/png':'text/html';
let hang=false;const held=[];
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/race-control/harness.html'){res.writeHead(200,{'content-type':'text/html'});
    return res.end('<!doctype html><meta charset="utf-8"><script>window.boot=navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).then(()=>navigator.serviceWorker.ready).then(()=>new Promise(r=>navigator.serviceWorker.controller?r():navigator.serviceWorker.addEventListener("controllerchange",r,{once:true})));</script>');}
  const rel=u.pathname.replace(/^\/race-control\/?/,'')||'index.html',file=path.join(SITE,rel);
  if(hang&&/^(index\.html)?$/.test(rel)){held.push(res);return;}   // lie-fi : la connexion s'ouvre mais aucune réponse n'arrive
  if(!file.startsWith(SITE)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('not found');}
  res.writeHead(200,{'content-type':type(file),'cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
(async()=>{
  const port=await new Promise((ok,ko)=>server.listen(0,'127.0.0.1',()=>ok(server.address().port)).on('error',ko)),base='http://localhost:'+port+'/race-control/';
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'twrc-sw-'));
  // proxy inexistant : aucune requête externe (météo, cartes) ne peut sortir ; seul le serveur local répond
  // heure fixe dans la page (les timers continuent) : un lundi 06:00, avant le trajet du matin. Sans elle, le verdict du briefing
  // dépendait de l'heure réelle du run (après 16:00 un mercredi : plus aucun trajet, donc aucune jauge → 41.3 rouge).
  const AT=new Date('2026-10-05T06:00:00+02:00');
  const open=async()=>{const c=await pw.chromium.launchPersistentContext(dir,{...(fs.existsSync(LOCAL)?{executablePath:LOCAL}:{}),args:['--no-sandbox'],serviceWorkers:'allow',
    proxy:{server:'http://127.0.0.1:9',bypass:'localhost'},viewport:{width:414,height:896},timezoneId:'Europe/Paris'});await c.clock.setFixedTime(AT);return c;};
  // 1. première visite en ligne : un ancien cache traîne, le SW s'installe, l'app est déverrouillée, une météo valide est mémorisée
  let c=await open(),p=c.pages()[0]||await c.newPage();p.on('pageerror',e=>rows.push('ERR '+e.message));
  await p.goto(base+'harness.html');await p.evaluate(async()=>{const ca=await caches.open('twrc-static-v1');await ca.put('/ancien',new Response('x'));});
  await p.evaluate(()=>window.boot);
  const keys=await p.evaluate(()=>caches.keys());
  check('41.1 · SW activé : ancien cache twrc-static-v1 purgé, cache courant présent',!keys.includes('twrc-static-v1')&&keys.some(k=>/^twrc-static-v\d+$/.test(k)),JSON.stringify(keys));
  await p.goto(base+'index.html');await p.waitForSelector('#statusbar .badge');await p.waitForTimeout(500);
  const lockUi=await p.evaluate(()=>({form:!!(document.querySelector('#unlockForm')&&document.querySelector('#unlockForm').offsetParent),noWeather:/indisponible/i.test(document.querySelector('#notice').innerText)}));
  check('41.0 · météo indisponible au premier lancement : déverrouillage toujours proposé',lockUi.form&&lockUi.noWeather,JSON.stringify(lockUi));
  if(await p.locator('#unlockPw').count()){await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);}
  await p.waitForFunction(()=>typeof allLocs==='function'&&typeof makeDemoPayload==='function');
  await p.evaluate(async()=>{
    const locs=allLocs().filter(l=>!l.gps&&locHasCoords(l));
    if(!locs.length)throw new Error('Aucun lieu fictif à préparer pour le redémarrage hors ligne.');
    locs.forEach(l=>localStorage.setItem('twrc.cache.'+l.id,JSON.stringify({t:Date.now()-20*60e3,lat:l.lat,lon:l.lon,p:makeDemoPayload('doux',l,'Europe/Paris')})));
    // localStorage est le magasin mémoire du coffre : fermer le contexte avant flush interrompt WebCrypto.
    // Attendre la vraie écriture vérifiée, pas un délai arbitraire ; les assertions de reprise restent inchangées.
    if(!window.TWRC_VAULT)throw new Error('Coffre de session absent avant fermeture.');
    await TWRC_VAULT.flush();
    if(TWRC_VAULT.error)throw new Error('Écriture chiffrée de la météo fictive non confirmée.');
  });
  await c.close();   // fermeture complète : plus aucune page en mémoire

  // 2. réouverture de la PWA, réseau coupé avant toute requête
  c=await open();await c.setOffline(true);p=c.pages()[0]||await c.newPage();p.on('pageerror',e=>rows.push('ERR '+e.message));
  const t0=Date.now(),nav=await p.goto(base,{waitUntil:'domcontentloaded'}).catch(e=>null);
  await p.waitForSelector('#statusbar .badge',{timeout:15000}).catch(()=>null);await p.waitForTimeout(800);
  // sécurité V1 : réouverture = code demandé (données chiffrées au repos) ; le déverrouillage doit marcher HORS LIGNE
  const askedCode=await p.locator('#unlockPw').count()>0;
  check('41.2b · réouverture : code demandé, aucune donnée personnelle chargée avant',askedCode&&await p.evaluate(()=>!window.TWRC_PRESET),String(askedCode));
  if(askedCode){await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await p.waitForSelector('#statusbar .badge',{timeout:15000}).catch(()=>null);await p.waitForTimeout(800);}
  const st=await p.evaluate(()=>({bar:(document.querySelector('#statusbar')||{}).innerText||'',hours:typeof M!=='undefined'&&M[UI.loc]?M[UI.loc].hs.length:0,gauge:!!document.querySelector('.gauge'),locked:!!(document.querySelector('#unlockPw')&&document.querySelector('#unlockPw').offsetParent)})).catch(e=>({err:e.message}));
  check('41.2 · démarrage à froid hors ligne : shell servi par le SW',!!nav&&nav.status()===200,(nav&&nav.status())+' en '+(Date.now()-t0)+' ms');
  check('41.3 · démarrage à froid hors ligne : déverrouillée hors ligne, dernière météo et verdict affichés',!st.locked&&st.hours>=24&&st.gauge,JSON.stringify(st).slice(0,200));
  check('41.4 · démarrage à froid hors ligne : HORS LIGNE + données datées, jamais LIVE',/HORS LIGNE/.test(st.bar)&&/cache/i.test(st.bar)&&!/\bLIVE\b/.test(st.bar),String(st.bar).replace(/\s+/g,' '));
  await c.close();

  // 3. lie-fi : réseau « connecté » mais le serveur ne répond jamais → shell en cache sans attendre indéfiniment
  hang=true;c=await open();p=c.pages()[0]||await c.newPage();
  const t1=Date.now(),nav2=await p.goto(base,{waitUntil:'domcontentloaded',timeout:20000}).catch(()=>null),dt=Date.now()-t1;
  const ok2=await p.locator('#statusbar').count().catch(()=>0);
  check('41.5 · réseau qui ne répond pas : shell en cache servi en ≤ 3,5 s',!!nav2&&nav2.status()===200&&ok2>0&&dt<=3500,dt+' ms');
  held.splice(0).forEach(r=>{try{r.destroy()}catch(e){}});hang=false;
  await c.close();fs.rmSync(dir,{recursive:true,force:true});

  console.log(rows.join('\n')+'\n\n'+(rows.length-fail)+'/'+rows.length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
  await new Promise(r=>server.close(r));process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);
})().catch(e=>{console.error(e);try{server.close()}catch(_){}process.exit(1);});
