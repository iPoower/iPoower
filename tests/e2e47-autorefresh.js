// Actualisation automatique « auto 5 min » : sans clic, la nouvelle météo du fournisseur atteint les quatre onglets
// (Pneus, Météo, Tenue, Analyse), y compris ceux qui étaient masqués pendant l'actualisation ; l'étiquette suit la donnée affichée.
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
const tab=async v=>{await p.evaluate(v=>{UI.view=v;renderAll();},v);await settle(2);return p.evaluate(v=>{const sel={pneus:'#secCars',meteo:'#secWx',tenue:'#secTenue',analyse:'#secLab'}[v],el=document.querySelector(sel);return el&&!el.hidden?el.innerText.replace(/\s+/g,' '):'';},v);};
const bar=()=>p.evaluate(()=>document.querySelector('#statusbar').innerText.replace(/\s+/g,' '));
await p.goto(U);await p.clock.runFor(2500);await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await settle(14);
const V=['pneus','meteo','tenue','analyse'],before={};for(const v of V)before[v]=await tab(v);
check('47.1 · état initial : les quatre onglets affichés en LIVE',V.every(v=>before[v].length>40)&&/LIVE/.test(await bar())&&/14:00/.test(await bar()),V.map(v=>v+':'+before[v].length).join(' '));
// le fournisseur change de temps ; on reste sur Pneus (Météo, Tenue et Analyse masqués) et on laisse seulement passer le temps
await tab('pneus');SCN='froid';const m0=meteo;const T1=T0+6*60e3;TNOW=T1;await p.clock.fastForward(6*60e3);await settle(10);   // saut jusqu'à l'échéance, puis temps court : les délais d'expiration réseau ne sont pas sautés
const b1=await bar(),pneusNow=await p.evaluate(()=>document.querySelector('#secCars').innerText.replace(/\s+/g,' '));
check('47.2 · sans clic : le minuteur relance l’actualisation (nouvelles requêtes météo)',meteo>m0,`${m0} → ${meteo}`);
check('47.3 · « Dernière mise à jour » = heure de la donnée du lieu affiché (14:06)',/LIVE/.test(b1)&&/14:06/.test(b1),b1);
check('47.4 · Pneus (onglet visible) recalculé avec la nouvelle météo',pneusNow!==before.pneus,pneusNow.slice(0,160));
for(const v of ['meteo','tenue','analyse']){const now=await tab(v);const strip=x=>x.replace(/\d{1,2}[:h]\d{2}|\d+ ?min|LIVE|FRESH|CACHE/gi,'');check(`47.5 · ${v} (masqué pendant l’actualisation) : nouvelle météo utilisée dès l’ouverture`,now.length>40&&strip(now)!==strip(before[v]),now.slice(0,160));}
const ten=await tab('tenue');check('47.7 · Tenue : météo des rendez-vous de l’agenda renouvelée au même cycle (ressenti 20 °C → frais)',/Ressenti/.test(before.tenue)&&/Ressenti 19,/.test(before.tenue)&&!/Ressenti 19,/.test(ten),ten.slice(0,240));
const one=await p.evaluate(()=>{const m=M[UI.loc],i=m.nowI,car=labCar(),r=car&&tyreLab(labInput(car));return{shared:CX&&CX.m===m,T:m.hs[i].T,Tr:m.hs[i].Tr,labT:r&&r.env?r.env.Tenv:null,labOk:!!(r&&r.thermal&&r.press&&r.grip&&r.confidence)};});
check('47.6 · un seul état : Météo, Pneus et Analyse lisent le même modèle (CX.m = M[lieu])',one.shared&&one.labOk,JSON.stringify(one));
console.log(rows.join('\n')+'\n\n'+(rows.length-fail)+'/'+rows.length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
await c.close();await b.close();process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);})();
