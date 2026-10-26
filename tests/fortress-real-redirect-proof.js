'use strict';
// Contrôle contradictoire : vrai SW, vraies redirections HTTP, CacheStorage natif.
// Les seules données réseau sont les sources publiques épinglées puis deux serveurs loopback.
const fs = require('node:fs'), http = require('node:http'), crypto = require('node:crypto'), assert = require('node:assert/strict'), pw = require('playwright');
const matrix = [
  {app:'race',repo:'iPoower/iPoower',file:'src/sw.js',cache:'twrc-static-v12',old:'6d10cd9759f20531d97acb4c9ecae91479b21b57',oldHash:'e63651847fbf42bc7220c92b978d5473151c2121787bd93ded5f33f591f86fcd',head:'4353cd218cf036edc2d3b8c44806f85d08358e8c',hash:'77f6d623342e4e3d7a4d04aeb7cc7e39dca840ab3884d15f34446679de3ea9d0'},
  {app:'vault',repo:'iPoower/Control-Vault',file:'public/sw.js',cache:'cv-shell-v4',old:'ac7e7af06c9bca68066717a7b45c18ced1dd91af',oldHash:'38b52ddd5de4f29d6c55021d12139b56f8fa4c0f99c5ba909b45a08ad1e3cad8',head:'f0b93ab1588f322b1ccb6a7ad074ad1c755cb73c',hash:'3992b0fb34e31aee3e35d4fbf3dfafb49d80c744af4b6bc26141f571eeae6008'}
];
const receipts=[];
const start = server => new Promise(resolve => server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
const close = server => new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
async function source(app, old) {
  const sha=old?app.old:app.head, expected=old?app.oldHash:app.hash;
  const response=await fetch(`https://raw.githubusercontent.com/${app.repo}/${sha}/${app.file}`);
  assert(response.ok);const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected);
  return bytes.toString('utf8');
}
async function scenario(browser, engine, app, old, worker) {
  let phase='initial';
  const external=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><body>UNTRUSTED_EXTERNAL</body></html>');});
  const foreign=await start(external);
  const server=http.createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    const send=(type,text)=>{res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(text);};
    if(path==='/sw.js')return send('text/javascript',worker);
    if(path==='/signin.html')return send('text/html','<html><body>UNTRUSTED_SIGNIN</body></html>');
    if(path==='/probe.html')return send('text/html','<html><body>CONTROL_PAGE</body></html>');
    if(['/', '/index', '/index.html'].includes(path)){
      if(phase==='secondary'||phase==='external'){res.writeHead(302,{Location:phase==='secondary'?'/signin.html':foreign+'/login'});return res.end();}
      return send('text/html','<html><body>TRUSTED_'+(phase==='updated'?'UPDATED':'INITIAL')+'</body></html>');
    }
    return send(path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'application/json','{}');
  });
  const origin=await start(server), context=await browser.newContext(), page=await context.newPage();
  const cacheText=async()=>{
    const probe=await context.newPage();
    try {await probe.goto(origin+'/probe.html');return await probe.evaluate(async name=>(await (await caches.open(name)).match(new URL('index.html',location.origin+'/').href)).text(),app.cache);}
    finally {await probe.close();}
  };
  try {
    await page.goto(origin+'/');
    await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(done=>navigator.serviceWorker.addEventListener('controllerchange',done,{once:true}));});
    assert.match(await cacheText(),/TRUSTED_INITIAL/);
    phase='secondary';const redirected=await page.goto(origin+'/index.html');
    const poisoned=(await cacheText()).includes('UNTRUSTED_SIGNIN');
    // L'hypothèse initiale « ancien code forcément contaminé » est réfutée
    // par les vrais navigateurs. Ne pas transformer la simulation en exploit.
    // Exiger l'invariant natif sur les DEUX versions et conserver l'observation.
    assert.equal(poisoned,false,app.app+' '+engine+' cache contaminé après redirection secondaire');
    const observed={url:page.url(),status:redirected?.status(),fromServiceWorker:redirected?.fromServiceWorker()};
    phase='updated';await page.goto(origin+'/index.html');assert.match(await cacheText(),/TRUSTED_UPDATED/);
    phase='external';try{await page.goto(origin+'/index.html',{timeout:10000});}catch{}
    assert.match(await cacheText(),/TRUSTED_UPDATED/);
    receipts.push({app:app.app,engine,sha:old?app.old:app.head,sourceSha256:old?app.oldHash:app.hash,old,secondaryPoisoned:poisoned,baselineVulnerabilityReproduced:old?poisoned:null,observed,legitimateUpdate:true,externalCachePreserved:true,status:'CONFIRME'});
    console.log('PASS',app.app,engine,old?'ancien code : contamination NON reproduite en HTTP natif':'candidat : cache préservé et shell légitime actualisé');
  } finally {await context.close();await close(server);await close(external);}
}
(async()=>{
  const sources=[];for(const app of matrix)sources.push([app,await source(app,true),await source(app,false)]);
  for(const engine of ['chromium','webkit']){
    const browser=await pw[engine].launch({proxy:{server:'http://127.0.0.1:9',bypass:'127.0.0.1,localhost'}});
    try {for(const [app,old,current]of sources){await scenario(browser,engine,app,true,old);await scenario(browser,engine,app,false,current);}}
    finally {await browser.close();}
  }
  fs.writeFileSync('fortress-real-redirect-proof.json',JSON.stringify({at:new Date().toISOString(),limits:'Loopback, sources SW réelles ; aucun Google réel, domaine publié ou iPhone physique.',receipts},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
