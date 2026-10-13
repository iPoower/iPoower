#!/usr/bin/env node
// Forteresse II Phase 4: MULTI-STORE RECOVERY LAB — ONLY SYNTHETIC CONTENT.
// localhost browser origins; no race-control URLs or browser storage from user.
'use strict';
const http=require('node:http'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const CLIENT="(() => {\nconst LS=['f2v4.settings','f2v4.context','f2v4.observations','f2v4.history','f2v4.tyres'];\nconst IDB=['tyreProfile','closedJourneys'];\nconst EXTRA=new Set(['f2v4.gps','f2v4.session','f2v4.cache','f2v4.restore.phase']);\nconst clone=x=>JSON.parse(JSON.stringify(x));\nfunction open(){return new Promise((yes,no)=>{const r=indexedDB.open('f2v4-DUMMY',1);r.onupgradeneeded=()=>{for(const s of ['durable','staging'])if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s)};r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error)})}\nfunction req(r){return new Promise((yes,no)=>{r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error)})}\nfunction done(tx){return new Promise((yes,no)=>{tx.oncomplete=()=>yes();tx.onabort=()=>no(tx.error||Error('transaction aborted'));tx.onerror=()=>no(tx.error||Error('transaction failed'))})}\nasync function get(s,k){const d=await open();try{return await req(d.transaction(s).objectStore(s).get(k))}finally{d.close()}}\nasync function put(s,k,v){const d=await open();try{const tx=d.transaction(s,'readwrite'),p=done(tx);tx.objectStore(s).put(v,k);await p}finally{d.close()}}\nasync function hash(x){const a=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x)));return [...new Uint8Array(a)].map(v=>v.toString(16).padStart(2,'0')).join('')}\nfunction allLocal(){const found={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k.startsWith('f2v4.'))continue;if(LS.includes(k))found[k]=localStorage.getItem(k);else if(!EXTRA.has(k))throw Error('unknown fixture key '+k)}if(Object.keys(found).length!==LS.length)throw Error('incomplete local source');return Object.fromEntries(LS.map(k=>[k,found[k]]))}\nasync function snapshot(){const ls=allLocal(),idb={};for(const k of IDB){const v=await get('durable',k);if(v===undefined)throw Error('incomplete IDB source');idb[k]=v}return {ls,idb}}\nasync function exportPlan(dest){const body={app:'F2V4-SYNTHETIC-ONLY',version:1,source:location.origin,destination:dest,state:await snapshot()};return {...body,sha:await hash(body)}}\nasync function verify(p,source){if(!p||p.app!=='F2V4-SYNTHETIC-ONLY'||p.version!==1||p.source!==source||p.destination!==location.origin)throw Error('invalid origin or version');if(JSON.stringify(p).length>100000)throw Error('oversized package');const {sha,...body}=p;if(await hash(body)!==sha)throw Error('digest mismatch');const s=p.state;if(!s||!s.ls||!s.idb||Object.keys(s.ls).sort().join('|')!==LS.slice().sort().join('|')||Object.keys(s.idb).sort().join('|')!==IDB.slice().sort().join('|'))throw Error('unknown or missing durable data');return true}\nasync function seed(){if(localStorage.length)throw Error('source not empty');const data={'f2v4.settings':{cars:['FAKE-CAR'],tyres:['FAKE-SUMMER','FAKE-WINTER']},'f2v4.context':{car:'FAKE-CAR',day:'work',gps:null},'f2v4.observations':[{id:'HUMAN-FAKE',report:'fog'}],'f2v4.history':{closed:[{id:'TRIP-FAKE',feedback:'good'}]},'f2v4.tyres':{depth:[7.1,7.0,6.9,6.8],dot:'FAKE'}};for(const k of LS)localStorage.setItem(k,JSON.stringify(data[k]));localStorage.setItem('f2v4.gps','DUMMY-LOCATION');localStorage.setItem('f2v4.session','DUMMY-SESSION');localStorage.setItem('f2v4.cache','DUMMY-CACHE');await put('durable','tyreProfile',{tyre:'FAKE-TYRE',depth:[7.1,7.0,6.9,6.8]});await put('durable','closedJourneys',[{id:'TRIP-FAKE',note:'FAKE'}])}\nasync function stage(p,src){await verify(p,src);if(localStorage.getItem('f2v4.restore.phase')!==null)throw Error('existing restore');for(const k of LS)if(localStorage.getItem(k)!==null)throw Error('nonempty target');for(const k of IDB)if(await get('durable',k)!==undefined)throw Error('nonempty IDB');if(await get('staging','plan'))throw Error('stage exists');await put('staging','plan',p);return 'staged'}\nasync function exactly(p){for(const k of LS)if(localStorage.getItem(k)!==p.state.ls[k])return false;for(const k of IDB)if(JSON.stringify(await get('durable',k))!==JSON.stringify(p.state.idb[k]))return false;return true}\nasync function commit(approved,fail){if(approved!==true)throw Error('confirmation required');const p=await get('staging','plan');if(!p||p.destination!==location.origin)throw Error('staging missing');if(localStorage.getItem('f2v4.restore.phase')==='ready')throw Error('already active');localStorage.setItem('f2v4.restore.phase','restoring');for(let i=0;i<LS.length;i++){const k=LS[i];localStorage.setItem(k,p.state.ls[k]);if(fail==='local-'+(i+1))throw Error('synthetic crash after local '+(i+1))}if(fail==='quota')throw Error('synthetic quota');const db=await open();try{const tx=db.transaction(['durable','staging'],'readwrite'),promise=done(tx);for(const k of IDB)tx.objectStore('durable').put(clone(p.state.idb[k]),k);tx.objectStore('staging').put(p.sha,'receipt');if(fail==='idb-abort')tx.abort();await promise}finally{db.close()}if(fail==='after-idb')throw Error('synthetic crash after IDB');if(!await exactly(p)||await get('staging','receipt')!==p.sha)throw Error('post-commit mismatch');localStorage.setItem('f2v4.restore.phase','ready');return 'READY'}\nasync function appRead(){if(localStorage.getItem('f2v4.restore.phase')!=='ready')throw Error('blocked while restoring');const p=await get('staging','plan');if(!p||!await exactly(p))throw Error('integrity failure');return p.state}\nasync function inspect(){const ls=Object.fromEntries(LS.map(k=>[k,localStorage.getItem(k)])),idb={};for(const k of IDB)idb[k]=await get('durable',k);return {phase:localStorage.getItem('f2v4.restore.phase'),ls,idb}}\nasync function reverse(old){const p=await get('staging','plan');const state=clone(p.state);const obs=JSON.parse(state.ls['f2v4.observations']);obs.push({id:'HUMAN-FAKE-NEW',report:'rain'});state.ls['f2v4.observations']=JSON.stringify(obs);state.idb.closedJourneys.push({id:'TRIP-FAKE-NEW',note:'FAKE'});return {source:location.origin,destination:old,state}}\nasync function preview(p,source){if(p.source!==source||p.destination!==location.origin)throw Error('wrong reverse origins');const original=await snapshot();return {conflict:JSON.stringify(original)!==JSON.stringify(p.state),oldObservations:JSON.parse(original.ls['f2v4.observations']).length,newObservations:JSON.parse(p.state.ls['f2v4.observations']).length}}\nwindow.lab={seed,snapshot,exportPlan,stage,commit,appRead,inspect,reverse,preview,\naddUnknown(){localStorage.setItem('f2v4.unknown','DUMMY')},removeUnknown(){localStorage.removeItem('f2v4.unknown')},\npollute(){localStorage.setItem('f2v4.settings','PREEXISTING-DUMMY')},cleanPollute(){localStorage.removeItem('f2v4.settings')}};\n})();";
const serve=()=>new Promise((yes,no)=>{
 const s=http.createServer((req,res)=>{if(req.url!=='/'&&req.url!=='/favicon.ico'){res.writeHead(404);res.end();return}
 res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});
 res.end('<!doctype html><html><title>Forteresse II dummy profile</title></html>')});
 s.once('error',no);s.listen(0,'127.0.0.1',()=>yes({server:s,origin:'http://127.0.0.1:'+s.address().port}))});
