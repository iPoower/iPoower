#!/usr/bin/env node
// FORTERESSE II: two real, isolated browser origins; all values are invented.
// This is NOT a Race Control exporter/importer. No user storage or production URL.
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium, webkit } = require('playwright');

const browserCode = String.raw;
const fixture = [
 '(function(){',
 "const keys=['f2.fixture.settings','f2.fixture.human'];",
 "const known=new Set([...keys,'f2.fixture.session','f2.fixture.runtime']);",
 "const dbName='fortress-ii-entirely-fake';",
 "const enc=new TextEncoder(), dec=new TextDecoder();",
 "const b64=x=>btoa(String.fromCharCode(...x));",
 "const un64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));",
 "const clone=x=>JSON.parse(JSON.stringify(x));",
 "function reqp(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}",
 "function txp(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('IDB transaction aborted'));tx.onerror=()=>reject(tx.error||Error('IDB transaction failed'));});}",
 "async function db(){return new Promise((resolve,reject)=>{let r=indexedDB.open(dbName,1);r.onupgradeneeded=()=>{for(const name of ['active','staging'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}",
 "async function read(store,key){const d=await db();try{return await reqp(d.transaction(store).objectStore(store).get(key));}finally{d.close();}}",
 "async function write(store,key,value){const d=await db();try{const t=d.transaction(store,'readwrite');const done=txp(t);t.objectStore(store).put(value,key);await done;}finally{d.close();}}",
 "function inventory(){const out={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith('f2.fixture.')){if(!known.has(key))throw Error('unknown fixture key');if(keys.includes(key))out[key]=localStorage.getItem(key);}}return out;}",
 "async function snapshot(){const values=inventory();for(const k of keys)if(typeof values[k]!=='string')throw Error('required fixture key absent');const journal=await read('active','journal');if(!journal)throw Error('fixture journal absent');return {values,journal};}",
 "async function crypt(password,salt,mode){if(typeof password!=='string'||password.length<10)throw Error('invalid passphrase');const k=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:80000,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,[mode]);}",
 "async function seal(state,destination,password){const source=location.origin;const s=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const k=await crypt(password,s,'encrypt');const p={v:1,source,destination,kdf:'PBKDF2-SHA256',iterations:80000,salt:b64(s),iv:b64(iv)};const aad=enc.encode([p.v,p.source,p.destination].join('|'));const plain=enc.encode(JSON.stringify({app:'f2-ONLY-FAKE',version:1,state}));p.cipher=b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},k,plain)));return p;}",
 "async function unseal(p,password,expectedSource){if(!p||p.v!==1||p.source!==expectedSource||p.destination!==location.origin||p.kdf!=='PBKDF2-SHA256'||p.iterations!==80000)throw Error('manifest rejected');if(typeof p.cipher!=='string'||p.cipher.length>250000)throw Error('size rejected');const s=un64(p.salt),iv=un64(p.iv);if(s.length!==16||iv.length!==12)throw Error('invalid salt or IV');const k=await crypt(password,s,'decrypt');const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode([p.v,p.source,p.destination].join('|'))},k,un64(p.cipher));const doc=JSON.parse(dec.decode(bytes));if(!doc||doc.app!=='f2-ONLY-FAKE'||doc.version!==1||!doc.state||!doc.state.values||!doc.state.journal)throw Error('invalid decrypted fixture');if(Object.keys(doc.state.values).sort().join('|')!==keys.slice().sort().join('|'))throw Error('missing or unknown snapshot keys');for(const value of Object.values(doc.state.values))if(typeof value!=='string')throw Error('invalid value');return doc.state;}",
 "async function ensureBlank(){for(const key of keys)if(localStorage.getItem(key)!==null)throw Error('destination not empty');if(await read('active','bundle')||await read('active','journal'))throw Error('destination active');}",
 "async function stage(p,password,expectedSource,{abort=false,quota=false}={}){const state=await unseal(p,password,expectedSource);await ensureBlank();if(quota)throw Error('simulated quota');const d=await db();try{const tx=d.transaction('staging','readwrite'),done=txp(tx);tx.objectStore('staging').put(state,'pending');if(abort)tx.abort();await done;}finally{d.close();}return Object.keys(state.values).length;}",
 "async function activate(confirmed,{abort=false}={}){if(confirmed!==true)throw Error('user confirmation required');const d=await db();try{await new Promise((resolve,reject)=>{const tx=d.transaction(['active','staging'],'readwrite');let fail=null;tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||fail||Error('aborted'));tx.onerror=()=>reject(tx.error||Error('failed'));const staging=tx.objectStore('staging'),active=tx.objectStore('active');const getStage=staging.get('pending');getStage.onsuccess=()=>{if(!getStage.result){fail=Error('no staging');tx.abort();return;}const getActive=active.get('bundle');getActive.onsuccess=()=>{if(getActive.result){fail=Error('destination occupied');tx.abort();return;}active.put({revision:1,state:getStage.result},'bundle');staging.delete('pending');if(abort){fail=Error('synthetic interruption');tx.abort();}};};});}finally{d.close();}}",
 "async function change(){const old=await read('active','bundle');if(!old)throw Error('bundle absent');const next=clone(old);next.revision++;next.state.journal.observations.push({id:'observation-FAKE-2',kind:'wet'});await write('active','bundle',next);}",
 "async function exportReverse(dest,password){const b=await read('active','bundle');if(!b)throw Error('no destination changes');return seal(b.state,dest,password);}",
 "async function conflictPreview(p,password,source){const returned=await unseal(p,password,source);const old=await snapshot();return {requiresConsent:JSON.stringify(old)!==JSON.stringify(returned),oldJournalCount:old.journal.observations.length,newJournalCount:returned.journal.observations.length};}",
 "window.f2={",
 "async seed(){if(localStorage.length)throw Error('source not empty');localStorage.setItem('f2.fixture.settings',JSON.stringify({car:'CAR-FAKE-1',tyre:'TYRE-FAKE-1'}));localStorage.setItem('f2.fixture.human',JSON.stringify([{id:'observation-FAKE-1',kind:'fog'}]));localStorage.setItem('f2.fixture.session','NON_REAL_SESSION_STRING');localStorage.setItem('f2.fixture.runtime','NON_REAL_RUNTIME_STRING');await write('active','journal',{observations:[{id:'observation-FAKE-1',kind:'fog'}]});},",
 "snapshot,sealExport:async(dest,password)=>seal(await snapshot(),dest,password),unseal,stage,activate,change,exportReverse,conflictPreview,",
 "read:(store,key)=>read(store,key),storage:()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])),",
 "introduceUnknown:()=>localStorage.setItem('f2.fixture.future.v99','FICTIVE'),removeUnknown:()=>localStorage.removeItem('f2.fixture.future.v99')",
 "};",
 '})();'
].join('\n');

