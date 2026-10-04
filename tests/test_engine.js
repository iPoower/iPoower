const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../src/engine.js'),'utf8')+fs.readFileSync(path.join(__dirname,'../src/demo.js'),'utf8');
const ctx={console,Math,Date,Intl,Map,Set};vm.createContext(ctx);vm.runInContext(src+`
this.api={makeDemoPayload,makeModel,windowAssess,summarize,seqOf,narrate,seasonAnalysis,computeAlerts,LV,ICE_LV,hourVerdict,estRoad,iceRisk,calendarEventRelevant,calendarEventPlace};`,ctx);
const A=ctx.api;
let relevantCount=0;
const relevantTest=(name,fn)=>{fn();relevantCount++;console.log('✅ '+name);};
const places=[{id:'home',name:'Maison fictive',lat:49,lon:2},{id:'work',name:'Bureau fictif',lat:48,lon:3}];
relevantTest('rappel sans lieu, titre seul ou anciennes jambes ne sont pas des déplacements',()=>{
  for(const event of [null,{}, {t:'Chargeur'}, {title:'Rendez-vous important'}, {t:'#trajet'}, {label:'Maison fictive'}, {legs:[{from:places[0],to:places[1]}]}]) assert.equal(A.calendarEventRelevant(event,places),false);
});
relevantTest('coordonnées numériques finies et bornées rendent le lieu exploitable',()=>{
  for(const event of [{lat:0,lon:0},{lat:90,lon:-180},{lat:-90,lon:180},{lat:49,lon:2,t:'Chargeur'}]) assert.equal(A.calendarEventRelevant(event,places),true);
});
relevantTest('chaînes, null, NaN, infini et coordonnées hors bornes ne deviennent pas des lieux',()=>{
  for(const event of [{lat:'49',lon:'2'},{lat:null,lon:null},{lat:NaN,lon:2},{lat:49,lon:Infinity},{lat:91,lon:2},{lat:49,lon:-181}]) assert.equal(A.calendarEventRelevant(event,places),false);
});
relevantTest('LOCATION correspond exactement à un id ou nom de lieu configuré après normalisation',()=>{
  for(const event of [{loc:' HOME '},{location:'bureau FICTIF'},{loc:' Maison   fictive '}]) assert.equal(A.calendarEventRelevant(event,places),true);
  assert.equal(A.calendarEventRelevant({loc:'Maison fictive annexe'},places),false);
  assert.equal(A.calendarEventRelevant({loc:'Lieu inconnu'},places),false);
});
relevantTest('équivalence Unicode du nom accepté sans élargir à un autre lieu',()=>{
  const configured=[{id:'cafe',name:'Café fictif',lat:49,lon:2}];
  assert.equal(A.calendarEventRelevant({loc:'Cafe\u0301 fictif'},configured),true);
  assert.equal(A.calendarEventRelevant({loc:'Cafe fictif'},configured),false);
});
relevantTest('lieu configuré sans coordonnées fiables et label seul ne suffisent pas',()=>{
  assert.equal(A.calendarEventRelevant({loc:'Bureau fictif'},[{id:'work',name:'Bureau fictif',lat:null,lon:null}]),false);
  assert.equal(A.calendarEventRelevant({loc:'Alias'},[{id:'home',name:'Maison fictive',label:'Alias',lat:49,lon:2}]),false);
  assert.equal(A.calendarEventRelevant({label:'Maison fictive'},places),false);
});
relevantTest('modes explicites gardent un vrai déplacement de destination encore inconnue',()=>{
  for(const mode of ['trajet','direct','maison','conflit']) assert.equal(A.calendarEventRelevant({mode,loc:'Lieu introuvable'},places),true);
  for(const mode of [null,'','rappel','trajetbidon']) assert.equal(A.calendarEventRelevant({mode},places),false);
});
relevantTest('#pasdetrajet prime même sur coordonnées et lieu configuré',()=>{
  assert.equal(A.calendarEventRelevant({mode:'pasdetrajet',loc:'home',lat:49,lon:2},places),false);
});
relevantTest('la pertinence reste déterministe et ne modifie aucun événement ou lieu',()=>{
  const event=Object.freeze({loc:'Home',legs:Object.freeze([])}), configured=Object.freeze(places.map(place=>Object.freeze({...place})));
  const before=JSON.stringify([event,configured]);
  assert.equal(A.calendarEventRelevant(event,configured),true);assert.equal(A.calendarEventRelevant(event,configured),true);
  assert.equal(JSON.stringify([event,configured]),before);
});
relevantTest('le lieu spatial retourne l’événement valide ou le lieu configuré reconnu, sans copie ni mutation',()=>{
  const spatial=Object.freeze({lat:0,lon:0,t:'Lieu fictif'});
  assert.strictEqual(A.calendarEventPlace(spatial,places),spatial);
  assert.strictEqual(A.calendarEventPlace({loc:' Maison   FICTIVE '},places),places[0]);
  assert.strictEqual(A.calendarEventPlace({location:'WORK'},places),places[1]);
});
relevantTest('#trajet inconnu reste pertinent mais ses anciennes jambes ne créent pas un lieu',()=>{
  const unknown=Object.freeze({mode:'trajet',loc:'Destination à confirmer',legs:Object.freeze([{from:places[0],to:places[1]}])});
  assert.equal(A.calendarEventRelevant(unknown,places),true);
  assert.equal(A.calendarEventPlace(unknown,places),null);
  for(const mode of ['direct','maison','conflit']) assert.equal(A.calendarEventPlace({...unknown,mode},places),null);
});
relevantTest('le lieu spatial ne devine rien du titre, label, coordonnées invalides ou rappel',()=>{
  for(const event of [null,{}, {t:'Maison fictive'},{label:'Maison fictive'},{lat:'49',lon:'2'},{lat:91,lon:2},{lat:49,lon:-181},{lat:NaN,lon:2},{mode:'pasdetrajet',loc:'home',lat:49,lon:2}]) assert.equal(A.calendarEventPlace(event,places),null);
  assert.equal(A.calendarEventPlace({loc:'Bureau fictif'},[{name:'Bureau fictif',lat:null,lon:null}]),null);
});
console.log(relevantCount+'/'+relevantCount+' scénarios pertinence agenda OK');
const cars=[
 {id:'i20',short:'i20 N',sporty:true,tire:{type:'summer',size:'215/40 R18 89Y XL',tread:null},plan:{on:true,date:''}},
 {id:'308',short:'308',sporty:false,tire:{type:'allseason',size:'225/45 R17 94W',tread:null},plan:{on:false}}];
