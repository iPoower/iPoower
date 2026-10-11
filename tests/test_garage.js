// Garage : source de vérité unique, absence de capteurs inventés et immutabilité.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../src/garage.js'),'utf8');
const c={Number,Array,Object,String,Set,JSON};vm.createContext(c);vm.runInContext(code+';this.G=Garage;',c);
const G=c.G;let n=0;
const test=(name,fn)=>{fn();n++;console.log('✅ '+name)};
test('aucune voiture : aucun inventaire fictif',()=>assert.equal(G.overview(null,null).length,0));
test('aucune donnée inventée si compteur ou pneus absents',()=>{
 const result=G.overview([{id:'x',name:'Voiture A',tire:{type:'none'}}],'x',()=>null);
 assert.equal(result[0].tyre,null);assert.equal(result[0].odo,null);assert.equal(result[0].winterPlan,null);
 assert.equal(result[0].active,true);assert.equal(result[0].notices.length,0);
});
test('relevé compteur : date la plus récente (pas maximum numérique)',()=>{
 const car={id:'a',short:'A',tire:{type:'summer'},odo:[{d:'2026-10-01',km:2000},{d:'2026-10-03',km:1990},{d:'invalide',km:9000}]};
 const r=G.overview([car],'a',()=>null)[0];assert.equal(r.odo.km,1990);assert.equal(r.odo.date,'2026-10-03');
});
test('reprise de l’état pneus existant, origine déclarée/estimée',()=>{
 const car={id:'a',name:'A',tire:{type:'summer',size:'215/40R18'},plan:{on:1,etaFrom:'2026-12-01',etaTo:'2026-12-05',appointmentDate:'2027-01-05'}};
 const state={active:{label:'Été'},model:{brand:'Marque',model:'Modèle'},tread:{mm:4.3,est:true,date:'2026-09-10'},
 pressure:{target:2.3,check:{date:'2026-09-08'}},dot:{txt:'DOT 2324'},mount:{date:'2025-04-12',kmSince:5200},
 stored:[{label:'Hiver',title:'Autre modèle'}],maint:[{lv:1,text:'Mesurer'}]};
 const carBefore=JSON.stringify(car),stateBefore=JSON.stringify(state);
 const r=G.overview([car],'a',()=>state)[0];assert.equal(r.tyre.tread.estimated,true);
 assert.equal(r.tyre.pressure.bar,2.3);assert.equal(r.tyre.kmSinceMount,5200);assert.equal(r.notices[0].text,'Mesurer');
 assert.equal(r.winterPlan.etaTo,'2026-12-05');assert.equal(r.winterPlan.confirmed,false);
 assert.equal(JSON.stringify(car),carBefore);assert.equal(JSON.stringify(state),stateBefore);
});
test('montage hiver déjà effectif : pas de rendez-vous hiver futur inventé',()=>{
 const car={id:'b',tire:{type:'winter'},plan:{on:1,appointmentConfirmed:1,appointmentDate:'2026-10-05'}};
 const x=G.overview([car],'b',()=>({active:{label:'Hiver'},model:{},tread:null,pressure:null,mount:{},stored:[]}))[0];
 assert.equal(x.winterPlan,null);
});
test('cibles de pression et compteur incompatibles non présentés comme mesures',()=>{
 const r=G.overview([{id:'x',tire:{type:'allseason'},odo:[]}],null,()=>({active:{label:'4 saisons'},model:{},tread:{mm:null},pressure:{target:2.2,check:null},mount:{},maint:[],stored:[]}))[0];
 assert.equal(r.tyre.pressure.checked,null);assert.equal(r.tyre.tread,null);assert.equal(r.odo,null);
});
test('doublons d’identifiants évités sans mutation de la source',()=>{
 const a=[{id:'x',name:'Voiture 1',tire:{}},{id:'x',name:'Voiture 2',tire:{}}],before=JSON.stringify(a);
 assert.equal(G.overview(a,null).length,1);assert.equal(JSON.stringify(a),before);
});
console.log(n+'/'+n+' scénarios Garage validés');
