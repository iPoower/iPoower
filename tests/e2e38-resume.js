// Reprise après suspension iOS : aucune donnée vieillie présentée comme LIVE, « maintenant » = horloge,
// une seule actualisation malgré plusieurs signaux de reprise, retour LIVE automatique quand le réseau répond.
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');
const T0=new Date('2026-10-03T14:00:00+02:00').getTime(),H6=T0+6*3600e3;let TNOW=T0;   // heure des réponses simulées du fournisseur
const RD=Date,FD=class extends RD{constructor(...a){super(...(a.length?a:[TNOW]))}static now(){return TNOW}};
const ctx={console,Math,Date:FD,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;',ctx);
const PW=fs.readFileSync('.passphrase','utf8').trim(),SP=process.env.SP,html=fs.readFileSync('site/index.html','utf8');
const U='https://ipoower.github.io/iPoower/race-control/';
let fail=0;const rows=[],check=(n,ok,d)=>{rows.push((ok?'✅':'❌')+' '+n+(d?' · '+d:''));if(!ok)fail++};
(async()=>{const b=await require('./lib/browser').launch(),c=await b.newContext({viewport:{width:414,height:896},isMobile:true,hasTouch:true,timezoneId:'Europe/Paris'});
await c.addInitScript(()=>{window.__OFFLINE=false;Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!window.__OFFLINE});});
const p=await c.newPage();await p.clock.install({time:T0});let hang=false,meteo=0,obsUpdated=null;const pending=[];
p.on('pageerror',e=>rows.push('ERR '+e.message));
const meteoReply=(r,u)=>{const J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  const q=new URL(u).searchParams,lats=String(q.get('latitude')).split(','),lons=String(q.get('longitude')).split(','),one=i=>ctx.mk('doux',{lat:+lats[i],lon:+lons[i]},'Europe/Paris',0);
  if(lats.length>1)return J(lats.map((_,i)=>one(i)));const base=one(0);return J(u.includes('ensemble')?ctx.me(base):q.get('minutely_15')?ctx.mn(base):base);};
await p.route('**/*',r=>{const u=r.request().url(),J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('open-meteo.com')){meteo++;if(hang){pending.push([r,u]);return;}return meteoReply(r,u);}
 if(u.includes('/race-control/calendar.sealed.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(SP+'/cal.fake.json','utf8')});
 if(u.includes('/race-control/obs.json'))return J(obsUpdated?{stations:{},updated:obsUpdated}:{stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.startsWith(U)&&!/\.(js|json)$/.test(new URL(u).pathname))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const settle=async(n=8)=>{for(let i=0;i<n;i++){await p.clock.runFor(500);await p.waitForTimeout(120)}};
const st=()=>p.evaluate(()=>({bar:document.querySelector('#statusbar').innerText.replace(/\s+/g,' '),now:M[UI.loc]&&M[UI.loc].nowStr,mode:M[UI.loc]&&M[UI.loc].mode,busy}));
const resume=()=>p.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('focus'));});
await p.goto(U);await p.clock.runFor(2500);await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await settle(14);
let s=await st();check('38.1 · en ligne : LIVE, maintenant = 14:00',/LIVE/.test(s.bar)&&s.now==='2026-10-03T14:00',JSON.stringify(s));

// iOS a gelé l'app 6 h (aucun minuteur exécuté) ; au retour, le réseau met longtemps à répondre
hang=true;await p.clock.setSystemTime(H6);TNOW=H6;const m0=meteo;await resume();await p.clock.runFor(1000);await p.waitForTimeout(300);s=await st();
check('38.2 · reprise après 6 h, réseau lent : jamais LIVE, données datées',!/LIVE/.test(s.bar)&&/CACHE/.test(s.bar)&&/14:00/.test(s.bar)&&s.mode==='cache',JSON.stringify(s));
check('38.3 · reprise : « maintenant » = horloge (20:00), pas l’heure des données',s.now==='2026-10-03T20:00',s.now);
check('38.4 · actualisation visible pendant la synchronisation',s.busy&&/actualisation/.test(s.bar),s.bar);
const m1=meteo;await resume();await p.evaluate(()=>{refreshAll();refreshAll();autoTick();});await p.clock.runFor(1000);await p.waitForTimeout(200);
check('38.5 · signaux de reprise et actualisations multiples : une seule vague de requêtes',m1>m0&&meteo===m1,`${m0} → ${m1} → ${meteo}`);

// le réseau répond enfin : retour LIVE automatique, sans recharger la page
hang=false;pending.splice(0).forEach(([r,u])=>meteoReply(r,u));await settle(10);s=await st();
check('38.6 · réponses arrivées : LIVE, MAJ 20:00, maintenant 20:00',/LIVE/.test(s.bar)&&/20:00/.test(s.bar)&&s.now==='2026-10-03T20:00'&&!s.busy,JSON.stringify(s));

// réseau coupé pendant la suspension, sans événement « offline » (iOS ne le garantit pas)
await p.evaluate(()=>{window.__OFFLINE=true;});await p.clock.setSystemTime(H6+3*3600e3);TNOW=H6+3*3600e3;await resume();await p.clock.runFor(1000);await p.waitForTimeout(300);s=await st();
check('38.7 · reprise hors ligne sans événement : jamais LIVE, maintenant = horloge (23:00)',!/LIVE/.test(s.bar)&&s.now==='2026-10-03T23:00',JSON.stringify(s));

// retour en ligne : LIVE à 23:00 ; puis l'horloge de l'APPAREIL est reculée de 3 h (réglage manuel, correction réseau fautive).
// Le fournisseur, lui, garde l'heure réelle (23:00) : seul l'appareil se trompe.
await p.evaluate(()=>{window.__OFFLINE=false;});await resume();await settle(10);s=await st();
check('38.8 · retour en ligne : LIVE, maintenant 23:00',/LIVE/.test(s.bar)&&s.now==='2026-10-03T23:00',JSON.stringify(s));
hang=true;const H9=H6+3*3600e3,m2=meteo;await p.clock.setSystemTime(H6);await p.clock.runFor(31e3);await p.waitForTimeout(300);s=await st();
check('38.9 · horloge appareil reculée de 3 h : jamais LIVE (fraîcheur invérifiable), maintenant = horloge (20:00)',!/LIVE/.test(s.bar)&&/CACHE/.test(s.bar)&&s.mode==='cache'&&s.now==='2026-10-03T20:00',JSON.stringify(s));
check('38.10 · horloge reculée : l’actualisation automatique n’attend pas 3 h, elle repart aussitôt',meteo>m2,`${m2} → ${meteo}`);
hang=false;pending.splice(0).forEach(([r,u])=>meteoReply(r,u));await settle(10);s=await st();let err=await p.evaluate(()=>ERR[UI.loc]||null);
check('38.11 · réponses du fournisseur reçues : acceptées sans erreur, mais toujours jamais LIVE (heure appareil douteuse)',!s.busy&&!err&&!/LIVE/.test(s.bar)&&s.mode==='cache',JSON.stringify({...s,err}));
TNOW=H9+6*60e3;await p.clock.setSystemTime(TNOW);await resume();await settle(12);s=await st();   // horloge corrigée : 23:06 (plus de 5 min après le dernier vrai succès de 23:00)
check('38.12 · horloge corrigée (23:06) : retour LIVE automatique, MAJ 23:06',/LIVE/.test(s.bar)&&/23:06/.test(s.bar)&&s.mode==='live'&&s.now==='2026-10-03T23:06',JSON.stringify(s));

// obs.json : une date « updated » dans le futur n'est jamais « fraîche » ; une date récente l'est
const obsState=()=>p.evaluate(()=>({kept:OBS!==null,at:RELAY_AT,diag:freshState(ageOf(RELAY_AT)),age:relayAgeMin(RELAY_AT)}));
obsUpdated=new Date(TNOW+3*3600e3).toISOString();await p.evaluate(()=>{refreshAll(true);});await settle(8);let o=await obsState();
check('38.13 · relais daté de +3 h : observations ignorées, diagnostic UNAVAILABLE (jamais FRESH)',!o.kept&&o.diag==='UNAVAILABLE'&&o.age===Infinity,JSON.stringify(o));
obsUpdated='2099-01-01T00:00:00Z';await p.evaluate(()=>{refreshAll(true);});await settle(8);o=await obsState();
check('38.14 · relais daté de 2099 : observations ignorées',!o.kept&&o.diag==='UNAVAILABLE',JSON.stringify(o));
obsUpdated=new Date(TNOW-5*60e3).toISOString();await p.evaluate(()=>{refreshAll(true);});await settle(8);o=await obsState();
check('38.15 · relais daté de −5 min (témoin) : observations conservées, FRESH',o.kept&&o.diag==='FRESH'&&o.age>=4.9&&o.age<6,JSON.stringify(o));

console.log(rows.join('\n')+'\n\n'+(rows.length-fail)+'/'+rows.length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
await c.close();await b.close();process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);})();
