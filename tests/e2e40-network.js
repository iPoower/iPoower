// Pannes du fournisseur météo : réponse 200 vide, tronquée ou d'un portail, HTTP 503, délai dépassé.
// Invariant : la dernière météo valide reste affichée et en cache, datée, jamais LIVE ; retour LIVE automatique ensuite.
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');
const T0=new Date('2026-10-03T14:00:00+02:00').getTime();let TNOW=T0;
const RD=Date,FD=class extends RD{constructor(...a){super(...(a.length?a:[TNOW]))}static now(){return TNOW}};
const ctx={console,Math,Date:FD,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;',ctx);
const PW=fs.readFileSync('.passphrase','utf8').trim(),SP=process.env.SP,html=fs.readFileSync('site/index.html','utf8');
const U='https://ipoower.github.io/iPoower/race-control/';
let fail=0;const rows=[],check=(n,ok,d)=>{rows.push((ok?'✅':'❌')+' '+n+(d?' · '+d:''));if(!ok)fail++};
(async()=>{const b=await require('./lib/browser').launch(),c=await b.newContext({viewport:{width:414,height:896},isMobile:true,hasTouch:true,timezoneId:'Europe/Paris'});
const p=await c.newPage();await p.clock.install({time:T0});let fault=null,meteoCalls=0,calBody=fs.readFileSync(SP+'/cal.fake.json','utf8');
p.on('pageerror',e=>rows.push('ERR '+e.message));
await p.route('**/*',r=>{const u=r.request().url(),H={'access-control-allow-origin':'*'},J=o=>r.fulfill({status:200,contentType:'application/json',headers:H,body:JSON.stringify(o)});
 if(u.includes('api.open-meteo.com/v1/forecast'))meteoCalls++;
 if(fault&&u.includes('api.open-meteo.com/v1/forecast')){
   if(fault==='timeout')return;   // jamais de réponse : l'AbortController de fetchJSON doit trancher
   if(fault==='503')return r.fulfill({status:503,contentType:'text/plain',headers:H,body:'Service Unavailable'});
   if(fault==='429')return r.fulfill({status:429,contentType:'application/json',headers:{...H,'retry-after':'120','access-control-expose-headers':'Retry-After'},body:JSON.stringify({error:true,reason:'Too many concurrent requests'})});
   return r.fulfill({status:200,contentType:fault.startsWith('<')?'text/html':'application/json',headers:H,body:fault});}
 if(u.includes('open-meteo.com')){const q=new URL(u).searchParams,lats=String(q.get('latitude')).split(','),lons=String(q.get('longitude')).split(','),one=i=>ctx.mk('doux',{lat:+lats[i],lon:+lons[i]},'Europe/Paris',0);if(lats.length>1)return J(lats.map((_,i)=>one(i)));const base=one(0);return J(u.includes('ensemble')?ctx.me(base):q.get('minutely_15')?ctx.mn(base):base);}
 if(u.includes('/race-control/calendar.sealed.json'))return r.fulfill({status:200,contentType:'application/json',body:calBody});
 if(u.includes('/race-control/obs.json'))return J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.startsWith(U)&&!/\.(js|json)$/.test(new URL(u).pathname))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const settle=async(n=8)=>{for(let i=0;i<n;i++){await p.clock.runFor(500);await p.waitForTimeout(100)}};
const st=()=>p.evaluate(()=>{const c=JSON.parse(localStorage.getItem('twrc.cache.'+UI.loc)||'null');
  return {hours:M[UI.loc]?M[UI.loc].hs.length:0,cache:c&&c.p&&c.p.hourly&&Array.isArray(c.p.hourly.time)?c.p.hourly.time.length:0,bar:document.querySelector('#statusbar').innerText.replace(/\s+/g,' '),busy,verdict:!!document.querySelector('#secCars .gauge, #secBrf .gauge')};});
await p.goto(U);await p.clock.runFor(2500);await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await settle(14);
const ref=await st();check('40.0 · en ligne : prévision complète, LIVE, en cache',ref.hours>=24&&ref.cache===ref.hours&&/LIVE/.test(ref.bar),JSON.stringify(ref));
const FAULTS=[['réponse 200 vide {}','{}'],['réponse 200 sans heures','{"hourly":{"time":[]}}'],['réponse 200 tronquée','{"hourly":{"time":["2026-10-03T14:00"],"temperature_2m":[12]}}'],
  ['portail captif (HTML)','<html><body>Wi-Fi</body></html>'],['HTTP 503','503'],['délai dépassé (aucune réponse)','timeout']];
for(const [name,f] of FAULTS){
  fault=f;await p.evaluate(()=>{lastOk=0;lastTry=0;refreshAll();});
  await settle(f==='timeout'?30:6);const s=await st();
  check(`40 · ${name} : dernière météo valide conservée, en cache, jamais LIVE`,s.hours===ref.hours&&s.cache===ref.cache&&!/LIVE/.test(s.bar)&&/CACHE/.test(s.bar)&&!s.busy&&s.verdict,JSON.stringify(s));
  fault=null;await p.evaluate(()=>refreshAll());await settle(8);
}
// reprise automatique sans geste : le minuteur d'actualisation (5 min) relance seul après une panne
// (pas de 5 s, plus courts que le plus petit délai réseau de 8 s, et chaque actualisation terminée en temps réel
//  avant le pas suivant : un délai réseau n'expire jamais en temps simulé, même sur un runner lent)
fault='503';await p.evaluate(()=>{lastOk=0;lastTry=0;refreshAll();});await settle(6);fault=null;
for(let k=1;k<=78;k++){TNOW=T0+60e3+k*5e3;await p.clock.runFor(5e3);await p.waitForFunction(()=>!busy,null,{timeout:20000});}await settle(8);const back=await st();
check('40.7 · panne passagère : retour LIVE automatique au cycle suivant, sans recharger',/LIVE/.test(back.bar)&&back.hours===ref.hours,JSON.stringify(back));
// agenda chiffré : un fichier corrompu ou une copie plus ancienne ne remplace jamais le dernier agenda valide
const {seal,tryUnseal}=require('../tools/keys'),good=JSON.parse(calBody),plain=tryUnseal(good,PW.toLowerCase());
const calState=()=>p.evaluate(()=>({c:CAL&&CAL.c,updated:CAL&&CAL.updated,n:CAL&&CAL.events.length,stored:(JSON.parse(localStorage.getItem('twrc.calendar.sealed.v1')||'null')||{}).sealed}));
const cal0=await calState();
calBody=JSON.stringify({...good,c:good.c.slice(0,-24)+'AAAAAAAAAAAAAAAAAAAAAAAA'});await p.evaluate(()=>loadCalendar());await settle(6);let cal1=await calState();
check('40.8 · agenda chiffré corrompu : agenda affiché et cache local intacts',cal1.c===cal0.c&&cal1.n===cal0.n&&cal1.stored&&cal1.stored.c===good.c,JSON.stringify({c:cal1.c===cal0.c,stored:cal1.stored&&cal1.stored.c===good.c}));
const newer=seal({...plain,updated:new Date(Date.parse(plain.updated)+3600e3).toISOString()},PW.toLowerCase()),older=seal({...plain,updated:new Date(Date.parse(plain.updated)-3600e3).toISOString()},PW.toLowerCase());
calBody=JSON.stringify(newer);await p.evaluate(()=>loadCalendar());await settle(10);const cal2=await calState();
calBody=JSON.stringify(older);await p.evaluate(()=>loadCalendar());await settle(10);const cal3=await calState();
check('40.9 · agenda plus récent adopté, copie plus ancienne ignorée (affichage et cache)',cal2.c===newer.c&&cal3.c===newer.c&&cal3.stored&&cal3.stored.c===newer.c,JSON.stringify({adopt:cal2.c===newer.c,kept:cal3.c===newer.c,stored:cal3.stored&&cal3.stored.c===newer.c}));
// diagnostic : états lisibles, sans aucune donnée personnelle
fault='503';await p.evaluate(()=>{lastOk=0;lastTry=0;refreshAll();});await settle(6);fault=null;
await p.evaluate(()=>{const s=document.getElementById('settings');s.open=true;renderSettings(true);});await settle(4);
const diag=await p.evaluate(()=>({html:document.querySelector('#diagBox').innerText,text:diagText()}));
check('40.10 · diagnostic : réseau, météo datée avec son erreur, relais, agenda, stockage, trajet',/Réseau/.test(diag.text)&&/Météo du lieu affiché : (FRESH|AGING|STALE) · cache · .*erreur : HTTP 503/.test(diag.text)&&/Agenda : (FRESH|AGING|STALE)/.test(diag.text)&&/Stockage local : (DURABLE|DEGRADED) · (?:validé il y a [^·]+|validation de reprise en attente) · \d+ clés/.test(diag.text)&&/Trajet vivant/.test(diag.text)&&/Météo du lieu/.test(diag.html),diag.text.replace(/\n/g,' | ').slice(0,400));
check('40.11 · diagnostic sans coordonnée, lieu ni rendez-vous',!/\d+[.,]\d{3,}/.test(diag.text.replace(/diagnostic du \S+/,''))&&!/Maison test|Travail test|Lieu test|Assurance|Concert|Lille|Amiens/i.test(diag.text),diag.text.replace(/\n/g,' | ').slice(0,300));
// Incident PC : HTTP 429 malgré une page à jour et un réseau disponible. La pause survit au rechargement.
await p.setViewportSize({width:1280,height:800});fault='429';
await p.evaluate(()=>{lastOk=0;lastTry=0;refreshAll();});await settle(8);let limited=await st();
check('40.12 · HTTP 429 sur PC : cache intact et daté, jamais LIVE, synchronisation terminée',limited.hours===ref.hours&&limited.cache===ref.cache&&/CACHE/.test(limited.bar)&&!/LIVE/.test(limited.bar)&&!limited.busy&&/fournisseur météo limité/.test(limited.bar),JSON.stringify(limited));
const pausedCalls=meteoCalls;
await p.evaluate(()=>{refreshAll();refreshAll();autoTick();window.dispatchEvent(new Event('focus'));});await settle(8);
check('40.13 · pendant Retry-After : aucun nouvel appel malgré actualiser et reprise de l’onglet',meteoCalls===pausedCalls,`${pausedCalls} → ${meteoCalls}`);
check('40.14 · diagnostic : pause HTTP 429 et bouton Actualiser suspendu',await p.evaluate(()=>/API météo : HTTP 429 · pause jusqu’à/.test(diagText())&&document.querySelector('[data-act=refresh]').disabled));
await p.reload();await settle(14);limited=await st();
check('40.15 · rechargement : même pause et même cache, sans nouvel appel au fournisseur',meteoCalls===pausedCalls&&/CACHE/.test(limited.bar)&&/fournisseur météo limité/.test(limited.bar)&&!limited.busy,JSON.stringify(limited));
// Le fournisseur répond de nouveau ; seul le minuteur existant relance la météo, sans clic.
fault=null;const resumeAt=await p.evaluate(()=>Date.now());
for(let k=1;k<=78;k++){TNOW=resumeAt+k*5e3;await p.clock.runFor(5e3);await p.waitForFunction(()=>!busy,null,{timeout:20000});}await settle(8);
const recovered=await st();
check('40.16 · après la pause : retour LIVE automatique, appels autorisés de nouveau',meteoCalls>pausedCalls&&/LIVE/.test(recovered.bar)&&recovered.hours===ref.hours&&!recovered.busy&&!/fournisseur météo limité/.test(recovered.bar),JSON.stringify(recovered));
console.log(rows.join('\n')+'\n\n'+(rows.length-fail)+'/'+rows.length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
await c.close();await b.close();process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);})();
