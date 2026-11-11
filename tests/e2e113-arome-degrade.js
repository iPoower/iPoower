// Lot 1 (passe R2) · fonctionnement dégradé d'AROME PENDANT un cycle automatique (5 min), puis récupération.
// La base répond ; AROME échoue (erreur HTTP, délai dépassé, fournisseur limité 429). À chaque étape : températures,
// verdict, messages, provenance du départ d'un trajet proche et vrais horodatages de réception.
//  - Dégradé : le lieu passe sur le modèle de base, « AROME indisponible » est écrit (ligne des sources ET trajet) ;
//    un départ proche n'est jamais étiqueté « au-delà de l'horizon AROME » (défaut corrigé, contre-épreuve en fin de suite).
//  - Une seule température par lieu et par heure reste vraie en mode dégradé (trajet = Météo, Maintenant = valeur recalée).
//  - Récupération : retour EXACT à l'état initial (heures AROME, prévision, verdict, message).
//  - Horodatages : la réception affichée est celle de la base réellement reçue ; l'heure du dernier AROME valide n'est
//    jamais rafraîchie par un échec.
// Données 100 % fictives : lieux du préréglage de test, station « Station test », trajet Lieu A → Lieu B.
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');
const T0=new Date('2026-10-03T14:00:00+02:00').getTime();let TNOW=T0;
const RD=Date,FD=class extends RD{constructor(...a){super(...(a.length?a:[TNOW]))}static now(){return TNOW}};
const ctx={console,Math,Date:FD,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;',ctx);
const PW=fs.readFileSync('.passphrase','utf8').trim(),SP=process.env.SP,html=fs.readFileSync('site/index.html','utf8');
const U='https://ipoower.github.io/iPoower/race-control/';
const AR_DT=2.2, ST_DT=-1.3, HOME=[48.85,2.35];   // AROME : +2,2 °C sur la base ; station : 1,3 °C sous l'heure AROME en cours
let fail=0;const rows=[],check=(n,ok,d)=>{rows.push((ok?'✅':'❌')+' '+n+(d?' · '+d:''));if(!ok)fail++};
(async()=>{const b=await require('./lib/browser').launch(),c=await b.newContext({viewport:{width:414,height:896},isMobile:true,hasTouch:true,timezoneId:'Europe/Paris'});
await c.addInitScript(()=>{window.__OFFLINE=false;Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!window.__OFFLINE});});
const p=await c.newPage();await p.clock.install({time:T0});let AR='ok';const n={base:0,arome:0},held=[];   // AR : comportement d'AROME pour le lieu affiché
p.on('pageerror',e=>rows.push('ERR '+e.message));
const J=(r,o,s=200)=>r.fulfill({status:s,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
const one=(lat,lon)=>ctx.mk('froid',{lat:+lat,lon:+lon},'Europe/Paris',0);
const arome=pl=>{const h=pl.hourly,cut=96;   // veille + 3 jours (past_days=1, forecast_days=3), comme la vraie requête AROME
  const A={time:h.time.slice(0,cut)};for(const k of ['temperature_2m','relative_humidity_2m','dew_point_2m','apparent_temperature','precipitation','rain','showers','snowfall','weather_code','pressure_msl','cloud_cover','wind_speed_10m','wind_gusts_10m','shortwave_radiation'])A[k]=h[k].slice(0,cut);
  A.temperature_2m=A.temperature_2m.map(v=>+(v+AR_DT).toFixed(1));return {...pl,hourly:A,current:{...pl.current,temperature_2m:+(pl.current.temperature_2m+AR_DT).toFixed(1)},daily:undefined};};
const station=()=>{const pl=one(...HOME),i=pl.hourly.time.indexOf(new FD(TNOW).toLocaleString('sv-SE',{timeZone:'Europe/Paris'}).slice(0,13).replace(' ','T')+':00');
  const at=new FD(TNOW).toISOString();return {updated:at,stations:{ST1:{id:'ST1',name:'Station test',lat:48.86,lon:2.36,last:{T:+(pl.hourly.temperature_2m[i]+AR_DT+ST_DT).toFixed(1),t:at}}}};};
await p.route('**/*',r=>{const u=r.request().url(),host=new URL(u).hostname;   // nom d'hôte exact, jamais une sous-chaîne de l'URL
 if(host==='open-meteo.com'||host.endsWith('.open-meteo.com')){const q=new URL(u).searchParams,lats=String(q.get('latitude')).split(','),lons=String(q.get('longitude')).split(',');
   if(host==='ensemble-api.open-meteo.com')return J(r,ctx.me(one(lats[0],lons[0])));if(q.get('minutely_15'))return J(r,ctx.mn(one(lats[0],lons[0])));
   if(host==='air-quality-api.open-meteo.com')return r.abort();
   if(lats.length>1)return J(r,lats.map((_,i)=>one(lats[i],lons[i])));
   const home=+lats[0]===HOME[0]&&+lons[0]===HOME[1];
   if(q.get('models')==='meteofrance_seamless'){if(home)n.arome++;
     if(home&&AR==='500')return J(r,{error:true,reason:'test'},500);
     if(home&&AR==='429')return J(r,{error:true,reason:'Minutely API request limit exceeded. Please try again in one minute.'},429);
     if(home&&AR==='hang'){held.push(r);return;}   // aucune réponse : le délai de 12 s de l'app doit jouer
     return J(r,arome(one(lats[0],lons[0])));}
   if(home)n.base++;return J(r,one(lats[0],lons[0]));}
 if(u.includes('/race-control/calendar.sealed.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(SP+'/cal.fake.json','utf8')});
 if(u.includes('/race-control/obs.json'))return J(r,station());
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.startsWith(U)&&!/\.(js|json)$/.test(new URL(u).pathname))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const settle=async(k=8)=>{for(let i=0;i<k;i++){await p.clock.runFor(500);await p.waitForTimeout(120)}};
await p.goto(U);await p.clock.runFor(2500);await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await settle(14);
const FIX='2026-10-03T16:00';   // heure fixe de prévision observée à chaque étape
const LEG={k:'go',fromKind:'home',from:{lat:48.85,lon:2.35,label:'Lieu A',city:'Lieu A'},to:{lat:48.9,lon:2.25,label:'Lieu B',city:'Lieu B'},
  pts:[{f:0.25,lat:48.86,lon:2.32,km:3},{f:0.5,lat:48.875,lon:2.3,km:6},{f:0.75,lat:48.89,lon:2.27,km:9}],km:12,min:30,dep:'2026-10-03T16:00',arr:'2026-10-03T16:30',routed:true};
await p.evaluate(l=>legEval(l),LEG);await settle(8);
// État complet lu dans la page : modèle du lieu, carte pneus, ligne des sources, trajet proche et horodatages.
const snap=()=>p.evaluate(([fix,leg])=>{UI.view='pneus';renderAll();renderSrc();
  const m=M.home,ar=m.payload.__arome,i=m.byTime.get(fix),loc=allLocs().find(l=>l.id==='home'),car=CX.cars.find(x=>x.w),r=legEval(leg),q=r.seq&&r.seq[0];
  const cars=document.querySelector('#secCars').innerText.replace(/\s+/g,' '),nowTxt=/Maintenant : (-?\d+,\d) °C/.exec(cars),nar=car.nar&&/(-?\d+,\d) °C actuellement/.exec(car.nar.body);
  const seq=seqOf(m,m.nowI,S.horizon),again=windowAssess(car.car,seq,'card');
  return {hours:ar.hours,status:ar.status,T:m.hs[i].T,Tr:m.hs[i].Tr,ice:m.hs[i].ice?m.hs[i].ice.level:null,
    now:nowTxt&&nowTxt[1],nar:nar&&nar[1],cur:f1(curTemp(m)),
    verdict:car.w.level+'/'+car.w.score,fresh:again.level+'/'+again.score,shared:CX.m===m,
    src:document.querySelector('#srcline').textContent.replace(/\s+/g,' '),
    depT:q?q.hs[q.i].T:null,depKind:r.depSrc&&r.depSrc.kind,tag:(/data-dep-src="\w+"[^>]*>([^<]*)/.exec(legHtml(leg))||[])[1]||'',legScore:r.res&&r.res[0]?r.res[0].w.level+'/'+r.res[0].w.score:null,
    rawT:RAW.home.t,mode:RAW.home.mode,baseAt:WEATHER_REQUESTS.fetchedAt(urlFor(loc)),arAt:WEATHER_REQUESTS.fetchedAt(urlArome(loc)),
    received:(document.querySelector('#weatherReceived')||{textContent:''}).textContent.replace(/\s+/g,' '),limited:WEATHER_REQUESTS.state().until>Date.now(),
    bar:document.querySelector('#statusbar').innerText.replace(/\s+/g,' ')};},[FIX,LEG]);
const hm=ms=>new RD(ms).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const brief=s=>`${s.hours} h AROME (${s.status}) · ${FIX.slice(11)} air ${s.T} °C, chaussée ${s.Tr} °C · maintenant ${s.now} · verdict ${s.verdict} · trajet ${s.depT} °C [${s.depKind}] ${s.legScore} · base ${hm(s.baseAt)} · AROME ${hm(s.arAt)}`;
// Un cycle automatique : on laisse seulement passer le temps jusqu'à T0 + min (aucun clic), puis on laisse l'app travailler.
const cycle=async(mode,min)=>{AR=mode;TNOW=T0+min*60e3;const before={...n};await p.clock.fastForward(TNOW-await p.evaluate(()=>Date.now()));await settle(12);return before;};
const same=(a,b)=>a.hours===b.hours&&a.status===b.status&&a.T===b.T&&a.Tr===b.Tr&&a.ice===b.ice&&a.now===b.now&&a.verdict===b.verdict&&a.depT===b.depT&&a.depKind===b.depKind&&a.legScore===b.legScore;
// Ce qui doit rester vrai à CHAQUE étape, dégradée ou non.
const invariants=(tag,s)=>{
  check(`${tag} · une seule température : Maintenant = récit = valeur recalée ; départ du trajet = Météo à ${FIX.slice(11)}`,s.now&&s.now===s.nar&&s.now===s.cur&&s.depT===s.T,`maintenant ${s.now} / récit ${s.nar} / recalée ${s.cur} · trajet ${s.depT} / Météo ${s.T}`);
  check(`${tag} · verdict recalculé sur les températures affichées (même modèle pour Météo, Pneus et le verdict)`,s.shared&&s.verdict===s.fresh,`affiché ${s.verdict} · recalculé ${s.fresh}`);};
const degraded=(tag,s,s0,at)=>{
  check(`${tag} · lieu sur le modèle de base, AROME retiré, sans donnée inventée`,s.hours===0&&s.status==='failed'&&s.T!==s0.T,brief(s));
  check(`${tag} · « AROME indisponible » écrit dans la ligne des sources`,/modèle de base, AROME indisponible/.test(s.src)&&!/Météo-France AROME jusqu/.test(s.src),s.src.slice(60,200));
  check(`${tag} · départ proche : « AROME indisponible », jamais « au-delà de l’horizon AROME »`,s.depKind==='failed'&&/modèle de base \(AROME indisponible\)/.test(s.tag)&&!/horizon/.test(s.tag),s.tag);
  check(`${tag} · vrais horodatages : réception = base reçue à ${hm(at)} ; dernier AROME valide non rafraîchi par l’échec`,s.rawT===s.baseAt&&hm(s.baseAt)===hm(at)&&s.received.includes(hm(at))&&s.arAt<s.baseAt-60e3,`réception ${hm(s.rawT)} (« ${s.received.trim()} ») · base ${hm(s.baseAt)} · AROME ${hm(s.arAt)}`);
  invariants(tag,s);};
const recovered=(tag,s,s0,at)=>{
  check(`${tag} · récupération : retour exact à l’état initial (heures AROME, prévision, verdict, trajet)`,same(s,s0),brief(s));
  check(`${tag} · message et provenance rétablis, base et AROME reçus ensemble à ${hm(at)}`,/Météo-France AROME jusqu/.test(s.src)&&!/AROME indisponible/.test(s.src)&&s.depKind==='arome'&&hm(s.baseAt)===hm(at)&&hm(s.arAt)===hm(at)&&s.rawT===s.baseAt,`${s.tag} · base ${hm(s.baseAt)} · AROME ${hm(s.arAt)}`);
  invariants(tag,s);};
const s0=await snap();
check('113.0 · état initial : AROME fusionné, station appliquée, trajet proche sur AROME',s0.hours>0&&s0.status==='ok'&&s0.depKind==='arome'&&/Météo-France AROME jusqu/.test(s0.src),brief(s0));
invariants('113.0',s0);
// 1. Erreur HTTP sur AROME pendant un cycle automatique, base réussie.
let before=await cycle('500',6);const s1=await snap();
check('113.1 · erreur HTTP : le cycle automatique a bien demandé la base et AROME',n.base>before.base&&n.arome>before.arome,`base ${before.base}→${n.base} · AROME ${before.arome}→${n.arome}`);
degraded('113.1 · erreur HTTP',s1,s0,T0+6*60e3);
await cycle('ok',12);recovered('113.2 · après erreur HTTP',await snap(),s0,T0+12*60e3);
// 2. Délai dépassé : AROME ne répond pas. Tant que le délai de 12 s court, rien n'est perdu ; ensuite, mode dégradé.
AR='hang';TNOW=T0+18*60e3;await p.clock.fastForward(TNOW-await p.evaluate(()=>Date.now()));for(let i=0;i<8;i++){await p.clock.runFor(500);await p.waitForTimeout(120);}
const s3w=await snap();
check('113.3 · délai dépassé, pendant l’attente (4 s) : affichage inchangé, AROME conservé',held.length>0&&same(s3w,s0),brief(s3w));
TNOW+=14e3;await p.clock.fastForward(10e3);await settle(8);const s3=await snap();
degraded('113.3 · délai dépassé',s3,s0,T0+18*60e3);
await cycle('ok',24);recovered('113.4 · après délai dépassé',await snap(),s0,T0+24*60e3);
// 3. Fournisseur limité (HTTP 429) sur AROME, base déjà partie : la base reçue est gardée, la pause du fournisseur est respectée.
before=await cycle('429',30);const s5=await snap();
check('113.5 · HTTP 429 : pause du fournisseur active, aucune nouvelle requête pendant la pause',s5.limited&&n.arome===before.arome+1,`pause active : ${s5.limited} · AROME ${before.arome}→${n.arome} · ${s5.bar.slice(0,120)}`);
degraded('113.5 · HTTP 429',s5,s0,T0+30*60e3);
await cycle('ok',36);const s6=await snap();
check('113.6 · après 429 : pause terminée',!s6.limited,s6.bar.slice(0,120));
recovered('113.6 · après 429',s6,s0,T0+36*60e3);
// Contre-épreuve du défaut corrigé : l'ancienne étiquette appelait « au-delà de l'horizon » tout départ sans heure AROME.
const old=await p.evaluate(()=>{const ar={hours:0,until:null,status:'failed'},x={t:'2026-10-03T16:00'};
  const legacy=ar&&ar.hours&&ar.until&&x.t<=ar.until?'arome':'base';   // règle d'origine (commit 388b16c)
  return {legacy,now:legDepSource([{k:0,hs:[x],i:0}],{payload:{__arome:ar}}).kind,
    kinds:['failed','stale','empty',undefined].map(st=>legDepSource([{k:0,hs:[x],i:0}],{payload:{__arome:{hours:0,until:null,status:st}}}).kind).join(),
    horizon:legDepSource([{k:0,hs:[{t:'2026-10-09T16:00'}],i:0}],{payload:{__arome:{hours:87,until:'2026-10-05T14:00',status:'ok'}}}).kind,
    tags:['failed','stale','empty','horizon','base'].map(k=>{const t=document.createElement('template');t.innerHTML=legDepSrcTag({kind:k});return t.content.textContent;}).join(' | ')};});
check('113.7 · quatre raisons distinctes : panne, données anciennes, absence de couverture, dépassement d’horizon',old.legacy==='base'&&old.now==='failed'&&old.kinds==='failed,stale,empty,base'&&old.horizon==='horizon'
  &&/AROME indisponible/.test(old.tags)&&/plus ancien que la base/.test(old.tags)&&/hors couverture/.test(old.tags)&&(old.tags.match(/horizon/g)||[]).length===1,JSON.stringify(old));
console.log(rows.join('\n')+'\n\n'+(rows.length-fail)+'/'+rows.length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
await c.close();await b.close();process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);})();
