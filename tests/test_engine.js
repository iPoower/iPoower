const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const src=fs.readFileSync(path.join(__dirname,'../src/engine.js'),'utf8')+fs.readFileSync(path.join(__dirname,'../src/demo.js'),'utf8');
const ctx={console,Math,Date,Intl,Map,Set};vm.createContext(ctx);vm.runInContext(src+`
this.api={makeDemoPayload,makeModel,windowAssess,summarize,seqOf,narrate,seasonAnalysis,computeAlerts,LV,ICE_LV,hourVerdict,estRoad,iceRisk,calendarEventRelevant,calendarEventPlace};`,ctx);
const A=ctx.api;
// Comparaison exacte au comportement antérieur : formateur caché, pas d'heure ni de décalage UTC cachés.
{
  let instant=Date.parse('2026-01-01T00:00:00Z'),allocations=0;
  const FixedDate=class extends Date{constructor(...a){super(...(a.length?a:[instant]));}static now(){return instant;}};
  const clock={console,Math,Date:FixedDate,Intl:{DateTimeFormat:function(...a){allocations++;return new Intl.DateTimeFormat(...a);}},Map,Set};
  vm.createContext(clock);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/engine.js'),'utf8')+';this.now=nowIn;this.cacheSize=()=>NOW_FORMATS.size;',clock);
  const previous=tz=>{try{return new FixedDate().toLocaleString('sv-SE',{timeZone:tz,hour12:false}).replace(' ','T').slice(0,16);}catch(e){const d=new FixedDate(),pad=n=>String(n).padStart(2,'0');return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;}};
  const instants=['2024-02-29T23:59:59Z','2026-01-01T00:00:00Z','2026-03-29T00:59:59Z','2026-03-29T01:00:00Z','2026-10-25T00:59:59Z','2026-10-25T01:00:00Z','2026-12-31T23:59:59Z'];
  const zones=['Europe/Paris','Europe/London','UTC','America/New_York','America/Los_Angeles','Asia/Kolkata','Asia/Kathmandu','Pacific/Chatham','Pacific/Kiritimati','Australia/Lord_Howe',undefined,null,'not-a-zone'];
  for(const at of instants){instant=Date.parse(at);for(const tz of zones)assert.equal(clock.now(tz),previous(tz),`${at} / ${tz}`);}
  const before=allocations;for(let i=0;i<100;i++){instant+=60000;assert.equal(clock.now('Europe/Paris'),previous('Europe/Paris'));}
  assert.equal(allocations,before,'un seul formateur par fuseau ; la minute avance réellement');
  for(let i=-12;i<=12;i++){const tz='Etc/GMT'+(i>=0?'+':'')+i;assert.equal(clock.now(tz),previous(tz));}
  assert(clock.cacheSize()<=16,'cache borné même avec plusieurs lieux/fuseaux');
  assert.equal(clock.now('Europe/Paris'),previous('Europe/Paris'),'fuseau évincé recréé correctement');
  console.log('✅ temps : 91 comparaisons à la référence, minutes fraîches, DST, fuseaux fractionnaires, repli invalide et cache borné');
}
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
const loc={id:'villeA',lat:48.85,lon:2.35};   // lieu fictif (aucune donnée personnelle)
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

const plusDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
{
  const p=A.makeDemoPayload('froid',loc),m=A.makeModel(p,'demo',loc),today=m.nowStr.slice(0,10);
  const estimated=plusDays(today,30),appointment=plusDays(today,20);
  const car={id:'winter-plan',short:'Test',sporty:false,tire:{type:'summer',size:'205/55 R16',tread:null},
    plan:{on:true,date:estimated,appointmentDate:appointment,appointmentConfirmed:0,etaFrom:plusDays(today,24),etaTo:plusDays(today,25)}};
  let s=A.seasonAnalysis(m,car);
  assert.equal(s.countdown.kind,'estimated');
  assert.equal(s.countdown.date,estimated);
  assert.equal(s.countdown.n,30);
  assert(s.countdown.weatherCoveredDays>0);
  assert(s.countdown.weatherRemainingDays>0);
  assert.equal(s.countdown.weatherCoveredDays+s.countdown.weatherRemainingDays,30);
  car.plan.appointmentConfirmed=1;
  s=A.seasonAnalysis(m,car);
  assert.equal(s.countdown.kind,'confirmed');
  assert.equal(s.countdown.date,appointment);
  assert.equal(s.countdown.n,20);
  assert.equal(s.countdown.weatherCoveredDays+s.countdown.weatherRemainingDays,20);
  car.plan.date='';
  s=A.seasonAnalysis(m,car);
  assert.equal(s.countdown.date,appointment);
  console.log('✅ cycle hiver : estimation, rendez-vous confirmé et couverture météo séparés');
}
