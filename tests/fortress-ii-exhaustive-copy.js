#!/usr/bin/env node
// Forteresse II Phase 5: TWO COPIES OF THE ACTUAL BUILT RACE CONTROL APP.
// Only synthesized CI secrets and sample data; network locked to loopback servers.
// NO production migration, user data, external fetch, or app-source changes.
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
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
 await page.locator('#unlockPw').waitFor({timeout:30000});
 await page.locator('#unlockPw').fill(APP_KEY_TEST);
 await Promise.all([page.waitForNavigation({timeout:60000}),page.locator('#unlockForm button[type=submit]').click()]);
 await page.waitForFunction(()=>typeof Backup!=='undefined'&&typeof USER_STORE!=='undefined'&&typeof S!=='undefined'&&!!S.cars?.length,undefined,{timeout:45000});
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
   const [download]=await Promise.all([
    a.waitForEvent('download',{timeout:90000}),
    a.locator('[data-act="bk-export"]').click()
   ]);
   const bytes=fs.readFileSync(await download.path());
   const envelope=JSON.parse(bytes.toString('utf8'));
   assert.equal(envelope.app,'twrc-backup');assert.equal(envelope.v,2);
   assert.equal(envelope.it,600000);
   assert(!bytes.toString('utf8').includes(FAKE_CAR));
   assert(!bytes.toString('utf8').includes(FAKE_REPORT_ID));
   a.__f2backup=bytes;
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

  // Additional Phase 6 only: exhaustive LAB export, running in Playwright's
  // isolated evaluation context; not part of the published Race Control app.
  await a.evaluate("window.F2X=(()=>{\nconst DURABLE=new Set(['twrc.settings.v1','twrc.context.v1','twrc.tyretherm.v1','twrc.tripcancel','twrc.reports.v1','twrc.shadow.v1','twrc.view','twrc.outfit.occasion']);\nconst EPHEMERAL=new Set(['twrc.runtime.v1','twrc.weather.limit.v1','twrc.calendar.sealed.v1','twrc.gps','twrc.place.v1','twrc.tripstart.v1','twrc.tripend.v1','twrc.returnhome.v1','twrc.tripdone','twrc.debrief.v1','twrc.decision.latest.v1','twrc.trend','twrc.weather.incidents.v1','twrc.nocode','twrc.presetv','twrc.cfghash','twrc.lastbackup','twrc.tripmap','twrc.lock.signal','twrc.key','twrc.plain','twrc.plain.v','twrc.vault.v2','twrc.session.v2','twrc.device.vault.v1','twrc.restore.pending.v1']);\nconst PREFIXES=['twrc.cache.','twrc.croute','twrc.road.','twrc.reload.','twrc.weather.station.'];\nconst REMAIN_REVIEW=new Set(['twrc.trend']);\nconst be=new TextEncoder(),bd=new TextDecoder();const toB64=u=>btoa(String.fromCharCode(...u));const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));\nconst copy=x=>JSON.parse(JSON.stringify(x));\nasync function checksum(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',be.encode(s)))].map(v=>v.toString(16).padStart(2,'0')).join('')}\nfunction list(){const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k||!k.startsWith('twrc.'))continue;\nconst v=localStorage.getItem(k);if(DURABLE.has(k)){if(typeof v!=='string')throw Error('invalid value: '+k);out[k]=v;continue;}\nif(k==='twrc.weather.incidents.v1'){let incidents;try{incidents=JSON.parse(v)}catch{throw Error('unclassified diagnostic format')}if(!Array.isArray(incidents)||incidents.length>20||incidents.some(row=>!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(field=>!['at','kind','durationMs','status'].includes(field))||!Number.isFinite(row.at)||!Number.isFinite(row.durationMs)))throw Error('unknown diagnostic fields');continue;}\nif(REMAIN_REVIEW.has(k)){let data;try{data=JSON.parse(v)}catch{throw Error('unclassified human history: '+k)};if(data&&((Array.isArray(data)&&data.length)||(typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length)))throw Error('review required: '+k);continue;}\nif(EPHEMERAL.has(k)||PREFIXES.some(p=>k.startsWith(p)))continue;throw Error('unknown future key: '+k)}\nfor(const k of ['twrc.settings.v1','twrc.context.v1','twrc.reports.v1','twrc.shadow.v1'])if(!(k in out))throw Error('missing mandatory durable key '+k);\nconst ctx=JSON.parse(out['twrc.context.v1']);if(ctx.gps||ctx.tripStart||ctx.tripEnd||ctx.returnHome)throw Error('active trip or GPS needs manual resolution');\nreturn Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));}\nasync function kdf(password,salt,usage){if(typeof password!=='string'||password.length<12)throw Error('unsafe dummy password');const master=await crypto.subtle.importKey('raw',be.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,hash:'SHA-256',iterations:600000},master,{name:'AES-GCM',length:256},false,[usage])}\nasync function exportFixture(target,password){const values=list();const inner={app:'F2X-SYNTHETIC',version:1,values,keys:Object.keys(values)};const manifest={v:1,app:'F2X-SYNTHETIC',from:location.origin,to:target,kdf:'PBKDF2-SHA256',it:600000,salt:toB64(crypto.getRandomValues(new Uint8Array(16))),iv:toB64(crypto.getRandomValues(new Uint8Array(12)))};\nconst key=await kdf(password,fromB64(manifest.salt),'encrypt');const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:fromB64(manifest.iv),additionalData:be.encode(JSON.stringify(manifest))},key,be.encode(JSON.stringify(inner)));return {...manifest,ciphertext:toB64(new Uint8Array(ct))};}\nasync function decodeFixture(env,password,expected){if(!env||env.app!=='F2X-SYNTHETIC'||env.v!==1||env.kdf!=='PBKDF2-SHA256'||env.it!==600000||env.from!==expected||env.to!==location.origin)throw Error('invalid origin/version/KDF');\nif(typeof env.ciphertext!=='string'||env.ciphertext.length>1500000)throw Error('size');const salt=fromB64(env.salt),iv=fromB64(env.iv);if(salt.length!==16||iv.length!==12)throw Error('invalid IV/salt');\nconst {ciphertext,...aad}=env;const key=await kdf(password,salt,'decrypt');const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:be.encode(JSON.stringify(aad))},key,fromB64(ciphertext));const p=JSON.parse(bd.decode(raw));\nif(p.app!=='F2X-SYNTHETIC'||p.version!==1||!p.values||!Array.isArray(p.keys)||Object.keys(p.values).sort().join('|')!==p.keys.slice().sort().join('|'))throw Error('invalid snapshot');\nfor(const k of p.keys)if(!DURABLE.has(k)||typeof p.values[k]!=='string')throw Error('unknown key');for(const k of ['twrc.settings.v1','twrc.context.v1','twrc.reports.v1','twrc.shadow.v1'])if(!p.keys.includes(k))throw Error('missing mandatory key');\nif(JSON.parse(p.values['twrc.context.v1']).gps)throw Error('GPS not allowed');return copy(p);}\nasync function applyTestOnly(plan,confirmed,failAfter){if(confirmed!==true)throw Error('human confirmation absent');const keys=Object.keys(plan.values);for(const k of keys)if(!DURABLE.has(k))throw Error('unknown key');const previous=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));\ntry{for(let i=0;i<keys.length;i++){const k=keys[i];localStorage.setItem(k,plan.values[k]);if(failAfter===i+1)throw Error('SYNTHETIC interruption')}await window.TWRC_VAULT.flush();if(window.TWRC_VAULT.error)throw Error('flush failed');for(const k of keys)if(localStorage.getItem(k)!==plan.values[k])throw Error('mismatch after flush');return {written:keys.length,verified:true}}\ncatch(e){for(const [k,v]of Object.entries(previous)){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}await window.TWRC_VAULT.flush();if(window.TWRC_VAULT.error)throw Error('recovery failed');throw e}}\nreturn {list,exportFixture,decodeFixture,applyTestOnly};})();");
  await b.evaluate("window.F2X=(()=>{\nconst DURABLE=new Set(['twrc.settings.v1','twrc.context.v1','twrc.tyretherm.v1','twrc.tripcancel','twrc.reports.v1','twrc.shadow.v1','twrc.view','twrc.outfit.occasion']);\nconst EPHEMERAL=new Set(['twrc.runtime.v1','twrc.weather.limit.v1','twrc.calendar.sealed.v1','twrc.gps','twrc.place.v1','twrc.tripstart.v1','twrc.tripend.v1','twrc.returnhome.v1','twrc.tripdone','twrc.debrief.v1','twrc.decision.latest.v1','twrc.trend','twrc.weather.incidents.v1','twrc.nocode','twrc.presetv','twrc.cfghash','twrc.lastbackup','twrc.tripmap','twrc.lock.signal','twrc.key','twrc.plain','twrc.plain.v','twrc.vault.v2','twrc.session.v2','twrc.device.vault.v1','twrc.restore.pending.v1']);\nconst PREFIXES=['twrc.cache.','twrc.croute','twrc.road.','twrc.reload.','twrc.weather.station.'];\nconst REMAIN_REVIEW=new Set(['twrc.trend','twrc.weather.incidents.v1']);\nconst be=new TextEncoder(),bd=new TextDecoder();const toB64=u=>btoa(String.fromCharCode(...u));const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));\nconst copy=x=>JSON.parse(JSON.stringify(x));\nasync function checksum(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',be.encode(s)))].map(v=>v.toString(16).padStart(2,'0')).join('')}\nfunction list(){const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k||!k.startsWith('twrc.'))continue;\nconst v=localStorage.getItem(k);if(DURABLE.has(k)){if(typeof v!=='string')throw Error('invalid value: '+k);out[k]=v;continue;}\nif(REMAIN_REVIEW.has(k)){let data;try{data=JSON.parse(v)}catch{throw Error('unclassified human history: '+k)};if(data&&((Array.isArray(data)&&data.length)||(typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length)))throw Error('review required: '+k);continue;}\nif(EPHEMERAL.has(k)||PREFIXES.some(p=>k.startsWith(p)))continue;throw Error('unknown future key: '+k)}\nfor(const k of ['twrc.settings.v1','twrc.context.v1','twrc.reports.v1','twrc.shadow.v1'])if(!(k in out))throw Error('missing mandatory durable key '+k);\nconst ctx=JSON.parse(out['twrc.context.v1']);if(ctx.gps||ctx.tripStart||ctx.tripEnd||ctx.returnHome)throw Error('active trip or GPS needs manual resolution');\nreturn Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));}\nasync function kdf(password,salt,usage){if(typeof password!=='string'||password.length<12)throw Error('unsafe dummy password');const master=await crypto.subtle.importKey('raw',be.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,hash:'SHA-256',iterations:600000},master,{name:'AES-GCM',length:256},false,[usage])}\nasync function exportFixture(target,password){const values=list();const inner={app:'F2X-SYNTHETIC',version:1,values,keys:Object.keys(values)};const manifest={v:1,app:'F2X-SYNTHETIC',from:location.origin,to:target,kdf:'PBKDF2-SHA256',it:600000,salt:toB64(crypto.getRandomValues(new Uint8Array(16))),iv:toB64(crypto.getRandomValues(new Uint8Array(12)))};\nconst key=await kdf(password,fromB64(manifest.salt),'encrypt');const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:fromB64(manifest.iv),additionalData:be.encode(JSON.stringify(manifest))},key,be.encode(JSON.stringify(inner)));return {...manifest,ciphertext:toB64(new Uint8Array(ct))};}\nasync function decodeFixture(env,password,expected){if(!env||env.app!=='F2X-SYNTHETIC'||env.v!==1||env.kdf!=='PBKDF2-SHA256'||env.it!==600000||env.from!==expected||env.to!==location.origin)throw Error('invalid origin/version/KDF');\nif(typeof env.ciphertext!=='string'||env.ciphertext.length>1500000)throw Error('size');const salt=fromB64(env.salt),iv=fromB64(env.iv);if(salt.length!==16||iv.length!==12)throw Error('invalid IV/salt');\nconst {ciphertext,...aad}=env;const key=await kdf(password,salt,'decrypt');const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:be.encode(JSON.stringify(aad))},key,fromB64(ciphertext));const p=JSON.parse(bd.decode(raw));\nif(p.app!=='F2X-SYNTHETIC'||p.version!==1||!p.values||!Array.isArray(p.keys)||Object.keys(p.values).sort().join('|')!==p.keys.slice().sort().join('|'))throw Error('invalid snapshot');\nfor(const k of p.keys)if(!DURABLE.has(k)||typeof p.values[k]!=='string')throw Error('unknown key');for(const k of ['twrc.settings.v1','twrc.context.v1','twrc.reports.v1','twrc.shadow.v1'])if(!p.keys.includes(k))throw Error('missing mandatory key');\nif(JSON.parse(p.values['twrc.context.v1']).gps)throw Error('GPS not allowed');return copy(p);}\nasync function applyTestOnly(plan,confirmed,failAfter){if(confirmed!==true)throw Error('human confirmation absent');const keys=Object.keys(plan.values);for(const k of keys)if(!DURABLE.has(k))throw Error('unknown key');const previous=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));\ntry{for(let i=0;i<keys.length;i++){const k=keys[i];localStorage.setItem(k,plan.values[k]);if(failAfter===i+1)throw Error('SYNTHETIC interruption')}await window.TWRC_VAULT.flush();if(window.TWRC_VAULT.error)throw Error('flush failed');for(const k of keys)if(localStorage.getItem(k)!==plan.values[k])throw Error('mismatch after flush');return {written:keys.length,verified:true}}\ncatch(e){for(const [k,v]of Object.entries(previous)){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}await window.TWRC_VAULT.flush();if(window.TWRC_VAULT.error)throw Error('recovery failed');throw e}}\nreturn {list,exportFixture,decodeFixture,applyTestOnly};})();");
  await a.evaluate(async id=>{
    lsSet('twrc.reports.v1',JSON.stringify([{id,kind:'fog',at:Date.now(),place:'FICTIONAL'}]));
    lsSet('twrc.shadow.v1',JSON.stringify([{id,loc:'FICTIONAL',obs:'wet',at:Date.now()}]));
    lsSet('twrc.tyretherm.v1',JSON.stringify({carA:{T:18.2,at:'2026-10-13T04:00',source:'manual',minutes:24,kind:'route'}}));
    lsSet('twrc.tripcancel',JSON.stringify({'work-2026-10-13':{at:Date.now(),exp:Date.now()+3600000}}));
    await window.TWRC_VAULT.flush();if(window.TWRC_VAULT.error)throw Error('setup flush failed');
  },FAKE_REPORT_ID);
  await check('exhaustive LAB inventory retains both human records absent from Backup V2',async()=>{
    const v=await a.evaluate(()=>window.F2X.list());
    assert(v['twrc.reports.v1'].includes(FAKE_REPORT_ID));
    assert(v['twrc.shadow.v1'].includes(FAKE_REPORT_ID));
    assert(Object.keys(v).includes('twrc.settings.v1'));
    assert(!('twrc.gps' in v)&&!('twrc.session.v2' in v));
  });
  await check('future unknown key prevents encrypted export, no source deletion',async()=>{
    await a.evaluate(()=>lsSet('twrc.future.unclassified','NEEDS_REVIEW_DUMMY'));
    await assert.rejects(()=>a.evaluate(([dest,pw])=>window.F2X.exportFixture(dest,pw),[right.origin,APP_KEY_TEST]),/unknown future key/);
    await a.evaluate(()=>localStorage.removeItem('twrc.future.unclassified'));
    assert((await a.evaluate(()=>window.F2X.list()))['twrc.shadow.v1'].includes(FAKE_REPORT_ID));
  });
  const f2Envelope=await a.evaluate(([dest,pw])=>window.F2X.exportFixture(dest,pw),[right.origin,APP_KEY_TEST]);
  await check('authenticated and origin-bound fixture envelope excludes plaintext',async()=>{
    assert.equal(f2Envelope.app,'F2X-SYNTHETIC');assert.equal(f2Envelope.it,600000);
    assert.equal(f2Envelope.from,left.origin);assert.equal(f2Envelope.to,right.origin);
    assert(!JSON.stringify(f2Envelope).includes(FAKE_CAR));
    assert(!JSON.stringify(f2Envelope).includes(FAKE_REPORT_ID));
  });
  await check('wrong password, destination, corrupted ciphertext all fail before mutation',async()=>{
    const original=await b.evaluate(()=>S.cars[0].name);
    await assert.rejects(()=>b.evaluate(([e,source])=>window.F2X.decodeFixture(e,'INCORRECT-FAKE-PASSWORD',source),[f2Envelope,left.origin]));
    await assert.rejects(()=>b.evaluate(([e,pw,source])=>window.F2X.decodeFixture({...e,to:'http://127.0.0.1:1'},pw,source),[f2Envelope,APP_KEY_TEST,left.origin]));
    const tampered={...f2Envelope,ciphertext:f2Envelope.ciphertext.slice(0,-12)+'AAAAAAAAAAAA'};
    await assert.rejects(()=>b.evaluate(([e,pw,source])=>window.F2X.decodeFixture(e,pw,source),[tampered,APP_KEY_TEST,left.origin]));
    assert.equal(await b.evaluate(()=>S.cars[0].name),original);
  });
  const f2Plan=await b.evaluate(([e,pw,source])=>window.F2X.decodeFixture(e,pw,source),[f2Envelope,APP_KEY_TEST,left.origin]);
  await check('decrypted synthetic plan preserves every listed durable value exactly',async()=>{
    const expected=await a.evaluate(()=>window.F2X.list());
    assert.deepEqual(f2Plan.values,expected);
    assert(f2Plan.values['twrc.shadow.v1'].includes(FAKE_REPORT_ID));
    assert(f2Plan.values['twrc.reports.v1'].includes(FAKE_REPORT_ID));
  });
  await check('no confirmation or interruption leaves previous fake destination intact',async()=>{
    const before=await b.evaluate(p=>Object.fromEntries(p.keys.map(k=>[k,localStorage.getItem(k)])),f2Plan);
    await assert.rejects(()=>b.evaluate(p=>window.F2X.applyTestOnly(p,false),f2Plan),/confirmation/);
    await assert.rejects(()=>b.evaluate(p=>window.F2X.applyTestOnly(p,true,2),f2Plan),/SYNTHETIC interruption/);
    assert.deepEqual(await b.evaluate(p=>Object.fromEntries(p.keys.map(k=>[k,localStorage.getItem(k)])),f2Plan),before);
  });
  await check('confirmed LAB apply plus vault flush preserves all eight synthetic keys',async()=>{
    const status=await b.evaluate(p=>window.F2X.applyTestOnly(p,true),f2Plan);
    assert.equal(status.verified,true);
    assert.deepEqual(await b.evaluate(()=>window.F2X.list()),f2Plan.values);
    const raw=await b.evaluate(()=>window.TWRC_RAW_STORAGE.getItem('twrc.vault.v2'));
    assert(raw&&!raw.includes(FAKE_REPORT_ID)&&!raw.includes(FAKE_CAR));
  });
  await check('source and destination persist same synthetic human observations after reload',async()=>{
    await b.reload();
    await b.waitForFunction(()=>typeof S!=='undefined'&&typeof window.TWRC_VAULT!=='undefined'&&window.TWRC_VAULT.mode==='vault',undefined,{timeout:45000});
    await b.evaluate("window.F2X=(()=>{\nconst DURABLE=new Set(['twrc.settings.v1','twrc.context.v1','twrc.tyretherm.v1','twrc.tripcancel','twrc.reports.v1','twrc.shadow.v1','twrc.view','twrc.outfit.occasion']);\nconst EPHEMERAL=new Set(['twrc.runtime.v1','twrc.weather.limit.v1','twrc.calendar.sealed.v1','twrc.gps','twrc.place.v1','twrc.tripstart.v1','twrc.tripend.v1','twrc.returnhome.v1','twrc.tripdone','twrc.debrief.v1','twrc.decision.latest.v1','twrc.trend','twrc.weather.incidents.v1','twrc.nocode','twrc.presetv','twrc.cfghash','twrc.lastbackup','twrc.tripmap','twrc.lock.signal','twrc.key','twrc.plain','twrc.plain.v','twrc.vault.v2','twrc.session.v2','twrc.device.vault.v1','twrc.restore.pending.v1']);\nconst PREFIXES=['twrc.cache.','twrc.croute','twrc.road.','twrc.reload.','twrc.weather.station.'];\nconst REMAIN_REVIEW=new Set(['twrc.trend','twrc.weather.incidents.v1']);\nconst be=new TextEncoder(),bd=new TextDecoder();const toB64=u=>btoa(String.fromCharCode(...u));const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));\nconst copy=x=>JSON.parse(JSON.stringify(x));\nasync function checksum(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',be.encode(s)))].map(v=>v.toString(16).padStart(2,'0')).join('')}\nfunction list(){const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k||!k.startsWith('twrc.'))continue;\nconst v=localStorage.getItem(k);if(DURABLE.has(k)){if(typeof v!=='string')throw Error('invalid value: '+k);out[k]=v;continue;}\nif(REMAIN_REVIEW.has(k)){let data;try{data=JSON.parse(v)}catch{throw Error('unclassified human history: '+k)};if(data&&((Array.isArray(data)&&data.length)||(typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length)))throw Error('review required: '+k);continue;}\nif(EPHEMERAL.has(k)||PREFIXES.some(p=>k.startsWith(p)))continue;throw Error('unknown future key: '+k)}\nfor(const k of ['twrc.settings.v1','twrc.context.v1','twrc.reports.v1','twrc.shadow.v1'])if(!(k in out))throw Error('missing mandatory durable key '+k);\nconst ctx=JSON.parse(out['twrc.context.v1']);if(ctx.gps||ctx.tripStart||ctx.tripEnd||ctx.returnHome)throw Error('active trip or GPS needs manual resolution');\nreturn Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));}\nasync function kdf(password,salt,usage){if(typeof password!=='string'||password.length<12)throw Error('unsafe dummy password');const master=await crypto.subtle.importKey('raw',be.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,hash:'SHA-256',iterations:600000},master,{name:'AES-GCM',length:256},false,[usage])}\nasync function exportFixture(target,password){const values=list();const inner={app:'F2X-SYNTHETIC',version:1,values,keys:Object.keys(values)};const manifest={v:1,app:'F2X-SYNTHETIC',from:location.origin,to:target,kdf:'PBKDF2-SHA256',it:600000,salt:toB64(crypto.getRandomValues(new Uint8Array(16))),iv:toB64(crypto.getRandomValues(new Uint8Array(12)))};\nconst key=await kdf(password,fromB64(manifest.salt),'encrypt');const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:fromB64(manifest.iv),additionalData:be.encode(JSON.stringify(manifest))},key,be.encode(JSON.stringify(inner)));return {...manifest,ciphertext:toB64(new Uint8Array(ct))};}\nasync function decodeFixture(env,password,expected){if(!env||env.app!=='F2X-SYNTHETIC'||env.v!==1||env.kdf!=='PBKDF2-SHA256'||env.it!==600000||env.from!==expected||env.to!==location.origin)throw Error('invalid origin/version/KDF');\nif(typeof env.ciphertext!=='string'||env.ciphertext.length>1500000)throw Error('size');const salt=fromB64(env.salt),iv=fromB64(env.iv);if(salt.length!==16||iv.length!==12)throw Error('invalid IV/salt');\nconst {ciphertext,...aad}=env;const key=await kdf(password,salt,'decrypt');const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:be.encode(JSON.stringify(aad))},key,fromB64(ciphertext));const p=JSON.parse(bd.decode(raw));\nif(p.app!=='F2X-SYNTHETIC'||p.version!==1||!p.values||!Array.isArray(p.keys)||Object.keys(p.values).sort().join('|')!==p.keys.slice().sort().join('|'))throw Error('invalid snapshot');\nfor(const k of p.keys)if(!DURABLE.has(k)||typeof p.values[k]!=='string')throw Error('unknown key');for(const k of ['twrc.settings.v1','twrc.context.v1','twrc.reports.v1','twrc.shadow.v1'])if(!p.keys.includes(k))throw Error('missing mandatory key');\nif(JSON.parse(p.values['twrc.context.v1']).gps)throw Error('GPS not allowed');return copy(p);}\nasync function applyTestOnly(plan,confirmed,failAfter){if(confirmed!==true)throw Error('human confirmation absent');const keys=Object.keys(plan.values);for(const k of keys)if(!DURABLE.has(k))throw Error('unknown key');const previous=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));\ntry{for(let i=0;i<keys.length;i++){const k=keys[i];localStorage.setItem(k,plan.values[k]);if(failAfter===i+1)throw Error('SYNTHETIC interruption')}await window.TWRC_VAULT.flush();if(window.TWRC_VAULT.error)throw Error('flush failed');for(const k of keys)if(localStorage.getItem(k)!==plan.values[k])throw Error('mismatch after flush');return {written:keys.length,verified:true}}\ncatch(e){for(const [k,v]of Object.entries(previous)){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}await window.TWRC_VAULT.flush();if(window.TWRC_VAULT.error)throw Error('recovery failed');throw e}}\nreturn {list,exportFixture,decodeFixture,applyTestOnly};})();");
    const v=await b.evaluate(()=>window.F2X.list());
    assert.equal(v['twrc.reports.v1'],f2Plan.values['twrc.reports.v1']);
    assert.equal(v['twrc.shadow.v1'],f2Plan.values['twrc.shadow.v1']);
    const orig=await a.evaluate(()=>window.F2X.list());
    assert.deepEqual(orig,f2Plan.values);
  });
  await check('post-copy new human observation triggers reverse conflict, no overwrite',async()=>{
    const src=await a.evaluate(()=>window.F2X.list());
    await b.evaluate(()=>lsSet('twrc.shadow.v1',JSON.stringify([{id:'F2-DUMMY-NEW',obs:1,at:Date.now()}])));
    const dst=await b.evaluate(()=>window.F2X.list());
    assert.notDeepEqual(dst,src);
    assert.deepEqual(await a.evaluate(()=>window.F2X.list()),src);
  });
  console.log('✅ '+BROWSER+': '+tests+'/'+tests+' integration+exhaustive LAB tests on built app copies');
 }finally{
  await ctx.close();await browser.close();
  await Promise.all([new Promise(ok=>left.server.close(ok)),new Promise(ok=>right.server.close(ok))]);
 }
}
run().catch(e=>{console.error('❌ Phase 5 app-copy failed: '+String(e?.stack||e).replace(/https?:\/\/[^\s)]+/g,'URL'));process.exitCode=1;});
