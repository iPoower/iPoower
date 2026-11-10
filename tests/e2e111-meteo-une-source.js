// Lot 1 (passe Clara R2) · une seule température par lieu et par heure.
//  R2-01 : l'actualisation automatique (5 min) garde la couche AROME (même nombre d'heures AROME, même prévision d'une heure fixe) ;
//          « AROME indisponible » n'apparaît que si AROME a été demandé et a échoué.
//  R2-02 : un trajet qui part d'un lieu enregistré lit, au départ, la même température que l'onglet Météo (AROME + station) ;
//          au-delà de l'horizon AROME : modèle de base, et c'est écrit.
//  R2-07 : carte pneus : « Maintenant » et le récit « … actuellement » donnent la même valeur, celle recalée sur la station.
// Données 100 % fictives : lieux « Maison test » / « Travail test » du préréglage de test, station « Station test ».
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');
const T0=new Date('2026-10-03T14:00:00+02:00').getTime();let TNOW=T0;
const RD=Date,FD=class extends RD{constructor(...a){super(...(a.length?a:[TNOW]))}static now(){return TNOW}};
const ctx={console,Math,Date:FD,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;',ctx);
const PW=fs.readFileSync('.passphrase','utf8').trim(),SP=process.env.SP,html=fs.readFileSync('site/index.html','utf8');
const U='https://ipoower.github.io/iPoower/race-control/';
const AR_DT=2.2, ST_DT=-1.3;   // AROME : +2,2 °C sur la base ; station : 1,3 °C sous l'heure AROME en cours
let fail=0;const rows=[],check=(n,ok,d)=>{rows.push((ok?'✅':'❌')+' '+n+(d?' · '+d:''));if(!ok)fail++};
(async()=>{const b=await require('./lib/browser').launch(),c=await b.newContext({viewport:{width:414,height:896},isMobile:true,hasTouch:true,timezoneId:'Europe/Paris'});
await c.addInitScript(()=>{window.__OFFLINE=false;Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!window.__OFFLINE});});
const p=await c.newPage();await p.clock.install({time:T0});let arFail=false;const n={base:0,arome:0,multi:0};
p.on('pageerror',e=>rows.push('ERR '+e.message));
const J=(r,o,s=200)=>r.fulfill({status:s,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
const one=(lat,lon)=>ctx.mk('doux',{lat:+lat,lon:+lon},'Europe/Paris',0);
const arome=pl=>{const h=pl.hourly,cut=96;   // veille + 3 jours (past_days=1, forecast_days=3), comme la vraie requête AROME
  const A={time:h.time.slice(0,cut)};for(const k of ['temperature_2m','relative_humidity_2m','dew_point_2m','apparent_temperature','precipitation','rain','showers','snowfall','weather_code','pressure_msl','cloud_cover','wind_speed_10m','wind_gusts_10m','shortwave_radiation'])A[k]=h[k].slice(0,cut);
  A.temperature_2m=A.temperature_2m.map(v=>+(v+AR_DT).toFixed(1));return {...pl,hourly:A,current:{...pl.current,temperature_2m:+(pl.current.temperature_2m+AR_DT).toFixed(1)},daily:undefined};};
const station=()=>{const pl=one(48.85,2.35),i=pl.hourly.time.indexOf(new FD(TNOW).toLocaleString('sv-SE',{timeZone:'Europe/Paris'}).slice(0,13).replace(' ','T')+':00');
  const at=new FD(TNOW).toISOString();return {updated:at,stations:{ST1:{id:'ST1',name:'Station test',lat:48.86,lon:2.36,last:{T:+(pl.hourly.temperature_2m[i]+AR_DT+ST_DT).toFixed(1),t:at}}}};};
await p.route('**/*',r=>{const u=r.request().url();
 if(u.includes('open-meteo.com')){const q=new URL(u).searchParams,lats=String(q.get('latitude')).split(','),lons=String(q.get('longitude')).split(',');
   if(u.includes('ensemble'))return J(r,ctx.me(one(lats[0],lons[0])));if(q.get('minutely_15'))return J(r,ctx.mn(one(lats[0],lons[0])));
   if(u.includes('air-quality'))return r.abort();
   if(lats.length>1){n.multi++;return J(r,lats.map((_,i)=>one(lats[i],lons[i])));}
   if(q.get('models')==='meteofrance_seamless'){n.arome++;return arFail?J(r,{error:true,reason:'test'},500):J(r,arome(one(lats[0],lons[0])));}
   n.base++;return J(r,one(lats[0],lons[0]));}
 if(u.includes('/race-control/calendar.sealed.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(SP+'/cal.fake.json','utf8')});
 if(u.includes('/race-control/obs.json'))return J(r,station());
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.startsWith(U)&&!/\.(js|json)$/.test(new URL(u).pathname))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const settle=async(k=8)=>{for(let i=0;i<k;i++){await p.clock.runFor(500);await p.waitForTimeout(120)}};
await p.goto(U);await p.clock.runFor(2500);await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await settle(14);
const FIX='2026-10-03T15:00';   // heure fixe observée avant/après le cycle automatique
const state=()=>p.evaluate(fix=>{const m=M.home,i=m&&m.byTime.get(fix),ar=m&&m.payload.__arome;renderSrc();
  return {hours:ar?ar.hours:null,status:ar?ar.status:null,T:i!=null?m.hs[i].T:null,Tr:i!=null?m.hs[i].Tr:null,arFlags:m?m.hs.filter(x=>x.ar).length:null,obs:!!(m&&m.obs),
    src:document.querySelector('#srcline').textContent.replace(/\s+/g,' ')};},FIX);
const s0=await state(),n0={...n};
check('111.0 · état initial : AROME fusionné et station appliquée sur le lieu affiché',s0.hours>0&&s0.arFlags>0&&s0.obs&&/Météo-France AROME/.test(s0.src)&&!/AROME indisponible/.test(s0.src),JSON.stringify({...s0,src:undefined}));
// R2-01 : laisser passer un cycle automatique (5 min) sans clic. La base du lieu affiché est redemandée ; AROME (35 min) vient du cache.
TNOW=T0+6*60e3;await p.clock.fastForward(6*60e3);await settle(12);
const s1=await state();
check('111.1 · R2-01 · le cycle automatique redemande la base ET AROME ensemble (même durée de cache)',n.base>n0.base&&n.arome-n0.arome===n.base-n0.base,`base ${n0.base}→${n.base} · AROME ${n0.arome}→${n.arome}`);
check('111.2 · R2-01 · même nombre d’heures AROME avant et après le cycle automatique',s1.hours===s0.hours&&s1.arFlags===s0.arFlags&&s1.status==='ok',`avant ${s0.hours} h (${s0.arFlags} drapeaux) · après ${s1.hours} h (${s1.arFlags} drapeaux) · ${s1.status}`);
check('111.3 · R2-01 · même prévision à '+FIX.slice(11)+' avant et après (air et chaussée)',s1.T===s0.T&&s1.Tr===s0.Tr,`air ${s0.T} → ${s1.T} °C · chaussée ${s0.Tr} → ${s1.Tr} °C`);
check('111.4 · R2-01 · « AROME indisponible » absent tant qu’AROME est reçu',!/AROME indisponible/.test(s1.src)&&/Météo-France AROME/.test(s1.src),s1.src.slice(0,200));
// R2-07 : carte pneus. « Maintenant : X °C » = « X °C actuellement » = température recalée affichée par Météo.
const card=await p.evaluate(()=>{UI.view='pneus';renderAll();const t=document.querySelector('#secCars').innerText.replace(/\s+/g,' ');
  const nb=(CX.cars.find(x=>x.nar)||{}).nar,now=/Maintenant : (-?\d+,\d) °C/.exec(t),nar=nb&&/(-?\d+,\d) °C actuellement/.exec(nb.body),link=/Météo · [^\d-]*(-?\d+,\d) °C/.exec(document.querySelector('#secWeatherLink').textContent);
  const m=M.home,x=m.hs[m.nowI];return {now:now&&now[1],nar:nar&&nar[1],link:link&&link[1],cur:f1(curTemp(m)),raw:f1(m.cur.T),hourCode:wx(x.code),txt:t.slice(0,240)};});
check('111.5 · R2-07 · « Maintenant » = récit « actuellement » = valeur recalée (curTemp)',card.now&&card.now===card.nar&&card.now===card.cur,JSON.stringify(card));
check('111.6 · R2-07 · la valeur brute du modèle n’apparaît pas seule sur Pneus',card.raw===card.cur||!new RegExp('\\b'+card.raw.replace('.',',')+' °C').test(card.txt)&&card.link===card.cur,`brute ${card.raw} · recalée ${card.cur} · lien Météo ${card.link}`);
// R2-02 : trajet fictif Maison test → Travail test, dans l'horizon AROME puis au-delà.
const leg=(dep,arr)=>({k:'go',fromKind:'home',from:{lat:48.85,lon:2.35,label:'Domicile',city:'Domicile'},to:{lat:48.9,lon:2.25,label:'Lieu B',city:'Lieu B'},
  pts:[{f:0.25,lat:48.86,lon:2.32,km:3},{f:0.5,lat:48.875,lon:2.3,km:6},{f:0.75,lat:48.89,lon:2.27,km:9}],km:12,min:30,dep,arr,routed:true});
const near=leg('2026-10-03T15:00','2026-10-03T15:30'),far=leg('2026-10-08T15:00','2026-10-08T15:30');
await p.evaluate(l=>legEval(l),near);await settle(8);
const tr=await p.evaluate(([a,z])=>{const out=l=>{const r=legEval(l),q=r.seq&&r.seq[0],m=M.home,i=q&&m.byTime.get(q.t.slice(0,13)+':00');
  return {dep:q?q.hs[q.i].T:null,meteo:i!=null?m.hs[i].T:null,src:r.depSrc,tag:(/data-dep-src="(\w+)"[^>]*>([^<]*)/.exec(legHtml(l))||[]).slice(1).join(' : ')};};return {near:out(a),far:out(z)};},[near,far]);
check('111.7 · R2-02 · requête de parcours groupée envoyée (points intermédiaires)',n.multi>0,'requêtes multi-points : '+n.multi);
check('111.8 · R2-02 · départ d’un lieu enregistré dans l’horizon AROME : même température que Météo (≤ 0,5 °C)',tr.near.dep!=null&&tr.near.meteo!=null&&Math.abs(tr.near.dep-tr.near.meteo)<=0.5&&tr.near.src&&tr.near.src.kind==='arome'&&/AROME/.test(tr.near.tag),JSON.stringify(tr.near));
check('111.9 · R2-02 · au-delà de l’horizon AROME : modèle de base, et c’est écrit',tr.far.src&&tr.far.src.kind==='base'&&/au-delà de l’horizon AROME/.test(tr.far.tag)&&Math.abs(tr.far.dep-tr.far.meteo)<=0.5,JSON.stringify(tr.far));
// R2-02 · preuve : la correction de chaussée apprise au domicile n'entre pas dans les trajets ; l'air reste celui de Météo.
// Cinq retours « givre » fictifs au domicile avec une chaussée estimée à 5 °C : correction appliquée de −3 °C (plafond).
const cal=await p.evaluate(l=>{S.calib=Array.from({length:5},(_,k)=>({t:'2026-10-03T13:0'+k,loc:'home',kind:'ice',Tr:5,T:20}));rebuild();
  const m=M.home,r=legEval(l),q=r.seq[0],i=m.byTime.get(q.t.slice(0,13)+':00');
  setRoadBias(0);const ref=makeModel(RAW.home.p,RAW.home.mode,m.loc);if(OBS)ref.obs=applyObs(ref,OBS.stations,35);const j=ref.byTime.get(q.t.slice(0,13)+':00');
  const src=f1WeatherSources(r.seq),x=q.hs[q.i];S.calib=[];rebuild();
  return {bias:m.roadBias,meteoT:m.hs[i].T,meteoTr:m.hs[i].Tr,depT:x.T,depTr:x.Tr,refTr:ref.hs[j].Tr,refIce:ref.hs[j].ice&&ref.hs[j].ice.level,depIce:x.ice&&x.ice.level,dated:src.known,rawT:q.raw?q.raw.T:null};},near);
check('111.11 · R2-02 · correction de chaussée du lieu active (−3 °C) dans l’onglet Météo',cal.bias===-3&&cal.meteoTr!==cal.depTr,JSON.stringify(cal));
check('111.12 · R2-02 · départ du trajet : air = Météo, chaussée et verglas = modèle SANS correction du lieu',cal.depT===cal.meteoT&&cal.depTr===cal.refTr&&cal.depIce===cal.refIce,JSON.stringify(cal));
check('111.13 · R2-02 · points du trajet toujours datés (vraie heure de réception du lieu)',cal.dated===true,JSON.stringify(cal));
const ev=await p.evaluate(l=>{const r=legEval(l),q=r.seq[0],lm=LEGM[legKey(l)].models[0],i=lm.byTime.get(q.t.slice(0,13)+':00');
  return {raw:q.raw?q.raw.T:null,leg:lm.hs[i].T,shown:q.hs[q.i].T};},near);
check('111.14 · C · moteur de preuves : le départ garde la prévision brute du parcours ; affichage et verdict lisent la valeur du lieu',ev.raw!=null&&ev.raw===ev.leg&&ev.shown!==ev.raw,JSON.stringify(ev));
// R2-01 (seconde moitié) : AROME demandé et en échec → « AROME indisponible », et seulement dans ce cas.
arFail=true;await p.evaluate(()=>refreshAll(true));await settle(12);
const s2=await state();
check('111.10 · R2-01 · AROME demandé et en échec : « AROME indisponible » affiché',s2.hours===0&&s2.status==='failed'&&/AROME indisponible/.test(s2.src),`${s2.hours} h · ${s2.status} · ${s2.src.slice(0,160)}`);
console.log(rows.join('\n')+'\n\n'+(rows.length-fail)+'/'+rows.length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
await c.close();await b.close();process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);})();
