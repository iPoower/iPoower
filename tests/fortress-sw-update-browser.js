'use strict';
// Source SW épinglée, fixtures loopback et profils jetables, aucune donnée utilisateur.
const {chromium,webkit}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const SHA=b=>crypto.createHash('sha256').update(b).digest('hex');
const apps=[{name:'RC',old:'rc-old.js',next:'rc-new.js',cache:'twrc-static-v12'},{name:'CV',old:'cv-old.js',next:'cv-new.js',cache:'cv-shell-v4'}];
const dir='tests/fixtures/fortress-sw-update';
async function run(app,engine,launcher){
 let current=fs.readFileSync(path.join(dir,app.old),'utf8'), next=fs.readFileSync(path.join(dir,app.next),'utf8');
 if(app.name==='CV'){current=current.replace('/* @build-assets */ []','["./assets/fixture.js"]');next=next.replace('/* @build-assets */ []','["./assets/fixture.js"]')}
 const sockets=new Set();let closed=false;const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture.invalid');if(url.pathname==='/index.html'){res.writeHead(308,{Location:'/'});return res.end()}if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<!doctype html><p id="fixture">Test fictif</p><script src="/assets/fixture.js"></script>')}if(url.pathname==='/sw.js'){res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});return res.end(current)}if(url.pathname==='/assets/fixture.js'){res.writeHead(200,{'Content-Type':'application/javascript'});return res.end('document.body.dataset.fixture="ready"')}res.writeHead(200,{'Content-Type':url.pathname.endsWith('.json')?'application/json':'application/octet-stream'});res.end('{}')});
 server.on('connection',s=>{sockets.add(s);s.on('error',()=>{});s.on('close',()=>sockets.delete(s))});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'fortress-update-fixture-'));let context;
 const opts={headless:true,serviceWorkers:'allow'};
 const readFixture=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('fortress-fixture',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('items','readonly'),q=tx.objectStore('items').get('id');q.onsuccess=()=>{const v=q.result;tx.oncomplete=()=>{db.close();resolve(v)}};tx.onabort=()=>{db.close();reject(tx.error)}}});
 try{
  context=await launcher.launchPersistentContext(profile,opts);let page=context.pages()[0]||await context.newPage();await page.goto(origin+'/');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));localStorage.setItem('fortress.fixture','local');await new Promise((resolve,reject)=>{const q=indexedDB.open('fortress-fixture',1);q.onupgradeneeded=()=>q.result.createObjectStore('items');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,tx=db.transaction('items','readwrite');tx.objectStore('items').put('idb','id');tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>{db.close();reject(tx.error)}}})});
  const before=await page.evaluate(async name=>{const r=await (await caches.open(name)).match('./index.html');return {redirected:r?.redirected,url:r?.url}},app.cache);
  if(!before.redirected)throw Error('fixture de mise à jour attend un ancien shell redirigé');
  current=next;
  await page.evaluate(async()=>{const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));await (await navigator.serviceWorker.getRegistration()).update();await Promise.race([changed,new Promise((_,reject)=>setTimeout(()=>reject(Error('mise à jour SW non activée')),20000))])});
  const after=await page.evaluate(async name=>{const r=await (await caches.open(name)).match('./index.html');return {redirected:r?.redirected,url:r?.url}},app.cache);
  if(after.redirected||after.url!==origin+'/')throw Error('nouveau shell non canonique : '+JSON.stringify(after));
  if(await page.evaluate(readFixture)!=='idb'||await page.evaluate(()=>localStorage.getItem('fortress.fixture'))!=='local')throw Error('données fictives perdues après mise à jour');
  for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));closed=true;
  for(let i=0;i<2;i++){await page.reload({waitUntil:'domcontentloaded',timeout:15000});if(!(await page.locator('#fixture').isVisible()))throw Error('shell hors ligne absent');if(await page.evaluate(readFixture)!=='idb')throw Error('IDB perdue')}
  await context.close();context=null;context=await launcher.launchPersistentContext(profile,opts);page=context.pages()[0]||await context.newPage();await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:15000});if(!(await page.locator('#fixture').isVisible())||await page.evaluate(readFixture)!=='idb'||await page.evaluate(()=>localStorage.getItem('fortress.fixture'))!=='local')throw Error('réouverture hors ligne ou persistance échouée');
  return {app:app.name,engine,oldSourceSha256:SHA(fs.readFileSync(path.join(dir,app.old))),newSourceSha256:SHA(fs.readFileSync(path.join(dir,app.next))),before,after,offlineReloads:2,fullBrowserRestart:true,localStorageAndIndexedDBPreserved:true,state:'CONFIRME'};
 }finally{if(context)await context.close();if(!closed){for(const s of sockets)s.destroy();await new Promise(r=>server.close(r))}fs.rmSync(profile,{recursive:true,force:true})}
}
(async()=>{const out={scope:'SW sources exactes, fixtures sur loopback, coupure TCP réelle ; pas de site publié, iPhone physique ou Google',cases:[],failures:[]};for(const app of apps)for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]])try{out.cases.push(await run(app,engine,launcher))}catch(e){out.failures.push({app:app.name,engine,error:e.message})}fs.writeFileSync('fortress-sw-update-browser.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));if(out.failures.length)process.exitCode=1})().catch(e=>{console.error(e);process.exitCode=1});
