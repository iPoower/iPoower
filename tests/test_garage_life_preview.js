/* Garage Life : laboratoire fictif, sans écrire dans le profil utilisateur. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const M=require('../garage-life-preview/model.js');
const cars=[{id:'a',name:'Véhicule A',goalKm:null},{id:'b',name:'Véhicule B',goalKm:null}];
const op=(id,vehicleId='a',other={})=>({
  id,vehicleId,date:'2026-10-12',odometerKm:20000,category:'vidange',
  description:'Intervention fictive '+id,amountCents:12999,provider:null,
  provenance:M.SOURCE.DONE,evidence:null,...other
});
let n=0;
function test(name,fn){fn();n++;console.log('OK '+String(n).padStart(2,'0')+' '+name);}
test('schéma versionné, deux voitures et carnet vide',()=>{
 const a=M.empty(cars);assert.equal(a.schemaVersion,1);assert.equal(M.summary(a,'a').history.length,0);
 assert.equal(M.summary(a,'b').latest,null);
});
test('aucun km, coût ni diagnostic extrapolé au carnet vide',()=>{
 const x=M.summary(M.empty(cars),'a');assert.equal(x.latest,null);assert.equal(x.spentCents,0);
 assert.equal(x.missing.records,true);assert.equal(x.deadlines.length,0);
 assert.equal(x.vehicle.goalKm,null);
});
test('coût euros en centimes sans arrondi binaire',()=>{
 for(const [input,expected] of [['0',0],['1',100],['17,2',1720],['17.29',1729],['9999999,99',999999999]])
 assert.equal(M.parseEuros(input),expected);
 assert.equal(M.parseEuros(''),null);
});
test('montants négatifs, notation scientifique, décimales supplémentaires rejetés',()=>{
 for(const v of ['-1','1e4','1.999','NaN','1 000','Infinity','99999999'])assert.throws(()=>M.parseEuros(v));
});
test('dates invalides et années bissextiles',()=>{
 for(const v of ['2026-02-29','2026-13-01','2026-04-31','2026-1-01','2026-00-12','2101-01-01'])assert.equal(M.dateOk(v),false);
 assert.equal(M.dateOk('2024-02-29'),true);
});
test('kilométrages négatifs, fractionnaires, énormes et non finis rejetés',()=>{
 for(const v of [-1,2.5,Infinity,NaN,50000001,'10000'])assert.equal(M.kmOk(v),false);
 assert.equal(M.kmOk(0),true);
});
test('une entrée validée ne modifie pas son origine',()=>{
 const before=M.empty(cars),record=op('a1'),snapshot=JSON.stringify(before);
 const updated=M.add(before,record);assert.equal(before.operations.length,0);
 assert.equal(JSON.stringify(before),snapshot);assert.equal(updated.operations.length,1);
});
test('deux voitures indépendantes',()=>{
 const s=M.add(M.add(M.empty(cars),op('a1')),op('b1','b',{odometerKm:70000}));
 assert.equal(M.summary(s,'a').latest.km,20000);assert.equal(M.summary(s,'b').latest.km,70000);
 assert.equal(M.summary(s,'a').spentCents,12999);
});
test('dernière déclaration selon la date et pas maximum kilométrique',()=>{
 let s=M.empty(cars);s=M.add(s,op('a1','a',{date:'2026-10-01',odometerKm:90000}));
 s=M.add(s,op('a2','a',{date:'2026-10-15',odometerKm:87000}));
 assert.equal(M.summary(s,'a').latest.km,87000);
});
test('historique trié sans effacer les interventions précédentes',()=>{
 let s=M.empty(cars);for(let i=1;i<=300;i++)s=M.add(s,op('r'+i,'a',{date:'2026-10-12',description:'Pièce fictive '+i}));
 assert.equal(M.summary(s,'a').history.length,300);
 assert.equal(s.operations.length,300);
});
test('coûts inconnus séparés des sommes effectivement renseignées',()=>{
 const s=M.add(M.add(M.empty(cars),op('k')),op('u','a',{amountCents:null}));
 const d=M.summary(s,'a');assert.equal(d.spentCents,12999);assert.equal(d.missingCosts,1);
});
test('échéance renseignée ne devient ni opération réalisée ni coût',()=>{
 const s=M.add(M.empty(cars),op('due','a',{provenance:M.SOURCE.DEADLINE,amountCents:null,odometerKm:null,date:'2028-01-01'}));
 const x=M.summary(s,'a');assert.equal(x.deadlines.length,1);assert.equal(x.latest,null);assert.equal(x.spentCents,0);
});
test('échéance portant une dépense refusée',()=>{
 assert.throws(()=>M.add(M.empty(cars),op('due','a',{provenance:M.SOURCE.DEADLINE})));
});
test('préconisation constructeur non sourcée impossible à introduire',()=>{
 assert.throws(()=>M.add(M.empty(cars),op('maker','a',{provenance:M.SOURCE.MAKER})));
});
test('doublon identifiant et doublon métier exact refusés',()=>{
 let s=M.add(M.empty(cars),op('unique'));assert.throws(()=>M.add(s,op('unique')));
 assert.throws(()=>M.add(s,op('autre-id','a',{description:'Intervention fictive unique'})));
});
test('opérations multiples réellement différentes acceptées le même jour',()=>{
 let s=M.add(M.empty(cars),op('a'));s=M.add(s,op('b','a',{category:'filtres',description:'Filtre fictif'}));
 assert.equal(M.summary(s,'a').history.length,2);
});
test('opération pour véhicule absent interdite',()=>{
 assert.throws(()=>M.add(M.empty(cars),op('missing','c')));
});
test('objectif 500000 volontaire, indépendant du compteur et de la durée de vie',()=>{
 const s=M.setGoal(M.empty(cars),'b',500000),sum=M.summary(s,'b');
 assert.equal(sum.vehicle.goalKm,500000);assert.equal(sum.latest,null);
 assert.equal(M.summary(s,'a').vehicle.goalKm,null);
 assert.equal(M.setGoal(s,'b',null).vehicles[1].goalKm,null);
});
test('objectifs invalides rejetés',()=>{
 for(const v of [-1,2.4,'500000',NaN,Infinity,50000001])assert.throws(()=>M.setGoal(M.empty(cars),'b',v));
});
test('preuve justificative interdite dans ce prototype',()=>{
 assert.throws(()=>M.add(M.empty(cars),{...op('f'),evidence:{name:'facture.pdf'}}));
});
test('aller-retour fictif conserve chaque opération et somme',()=>{
 let s=M.empty(cars);
 for(let i=0;i<35;i++)s=M.add(s,op('x'+i,i%2?'b':'a',{description:'Contrôle fictif '+i,amountCents:i*117}));
 s=M.setGoal(s,'b',500000);
 assert.deepEqual(M.roundTripFixture(s),s);
 assert.equal(M.summary(M.roundTripFixture(s),'b').vehicle.goalKm,500000);
});
test('format inconnu ou version future refusé avant récupération',()=>{
 const s=M.empty(cars);assert.throws(()=>M.validateState({...s,schemaVersion:2}));
 assert.throws(()=>M.validateState({...s,operations:'corrompu'}));
 assert.throws(()=>M.validateState({...s,vehicles:[cars[0],cars[0]]}));
});
test('invalidité de la récupération ne modifie pas le profil source',()=>{
 const s=M.add(M.empty(cars),op('good'));const before=JSON.stringify(s);
 const evil={...s,operations:[...s.operations,op('bad','introuvable')]};
 assert.throws(()=>M.roundTripFixture(evil));assert.equal(JSON.stringify(s),before);
});
test('code du laboratoire ne sollicite aucun stockage navigateur ni API réseau',()=>{
 const source=['garage-life-preview/model.js','garage-life-preview/app.js','garage-life-preview/index.html']
  .map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n');
 for(const forbidden of [/\blocalStorage\s*\./,/\bsessionStorage\s*\./,/\bindexedDB\s*\./,
    /\bfetch\s*\(/,/\bXMLHttpRequest\s*\(/,/\bsendBeacon\s*\(/,
    /\bFileReader\s*\(/,/\bcrypto\.subtle\.encrypt\s*\(/])assert.equal(forbidden.test(source),false,String(forbidden));
});
console.log('GARAGE LIFE : '+n+'/'+n+' contrôles unitaires du prototype.');
