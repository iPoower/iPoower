'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const context = {}; vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/live-route-core.js'), 'utf8') + ';this.api=LiveRoute;', context);
const L = context.api, now = Date.parse('2026-10-20T06:00:00Z');
const trip = { key: 'fixture', dep: '2026-10-20T08:00', arr: '2026-10-20T08:30',
  l: { routed: true, km: 8, min: 30, g: [[48,2],[48.02,2],[48.02,2.06]] } };
const route = L.route(trip), fix = {lat:48.01,lon:2,acc:10,ts:now};
const base = { route, fix, now, enabled:true, active:true };
let n = 0; const test = (label, run) => { run(); n++; console.log('✅ ' + label); };
test('aucun tracé absent, estimé, invalide ou en attente ne devient une route réelle', () => {
  for (const t of [null, {...trip,destinationPending:true}, {...trip,originPending:true}, {...trip,l:{...trip.l,originPending:true}},
    {...trip,l:{...trip.l,routed:false}}, {...trip,l:{...trip.l,g:[[48,2],[NaN,3]]}}, {...trip,l:{...trip.l,g:[[48,2],[48,2]]}}])
    assert.equal(L.route(t),null);
  assert.equal(L.route({key:'a'},{pts:trip.l.g,est:true}),null);
  assert(L.route({key:'a'},{pts:trip.l.g,est:false}));
});
test('privilégie le tracé prévu complet et ne modifie jamais la source canonique', () => {
  const t = {...trip, planL:trip.l, l:{...trip.l,g:[[48.02,2],[48.02,2.06]]}}, before=JSON.stringify(t);
  assert.equal(L.route(t).total,route.total); L.at(route,.5); L.gps(base); L.metrics(route,.5);
  assert.equal(JSON.stringify(t),before);
});
test('interpolation par distance, orientations et bornes de la chronologie', () => {
  assert.equal(L.at(route,0).point[0],48); assert.equal(L.at(route,1).point[0],48.02);
  assert(Math.abs(L.at(route,1).point[1]-2.06)<1e-9);
  assert.equal(L.at(route,-1).fraction,0);assert.equal(L.at(route,2).fraction,1);
  assert.equal(L.at(route,.05).bearing,0); assert.equal(L.at(route,.9).bearing,90);
});
test('fix GPS précis : projection sur le vrai segment, jamais progression par horloge', () => {
  const p=L.gps(base); assert(p.valid); assert(p.fraction>0&&p.fraction<.5); assert(p.gap<1);
  const later=L.gps({...base,now:now+14000}); assert.equal(later.fraction,p.fraction);
  assert.equal(L.gps({...base,now:now+15001}).valid,false);
});
test('refuse précision, dates, suspension, démo, désactivation et confirmations en attente', () => {
  for (const more of [{enabled:false},{active:false},{held:true},{hidden:true},{locked:true},{demo:true},
    {floor:now+1},{fix:null},{fix:{...fix,acc:61}},{fix:{...fix,acc:-1}},{fix:{...fix,ts:now+2000}},
    {fix:{...fix,ts:now-15001}},{fix:{...fix,lat:NaN}}]) assert.equal(L.gps({...base,...more}).valid,false,JSON.stringify(more));
});
test('hors route, téléportation et réponse ancienne ne déplacent pas le véhicule', () => {
  const previous=L.gps(base);
  assert.equal(L.gps({...base,fix:{...fix,lon:2.1}}).valid,false);
  assert.equal(L.gps({...base,previous,now:now+1000,fix:{...fix,lat:48.02,lon:2.04,ts:now+1000}}).valid,false);
  assert.equal(L.gps({...base,previous,fix:{...fix,ts:now-1}}).valid,false);
});
test('croisement ambigu sans position précédente ne devient pas une arrivée', () => {
  const loop=L.route({...trip,l:{...trip.l,g:[[48,2],[48.02,2],[48.02,2.06],[48,2]]}});
  assert.match(L.gps({...base,route:loop,fix:{...fix,lat:48}}).reason,/ambiguë/);
});
test('distance, durée simulée et secteurs ne créent pas de télémétrie', () => {
  const m=L.metrics(route,.5,{simulated:true}); assert.equal(m.remaining,4);assert.equal(m.elapsed,15);assert.equal(m.sector,2);
  const real=L.metrics(route,.5,{now,startedAt:now-600000});assert.equal(real.elapsed,10);
  assert.equal(L.metrics(route,null).percent,null);assert.equal(L.metrics(route,.5).elapsed,null);
  assert.equal(L.metrics(route,1).remaining,0);assert.equal(L.metrics(route,1).sector,3);
  assert.equal(L.metrics({...route,min:null},.5,{simulated:true}).elapsed,null);
});
test('météo ponctuelle : uniquement les phénomènes documentés et encore devant', () => {
  const points=[{fraction:.2,rain:1,position:'Position documentée par itinéraire'},
    {fraction:.4,rain:2,position:'Position locale estimée'},{fraction:.8,snow:true,position:'Position documentée par itinéraire'}];
  assert.equal(L.weather(points,.3),points[2]);assert.equal(L.weather(points,.9),null);assert.equal(L.weather(points,null),null);
});
test('la projection est une fonction pure sans accès navigateur, horloge active ou stockage', () => {
  const code=fs.readFileSync(path.join(__dirname,'../src/app/live-route-core.js'),'utf8');
  assert.doesNotMatch(code,/\b(?:fetch|localStorage|sessionStorage|indexedDB|navigator|setInterval|setTimeout|requestAnimationFrame)\b/);
});
console.log(n+'/'+n+' scénarios LIVE ROUTE validés');
