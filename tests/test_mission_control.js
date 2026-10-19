'use strict';
// Oracle métier : les données du briefing sont les projections du Garage, sans copie concurrente.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
const c={Number,Array,Object,String,JSON,Set,Map,Date};
c.esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
c.f1=x=>String(x).replace('.',',');
c.uxFold=(id,title,body)=>'<details data-ux="'+id+'"><summary>'+title+'</summary>'+body+'</details>';
vm.createContext(c);
vm.runInContext(src('garage.js')+'\n'+src('app/mission-control.js')+';this.G=Garage;this.MC=MissionControl;this.html=missionControlHtml;',c);
const G=c.G,M=c.MC,html=c.html;
let n=0;const test=(name,fn)=>{fn();n++;console.log('✅ '+name)};
const now=Date.parse('2026-10-19T09:00:00Z');
const a={id:'a',name:'Véhicule fictif A',short:'A',tire:{type:'summer',size:'215/40 R18'}};
const b={id:'b',name:'Véhicule fictif B',short:'B',tire:{type:'winter'}};
const st={active:{label:'Été'},model:{brand:'Marque test',model:'Modèle A'},tread:{mm:4.4,est:false,date:'2026-10-18'},pressure:{target:2.3,check:{date:'2026-10-18'}},stored:[],maint:[{lv:1,text:'Contrôle fictif de profondeur'}]};
const cars=G.overview([a,b],'a',car=>car.id==='a'?st:null),car=cars[0];
const hs=[{t:'2026-10-19T10:00',T:7,Tr:6,P:1,RH:80,vis:10000,gust:4,rain:1},
 {t:'2026-10-19T11:00',T:9,Tr:8,P:0,RH:70,vis:10000,gust:2,code:0}];
const trip={src:'work',from:'Lieu A',to:'Lieu B',dep:'2026-10-19T10:15',arr:'2026-10-19T11:15',
 l:{from:{id:'a'},to:{id:'b'}},seq:hs.map((h,i)=>({hs,i,t:h.t,loc:i?'Lieu B':'Lieu A'})),
 res:[{c:{id:'a'},w:{level:2,worst:{parts:[{label:'Pluie fictive · prudence'}]}}}]};
const o={now,sourceFor:()=>({at:now-60000,mode:'live',days:[]}),freshness:age=>age<15?'FRESH':'STALE'};
const scene=G.preview(trip,o),comparison=G.comparison(cars,trip,scene)[0],initial=JSON.stringify({a,b,st,trip,scene,comparison});
const projected=()=>M.project({car,trip,scene,comparison,navigationAvailable:true});
test('identité stricte avec Garage, météo et diagnostic canonique',()=>{
 const p=projected();
 assert.equal(p.vehicle,cars[0].name);
 assert.equal(p.carId,cars[0].id);
 assert.equal(p.tyre.model,cars[0].tyre.model);
 assert.equal(p.tyre.tread.mm,cars[0].tyre.tread.mm);
 assert.equal(p.trip.from,trip.from);assert.equal(p.trip.to,trip.to);
 assert.equal(p.trip.departure,scene.departure);
 assert.equal(p.weather.departure.temperature,scene.samples[0].temperature);
 assert.equal(p.weather.arrival.temperature,scene.samples.at(-1).temperature);
 assert.equal(p.vigilance,comparison.reasons[0]);
 assert.equal(p.weather.status,scene.status);
 assert(p.navigationAvailable);
});
test('aucun trajet : aucune destination, heure, météo ni navigation inventées',()=>{
 const p=M.project({car,trip:null,scene:G.preview(null,o),navigationAvailable:true});
 assert.equal(p.trip,null);assert.equal(p.weather.departure,null);assert.equal(p.weather.arrival,null);
 assert.equal(p.navigationAvailable,false);
 assert.match(html(p),/Aucun prochain trajet connu/);
});
test('origine en recalcul : aucune ancienne route présentée comme valide',()=>{
 const changed={...trip,l:{originPending:true},from:'Ancienne origine'};
 const p=M.project({car,trip:changed,scene,navigationAvailable:true});
 assert.equal(p.trip,null);assert(p.tripPending);assert.equal(p.navigationAvailable,false);
});
test('pneus non confirmés : ne jamais transformer un projet futur en monte actuelle',()=>{
 const p=M.project({car:cars[1],trip,scene,comparison:null});
 assert.equal(p.tyre,null);assert.equal(p.vigilance,null);
 assert.match(html(p),/Monte non confirmée/);
});
test('météo absente, source ancienne, offline et simulation : pas de feu vert',()=>{
 const absent=G.preview({...trip,seq:[]},o);
 const miss=M.project({car,trip,scene:absent,comparison});
 assert.equal(miss.weather.departure,null);assert.equal(miss.vigilance,st.maint[0].text);
 const stale=G.preview(trip,{...o,sourceFor:()=>({at:now-120*60000,mode:'cache'})});
 const off=M.project({car,trip,scene:stale,comparison,offline:true});
 assert.equal(off.weather.status,'CACHE ANCIEN');assert(off.offline);assert.equal(off.weather.complete,false);
 assert.match(html(off),/HORS LIGNE/);
 const demo=G.preview(trip,{...o,sourceFor:()=>({at:now-60000,mode:'demo'})});
 const simulated=M.project({car,trip,scene:demo,comparison});
 assert.equal(simulated.weather.demo,true);assert.notEqual(simulated.vigilance,comparison.reasons[0]);
});
test('point météo unique : pas de température inventée à l’arrivée',()=>{
 const one=G.preview({...trip,seq:trip.seq.slice(0,1)},o);
 const p=M.project({car,trip,scene:one});
 assert(p.weather.departure);assert.equal(p.weather.arrival,null);
});
test('valeurs échappées, navigation exclusive aux liens existants',()=>{
 const p=M.project({car:{...car,name:'<script>alert(1)</script>'},trip,scene});
 const body=html(p);
 assert(!body.includes('<script>alert(1)</script>'));assert(body.includes('&lt;script&gt;'));
 assert(!body.includes('waze.com'));
 const active=html(projected(),'<a class="btn" href="https://waze.com/ul?ll=1,2&amp;navigate=yes">Waze</a>');
 assert(active.includes('waze.com'));
});
test('les véhicules et les moteurs canoniques ne sont jamais mutés',()=>{
 projected();html(projected());
 assert.equal(JSON.stringify({a,b,st,trip,scene,comparison}),initial);
});
console.log(n+'/'+n+' scénarios Mission Control validés');