const loc={id:'ros',lat:49.8167,lon:2.7};
for(const k of ['froid','pluie','neige','doux']){
  const p=A.makeDemoPayload(k,loc); const m=A.makeModel(p,'demo',loc);
  console.log('\n=== '+k+' nowI',m.nowI,m.nowStr,'hours',m.hs.length,'days',m.days.length);
  const seq=A.seqOf(m,m.nowI,12); const sm=A.summarize(seq);
  console.log(' Tmin',sm.Tmin,'TrMin',sm.TrMin,'iceMax',sm.iceMax,A.ICE_LV[sm.iceLevel],'visMin',sm.visMin,'snow',sm.snowSum,'Pmax',sm.Pmax);
  for(const c of cars){ const w=A.windowAssess(c,seq,'card'); const n=A.narrate(c,w,sm,'actuellement');
    console.log(' ',c.short,c.tire.type,'score',w.score,A.LV[w.level].name,'(score lvl',w.scoreLevel,'flag',w.flagLevel,')');
    console.log('   ',n.head,n.body);
    if(k==='froid') console.log('   top parts',JSON.stringify(w.worst.parts.slice(0,5))); }
  const m0=m.hs[m.nowI]; console.log(' now T',m0.T,'Tr',m0.Tr);
  if(k==='froid'){ const i=m.hs.findIndex(x=>x.t.slice(11,16)==='06:00'&&x.t>m.nowStr); const x=m.hs[i]; console.log(' 06:00 T',x.T,'Tr',x.Tr,'ice',JSON.stringify(x.ice));
   const mid=m.hs.findIndex(x=>x.t.slice(11,16)==='15:00'&&x.t>m.nowStr); console.log(' 15:00 T',m.hs[mid].T,'Tr',m.hs[mid].Tr);}
  const s1=A.seasonAnalysis(m,cars[0]); console.log(' season i20:',s1.level,s1.title,'|',s1.text, 'days',s1.days.length);
  const s2=A.seasonAnalysis(m,cars[1]); console.log(' season 308:',s2.level,s2.title);
  const al=A.computeAlerts(m,cars,{rainThr:5},{i20:s1,'308':s2}); console.log(' alerts',Object.values(al).map(a=>a.id+':'+a.sev).join(' '));
}
