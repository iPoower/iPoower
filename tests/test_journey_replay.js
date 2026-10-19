// Journey Replay : données historiques seulement, zéro télémétrie et rendu inaccessible aux entrées annulées.
'use strict';
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), read=f=>fs.readFileSync(path.join(root,f),'utf8');
const sandbox={Date,Math,JSON,Array,Set,Map,Number,String,Object,window:{},esc:s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  garageCarSvg:(kind,scene)=>'<g data-test-car="'+kind+'" data-scene="'+scene+'"></g>'};
vm.createContext(sandbox);
vm.runInContext(read('src/garage.js')+'\n'+read('src/debrief.js')+'\n'+
  read('src/app/journey-replay-core.js')+'\n'+read('src/app/journey-replay-view.js')+
  '\nthis.R=JourneyReplay;this.HTML=journeyReplayHtml;',sandbox);
const R=sandbox.R, html=sandbox.HTML, json=v=>JSON.parse(JSON.stringify(v));
let passed=0;
const test=(title,fn)=>{fn();passed++;console.log('✅ '+title)};
const AT=Date.parse('2026-10-18T17:45:00Z');
const start=(cond=['rain'],extra={})=>({key:'test-1',at:AT-35*60000,from:'Lieu A',to:'Lieu B',carId:'v1',
  car:'Voiture test',prediction:{known:true,conditions:cond,fetchedAt:AT-40*60000,offline:false},...extra});
const finished=(conditions=['wet'],before=start())=>({key:'test-1',at:AT,how:'confirmé',name:'Trajet test',from:'Lieu A',to:'Lieu B',
  start:before,feedback:{at:AT+200,conditions,grip:'unknown'}});
