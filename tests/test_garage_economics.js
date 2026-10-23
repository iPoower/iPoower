// Garage economics: tests sur véhicules entièrement fictifs.
'use strict';
const assert=require('node:assert/strict');
const G=require('../src/garage-economics.js');
let n=0;
const test=(name,fn)=>{fn();n++;console.log('✓ '+name);};
const demo=()=>({
  purchasePriceCents:360000,purchaseDate:'2026-01-01',asOfDate:'2026-11-01',
  purchaseOdometerKm:120000,currentOdometerKm:132000,annualDistanceKm:12000,
  expenses:{fuelCents:42000,insuranceCents:28000,maintenanceCents:0,repairsCents:11000}
});
test('prix absent = données insuffisantes',()=>{
  const x=G.project({});assert.equal(x.available,false);assert.equal(x.reason,'PURCHASE_PRICE_MISSING');
});
test('amortissement achat seul 12/24/36/60/84 mois',()=>{
  const x=G.project(demo());assert.deepEqual(x.scenarios.map(s=>s.purchasePerMonthCents),[30000,15000,10000,6000,4286]);
  assert.equal(x.scenarios[3].purchasePerKmCents,6);
  assert.equal(x.scenarios[3].basis,'PURCHASE_ONLY_EXCLUDING_OPERATING_COSTS');
});
test('0 renseigné diffère des dépenses manquantes',()=>{
  const x=G.project({purchasePriceCents:50000,expenses:{fuelCents:0}});
  assert.equal(x.recordedExpensesCents,0);
  assert.deepEqual(x.missingExpenses,['insuranceCents','maintenanceCents','repairsCents']);
  assert.equal(x.operatingCostCoverage,'PARTIAL');
});
test('somme des dépenses déclarées seulement',()=>{
  const x=G.project(demo());
  assert.equal(x.recordedExpensesCents,81000);assert.equal(x.recordedCashOutlayCents,441000);
  assert.equal(x.operatingCostCoverage,'DECLARED_CATEGORIES_COMPLETE');
  assert.equal(x.currentRecordedCostPerKmCents,37);
});
test('recul du compteur : pas de coût au km',()=>{
  const x=G.project({...demo(),currentOdometerKm:119999,annualDistanceKm:0});
  assert.equal(x.distanceSincePurchaseKm,null);assert.equal(x.currentRecordedCostPerKmCents,null);
  assert.equal(x.scenarios[0].purchasePerKmCents,null);
});
test('dates calendaires impossibles ou inversées',()=>{
  assert.equal(G.project({...demo(),purchaseDate:'2026-02-30'}).elapsedDays,null);
  assert.equal(G.project({...demo(),asOfDate:'2025-01-01'}).elapsedDays,null);
});
test('revente absente ne vaut pas zéro',()=>{
  assert.equal(G.project(demo()).scenarios[0].estimatedResalePerMonthCents,null);
  assert.equal(G.project({...demo(),estimatedResaleCents:160000}).scenarios[3].estimatedResalePerMonthCents,3333);
});
test('historique court signalé',()=>{
  assert.equal(G.project({...demo(),asOfDate:'2026-01-08',currentOdometerKm:120250}).shortObservation,true);
});
test('montants invalides et dépassements bloqués',()=>{
  assert.equal(G.project({purchasePriceCents:-1}).available,false);
  assert.equal(G.project({purchasePriceCents:12.45}).available,false);
  assert.equal(G.project({purchasePriceCents:Number.MAX_SAFE_INTEGER,expenses:{fuelCents:1}}).reason,'AMOUNT_OVERFLOW');
});
test('deux véhicules, le second sans prix',()=>{
  const x=G.compare([{id:'a',name:'Véhicule A'},{id:'b',name:'Véhicule B'}],{a:demo()});
  assert.equal(x.length,2);assert.equal(x[0].result.available,true);assert.equal(x[1].result.available,false);
});
test('calcul sans mutation',()=>{
  const x=demo(),before=JSON.stringify(x);G.project(x);assert.equal(JSON.stringify(x),before);
});
console.log('Garage Economics : '+n+' tests réussis');