function server() {
 return new Promise((resolve,reject)=>{
  const s=http.createServer((req,res)=>{
   if(req.url!=='/'&&req.url!=='/favicon.ico'){res.writeHead(404);res.end('not found');return;}
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
   res.end('<!doctype html><html><meta charset="utf-8"><title>F2 synthetic fixture only</title></html>');
  });
  s.on('error',reject);
  s.listen(0,'127.0.0.1',()=>resolve({server:s,origin:'http://127.0.0.1:'+s.address().port}));
 });
}
async function run(browserName){
 const left=await server(),right=await server();
 const browser=await {chromium,webkit}[browserName].launch({headless:true});
 const context=await browser.newContext({serviceWorkers:'block'});
 let done=0;
 async function test(label,fn){await fn();done++;console.log('✅ '+browserName+' '+label);}
 try {
  const allowed=new Set([left.origin,right.origin]);
  await context.route('**/*',route=>{
   const url=new URL(route.request().url);
   if(!allowed.has(url.origin))return route.abort('blockedbyclient');
   return route.continue();
  });
  const old=await context.newPage(),fresh=await context.newPage();
  await old.goto(left.origin);await fresh.goto(right.origin);
  await old.addScriptTag({content:fixture});await fresh.addScriptTag({content:fixture});
  const password='TEST_ONLY_DUMMY_PASSWORD_NOT_REAL';
  await old.evaluate(()=>window.f2.seed());
  const original=await old.evaluate(()=>window.f2.snapshot());
  const sourceStorage=await old.evaluate(()=>window.f2.storage());
  await test('origin separation including IndexedDB and localStorage',async()=>{
   assert.equal(await fresh.evaluate(()=>localStorage.length),0);
   assert.equal(await fresh.evaluate(()=>window.f2.read('active','journal')),undefined);
   assert.equal(await old.evaluate(()=>window.f2.read('active','bundle')),undefined);
  });
  await test('unknown source key blocks export without any mutation',async()=>{
   await old.evaluate(()=>window.f2.introduceUnknown());
   await assert.rejects(()=>old.evaluate(([destination,password])=>window.f2.sealExport(destination,password),[right.origin,password]),/unknown fixture key/);
   await old.evaluate(()=>window.f2.removeUnknown());
  });
  const pack=await old.evaluate(([destination,password])=>window.f2.sealExport(destination,password),[right.origin,password]);
  await test('encrypted fixture excludes ephemeral and session',async()=>{
   assert.equal(pack.source,left.origin);assert.equal(pack.destination,right.origin);
   assert(!JSON.stringify(pack).includes('NON_REAL_SESSION_STRING'));
   assert(!JSON.stringify(pack).includes('CAR-FAKE-1'));
  });
  await test('wrong password refuses import and leaves destination pristine',async()=>{
   await assert.rejects(()=>fresh.evaluate(([p,source])=>window.f2.stage(p,'WRONG_PASSWORD_FICTIVE',source),[pack,left.origin]));
   assert.equal(await fresh.evaluate(()=>window.f2.read('staging','pending')),undefined);
  });
  await test('tampered cipher refuses import',async()=>{
   const p={...pack,cipher:pack.cipher.slice(0,-8)+'AAAAAAAA'};
   await assert.rejects(()=>fresh.evaluate(([p,password,source])=>window.f2.stage(p,password,source),[p,password,left.origin]));
   assert.equal(await fresh.evaluate(()=>window.f2.read('staging','pending')),undefined);
  });
  await test('wrong source, destination and version are rejected',async()=>{
   for(const p of [{...pack,source:'http://localhost:9998'}, {...pack,destination:'http://localhost:9999'},{...pack,v:2}]){
    await assert.rejects(()=>fresh.evaluate(([p,password,source])=>window.f2.stage(p,password,source),[p,password,left.origin]));
   }
  });
  await test('quota gate leaves target empty before IDB transaction',async()=>{
   await assert.rejects(()=>fresh.evaluate(([p,password,source])=>window.f2.stage(p,password,source,{quota:true}),[pack,password,left.origin]),/simulated quota/);
   assert.equal(await fresh.evaluate(()=>window.f2.read('staging','pending')),undefined);
  });
  await test('real IndexedDB abort leaves no staged changes',async()=>{
   await assert.rejects(()=>fresh.evaluate(([p,password,source])=>window.f2.stage(p,password,source,{abort:true}),[pack,password,left.origin]));
   assert.equal(await fresh.evaluate(()=>window.f2.read('staging','pending')),undefined);
  });
  await test('staging only, never automatically activates data',async()=>{
   const count=await fresh.evaluate(([p,password,source])=>window.f2.stage(p,password,source),[pack,password,left.origin]);
   assert.equal(count,2);
   assert.equal(await fresh.evaluate(()=>window.f2.read('active','bundle')),undefined);
   assert.equal(await fresh.evaluate(()=>localStorage.length),0);
  });
  await test('no confirmation => no activation',async()=>{
   await assert.rejects(()=>fresh.evaluate(()=>window.f2.activate(false)),/user confirmation required/);
   assert.equal(await fresh.evaluate(()=>window.f2.read('active','bundle')),undefined);
  });
  await test('failed real IndexedDB activation is atomic',async()=>{
   await assert.rejects(()=>fresh.evaluate(()=>window.f2.activate(true,{abort:true})));
   assert.equal(await fresh.evaluate(()=>window.f2.read('active','bundle')),undefined);
   assert(await fresh.evaluate(()=>window.f2.read('staging','pending')));
  });
  await test('confirmed activation in single IndexedDB transaction',async()=>{
   await fresh.evaluate(()=>window.f2.activate(true));
   const state=await fresh.evaluate(()=>window.f2.read('active','bundle'));
   assert.equal(state.revision,1);assert.deepEqual(state.state,original);
   assert.equal(await fresh.evaluate(()=>window.f2.read('staging','pending')),undefined);
   assert.equal(await fresh.evaluate(()=>localStorage.length),0);
  });
  await test('browser reload preserves destination IDB but not origin mixing',async()=>{
   await fresh.reload();await fresh.addScriptTag({content:fixture});
   assert.deepEqual((await fresh.evaluate(()=>window.f2.read('active','bundle'))).state,original);
   assert.equal(await fresh.evaluate(()=>window.f2.read('active','journal')),undefined);
  });
  await test('a second attempt cannot silently overwrite destination',async()=>{
   await assert.rejects(()=>fresh.evaluate(([p,password,source])=>window.f2.stage(p,password,source),[pack,password,left.origin]),/destination active/);
  });
  await fresh.evaluate(()=>window.f2.change());
  const reverse=await fresh.evaluate(([dest,password])=>window.f2.exportReverse(dest,password),[left.origin,password]);
  await test('reverse export requires conflict review, does not overwrite original',async()=>{
   const preview=await old.evaluate(([p,password,source])=>window.f2.conflictPreview(p,password,source),[reverse,password,right.origin]);
   assert.deepEqual(preview,{requiresConsent:true,oldJournalCount:1,newJournalCount:2});
   assert.deepEqual(await old.evaluate(()=>window.f2.snapshot()),original);
   assert.deepEqual(await old.evaluate(()=>window.f2.storage()),sourceStorage);
  });
  await test('old origin stays unmodified through synthetic rollback rehearsal',async()=>{
   assert.deepEqual(await old.evaluate(()=>window.f2.snapshot()),original);
   assert.equal(await old.evaluate(()=>window.f2.read('active','bundle')),undefined);
  });
  console.log('✅ '+browserName+': '+done+'/'+done+' synthetic browser scenarios passed');
 } finally {
  await context.close();
  await browser.close();
  await Promise.all([new Promise(ok=>left.server.close(ok)),new Promise(ok=>right.server.close(ok))]);
 }
}
(async()=>{const name=process.env.BROWSER||process.argv[2]||'chromium';if(!['chromium','webkit'].includes(name))throw Error('unsupported test browser');await run(name);})().catch(err=>{console.error('❌',err.stack);process.exitCode=1;});