const cars=[{id:'v1',name:'Voiture test',short:'Test'}];
test('entrée manquante ou arrivée annulée : aucune scène',()=>{
  assert.equal(R.project(null).available,false);
  assert.equal(R.project({...finished(),cancelledAt:AT+1000},cars).available,false);
  assert.equal(html({...finished(),cancelledAt:AT+1000},cars),'');
});
test('seule la voiture HISTORIQUE est retenue, jamais la voiture actuellement active',()=>{
  const result=R.project(finished(),[{id:'v2',name:'Autre voiture',active:true}]);
  assert.equal(result.car,'Voiture test');assert.equal(result.carId,'v1');assert.equal(result.silhouette,'generic');
});
test('identité historique prioritaire sur le Garage renommé depuis le trajet',()=>{
  const e=finished([],start([],{car:'308'}));
  const p=R.project(e,[{id:'v1',name:'Hyundai i20 N actuelle'}]);
  assert.equal(p.car,'308');assert.equal(p.carSource,'snapshot');assert.equal(p.silhouette,'touring');
  const missing=R.project(finished([],start([],{car:''})),[{id:'v1',name:'Hyundai i20 N actuelle'}]);
  assert.equal(missing.carSource,'garage-current');assert.equal(missing.silhouette,null);
  assert.match(html(finished([],start([],{car:''})),[{id:'v1',name:'Hyundai i20 N actuelle'}]),/identité historique non archivée/);
});
test('snapshot immuable, aucun alias vers les sources',()=>{
  const e=finished(['wet','fog'],start(['rain'])), before=JSON.stringify(e);
  const p=R.project(e,cars); p.frames[0].conditions.push('snow');p.frames[1].labels.push('Faux');
  assert.equal(JSON.stringify(e),before);assert.deepEqual(json(e.start.prediction.conditions),['rain']);
});
test('famille pluie et chaussée humide : concordance selon Debrief.compare',()=>{
  const p=R.project(finished(['wet']),cars);
  assert.equal(p.comparison,'match');assert.equal(p.comparable,true);assert.equal(p.frames[0].rain,true);
  assert.equal(p.frames[1].wet,true);assert.equal(p.frames[1].rain,false);
});
test('brouillard non annoncé : conducteur explicite, pas station',()=>{
  const p=R.project(finished(['fog']),cars);
  assert.equal(p.comparison,'mixed');assert.deepEqual(json(p.missed),['Brume / brouillard']);
  assert.match(html(finished(['fog']),cars),/DÉCLARATION CONDUCTEUR/);
  assert.match(html(finished(['fog']),cars),/Modèle météo archivé, pas une observation/);
});
test('prévision non rencontrée : alerte signalée comme non rencontrée',()=>{
  const p=R.project(finished([],start(['snow','ice'])),cars);
  assert.equal(p.comparison,'unused');assert.equal(p.unused.length,2);
  assert.equal(p.frames[1].known,true);assert.deepEqual(json(p.frames[1].conditions),[]);
});
test('aucun retour : pas de chaussée sèche ni météo observée inventées',()=>{
  const e={...finished(),feedback:null},p=R.project(e,cars);
  assert.equal(p.comparison,'pending');assert.equal(p.frames[1].known,false);
  assert.equal(p.frames[1].wet,false);assert.equal(p.frames[1].rain,false);
});
test('prévision absente : ne montre aucune météo au départ',()=>{
  const p=R.project(finished(['rain'],start(['snow'],{prediction:null})),cars);
  assert.equal(p.comparison,'unknown');assert.equal(p.frames[0].known,false);
  assert.equal(p.frames[0].snow,false);assert.equal(p.frames[1].rain,true);
});
test('prévision trop ancienne affichée mais jamais rendue comparable',()=>{
  const s=start(['snow']);s.prediction.fetchedAt=s.at-90*60000;
  const p=R.project(finished(['snow'],s),cars);
  assert.equal(p.comparison,'unknown');assert.equal(p.comparable,false);assert.equal(p.frames[0].snow,true);
});
test('trajet sans départ : route déclarée conservée, météo non inventée',()=>{
  const p=R.project(finished(['ice'],null),cars);
  assert.equal(p.departure,null);assert.equal(p.frames[0].known,false);assert.equal(p.car,null);
  assert.ok(p.missing.includes('Départ non archivé'));
});
test('jour/nuit jamais inféré de la seule heure : éphémérides absentes',()=>{
  const p=R.project({...finished(),at:Date.parse('2026-10-18T01:00:00Z')},cars);
  assert.equal(p.phase,'unknown');assert.equal(p.routeScale,'illustrative');assert.equal(p.telemetry,null);
});
test('hors ligne conservé comme provenance de la prévision enregistrée',()=>{
  const s=start(['fog']);s.prediction.offline=true;
  const p=R.project(finished(['fog'],s),cars);assert.equal(p.offlineAtDeparture,true);
  assert.match(html(finished(['fog'],s),cars),/hors ligne au départ/);
});
test('conditions absentes et voiture absente : pas de silhouette par défaut',()=>{
  const e=finished([],start([],{car:'',carId:''})),p=R.project(e);
  assert.equal(p.car,null);assert.equal(p.silhouette,null);
  const view=html(e,[]);assert.ok(!view.includes('data-test-car'));
});
test('noms de lieux échappés et non injectables dans la scène',()=>{
  const e=finished();e.from='<img src=x onerror=alert(1)>';e.start.from=e.from;
  const view=html(e,cars);assert.ok(!view.includes('<img'));assert.match(view,/&lt;img/);
});
test('interface : lecture/pause, panneaux AVANT/APRÈS et origine distincte',()=>{
  const view=html(finished(),cars,true);
  assert.match(view,/data-jr-act="play"/);assert.match(view,/data-jr-act="before"/);
  assert.match(view,/data-jr-act="after"/);assert.match(view,/open>/);
  assert.match(view,/PRÉVISION FIGÉE/);assert.match(view,/DÉCLARATION CONDUCTEUR/);
  assert.match(view,/SANS ÉCHELLE/);assert.match(view,/data-test-car/);
});
test('code statique : aucun stockage, requête, télémétrie, nouveau timer ou récupération historique',()=>{
  const src=read('src/app/journey-replay-core.js')+'\n'+read('src/app/journey-replay-view.js');
  for(const pattern of [/\bfetch\s*\(/,/\blocalStorage\b/,/\bsessionStorage\b/,/\bindexedDB\b/,
    /\bsetInterval\s*\(/,/\bsetTimeout\s*\(/,/\brequestAnimationFrame\s*\(/,/\bnavigator\.geolocation\b/])assert.ok(!pattern.test(src),String(pattern));
  assert.match(src,/prefers-reduced-motion/);assert.match(src,/IntersectionObserver/);
  assert.match(src,/garageCarSvg/);
});
console.log(passed+' tests Journey Replay réussis.');