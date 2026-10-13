#!/usr/bin/env node
// Forteresse II — SW v12 exécuté dans une VM isolée, réponses et caches entièrement fictifs.
// AUCUN HTTP, aucune donnée de compte, aucun GPS réel, aucune inscription SW dans Safari.
'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const ORIGIN='https://race-seul.example.invalid', OLD='https://ancien-race.example.invalid';
const SCOPE=ORIGIN+'/race-control/';
let online=true, nextStatus=null, responseOverride=null;
const data={
  'obs.json':{checkedAt:'2040-01-01T00:00:00Z',stations:[]},
  'calendar.sealed.json':{schema:99,ciphertext:'FICTIF-NON-DECHIFFRABLE'},
  'version.json':{run:999,sha:'SHA-FICTIF'},
  'road-datex.json':{schema:1,provider:'datex',complete:true,events:[],coverage:'fictif',
   checkedAt:new Date().toISOString(),publicationTime:new Date().toISOString()}
};
function fakeFetch(req) {
  if(!online) return Promise.reject(new TypeError('offline-fictif'));
  const basename=new URL(req.url).pathname.split('/').pop();
  if(nextStatus!==null) {const s=nextStatus;nextStatus=null;return Promise.resolve(new Response('synthetic error',{status:s}));}
  const body=responseOverride!==null?responseOverride:JSON.stringify(data[basename]||{fixture:true});
  responseOverride=null;
  return Promise.resolve(new Response(body,{status:200,headers:{'Content-Type':'application/json'}}));
}
const cacheBoxes=new Map(), events=new Map();
class Cache {
  constructor(){this.map=new Map();}
  async match(key){const value=this.map.get(key.url||key);return value?value.clone():undefined;}
  async put(key,value){this.map.set(key.url||key,value.clone());}
  async delete(key){return this.map.delete(key.url||key);}
  async addAll(){throw Error('install est exclu du test, aucun réseau implicite');}
}
const fakeCaches={
  async open(name){if(!cacheBoxes.has(name))cacheBoxes.set(name,new Cache());return cacheBoxes.get(name);},
  async match(){return undefined;},
  async keys(){return [...cacheBoxes.keys()];},
  async delete(name){return cacheBoxes.delete(name);}
};
const swCode=fs.readFileSync(path.join(__dirname,'../src/sw.js'),'utf8');
const sb={
  self:{
    location:{origin:ORIGIN},
    registration:{scope:SCOPE},
    clients:{claim:async()=>{}},
    skipWaiting(){},
    addEventListener(type,callback){events.set(type,callback);}
  }, Request,Response,Headers,URL,Date,Promise,setTimeout, caches:fakeCaches, fetch:fakeFetch
};
vm.runInNewContext(swCode,sb,{filename:'src/sw.js',timeout:1000});
assert(events.has('fetch'),'vrai service worker non branché');
async function request(url){
  let responded=false, p;
  events.get('fetch')({request:new Request(url),respondWith(value){responded=true;p=value;},waitUntil(){}});
  return {intercepted:responded,response:responded?await p:null};
}
function setOnline(value){online=value;}
let passed=0;
async function test(label,fn){await fn();passed++;console.log('✅ '+label);}
async function main(){
 await test('aucune interception de l’ancienne origine, même pour obs.json',async()=>{
   assert.equal((await request(OLD+'/iPoower/race-control/obs.json')).intercepted,false);
 });
 await test('aucune interception de l’app voisine dans un autre chemin',async()=>{
   assert.equal((await request(ORIGIN+'/Reconversion-Control/obs.json')).intercepted,false);
 });
 for(const name of ['obs.json','calendar.sealed.json','version.json']){
   await test(name+' fictif : initialisation même origine puis lecture hors ligne',async()=>{
     setOnline(true);
     const first=await request(SCOPE+name);assert(first.intercepted);
     assert.equal(first.response.status,200);
     assert.deepEqual(await first.response.json(),data[name]);
     setOnline(false);
     const fallback=await request(SCOPE+name);
     assert(fallback.intercepted);
     assert.equal(fallback.response.status,200);
     assert.deepEqual(await fallback.response.json(),data[name]);
   });
 }
 await test('cache SW n’obtient aucune copie des requêtes cross-origin',async()=>{
   const cache=await fakeCaches.open('twrc-data-v3');
   assert.equal(await cache.match(OLD+'/iPoower/race-control/obs.json'),undefined);
 });
 await test('JSON même origine : HTTP 503 utilise dernière copie fictive',async()=>{
   setOnline(true);nextStatus=503;
   const r=await request(SCOPE+'obs.json');
   assert.equal(r.response.status,200);
   assert.deepEqual(await r.response.json(),data['obs.json']);
 });
 await test('DATEX : une première réponse valide est sauvegardée',async()=>{
   setOnline(true);
   const first=await request(SCOPE+'road-datex.json');
   assert.equal(first.response.status,200);
   assert.deepEqual(await first.response.json(),data['road-datex.json']);
 });
 await test('DATEX : repli offline signalé seulement avec cache valide',async()=>{
   setOnline(false);
   const r=await request(SCOPE+'road-datex.json');
   assert.equal(r.response.status,200);
   assert.equal(r.response.headers.get('X-TWRC-Cache'),'fallback');
   assert.deepEqual(await r.response.json(),data['road-datex.json']);
 });
 await test('DATEX : réponse non-JSON n’écrase pas copie précédemment saine',async()=>{
   setOnline(true);responseOverride='<html>erreur fictive</html>';
   const bad=await request(SCOPE+'road-datex.json'); assert.equal(bad.response.status,200);
   setOnline(false);
   const fallback=await request(SCOPE+'road-datex.json');
   assert.deepEqual(await fallback.response.json(),data['road-datex.json']);
 });
 await test('DATEX : donnée de cache périmée refusée',async()=>{
   const cache=await fakeCaches.open('twrc-data-v3');
   const stale={...data['road-datex.json'],checkedAt:new Date(Date.now()-2*86400000).toISOString(),
     publicationTime:new Date(Date.now()-2*86400000).toISOString()};
   await cache.put(ORIGIN+'/race-control/road-datex.json',new Response(JSON.stringify(stale)));
   setOnline(false);
   await assert.rejects(async()=>request(SCOPE+'road-datex.json'),/offline-fictif/);
   assert.equal(await cache.match(ORIGIN+'/race-control/road-datex.json'),undefined);
 });
 await test('data URLs uniques : aucune URL privée ni paramètre utilisateur dans la VM',async()=>{
   for(const box of cacheBoxes.values()) for(const url of box.map.keys()){
     assert(url.startsWith(SCOPE),url);
     assert(!url.includes('?'),url);
   }
 });
 console.log(passed+'/'+passed+' tests SW fictifs réussis — aucun réseau ni service worker réel.');
}
main().catch(e=>{console.error('❌',e.stack);process.exitCode=1;});