async function run(name){
 const [src,dst]=await Promise.all([serve(),serve()]);
 const browser=await {chromium,webkit}[name].launch({headless:true});
 const ctx=await browser.newContext({serviceWorkers:'block'});
 const allowed=new Set([src.origin,dst.origin]);
 await ctx.route('**/*',r=>{
  let origin;try{origin=new URL(r.request().url()).origin}catch{return r.abort()}
  return allowed.has(origin)?r.continue():r.abort('blockedbyclient')});
 const old=await ctx.newPage(),fresh=await ctx.newPage();let passed=0;
 const test=async(n,f)=>{await f();passed++;console.log('✅ '+name+' '+n)};
 try {
  await old.goto(src.origin);await fresh.goto(dst.origin);
  await old.addScriptTag({content:CLIENT});await fresh.addScriptTag({content:CLIENT});
  await old.evaluate(()=>lab.seed());
  const reference=await old.evaluate(()=>lab.snapshot());
  const pack=await old.evaluate(d=>lab.exportPlan(d),dst.origin);
  await test('5 durable local keys + 2 durable IDB records preserved',async()=>{
   assert.equal(Object.keys(reference.ls).length,5);assert.equal(Object.keys(reference.idb).length,2);
   assert.deepEqual(pack.state,reference);
   assert(!JSON.stringify(pack).includes('DUMMY-SESSION'));
   assert(!JSON.stringify(pack).includes('DUMMY-LOCATION'))
  });
  await test('unknown synthetic key blocks source export',async()=>{
   await old.evaluate(()=>lab.addUnknown());
   await assert.rejects(()=>old.evaluate(d=>lab.exportPlan(d),dst.origin),/unknown fixture key/);
   await old.evaluate(()=>lab.removeUnknown())
  });
  await test('altered digest and foreign destination blocked before staging',async()=>{
   for(const p of [{...pack,sha:'0'.repeat(64)},{...pack,destination:'http://127.0.0.1:9'}])
    await assert.rejects(()=>fresh.evaluate(([p,s])=>lab.stage(p,s),[p,src.origin]));
   assert.equal((await fresh.evaluate(()=>lab.inspect())).phase,null)
  });
  await test('nonempty target cannot be overwritten',async()=>{
   await fresh.evaluate(()=>lab.pollute());
   await assert.rejects(()=>fresh.evaluate(([p,s])=>lab.stage(p,s),[pack,src.origin]),/nonempty target/);
   await fresh.evaluate(()=>lab.cleanPollute())
  });
  await test('staging does not expose durable keys',async()=>{
   assert.equal(await fresh.evaluate(([p,s])=>lab.stage(p,s),[pack,src.origin]),'staged');
   const v=await fresh.evaluate(()=>lab.inspect());
   assert.equal(v.phase,null);assert(Object.values(v.ls).every(x=>x===null));
   assert(Object.values(v.idb).every(x=>x===undefined))
  });
  await test('consent required before any activation',async()=>{
   await assert.rejects(()=>fresh.evaluate(()=>lab.commit(false)),/confirmation required/);
   assert.equal((await fresh.evaluate(()=>lab.inspect())).phase,null)
  });
  await test('power loss after first local write blocks application reads',async()=>{
   await assert.rejects(()=>fresh.evaluate(()=>lab.commit(true,'local-1')),/synthetic crash/);
   assert.equal((await fresh.evaluate(()=>lab.inspect())).phase,'restoring');
   await assert.rejects(()=>fresh.evaluate(()=>lab.appRead()),/blocked/)
  });
  await test('browser reload does not mark partial restore ready',async()=>{
   await fresh.reload();await fresh.addScriptTag({content:CLIENT});
   assert.equal((await fresh.evaluate(()=>lab.inspect())).phase,'restoring');
   await assert.rejects(()=>fresh.evaluate(()=>lab.appRead()),/blocked/)
  });
  await test('quota injection after local writes stops before IDB',async()=>{
   await assert.rejects(()=>fresh.evaluate(()=>lab.commit(true,'quota')),/synthetic quota/);
   assert.equal((await fresh.evaluate(()=>lab.inspect())).phase,'restoring')
  });
  await test('real IDB abort leaves no durable IDB records',async()=>{
   await assert.rejects(()=>fresh.evaluate(()=>lab.commit(true,'idb-abort')));
   const v=await fresh.evaluate(()=>lab.inspect());
   assert.equal(v.phase,'restoring');assert(Object.values(v.idb).every(x=>x===undefined))
  });
  await test('crash after IDB commit still refuses app reads',async()=>{
   await assert.rejects(()=>fresh.evaluate(()=>lab.commit(true,'after-idb')),/synthetic crash/);
   const v=await fresh.evaluate(()=>lab.inspect());
   assert.equal(v.phase,'restoring');assert.deepEqual(v.idb,reference.idb);
   await assert.rejects(()=>fresh.evaluate(()=>lab.appRead()),/blocked/)
  });
  await test('explicit resume replays and checks all seven durable records',async()=>{
   assert.equal(await fresh.evaluate(()=>lab.commit(true)),'READY');
   const v=await fresh.evaluate(()=>lab.inspect());
   assert.equal(v.phase,'ready');assert.deepEqual(v.ls,reference.ls);
   assert.deepEqual(v.idb,reference.idb);
   assert.deepEqual(await fresh.evaluate(()=>lab.appRead()),reference)
  });
  await test('fresh browser navigation can read verified restore',async()=>{
   await fresh.reload();await fresh.addScriptTag({content:CLIENT});
   assert.deepEqual(await fresh.evaluate(()=>lab.appRead()),reference)
  });
  await test('second activation is refused',async()=>{
   await assert.rejects(()=>fresh.evaluate(()=>lab.commit(true)),/already active/);
   assert.deepEqual(await fresh.evaluate(()=>lab.appRead()),reference)
  });
  await test('reverse transfer detects human observations conflict',async()=>{
   const inverse=await fresh.evaluate(origin=>lab.reverse(origin),src.origin);
   const verdict=await old.evaluate(([x,source])=>lab.preview(x,source),[inverse,dst.origin]);
   assert.deepEqual(verdict,{conflict:true,oldObservations:1,newObservations:2});
   assert.deepEqual(await old.evaluate(()=>lab.snapshot()),reference)
  });
  await test('old origin untouched, new origin excludes session & GPS',async()=>{
   assert.deepEqual(await old.evaluate(()=>lab.snapshot()),reference);
   const names=await fresh.evaluate(()=>Object.keys(localStorage));
   assert(!names.includes('f2v4.session'));assert(!names.includes('f2v4.gps'))
  });
  console.log('✅ '+name+': '+passed+'/'+passed+' synthetic multi-store recovery tests');
 }finally{
  await ctx.close();await browser.close();
  await Promise.all([new Promise(r=>src.server.close(r)),new Promise(r=>dst.server.close(r))])
 }
}
(async()=>{const name=process.env.BROWSER||process.argv[2]||'chromium';if(!['chromium','webkit'].includes(name))throw Error('browser unsupported');await run(name)})().catch(e=>{console.error('❌',e.stack);process.exitCode=1});
