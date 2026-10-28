"use strict";
// NOESIS-RC-003: exercises the real DriveStore.open()/read()/write() implementation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname,"../src/drive-store.js"),"utf8");
function fake() {
 let mode = "ok", opens = 0, deletes = 0;
 const connections = [], late = [], rows = {state:new Map(), recovery:new Map()};
 function connection() {
  let closed = false;
  const db = {close(){closed=true;},createObjectStore(){},
   transaction(name) {
    if(closed)throw Error("InvalidStateError: closed database");
    const tx = {objectStore(){return {
     get(key) {const request={};queueMicrotask(()=>{request.result=rows[name].get(key);request.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return request;},
     put(value,key){rows[name].set(key,structuredClone(value));queueMicrotask(()=>tx.oncomplete?.());},
     add(value,key){if(rows[name].has(key))throw Error("ConstraintError");rows[name].set(key,structuredClone(value));}
    };}};
    return tx;
   }, get closed(){return closed;}};
  connections.push(db);return db;
 }
 const indexedDB = {
  open() {
   opens++;const req={result:connection()};
   const step=mode;mode="ok";
   queueMicrotask(()=>{
    if(step==="error"){req.onerror?.();return;}
    if(step==="blocked"){req.onblocked?.();late.push(()=>req.onsuccess?.());return;}
    req.onupgradeneeded?.();req.onsuccess?.();
   });
   return req;
  },
  deleteDatabase(){deletes++;throw Error("Database deletion forbidden");}
 };
 return {indexedDB,connections,late,rows,set mode(v){mode=v;},get opens(){return opens;},get deletes(){return deletes;}};
}
function make(f) {
 const env={indexedDB:f.indexedDB,structuredClone,Uint8Array,queueMicrotask,Date,globalThis:null};
 env.globalThis=env;
 vm.createContext(env);
 vm.runInContext(source+"\nglobalThis.Store=DriveStore;",env);
 return env.Store.create("noesis-fake-idb",f.indexedDB);
}
let count=0;
async function test(name,fn){await fn();count++;console.log("PASS NOESIS-RC-003 "+name);}
async function main() {
 await test("rejected initial open is retryable",async()=>{
  const f=fake(),s=make(f);f.mode="error";
  await assert.rejects(s.read(),/stockage/);
  assert.equal(await s.read(),null);assert.equal(f.opens,2);
 });
 await test("onblocked releases cache; a late orphan connection is closed",async()=>{
  const f=fake(),s=make(f);f.mode="blocked";
  await assert.rejects(s.read(),/stockage/);
  assert.equal(await s.read(),null);f.late.forEach(release=>release());
  await Promise.resolve();
  assert.equal(f.connections[0].closed,true);
  assert.equal(f.deletes,0);
 });
 await test("versionchange closes stale connection and reopens",async()=>{
  const f=fake(),s=make(f);assert.equal(await s.read(),null);
  f.connections[0].onversionchange();
  assert.equal(f.connections[0].closed,true);
  assert.equal(await s.read(),null);assert.equal(f.opens,2);
 });
 await test("manual close fails once then recovers without deleting database",async()=>{
  const f=fake(),s=make(f);await s.read();f.connections[0].close();
  await assert.rejects(s.read(),/stockage/);
  assert.equal(await s.read(),null);assert.equal(f.opens,2);assert.equal(f.deletes,0);
 });
 await test("parallel calls share a single open",async()=>{
  const f=fake(),s=make(f);
  assert.deepEqual(await Promise.all([s.read(),s.read(),s.read()]),[null,null,null]);
  assert.equal(f.opens,1);
 });
 await test("previously verified user bytes survive a failed reopen",async()=>{
  const f=fake(),s=make(f),value={v:1,job:null,receipts:[{fileId:"synthetic",sha:"a".repeat(64)}]};
  await s.write(value);f.connections[0].onversionchange();
  assert.equal((await s.read()).receipts[0].fileId,"synthetic");
  assert.equal(f.deletes,0);
 });
 await test("NOESIS 13.4 : toutes les copies avant fusion sont indexées et relisibles, aucune n'est purgée",async()=>{
  const {webcrypto}=require("node:crypto"),f=fake(),s=make(f),enc=t=>new TextEncoder().encode(t);
  const h1=await s.recovery(enc("copie-1"),webcrypto,1000),h2=await s.recovery(enc("copie-2"),webcrypto,2000),again=await s.recovery(enc("copie-1"),webcrypto,3000);
  assert.equal(again,h1,"copie identique : même empreinte, pas de doublon");
  const list=JSON.parse(JSON.stringify(await s.recoveries()));
  assert.deepEqual(list.map(x=>x.hash),[h2,h1],"plus récente d'abord");
  assert.deepEqual(list.map(x=>x.at),[2000,1000]);assert.deepEqual(list.map(x=>x.size),[7,7]);
  assert.equal(new TextDecoder().decode(await s.readRecovery(h1)),"copie-1");
  assert.equal(f.rows.recovery.size,2);assert.equal(f.deletes,0);
 });
 await test("NOESIS 13.4 : copie antérieure à l'index (recovery-latest seul) toujours listée",async()=>{
  const f=fake(),s=make(f);f.rows.recovery.set("b".repeat(64),new Uint8Array([1,2,3]));f.rows.state.set("recovery-latest","b".repeat(64));
  const list=JSON.parse(JSON.stringify(await s.recoveries()));
  assert.deepEqual(list,[{hash:"b".repeat(64),at:null,size:3}]);
 });
 console.log("NOESIS-RC-003: "+count+" tests, synthetic IndexedDB only.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
