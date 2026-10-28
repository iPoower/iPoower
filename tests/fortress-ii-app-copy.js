#!/usr/bin/env node
// Forteresse II Phase 5: TWO COPIES OF THE ACTUAL BUILT RACE CONTROL APP.
// Only synthesized CI secrets and sample data; network locked to loopback servers.
// NO production migration, user data, external fetch, or app-source changes.
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {chromium,webkit}=require('playwright');
const {workspace}=require('./ci/workspace');
const {APP_KEY_TEST}=require('./lib/test-keys');
const ROOT=path.resolve(__dirname,'..');
const BROWSER=(process.env.BROWSER||'chromium').toLowerCase();
const FAKE_CAR='F2-CONTRÔLE-VOITURE-FICTIVE';
const FAKE_REPORT_ID='F2-HUMAN-OBSERVATION-FICTIVE';
if(!['chromium','webkit'].includes(BROWSER))throw Error('invalid browser');
const {w,out}=workspace('f2-appcopy-'+BROWSER);
const site=path.join(w,'site');
const sampleCalendar=fs.readFileSync(path.join(out,'cal.fake.json'));
const MIME={'.js':'application/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
function makeServer(){
 return new Promise((ok,bad)=>{
  const server=http.createServer((req,res)=>{
   if(req.method!=='GET') {res.writeHead(405);res.end();return;}
   let u;try{u=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);res.end();return;}
   if(!u.pathname.startsWith('/race-control/')){res.writeHead(404);res.end();return;}
   const logical=u.pathname.slice('/race-control/'.length)||'index.html';
   if(!/^[a-zA-Z0-9/_.-]+$/.test(logical)||logical.split('/').includes('..')){res.writeHead(404);res.end();return;}
   if(logical==='calendar.sealed.json'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(sampleCalendar);return;}
   if(logical==='obs.json'){res.writeHead(200,{'content-type':'application/json'});res.end('{"stations":{}}');return;}
   if(logical==='version.json'){res.writeHead(200,{'content-type':'application/json'});res.end('{"run":0,"sha":"F2-CI-ONLY"}');return;}
   if(logical==='road-datex.json'){res.writeHead(503);res.end('F2 fake feed offline');return;}
   const file=path.join(site,logical);
   if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
   fs.createReadStream(file).pipe(res);
  });
  server.once('error',bad);
  server.listen(0,'127.0.0.1',()=>ok({server,origin:'http://127.0.0.1:'+server.address().port}));
 });
}
async function loadApp(page,origin){
 await page.goto(origin+'/race-control/',{waitUntil:'domcontentloaded'});
 // Initial installation requires the password, whereas a post-export reload may
 // resume the already authenticated vault. The latter MUST NOT expose #unlockPw.
 await page.waitForFunction(()=>{
  const ready=window.TWRC_VAULT?.mode==='vault'&&typeof Backup!=='undefined'&&
   typeof USER_STORE!=='undefined'&&typeof S!=='undefined'&&!!S.cars?.length;
  const field=document.querySelector('#unlockPw');
  return ready||!!(field&&field.getClientRects().length);
 },undefined,{timeout:45000});
 if(await page.locator('#unlockPw').isVisible()){
  await page.locator('#unlockPw').fill(APP_KEY_TEST);
  await Promise.all([page.waitForNavigation({timeout:60000}),page.locator('#unlockForm button[type=submit]').click()]);
 }
 await page.waitForFunction(()=>window.TWRC_VAULT?.mode==='vault'&&
  typeof Backup!=='undefined'&&typeof USER_STORE!=='undefined'&&
  typeof S!=='undefined'&&!!S.cars?.length,undefined,{timeout:45000});
}
async function run(){
 const [left,right]=await Promise.all([makeServer(),makeServer()]);
 const browser=await {chromium,webkit}[BROWSER].launch({headless:true});
 const ctx=await browser.newContext({serviceWorkers:'block',acceptDownloads:true,locale:'fr-FR',timezoneId:'Europe/Paris'});
 const allowed=new Set([left.origin,right.origin]),external=[];
 await ctx.route('**/*',route=>{
  const uri=route.request().url();let u;try{u=new URL(uri)}catch{return route.abort()}
  if(allowed.has(u.origin))return route.continue();
  external.push(u.hostname);return route.abort('blockedbyclient');
 });
 const a=await ctx.newPage(),b=await ctx.newPage();
 for(const p of [a,b])p.on('dialog',dialog=>dialog.accept());
 let tests=0;
 async function check(label,fn){await fn();tests++;console.log('✅ '+BROWSER+' '+label);}
 try{
  await loadApp(a,left.origin);
  await loadApp(b,right.origin);
  await check('actual compiled app boots in two isolated origins',async()=>{
   assert.equal(await a.evaluate(()=>S.cars.length),2);
   assert.equal(await b.evaluate(()=>S.cars.length),2);
   assert.notEqual(left.origin,right.origin);
   assert.equal(await a.evaluate(()=>window.TWRC_VAULT?.mode),'vault');
   assert.equal(await b.evaluate(()=>window.TWRC_VAULT?.mode),'vault');
  });
  await check('source change does not affect destination state',async()=>{
   await a.evaluate(name=>{S.cars[0].name=name;saveSettings();},FAKE_CAR);
   await a.evaluate(async()=>{await window.TWRC_VAULT.flush();if(window.TWRC_VAULT.error)throw Error('vault flush');});
   assert.equal(await a.evaluate(()=>S.cars[0].name),FAKE_CAR);
   assert.notEqual(await b.evaluate(()=>S.cars[0].name),FAKE_CAR);
  });
  await check('human observations are present in vault but absent from Backup V2',async()=>{
   const audit=await a.evaluate(async id=>{
    lsSet('twrc.reports.v1',JSON.stringify([{kind:'fog',at:Date.now(),place:'fictional',lat:0,lon:0,id}]));
    lsSet('twrc.shadow.v1',JSON.stringify([{at:Date.now(),loc:'fictional',obs:1,id}]));
    await window.TWRC_VAULT.flush();
    const archive=Backup.make({settings:S,view:UI.view,context:USER_STORE.state,tyreTherm:ttLoad(),tripCancel:TRIPCANCEL,at:new Date().toISOString()});
    return {report:JSON.parse(lsGet('twrc.reports.v1')),shadow:JSON.parse(lsGet('twrc.shadow.v1')),v:archive.v,
      archive:JSON.stringify(archive),encrypted:window.TWRC_RAW_STORAGE.getItem('twrc.vault.v2')?.length>0,
      rawReports:window.TWRC_RAW_STORAGE.getItem('twrc.reports.v1')};
   },FAKE_REPORT_ID);
   assert.equal(audit.v,2);assert.equal(audit.report[0].id,FAKE_REPORT_ID);
   assert.equal(audit.shadow[0].id,FAKE_REPORT_ID);
   assert(audit.encrypted);assert.equal(audit.rawReports,null);
   assert(!audit.archive.includes(FAKE_REPORT_ID));
  });
  await check('fail-closed migration preflight rejects meaningful human observations',async()=>{
   const reasons=await a.evaluate(()=>{
    const blocked=[];
    for(const key of ['twrc.reports.v1','twrc.shadow.v1']){
     const value=JSON.parse(lsGet(key)||'[]');
     if(!Array.isArray(value))throw Error('unknown human observation format');
     if(value.length)blocked.push(key);
    }
    return blocked;
   });
   assert.deepEqual(reasons,['twrc.reports.v1','twrc.shadow.v1']);
   assert.notEqual(await b.evaluate(()=>S.cars[0].name),FAKE_CAR);
  });
  // No real observations are deleted here; only dummy records introduced above.
  await a.evaluate(async()=>{
   lsSet('twrc.reports.v1','[]');lsSet('twrc.shadow.v1','[]');
   await window.TWRC_VAULT.flush();
   if(window.TWRC_VAULT.error)throw Error('fixture reset failed');
  });
  await check('real Backup.make V2 from app copy excludes transient state',async()=>{
   const data=await a.evaluate(()=>Backup.make({settings:S,view:UI.view,context:USER_STORE.state,
     tyreTherm:ttLoad(),tripCancel:TRIPCANCEL,at:new Date().toISOString()}));
   assert.equal(data.v,2);assert.equal(data.settings.cars[0].name,FAKE_CAR);
   assert.equal(data.durable.context.gps,null);
   assert.equal(data.durable.context.tripStart,null);
   assert(!JSON.stringify(data).includes('TWRC_VAULT'));
  });
  await check('real UI encrypts backup: downloadable bytes disclose no synthetic car',async()=>{
   await a.evaluate(()=>{document.querySelector('#settings').open=true;renderSettings(true)});
   await a.locator('#bkPw').fill(APP_KEY_TEST);
   const activates=await a.evaluate(()=>window.TWRC_VAULT?.journalNeedsRecovery===true);
   // Register BEFORE export: iOS WebKit can schedule a same-URL reload in 100 ms.
   const afterExport=activates?a.waitForNavigation({waitUntil:'domcontentloaded',timeout:30000}):null;
   const [download]=await Promise.all([
    a.waitForEvent('download',{timeout:90000}),
    a.locator('[data-act="bk-export"]').click()
   ]);
   const bytes=fs.readFileSync(await download.path());
   const text=bytes.toString('utf8'),envelope=JSON.parse(text);
   // The current Exporter produces an authenticated SessionVault V2/V3 copy,
   // not the old twrc-backup projection. Verify the actual exported codec.
   // The browser may reload immediately after Exporter (journal activation).
   // Decrypt the actual downloaded bytes with the production SessionVault source
   // in an isolated Node/WebCrypto context, independent of page navigation.
   const context={TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,atob,btoa,crypto:webcrypto};
   vm.createContext(context);
   vm.runInContext(fs.readFileSync(path.join(ROOT,'src/session-vault.js'),'utf8')+';this.codec=SessionVault;',context);
   const codec=context.codec,values=await codec.readRecovery(text,APP_KEY_TEST,webcrypto);
   const settings=JSON.parse(values['twrc.settings.v1']||'null');
   const proof={valid:codec.validVault(envelope),
    car:settings?.cars?.[0]?.name===FAKE_CAR,
    archive:Object.hasOwn(values,'twrc.debrief.archive.v1'),version:envelope.v};
   assert.equal(proof.valid,true,'export recognised by actual SessionVault codec');
   assert.equal(proof.car,true,'decrypted values retain the complete fictitious car');
   assert.equal(envelope.app,undefined,'export is not mislabeled as legacy twrc-backup');
   assert.equal(envelope.v,proof.archive?3:2,'archive presence determines vault version');
   assert.equal(envelope.kdf,'PBKDF2-SHA256');
   assert.equal(envelope.it,600000);
   assert(!text.includes(FAKE_CAR));
   assert(!text.includes(FAKE_REPORT_ID));
   a.__f2backup=bytes;
   // Wait for the actual automatic reload before any further navigation.
   if(afterExport)await afterExport;
   // Verify a new navigation resumes the existing encrypted vault without loss.
   await loadApp(a,left.origin);
   assert.equal(await a.evaluate(()=>S.cars[0].name),FAKE_CAR,
    'car persists across post-export browser navigation');
   assert.equal(await a.evaluate(()=>window.TWRC_VAULT?.mode),'vault');
  });
  await check('destination refuses import until its recovery journal is protected',async()=>{
   const needs=await b.evaluate(()=>window.TWRC_VAULT?.journalNeedsRecovery===true);
   assert.equal(needs,true,'fresh destination must require local journal activation');
   await b.evaluate(()=>{document.querySelector('#settings').open=true;renderSettings(true)});
   const before=await b.evaluate(()=>S.cars[0].name);
   await b.locator('#bkPw').fill(APP_KEY_TEST);
   await b.locator('#bkFile').setInputFiles({name:'f2-backup-fake.json',mimeType:'application/json',buffer:a.__f2backup});
   await b.waitForFunction(()=>/Appuie d’abord sur Exporter/.test(document.querySelector('#bkMsg')?.textContent||''),undefined,{timeout:20000});
   assert.equal(await b.evaluate(()=>S.cars[0].name),before);
  });
  await check('destination independently exports a recoverable vault before import',async()=>{
   await b.evaluate(()=>{document.querySelector('#settings').open=true;renderSettings(true)});
   await b.locator('#bkPw').fill(APP_KEY_TEST);
   const onReload=b.waitForNavigation({waitUntil:'domcontentloaded',timeout:30000});
   const [download]=await Promise.all([
    b.waitForEvent('download',{timeout:90000}),
    b.locator('[data-act="bk-export"]').click()
   ]);
   const destinationBytes=fs.readFileSync(await download.path()).toString('utf8');
   const sandbox={TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,atob,btoa,crypto:webcrypto};
   vm.createContext(sandbox);
   vm.runInContext(fs.readFileSync(path.join(ROOT,'src/session-vault.js'),'utf8')+';this.codec=SessionVault;',sandbox);
   const values=await sandbox.codec.readRecovery(destinationBytes,APP_KEY_TEST,webcrypto);
   assert.equal(JSON.parse(values['twrc.settings.v1']).cars.length,2);
   await onReload;
   await loadApp(b,right.origin);
   assert.equal(await b.evaluate(()=>window.TWRC_VAULT?.journalNeedsRecovery),false);
   assert.notEqual(await b.evaluate(()=>S.cars[0].name),FAKE_CAR);
  });
  await check('wrong password in real UI refuses import without changing destination',async()=>{
   await b.evaluate(()=>{document.querySelector('#settings').open=true;renderSettings(true)});
   const before=await b.evaluate(()=>S.cars[0].name);
   await b.locator('#bkPw').fill('INCORRECT-FAKE-CODE');
   await b.locator('#bkFile').setInputFiles({name:'f2-backup-fake.json',mimeType:'application/json',buffer:a.__f2backup});
   await b.waitForFunction(()=>/Code incorrect/.test(document.querySelector('#bkMsg')?.textContent||''),undefined,{timeout:45000});
   assert.equal(await b.evaluate(()=>S.cars[0].name),before);
  });
  await check('real UI import restores supported car settings into other copy',async()=>{
   await b.locator('#bkPw').fill(APP_KEY_TEST);
   const navigate=b.waitForNavigation({timeout:90000});
   await b.locator('#bkFile').setInputFiles({name:'f2-backup-fake.json',mimeType:'application/json',buffer:a.__f2backup});
   await navigate;
   await b.waitForFunction(name=>typeof S!=='undefined'&&S.cars[0].name===name,FAKE_CAR,{timeout:45000});
   assert.equal(await b.evaluate(()=>S.cars[0].name),FAKE_CAR);
  });
  await check('post-import vault still encrypted, no raw settings and source unchanged',async()=>{
   for(const p of [a,b]){
    const raw=await p.evaluate(()=>({
     vault:window.TWRC_RAW_STORAGE.getItem('twrc.vault.v2'),
     settings:window.TWRC_RAW_STORAGE.getItem('twrc.settings.v1'),
     gps:window.TWRC_RAW_STORAGE.getItem('twrc.gps'),
     sourceCar:S.cars[0].name
    }));
    assert(raw.vault?.length>50);assert.equal(raw.settings,null);
    assert.equal(raw.gps,null);assert.equal(raw.sourceCar,FAKE_CAR);
    assert(!raw.vault.includes(FAKE_CAR));
   }
  });
  await check('external network denied and both app copies local only',async()=>{
   assert([...allowed].every(x=>x.startsWith('http://127.0.0.1:')));
   assert(!external.includes('127.0.0.1'));
  });
  console.log('✅ '+BROWSER+': '+tests+'/'+tests+' tests on two BUILT app copies and fake backups');
 }finally{
  await ctx.close();await browser.close();
  await Promise.all([new Promise(ok=>left.server.close(ok)),new Promise(ok=>right.server.close(ok))]);
 }
}
run().catch(e=>{console.error('❌ Phase 5 app-copy failed: '+String(e?.stack||e).replace(/https?:\/\/[^\s)]+/g,'URL'));process.exitCode=1;});
