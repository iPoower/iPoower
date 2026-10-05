// « 🚗 Je pars maintenant » : un seul état de trajet (automate LIVE) lu par le briefing et Analyse ; avant départ → en cours
// (sans GPS, hors ligne, après rechargement) → « ✅ Bien arrivé » : bilan mémorisé et historique thermique réutilisé.
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
const p=await c.newPage();await p.clock.install({time:T0});let hang=false,meteo=0,SCN='doux';const pending=[];
p.on('pageerror',e=>rows.push('ERR '+e.message));
const meteoReply=(r,u)=>{const J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
  const q=new URL(u).searchParams,lats=String(q.get('latitude')).split(','),lons=String(q.get('longitude')).split(','),one=i=>ctx.mk(SCN,{lat:+lats[i],lon:+lons[i]},'Europe/Paris',0);
  if(lats.length>1)return J(lats.map((_,i)=>one(i)));const base=one(0);return J(u.includes('ensemble')?ctx.me(base):q.get('minutely_15')?ctx.mn(base):base);};
await p.route('**/*',r=>{const u=r.request().url(),J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('open-meteo.com')){meteo++;if(hang){pending.push([r,u]);return;}return meteoReply(r,u);}
 if(u.includes('/race-control/calendar.sealed.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(SP+'/cal.fake.json','utf8')});
 if(u.includes('/race-control/obs.json'))return J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.startsWith(U)&&!/\.(js|json)$/.test(new URL(u).pathname))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const settle=async(n=8)=>{for(let i=0;i<n;i++){await p.clock.runFor(500);await p.waitForTimeout(120)}};
const tab=async v=>{await p.evaluate(v=>{UI.view=v;renderAll();},v);await settle(2);};
const txt=sel=>p.evaluate(sel=>{const el=document.querySelector(sel);return el&&!el.hidden?el.innerText.replace(/\s+/g,' '):'';},sel);
const login=async()=>{await p.goto(U);await p.clock.runFor(2500);await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await settle(14);};
await login();
// 1. avant départ : simulation prédictive dans Analyse, bouton global sur la carte du prochain trajet
await tab('analyse');let a=await txt('#secLab');
check('48.1 · Analyse avant départ : simulation du trajet (état probable, état estimé à l’arrivée)',/Avant départ/i.test(a)&&/probable au départ/.test(a)&&/État thermique estimé à l’arrivée/.test(a),a.slice(0,260));
await tab('pneus');const btn=p.locator('#secBrf [data-act=trip-start]').first();
check('48.2 · carte du prochain trajet : « 🚗 Je pars maintenant »',await btn.count()>0&&/Je pars maintenant/.test(await btn.innerText()));
const key=await btn.getAttribute('data-key');await btn.click();await settle(4);
let s=await p.evaluate(()=>({phase:LIVE.phase,key:LIVE.key,manual:!!LIVE.manual,store:localStorage.getItem('twrc.tripstart.v1')||'',brf:document.querySelector('#secBrf').innerText.replace(/\s+/g,' ')}));
check('48.3 · un clic : automate de trajet existant en « active », départ mémorisé (sans coordonnées du GPS absent)',s.phase==='active'&&s.key===key&&s.manual&&/"key"/.test(s.store),JSON.stringify(s).slice(0,300));
check('48.4 · briefing : trajet en cours, « ✅ Bien arrivé » proposé, plus de « Je pars maintenant »',/Trajet en cours/i.test(s.brf)&&/Bien arrivé/.test(s.brf)&&!/Je pars maintenant/.test(s.brf),s.brf.slice(0,240));
await tab('analyse');a=await txt('#secLab');
check('48.5 · Analyse LIVE : départ réel 14:00, progression, état du pneu',/Trajet en cours/i.test(a)&&/Départ réel : 14:00/.test(a)&&/Progression/.test(a)&&/EN ROULAGE/i.test(a),a.slice(0,300));
// 2. hors ligne, 20 min plus tard : progression au temps écoulé, analyse recalculée depuis le même état
await p.evaluate(()=>{window.__OFFLINE=true;window.dispatchEvent(new Event('offline'));});TNOW=T0+20*60e3;await p.clock.fastForward(20*60e3);await settle(6);await tab('analyse');
const a2=await txt('#secLab'),pr=t=>{const m=/Progression : ([\d,]+)/.exec(t);return m?+m[1].replace(',','.'):null;};
check('48.6 · hors ligne : trajet toujours en cours, progression qui avance (au temps écoulé, sans GPS)',/Trajet en cours/i.test(a2)&&pr(a2)>0&&/temps écoulé/.test(a2),a2.slice(0,300));
// 3. rechargement : le départ déclaré est conservé
await p.evaluate(()=>{window.__OFFLINE=false;});await p.reload();await settle(14);if(await p.locator('#unlockPw').count()){await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await settle(14);}
s=await p.evaluate(()=>({phase:LIVE.phase,key:LIVE.key}));check('48.7 · après rechargement : même trajet toujours en cours',s.phase==='active'&&s.key===key,JSON.stringify(s));
// 4. arrivée : bilan mémorisé, historique thermique repris au trajet suivant
await tab('pneus');await p.locator('#secBrf [data-act=trip-arrived]').first().click();await settle(4);await tab('analyse');a=await txt('#secLab');
const st=await p.evaluate(()=>({phase:LIVE.phase,end:localStorage.getItem('twrc.tripend.v1')||'',start:localStorage.getItem('twrc.tripstart.v1')}));
check('48.8 · « ✅ Bien arrivé » : trajet terminé, durée réelle et état thermique final estimé',st.phase==='idle'&&st.start===null&&/Trajet terminé/i.test(a)&&/\d+ min/.test(a)&&/État thermique final estimé/.test(a)&&/Confiance : (faible|moyenne)/.test(a),a.slice(0,320));
check('48.9 · historique thermique enregistré : Analyse repart de l’état d’arrivée (« À l’arrêt »), pas d’un pneu supposé froid',/À L’ARRÊT/i.test(a)&&!/HISTORIQUE INCONNU/i.test(a),a.slice(0,200));
console.log(rows.join('\n')+'\n\n'+(rows.length-fail)+'/'+rows.length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
await c.close();await b.close();process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);})();
