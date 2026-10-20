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
const NOW=Date.parse('2026-10-07T04:00:00Z');
const hour=(data={})=>({t:'2026-10-07T06:00',T:8,Tr:7,P:0,RH:75,vis:10000,gust:5,code:null,...data});
const point=(h,more={})=>({hs:[h],i:0,...more});
const trip=seq=>({from:'Lieu A',to:'Lieu B',dep:'2026-10-07T06:30',arr:'2026-10-07T07:10',seq});
const source=()=>({at:NOW-60000,mode:'live',days:[{date:'2026-10-07',sunrise:'2026-10-07T07:00',sunset:'2026-10-07T19:00'}]});
const options={now:NOW,sourceFor:source,freshness:x=>x<=15?'FRESH':x<=60?'AGING':'STALE'};
test('Twin : aucun trajet ni météo inventés',()=>{
 assert.equal(G.preview(null,options).available,false);
 const s=G.preview(trip([]),options);assert.equal(s.status,'MÉTÉO INDISPONIBLE');assert.equal(s.animate,false);assert.equal(s.samples.length,0);
});
test('silhouettes identifiées seulement depuis le libellé, sans profil codé en dur',()=>{
 assert.equal(G.silhouette({name:'Hyundai i20 N test'}),'sport');assert.equal(G.silhouette({short:'Peugeot 308 test'}),'touring');
 assert.equal(G.silhouette({id:'i20n',name:'Voiture fictive'}),'generic');
});
test('météo manquante ne devient pas soleil ou pluie et 0 °C reste visible',()=>{
 const s=G.preview(trip([point(hour({T:0,gust:null}))]),options);assert.equal(s.samples[0].temperature,0);
 for(const k of ['rain','snow','fog','sun','wind'])assert.equal(s.samples[0][k],false);
 assert.equal(s.samples[0].phase,'unknown');
});
test('effets documentés : pluie, neige, visibilité et vent avec direction explicite',()=>{
 const seq=[point(hour({rain:1,wind:24,gust:42,dir:270}),{loc:'Lieu A'}),point(hour({snow:0.4,code:73})),point(hour({vis:500,code:45}),{loc:'Lieu B'})];
 const s=G.preview(trip(seq),options);assert.equal(s.animate,true);
 assert.equal(s.samples[0].rain,true);assert.equal(s.samples[0].windDirection,270);assert.equal(s.samples[1].snow,true);assert.equal(s.samples[2].fog,true);
 assert.equal(s.samples[1].windDirection,null);
 const lowVis=G.preview(trip([point(hour({vis:500,code:95}))]),options).samples[0];assert.equal(lowVis.fog,false);assert.equal(lowVis.rain,false);
});
test('jour et nuit suivent le vrai départ/arrivée, pas le début de l’heure météo',()=>{
 const s=G.preview(trip([point(hour(),{loc:'Lieu A'}),point(hour({t:'2026-10-07T07:00'}),{loc:'Lieu B'})]),options);
 assert.equal(s.samples[0].phase,'night');assert.equal(s.samples[1].phase,'day');assert.equal(s.phase,'mixed');
 const late={...trip([point(hour(),{loc:'Lieu A'})]),dep:'2026-10-07T07:15'};
 assert.equal(G.preview(late,options).samples[0].phase,'day');
});
test('schéma borné à trois points, couverture contrôlée sur toute la séquence',()=>{
 const seq=Array.from({length:9},()=>point(hour()));seq[6]=point(hour({T:null}));
 const s=G.preview(trip(seq),options);assert.equal(s.samples.length,3);assert.equal(s.count,9);assert.equal(s.complete,false);assert.equal(s.animate,false);
});
test('trou de séquence, réception inconnue/future et cache ancien ne donnent pas de feu vert',()=>{
 for(const seq of [[null], [point(hour()),null,point(hour())]])assert.equal(G.preview(trip(seq),options).complete,false);
 for(const src of [null,{at:NOW+120000},{at:NOW-61*60000}]){
  const s=G.preview(trip([point(hour())]),{...options,sourceFor:()=>src});assert.equal(s.complete,false);assert.equal(s.animate,false);
 }
});
test('hors ligne et cache : prévisions lisibles, animation statique et provenance explicite',()=>{
 const t=trip([point(hour({rain:2}))]);
 const off=G.preview(t,{...options,offline:true});assert.equal(off.status,'HORS LIGNE');assert.equal(off.animate,false);assert.equal(off.samples[0].rain,true);
 const cache=G.preview(t,{...options,sourceFor:()=>({...source(),mode:'cache'})});assert.equal(cache.status,'CACHE');assert.equal(cache.animate,false);
});
test('comparaison : résultats exacts du moteur, aucun classement et données insuffisantes',()=>{
 const cars=[{id:'a',tyre:{model:'Modèle fictif',size:'205/55 R16',tread:{mm:5,date:'2026-10-01'},pressure:{checked:'2026-10-01'}}},{id:'b',tyre:null}];
 const t={res:[{c:{id:'a'},w:{level:2,worst:{parts:[{label:'Vigilance fictive'}]}}}]};
 const before=JSON.stringify([cars,t]);const rows=G.comparison(cars,t,{complete:true});assert.equal(rows[0].level,2);assert.equal(rows[0].reasons[0],'Vigilance fictive');
 assert.equal(rows[1].label,'DONNÉES INSUFFISANTES');assert.equal(G.comparison(cars,t,{complete:false})[0].level,null);
 cars[0].tyre.tread.estimated=true;assert.equal(G.comparison(cars,t,{complete:true})[0].label,'DONNÉES INSUFFISANTES');delete cars[0].tyre.tread.estimated;
 assert.equal(JSON.stringify([cars,t]),before);
});
test('projection du trajet sans mutations, sans géométrie, vitesse, pression mesurée ou localisation déduite',()=>{
 const t=trip([point(hour({rain:1}))]),before=JSON.stringify(t),s=G.preview(t,options);
 assert.equal(JSON.stringify(t),before);for(const k of ['speed','distance','gps','grip','measuredRoadTemperature'])assert.equal(s[k],undefined);
});
test('météo de démonstration ne devient pas une prévision réelle ou une comparaison fiable',()=>{
 const s=G.preview(trip([point(hour())]),{...options,sourceFor:()=>({...source(),mode:'demo'})});
 assert.equal(s.demo,true);assert.equal(s.status,'DÉMO · SIMULATION');assert.equal(s.complete,false);assert.equal(s.animate,false);
});
test('V1.4.1 : profils i20 N et 308 réellement distincts, vectoriels et sans image réseau',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/app/garage-scene.js'),'utf8'),scope={};
 vm.createContext(scope);vm.runInContext(source+';this.draw=garageCarSvg;',scope);
 const sport=scope.draw('sport'),touring=scope.draw('touring'),generic=scope.draw('generic'),drive=scope.draw('sport',true);
 for(const svg of [sport,touring,generic]){
  assert.match(svg,/viewBox="0 0 264 100"/);
  assert.match(svg,/aria-hidden="true"/);
  assert.equal((svg.match(/class="twin-wheel"/g)||[]).length,2);
  assert.doesNotMatch(svg,/<(?:image|foreignObject|script)\b|https?:\/\//);
 }
 assert.match(sport,/data-shape="sport"/);assert.match(touring,/data-shape="touring"/);
 assert.match(sport,/twin-spoiler/);assert.match(sport,/twin-sport-accent/);
 assert.match(touring,/twin-chrome/);assert.doesNotMatch(touring,/twin-spoiler/);
 assert.notEqual(sport,touring);
 assert.match(drive,/^<g class="twin-car-svg twin-car-sport"/);
 assert.doesNotMatch(drive,/<svg/);
});
test('V1.5 manga : encrage, détourage, roues à l’échelle et rotation limitée à la scène',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/app/garage-scene.js'),'utf8'),scope={};
 vm.createContext(scope);vm.runInContext(source+';this.draw=garageCarSvg;',scope);
 for(const kind of ['sport','touring','generic','inconnu']){
  const card=scope.draw(kind),drive=scope.draw(kind,true);
  for(const cls of ['twin-halo','twin-ink','twin-well','twin-body-shade','twin-reflection','twin-glare'])assert.equal((card.match(new RegExp('class="'+cls+'"','g'))||[]).length,1,kind+' '+cls);
  assert.equal((card.match(/class="twin-rubber"[^>]*r="18"/g)||[]).length,2,kind+' pneus r=18');
  // La même caisse sert au remplissage, à l’encrage et au détourage.
  const body=card.match(/class="twin-paint" d="([^"]+)"/)[1];
  assert(card.includes('class="twin-ink" d="'+body+'"'));assert(card.includes('class="twin-halo" d="'+body+' '));
  assert.doesNotMatch(card,/twin-animated/,'fiche statique');
  assert.equal((drive.match(/class="twin-spin twin-animated"/g)||[]).length,2,'rotation suspendue avec la scène');
  assert.doesNotMatch(card+drive,/\bid=|url\(|<(?:image|foreignObject|script|text)\b/);
 }
 assert.match(scope.draw('inconnu'),/data-shape="generic"/);
 assert.match(scope.draw('sport'),/class="twin-caliper"/);assert.doesNotMatch(scope.draw('touring'),/twin-caliper/);
 for(const cls of ['twin-roof','twin-skirt','twin-diffuser']){assert.equal((scope.draw('sport').match(new RegExp('class="'+cls+'"','g'))||[]).length,1,cls);assert.doesNotMatch(scope.draw('touring')+scope.draw('generic'),new RegExp(cls));}
});
console.log(n+'/'+n+' scénarios Garage validés');
