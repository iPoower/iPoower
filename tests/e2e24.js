const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');let ctx;
const mkCtx=T0=>{const RD=Date;const FD=class extends RD{constructor(...a){super(...(a.length?a:[T0]))} static now(){return T0}};ctx={console,Math,Date:FD,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;',ctx);};
const PW=fs.readFileSync('.passphrase','utf8').trim(), SP=process.env.SP;
const png=(r,g,b,a)=>{const {PNG}=(()=>{try{return require('pngjs')}catch(e){return {}}})();return null};
const PX=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const SC=[['Ven. 17:00 (TT, après le retour)','2026-10-02T17:00:00+02:00','aller','lun.','06:30'],['Ven. 10:00 (TT)','2026-10-02T10:00:00+02:00','aller','lun.','06:30'],
 ['Jeu. 07:00 (TT)','2026-10-01T07:00:00+02:00','aller','lun.','06:30'],['Sam. 10:00','2026-10-03T10:00:00+02:00','aller','lun.','06:30'],['Dim. 21:00','2026-10-04T21:00:00+02:00','aller','demain','06:30'],
 ['Lun. 05:30','2026-10-05T05:30:00+02:00','aller','aujourd’hui','06:30'],['Lun. 10:00','2026-10-05T10:00:00+02:00','retour','aujourd’hui','16:00'],['Mer. 17:00','2026-10-07T17:00:00+02:00','aller','lun.','06:30']];
let ok=0;const e=[];
for(const [lbl,iso,dir,day,hh] of SC){const T0=new Date(iso).getTime();mkCtx(T0);
const c=await b.newContext({viewport:{width:414,height:896},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Europe/Paris',colorScheme:'dark'});
const p=await c.newPage();await p.clock.install({time:T0});p.on('pageerror',x=>e.push(lbl+': '+x.message));const reqs={rv:0,tile:0,aq:0};
const html=fs.readFileSync('site/index.html','utf8');const now=Math.floor(T0/600000)*600;
await p.route('**/*',r=>{const u=r.request().url();const J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('air-quality-api')){reqs.aq++;const q=new URL(u).searchParams;return J(ctx.ma(ctx.mk('doux',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0)));}
 if(u.includes('open-meteo.com')){if(!u.includes('ensemble')&&!new URL(u).searchParams.get('minutely_15')&&!u.includes('meteofrance'))reqs.fc=(reqs.fc||0)+1;const q=new URL(u).searchParams;const base=ctx.mk('doux',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);if(u.includes('ensemble'))return J(ctx.me(base));if(q.get('minutely_15'))return J(ctx.mn(base));return J(base);}
 if(u.includes('api.rainviewer.com')){reqs.rv++;return J({version:'2.0',host:'https://tilecache.rainviewer.com',radar:{past:Array.from({length:13},(_,k)=>({time:now-(12-k)*600,path:'/v2/radar/'+(now-(12-k)*600)}))}});}
 if(u.includes('tilecache.rainviewer.com')){reqs.tile++;return r.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:PX});}
 if(u.includes('arcgisonline.com')){reqs.esri=(reqs.esri||0)+1;if(process.env.ESRI_DOWN)return r.abort();return r.fulfill({status:200,contentType:'image/png',body:PX});}
 if(u.includes('tile.openstreetmap.org')){reqs.osm=(reqs.osm||0)+1;return r.fulfill({status:200,contentType:'image/png',body:PX});}
 if(u.includes('cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'))return r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync('node_modules/leaflet/dist/leaflet.js')});
 if(u.includes('cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'))return r.fulfill({status:200,contentType:'text/css',body:fs.readFileSync('node_modules/leaflet/dist/leaflet.css')});
 if(u.includes('/race-control/obs.json'))return J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.includes('/race-control/sw.js'))return r.fulfill({status:200,contentType:'text/javascript',body:'//'});
 if(u.startsWith('https://ipoower.github.io/iPoower/race-control/'))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const U='https://ipoower.github.io/iPoower/race-control/';
await p.goto(U);await p.clock.runFor(3000);
await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);for(let k=0;k<60;k++){if(await p.evaluate(()=>typeof CAL!=='undefined'&&(!!CAL||CALDONE)).catch(()=>false))break;await p.clock.runFor(200);await p.waitForTimeout(300);}await p.clock.runFor(1500);await p.waitForTimeout(800);
await p.waitForFunction(()=>typeof CALDONE!=='undefined'&&CALDONE,null,{timeout:20000}).catch(()=>{});await p.waitForTimeout(300);const h=await p.$eval('#secBrf',x=>x.innerText.replace(/\s+/g,' ')).catch(()=>'(absent)');
const dayBtns=await p.$$eval('#secBrief [data-act=day]',x=>x.map(y=>y.textContent+(y.getAttribute('aria-pressed')==='true'?'*':''))).catch(()=>[]);
const H=h.toLowerCase(),pass=(H.includes((dir==='aller'?'aller':'retour')+' domicile-travail')||(dir==='aller'&&H.includes('prochain trajet domicile-travail')))&&H.includes(day)&&H.includes(hh)&&!dayBtns.some(x=>/NaN|ndefined/.test(x));if(pass)ok++;
console.log((pass?'✅':'❌')+' '+lbl.padEnd(32)+' → '+h+' | jours : '+dayBtns.join(' '));
if(lbl.startsWith('Mer.')){
 // réglage : on coche jeudi -> le prochain aller devient demain (jeu.) ; persistance après rechargement ; puis on décoche
 await p.evaluate(()=>{document.getElementById('settings').open=true;});await p.clock.runFor(800);
 const btn=await p.$('[data-act=wday][data-d="4"]');console.log('   bouton jeudi présent :',!!btn,'| état :',await p.$$eval('[data-act=wday]',x=>x.map(y=>y.textContent+(y.getAttribute('aria-pressed')==='true'?'✓':'')).join(' ')));
 if(btn){await btn.click();await p.clock.runFor(1500);const h2=await p.$eval('#secBrf',x=>x.innerText.replace(/\s+/g,' '));console.log((h2.includes('demain')?'✅':'❌')+' jeudi coché → '+h2);
  await p.reload();await p.clock.runFor(8000);await p.waitForTimeout(1200);const h3=await p.$eval('#secBrf',x=>x.innerText.replace(/\s+/g,' '));console.log((h3.includes('demain')?'✅':'❌')+' après rechargement → '+h3);
  await p.evaluate(()=>{document.getElementById('settings').open=true;});await p.clock.runFor(800);await p.click('[data-act=wday][data-d="4"]');await p.clock.runFor(1500);
  const h4=await p.$eval('#secBrf',x=>x.innerText.replace(/\s+/g,' '));console.log((h4.includes('lun.')?'✅':'❌')+' jeudi décoché → '+h4);
  for(const d of [1,2,3]){await p.click('[data-act=wday][data-d="'+d+'"]');await p.clock.runFor(300);}
  console.log('   tout décocher : il reste',await p.$$eval('[data-act=wday][aria-pressed=true]',x=>x.length),'jour(s) coché(s) (minimum 1)');
  const sec=await p.$('.wdays');if(sec){await sec.scrollIntoViewIfNeeded();await (await p.$('.wdays')).evaluate(x=>x.closest('.set-sec').scrollIntoView());await p.screenshot({path:SP+'/wdays.png'});}
 }
}
await c.close();}
console.log(ok+'/'+SC.length+' scénarios OK · erreurs JS :',e.length?e:'aucune');await b.close();})();