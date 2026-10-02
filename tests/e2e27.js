const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');let ctx;
const mkCtx=T0=>{const RD=Date;const FD=class extends RD{constructor(...a){super(...(a.length?a:[T0]))} static now(){return T0}};ctx={console,Math,Date:FD,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;',ctx);};
const PW=fs.readFileSync('.passphrase','utf8').trim(), SP=process.env.SP;
const png=(r,g,b,a)=>{const {PNG}=(()=>{try{return require('pngjs')}catch(e){return {}}})();return null};
const PX=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
(async()=>{const b=await require('./lib/browser').launch();
const SC=[
 ['ordi · Sam. 16:10 agenda en cours','2026-10-03T16:10:00+02:00',1,'doux'],
 ['ordi · Lun. 05:30 trajet boulot','2026-10-05T05:30:00+02:00',1,'doux'],
 ['ordi · Sam. 05:00 froid (point critique)','2026-10-03T05:00:00+02:00',1,'froid'],
 ['iPhone · Sam. 16:10 carte fermée puis ouverte','2026-10-03T16:10:00+02:00',0,'doux']];
let okN=0;const e=[];
for(const [lbl,iso,W,scn] of SC){const SCN=scn||'doux';const T0=new Date(iso).getTime();mkCtx(T0);
const c=await b.newContext({viewport:W?{width:1160,height:900}:{width:414,height:896},deviceScaleFactor:W?1:2,isMobile:!W,hasTouch:!W,timezoneId:'Europe/Paris',colorScheme:'dark'});
const p=await c.newPage();await p.clock.install({time:T0});p.on('pageerror',x=>e.push(lbl+': '+x.message));const reqs={rv:0,tile:0,aq:0};
const html=fs.readFileSync('site/index.html','utf8');const now=Math.floor(T0/600000)*600;
await p.route('**/*',r=>{const u=r.request().url();const J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('air-quality-api')){reqs.aq++;const q=new URL(u).searchParams;return J(ctx.ma(ctx.mk(SCN,{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0)));}
 if(u.includes('open-meteo.com')){if(!u.includes('ensemble')&&!new URL(u).searchParams.get('minutely_15')&&!u.includes('meteofrance'))reqs.fc=(reqs.fc||0)+1;const q=new URL(u).searchParams;const base=ctx.mk(SCN,{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);if(u.includes('ensemble'))return J(ctx.me(base));if(q.get('minutely_15'))return J(ctx.mn(base));return J(base);}
 if(u.includes('api.rainviewer.com')){reqs.rv++;return J({version:'2.0',host:'https://tilecache.rainviewer.com',radar:{past:Array.from({length:13},(_,k)=>({time:now-(12-k)*600,path:'/v2/radar/'+(now-(12-k)*600)}))}});}
 if(u.includes('tilecache.rainviewer.com')){reqs.tile++;return r.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:PX});}
 if(u.includes('arcgisonline.com')){reqs.esri=(reqs.esri||0)+1;if(process.env.ESRI_DOWN)return r.abort();return r.fulfill({status:200,contentType:'image/png',body:PX});}
 if(u.includes('tile.openstreetmap.org')){reqs.osm=(reqs.osm||0)+1;return r.fulfill({status:200,contentType:'image/png',body:PX});}
 if(u.includes('cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'))return r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync('node_modules/leaflet/dist/leaflet.js')});
 if(u.includes('cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'))return r.fulfill({status:200,contentType:'text/css',body:fs.readFileSync('node_modules/leaflet/dist/leaflet.css')});
 if(u.includes('unpkg.com/leaflet@1.9.4/dist/leaflet.js')){reqs.lf=(reqs.lf||0)+1;return r.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync('node_modules/leaflet/dist/leaflet.js')});}
 if(u.includes('unpkg.com/leaflet@1.9.4/dist/leaflet.css'))return r.fulfill({status:200,contentType:'text/css',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync('node_modules/leaflet/dist/leaflet.css')});
 if(u.includes('router.project-osrm.org')){reqs.osrm=(reqs.osrm||[]);reqs.osrm.push(u.split('/driving/')[1].split('?')[0]);const m=/driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/.exec(u);const a=[+m[1],+m[2]],q=[+m[3],+m[4]];return J({routes:[{geometry:{coordinates:[...Array(30)].map((_,k)=>[a[0]+(q[0]-a[0])*k/29+Math.sin(k/4)*0.02,a[1]+(q[1]-a[1])*k/29])}}]});}
 if(u.includes('/race-control/calendar.sealed.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(SP+'/cal.fake.json','utf8')});
 if(u.includes('/race-control/obs.json'))return J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.includes('/race-control/sw.js'))return r.fulfill({status:200,contentType:'text/javascript',body:'//'});
 if(u.startsWith('https://ipoower.github.io/iPoower/race-control/'))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const U='https://ipoower.github.io/iPoower/race-control/';
await p.goto(U);await p.clock.runFor(3000);
await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);for(let k=0;k<60;k++){if(await p.evaluate(()=>typeof CAL!=='undefined'&&!!CAL).catch(()=>false))break;await p.clock.runFor(200);await p.waitForTimeout(300);}
await p.waitForFunction(()=>typeof CALDONE!=='undefined'&&CALDONE,null,{timeout:20000}).catch(()=>console.log('   (agenda non lu en 20 s)'));await p.waitForTimeout(300);for(let k=0;k<40;k++){const busy=await p.$eval('#secBrf',x=>/⏳/.test(x.innerText)).catch(()=>false);if(!busy)break;await p.clock.runFor(500);await p.waitForTimeout(250);}const st=async()=>p.evaluate(()=>{const n=document.querySelector('#secBrf .tmap');return{leaflet:!!window.L,map:!!n,inW:!!document.querySelector('#tmapW .tmap'),inM:!!document.querySelector('#tmapM .tmap'),wVisible:!!document.querySelector('#tmapW')&&getComputedStyle(document.querySelector('#tmapW')).display!=='none',lines:n?n.querySelectorAll('.leaflet-overlay-pane path').length:0,badge:n&&n.querySelector('.tmap-b')?n.querySelector('.tmap-b').textContent:'',btn:document.querySelector('[data-act=tripmap]')?getComputedStyle(document.querySelector('[data-act=tripmap]')).display!=='none':false,gauge:!!document.querySelector('#secBrf .gauge'),kpis:document.querySelectorAll('#secBrf .kpi').length}});
const settle=async()=>{for(let k=0;k<40;k++){await p.clock.runFor(400);await p.waitForTimeout(250);const busy=await p.$eval('#secBrf',x=>/⏳/.test(x.innerText)||(!!x.querySelector('.tmap')&&!x.querySelector('.tmap .leaflet-overlay-pane path'))).catch(()=>false);if(!busy&&k>=6)break;}};
await settle();let s=await st();
const head=await p.$eval('#secBrf .brf-h',x=>x.innerText.replace(/\s+/g,' '));
let ok;
if(W){ok=s.inW&&s.lines>=3&&s.gauge&&s.kpis===5&&!s.btn;
 if(SCN==='froid'){ok=ok&&s.lines>=4;}else ok=ok&&s.lines===3;
}else{const before=s;ok=!before.leaflet&&!before.map&&before.btn&&before.gauge&&before.kpis===5&&!before.wVisible;console.log('   iPhone avant ouverture :',JSON.stringify(before),'| requêtes Leaflet :',reqs.lf||0);
 await p.click('[data-act=tripmap]');await settle();s=await st();ok=ok&&s.inM&&s.lines>=3;
 await p.reload();await p.clock.runFor(8000);await p.waitForTimeout(1200);await p.waitForFunction(()=>typeof CALDONE!=='undefined'&&CALDONE,null,{timeout:20000}).catch(()=>{});await settle();const s2=await st();console.log('   après rechargement (carte restée ouverte) :',s2.inM);ok=ok&&s2.inM;}
if(reqs.osrm)console.log('   appel OSRM depuis le téléphone :',reqs.osrm.join(' | '),'| coordonnées arrondies à 0,01° :',reqs.osrm.every(x=>x.split(/[;,]/).every(v=>/^-?\d+(\.\d{1,2})?$/.test(v))));
if(ok)okN++;console.log((ok?'✅':'❌')+' '+lbl+' | '+head+'\n   '+JSON.stringify(s));
await (await p.$('#secBrf')).screenshot({path:SP+'/map-'+SC.findIndex(x=>x[0]===lbl)+'.png'});
await c.close();}
console.log(okN+'/'+SC.length+' scénarios OK · erreurs JS :',e.length?e:'aucune');await b.close();})();