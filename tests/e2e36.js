// Hors connexion : cache météo local + agenda chiffré, aucun faux LIVE, redémarrage et reconnexion.
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');let ctx;
const T0=new Date('2026-10-03T14:00:00+02:00').getTime(),RD=Date,FD=class extends RD{constructor(...a){super(...(a.length?a:[T0]))}static now(){return T0}};
ctx={console,Math,Date:FD,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;',ctx);
const PW=fs.readFileSync('.passphrase','utf8').trim(),SP=process.env.SP,html=fs.readFileSync('site/index.html','utf8');
const U='https://ipoower.github.io/iPoower/race-control/',PX=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
let fail=0;const rows=[],check=(n,ok,d)=>{rows.push((ok?'✅':'❌')+' '+n+(d?' · '+d:''));if(!ok)fail++};
(async()=>{const b=await require('./lib/browser').launch(),c=await b.newContext({viewport:{width:414,height:896},isMobile:true,hasTouch:true,timezoneId:'Europe/Paris',colorScheme:'dark'});
await c.addInitScript(()=>{window.__OFFLINE=sessionStorage.getItem('__offline')==='1';Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!window.__OFFLINE});window.__setOffline=v=>{window.__OFFLINE=!!v;sessionStorage.setItem('__offline',v?'1':'0');window.dispatchEvent(new Event(v?'offline':'online'));};});
const p=await c.newPage();await p.clock.install({time:T0});let cut=false,external=0;
p.on('pageerror',e=>rows.push('ERR '+e.message));
await p.route('**/*',r=>{const u=r.request().url(),J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('open-meteo.com')){external++;if(cut)return r.abort();const q=new URL(u).searchParams,lats=String(q.get('latitude')).split(','),lons=String(q.get('longitude')).split(','),one=i=>ctx.mk('doux',{lat:+lats[i],lon:+lons[i]},'Europe/Paris',0);if(lats.length>1)return J(lats.map((_,i)=>one(i)));const base=one(0);return J(u.includes('ensemble')?ctx.me(base):q.get('minutely_15')?ctx.mn(base):base);}
 if(u.includes('api.bigdatacloud.net')||u.includes('public.opendatasoft.com')||u.includes('api.rainviewer.com')||u.includes('router.project-osrm.org')){external++;return cut?r.abort():J(u.includes('api.bigdatacloud.net')?{locality:'Ville test'}:u.includes('api.rainviewer.com')?{version:'2.0',host:'https://tilecache.rainviewer.com',radar:{past:[]}}:{records:[]});}
 if(/tilecache\.rainviewer|arcgisonline|tile\.openstreetmap/.test(u))return r.fulfill({status:200,contentType:'image/png',body:PX});
 if(u.includes('leaflet/1.9.4/leaflet.js'))return r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync('node_modules/leaflet/dist/leaflet.js')});
 if(u.includes('leaflet/1.9.4/leaflet.css'))return r.fulfill({status:200,contentType:'text/css',body:fs.readFileSync('node_modules/leaflet/dist/leaflet.css')});
 if(u.includes('/race-control/calendar.sealed.json'))return cut?r.abort():r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(SP+'/cal.fake.json','utf8')});
 if(u.includes('/race-control/obs.json'))return cut?r.abort():J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.includes('/race-control/sw.js'))return r.fulfill({status:200,contentType:'text/javascript',body:'// test'});
 if(u.startsWith(U))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const settle=async(n=8)=>{for(let i=0;i<n;i++){await p.clock.runFor(500);await p.waitForTimeout(120)}};
await p.goto(U);await p.clock.runFor(2500);await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await settle(14);
let t=await p.locator('body').innerText();
const cached=await p.evaluate(()=>({weather:Object.keys(localStorage).some(k=>k.startsWith('twrc.cache.')),cal:!!localStorage.getItem('twrc.calendar.sealed.v1')}));
check('36.1 · en ligne : météo + agenda chiffré mis en cache',cached.weather&&cached.cal&&/Assurance/.test(t),JSON.stringify(cached));
await p.evaluate(()=>{ if (CAL) { CAL.updated = new Date(Date.now() - 65 * 60e3).toISOString(); renderCal(); } }); await settle(2); t=await p.locator('body').innerText();
check('36.1b · relais Agenda vieux : retard explicite, jamais présenté comme prévision fraîche',/Agenda/.test(t)&&/relais/i.test(t)&&/1 h/.test(t)&&!/Google Agenda · prévision/.test(t),t.slice(0,220));
check('36.1c · observations relais sans horodatage fiable : ignorées',await p.evaluate(()=>OBS===null));
const tripOnly=await p.evaluate(()=>{
  const s=addMin(liveNow(),30), e=addMin(s,15);
  CAL.events.push({id:'event-tech-no-place',t:'Rappel technique sans trajet',s,e,allDay:false,loc:'',lat:null,lon:null,label:null,mode:null,legs:[]});
  CAL.events.push({id:'event-tech-bad-place',t:'Rendez-vous adresse à corriger',s:addMin(s,30),e:addMin(e,30),allDay:false,loc:'Adresse fictive introuvable',lat:null,lon:null,label:null,mode:null,legs:[]});
  renderCal();
  const x=document.querySelector('#secCal').innerText;
  return !x.includes('Rappel technique sans trajet')&&!x.includes('Rendez-vous adresse à corriger')&&/1 rendez-vous au lieu non reconnu masqué/.test(x)&&/1 rappel sans lieu masqué/.test(x);
});
check('36.1d · Agenda trajets : rappel sans lieu masqué, lieu non reconnu masqué mais compté (sans titre)',tripOnly);

cut=true;const before=external;await p.evaluate(()=>window.__setOffline(true));await settle(3);t=await p.locator('body').innerText();
check('36.2 · perte réseau : HORS LIGNE, jamais LIVE, données conservées',/HORS LIGNE/.test(t)&&!/\bLIVE\b/.test((await p.locator('#statusbar').innerText()))&&/Assurance/.test(t));

await p.evaluate(()=>refreshAll());await settle(2);
check('36.3 · actualiser hors ligne : aucun appel externe',external===before,external+' vs '+before);

await p.reload();await settle(10);t=await p.locator('body').innerText();
check('36.4 · redémarrage hors ligne : météo cache + agenda chiffré encore utilisables',/HORS LIGNE/.test(t)&&/Assurance/.test(t)&&/cache/i.test(t));

cut=false;await p.evaluate(()=>window.__setOffline(false));await settle(16);t=await p.locator('#statusbar').innerText();
check('36.5 · retour réseau : reconnexion et retour LIVE automatique',/LIVE/.test(t),t.slice(0,120));

console.log(rows.join('\n')+'\n\n'+(rows.length-fail)+'/'+rows.length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
await c.close();await b.close();process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);})();
