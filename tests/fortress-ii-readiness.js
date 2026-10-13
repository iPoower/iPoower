#!/usr/bin/env node
// Forteresse II, étape 2 — moteur de décision de simulation, sans accès aux vrais coffres.
// IMPORTANT : pas un exporteur/importeur de production; exemples purement inventés.
'use strict';
const assert = require('node:assert/strict');
const SRC = 'https://ancien-race.example.invalid';
const DST = 'https://race-seul.example.invalid';
const DURABLE = new Set(['twrc.settings.v1','twrc.context.v1','twrc.tyretherm.v1','twrc.tripcancel','twrc.view','twrc.outfit.occasion']);
const HUMAN = new Set(['twrc.reports.v1','twrc.shadow.v1']);
const REVIEW = new Set(['twrc.weather.incidents.v1','twrc.trend',...HUMAN]);
const DEVICE = new Set(['twrc.vault.v2','twrc.session.v2','twrc.device.vault.v1','twrc.remember-device.v1','twrc.restore.pending.v1','twrc.lock.signal','twrc.gps']);
const TRANSIENT = new Set(['twrc.runtime.v1','twrc.weather.limit.v1','twrc.calendar.sealed.v1','twrc.tripmap','twrc.decision.latest.v1']);
const PREFIXES = ['twrc.cache.','twrc.croute.','twrc.road.','twrc.reload.'];
const clone = v => JSON.parse(JSON.stringify(v));
const payload = () => ({
  'twrc.settings.v1': JSON.stringify({ cars: [{id:'auto-FICTIVE',tyre:'pneu-FICTIF'}], calOrigins:[] }),
  'twrc.context.v1': JSON.stringify({v:1,revision:15,dayContext:{activeCarId:'auto-FICTIVE'},debrief:{entries:[{key:'trajet-FICTIF',feedback:{grip:'normal'}}]},gps:null}),
  'twrc.tyretherm.v1':'{}',
  'twrc.tripcancel':'{}',
  'twrc.view':'pneus',
  'twrc.reports.v1':JSON.stringify([{kind:'fog',place:'PLACE-FICTIVE',lat:0.01,lon:0.02,at:1000}]),
  'twrc.shadow.v1':JSON.stringify([{loc:'PLACE-FICTIVE',obs:1,at:1000}]),
  'twrc.vault.v2':'SECRET-FICTIF-NE-PAS-COPIER',
  'twrc.session.v2':'SESSION-FICTIVE-NE-PAS-COPIER',
  'twrc.gps':JSON.stringify({lat:0.1,lon:0.2}),
  'twrc.cache.forecast':'CACHE-FICTIF'
});
const decisions = () => ({'twrc.reports.v1':'preserve','twrc.shadow.v1':'preserve'});
function classify(key) {
  if (DURABLE.has(key)) return 'durable';
  if (REVIEW.has(key)) return 'review';
  if (DEVICE.has(key)) return 'device';
  if (TRANSIENT.has(key)||PREFIXES.some(p=>key.startsWith(p))) return 'transient';
  return 'unknown';
}
function prepare(source, choices, meta={source:SRC,target:DST,revision:15}) {
  assert.equal(meta.source,SRC,'source non reconnue');
  assert.equal(meta.target,DST,'cible non reconnue');
  assert(Number.isSafeInteger(meta.revision) && meta.revision>=0, 'révision source invalide');
  assert(source&&typeof source==='object'&&!Array.isArray(source),'stockage invalide');
  if(Buffer.byteLength(JSON.stringify(source))>1000000) throw Error('volume excessif');
  const out={};
  for(const [key,value] of Object.entries(source)) {
    const kind=classify(key);
    if(kind==='unknown') throw Error('clé non classifiée: '+key);
    if(typeof value!=='string') throw Error('valeur non textuelle: '+key);
    if(kind==='device'||kind==='transient') continue;
    if(kind==='review') {
      // Les observations humaines ne peuvent jamais être ignorées silencieusement.
      let meaningful=true;
      try { const decoded=JSON.parse(value); meaningful=Array.isArray(decoded) ? decoded.length>0 : !!decoded && Object.keys(decoded).length>0; }
      catch{throw Error('observation illisible: '+key);}
      if(meaningful && choices[key]!=='preserve') throw Error('arbitrage humain requis: '+key);
      if(choices[key]==='preserve') out[key]=value;
      continue;
    }
    if(key==='twrc.context.v1') {
      const c=JSON.parse(value);
      if(!c || typeof c!=='object'||Array.isArray(c)) throw Error('contexte malformé');
      if(c.gps!==null && c.gps!==undefined) throw Error('GPS actif dans le contexte');
      if(c.tripStart||c.tripEnd||c.returnHome) throw Error('trajet actif');
    }
    out[key]=value;
  }
  if(!out['twrc.settings.v1']||!out['twrc.context.v1']) throw Error('données essentielles absentes');
  return Object.freeze({source:meta.source,target:meta.target,revision:meta.revision,values:out,keys:Object.keys(out).sort()});
}
class FakeStore {
  constructor(values={}, revision=0, limit=1000000) {this.values=clone(values);this.revision=revision;this.limit=limit;}
  read() {return clone(this.values);}
  stage(plan) {
    if(Object.keys(this.values).length) throw Error('cible doit être vide');
    if(plan.target!==DST) throw Error('mauvaise origine');
    if(plan.revision!==15) throw Error('révision du manifeste inattendue');
    const values=clone(plan.values);
    if(Buffer.byteLength(JSON.stringify(values))>this.limit) throw Error('QuotaExceededError');
    return {revision:this.revision,values};
  }
  activate(candidate) {
    if(this.revision!==candidate.revision || Object.keys(this.values).length) throw Error('écriture concurrente');
    this.values=clone(candidate.values);this.revision++;
  }
}
async function main() {
 let n=0;
 async function t(label,fn){await fn(); n++; console.log('✅ '+label);}
 const source=payload(), original=clone(source), choices=decisions(), p=prepare(source,choices);
 await t('données durables fictives conservées à valeur égale',()=>{
   for(const k of [...DURABLE].filter(k=>k in source)) assert.equal(p.values[k],source[k]);
   for(const k of HUMAN) assert.equal(p.values[k],source[k]);
 });
 await t('GPS, secrets appareils et cache sont absents du transfert',()=>{
   for(const k of ['twrc.vault.v2','twrc.session.v2','twrc.gps','twrc.cache.forecast']) assert(!Object.hasOwn(p.values,k));
 });
 await t('clé future inconnue provoque NO GO',()=>assert.throws(()=>prepare({...source,'twrc.unknown.v900':'fiche'},choices),/non classifiée/));
 await t('absence de consentement pour observation empêche transfert',()=>assert.throws(()=>prepare(source,{}),/arbitrage humain/));
 await t('un journal humain impossible à parser bloque',()=>assert.throws(()=>prepare({...source,'twrc.shadow.v1':'{'} ,choices),/illisible/));
 await t('signalement utilisateur non transporté volontairement interdit',()=>assert.throws(()=>prepare(source,{'twrc.shadow.v1':'preserve'}),/arbitrage/));
 await t('GPS niché sous contexte durable interdit',()=>{
  const c=JSON.parse(source['twrc.context.v1']); c.gps={lat:47.1,lon:2.3};
  assert.throws(()=>prepare({...source,'twrc.context.v1':JSON.stringify(c)},choices),/GPS/);
 });
 await t('trajet actif inclus dans contexte interdit',()=>{
  const c=JSON.parse(source['twrc.context.v1']);c.tripStart={at:3};
  assert.throws(()=>prepare({...source,'twrc.context.v1':JSON.stringify(c)},choices),/trajet actif/);
 });
 await t('source et cible doivent correspondre au manifeste',()=>{
   assert.throws(()=>prepare(source,choices,{source:'https://evil.invalid',target:DST,revision:15}),/source/);
   assert.throws(()=>prepare(source,choices,{source:SRC,target:'https://evil.invalid',revision:15}),/cible/);
 });
 await t('trop gros volume => NO GO sans troncature',()=>assert.throws(()=>prepare({...source,'twrc.cache.oversized':'X'.repeat(1000001)},choices),/volume/));
 await t('données essentielles manquantes => NO GO',()=>assert.throws(()=>prepare({'twrc.settings.v1':'{}'},choices),/essentielles/));
 await t('cible non vide jamais écrasée',()=>{
   const dst=new FakeStore({'twrc.settings.v1':'PREEXISTANT'}),before=dst.read();
   assert.throws(()=>dst.stage(p),/vide/);assert.deepEqual(dst.read(),before);
 });
 await t('quota simulé : aucun état partiel',()=>{
   const dst=new FakeStore({},0,100),before=dst.read();
   assert.throws(()=>dst.stage(p),/Quota/);assert.deepEqual(dst.read(),before);
 });
 await t('collision de révision après staging : aucun remplacement',()=>{
   const dst=new FakeStore(),staged=dst.stage(p);dst.revision++;
   assert.throws(()=>dst.activate(staged),/concurrente/);assert.deepEqual(dst.read(),{});
 });
 await t('activation fictive explicite et comparaison exacte',()=>{
   const dst=new FakeStore(),candidate=dst.stage(p);
   assert.deepEqual(dst.read(),{});dst.activate(candidate);assert.deepEqual(dst.read(),p.values);
 });
 await t('double activation refusée',()=>{
   const dst=new FakeStore(),candidate=dst.stage(p);
   dst.activate(candidate);assert.throws(()=>dst.activate(candidate),/concurrente/);
 });
 await t('ancienne origine intacte à la fin de la répétition',()=>assert.deepEqual(source,original));
 console.log(n+'/'+n+' scénarios de préparation fictifs : OK (aucune donnée réelle).');
}
main().catch(e=>{console.error('❌',e.stack);process.exitCode=1;});
