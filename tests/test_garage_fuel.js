// Tests du suivi carburant, sans données de propriétaire.
'use strict';
const assert=require('node:assert/strict');
const Fuel=require('../src/app/garage-economics-fuel.js');
let n=0;
function test(name,fn){fn();n++;console.log('✓ '+name);}
const ref=(id,date,km,volumeMl,amountCents,fullTank=false)=>({id,category:'fuel',date,km,volumeMl,amountCents,fullTank});
test('litres FR à trois décimales et centilitres',()=>{
 assert.equal(Fuel.parseLitres('26,667'),26667);
 assert.equal(Fuel.parseLitres('40.5'),40500);
 assert.equal(Fuel.parseLitres(''),null);
});
test('litres absurdes ou mal formés refusés',()=>{
 for(const x of ['abc','200,001','0','-2','1.0001','1e3','1,2,3'])assert.throws(()=>Fuel.parseLitres(x));
});
test('prix effectif calculé après remise sur le total payé',()=>{
 assert.equal(Fuel.perLiter(6000,30000),2);
 assert.equal(Fuel.perLiter(6000,0),null);
});
test('suivi d un ticket seul sans conso devinée',()=>{
 const xs=[ref('t1','2026-10-01',1000,30000,6000)];
 assert.equal(Fuel.summarize(xs).litres,30);
 assert.equal(Fuel.summarize(xs).weightedPriceEuroPerL,2);
 assert.equal(Fuel.fullToFull(xs),null);
});
test('ancienne dépense sans litres reste comptée en euros mais pas en €/L',()=>{
 const xs=[ref('a','2026-10-01',1000,30000,6000),{id:'b',category:'fuel',date:'2026-10-02',amountCents:2000}];
 const z=Fuel.summarize(xs);
 assert.equal(z.costCents,8000);assert.equal(z.missingVolume,1);assert.equal(z.weightedPriceEuroPerL,2);
});
test('deux pleins complets : consommation mesurée conditionnelle',()=>{
 const xs=[ref('a','2026-01-01',10000,30000,6000,true),ref('b','2026-01-20',10500,25000,5000,true)];
 const x=Fuel.fullToFull(xs);
 assert.equal(x.distanceKm,500);assert.equal(x.consumptionL100,5);
 assert.equal(x.costEuroPer100,10);
});
test('pleins complets avec plein partiel intermédiaire',()=>{
 const xs=[ref('a','2026-01-01',10000,30000,6000,true),
  ref('b','2026-01-10',10200,10000,2000),
  ref('c','2026-01-20',10500,15000,3000,true)];
 const x=Fuel.fullToFull(xs);
 assert.equal(x.consumptionL100,5);
 assert.equal(x.litres,25);
 assert.equal(x.otherRefuels,1);
});
test('pas de consommation si un plein manque ou si km absent',()=>{
 assert.equal(Fuel.fullToFull([ref('a','2026-01-01',10000,30000,6000,false),
  ref('b','2026-01-20',10500,25000,5000,true)]),null);
 assert.equal(Fuel.fullToFull([ref('a','2026-01-01',null,30000,6000,true),
  ref('b','2026-01-20',10500,25000,5000,true)]),null);
});
test('pas de calcul avec kilométrage décroissant ou intermédiaire non mesuré',()=>{
 assert.equal(Fuel.fullToFull([ref('a','2026-01-01',10500,30000,6000,true),
  ref('b','2026-01-20',10000,25000,5000,true)]),null);
 assert.equal(Fuel.fullToFull([ref('a','2026-01-01',10000,30000,6000,true),
  {id:'b',category:'fuel',date:'2026-01-10',amountCents:800},
  ref('c','2026-01-20',10500,25000,5000,true)]),null);
});
test('aucun mélange entre voitures',()=>{
 const carA=[ref('a','2026-01-01',10000,30000,6000,true),ref('b','2026-01-20',10500,25000,5000,true)];
 const carB=[ref('c','2026-01-15',50000,50000,9000,true)];
 assert.equal(Fuel.fullToFull(carA).consumptionL100,5);
 assert.equal(Fuel.fullToFull(carB),null);
});
test('pas d ordre inventé pour deux pleins le même jour',()=>{
 const a=[ref('a','2026-01-01',10000,30000,6000,true),ref('b','2026-01-01',10500,25000,5000,true)];
 assert.equal(Fuel.fullToFull(a),null);
});
console.log('Garage Fuel : '+n+' tests réussis');
