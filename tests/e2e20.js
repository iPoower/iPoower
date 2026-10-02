const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;',ctx);
const PW=fs.readFileSync('.passphrase','utf8').trim(), SP=process.env.SP;
const png=(r,g,b,a)=>{const {PNG}=(()=>{try{return require('pngjs')}catch(e){return {}}})();return null};
const PX=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:414,height:896},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Europe/Paris',colorScheme:'dark'});
const p=await c.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));const reqs={rv:0,tile:0,aq:0};
const html=fs.readFileSync('site/index.html','utf8');const now=Math.floor(Date.now()/600000)*600;
await p.route('**/*',r=>{const u=r.request().url();const J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('air-quality-api')){reqs.aq++;const q=new URL(u).searchParams;return J(ctx.ma(ctx.mk('doux',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0)));}
 if(u.includes('open-meteo.com')){const q=new URL(u).searchParams;const base=ctx.mk('doux',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);if(u.includes('ensemble'))return J(ctx.me(base));if(q.get('minutely_15'))return J(ctx.mn(base));return J(base);}
 if(u.includes('api.rainviewer.com')){reqs.rv++;return J({version:'2.0',host:'https://tilecache.rainviewer.com',radar:{past:Array.from({length:13},(_,k)=>({time:now-(12-k)*600,path:'/v2/radar/'+(now-(12-k)*600)}))}});}
 if(u.includes('tilecache.rainviewer.com')){reqs.tile++;return r.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:PX});}
 if(u.includes('arcgisonline.com')){reqs.esri=(reqs.esri||0)+1;if(process.env.ESRI_DOWN)return r.abort();return r.fulfill({status:200,contentType:'image/png',body:PX});}
 if(u.includes('tile.openstreetmap.org')){reqs.osm=(reqs.osm||0)+1;return r.fulfill({status:200,contentType:'image/png',body:PX});}
 if(u.includes('unpkg.com/leaflet@1.9.4/dist/leaflet.js'))return r.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:process.env.TAMPER?Buffer.concat([fs.readFileSync('node_modules/leaflet/dist/leaflet.js'),Buffer.from(';window.PWNED=1;')]):fs.readFileSync('node_modules/leaflet/dist/leaflet.js')});
 if(u.includes('unpkg.com/leaflet@1.9.4/dist/leaflet.css'))return r.fulfill({status:200,contentType:'text/css',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync('node_modules/leaflet/dist/leaflet.css')});
 if(u.includes('/race-control/obs.json'))return J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.includes('/race-control/sw.js'))return r.fulfill({status:200,contentType:'text/javascript',body:'//'});
 if(u.startsWith('https://ipoower.github.io/iPoower/race-control/'))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const U='https://ipoower.github.io/iPoower/race-control/';
await p.goto(U);await p.waitForTimeout(1200);
await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await p.waitForTimeout(3500);
const shot=async n=>{await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(400);await p.screenshot({path:SP+'/'+n+'.png'});};
console.log('ordre',await p.evaluate(()=>[...document.querySelectorAll('main > section, main > .grid2')].filter(x=>!x.hidden&&getComputedStyle(x).display!=='none').slice(0,4).map(x=>x.id).join(' ')));
console.log('briefing',await p.$eval('#secBrf',x=>x.innerText.replace(/\s+/g,' ').slice(0,400)));
await shot('v2-live');
await p.evaluate(()=>startDemo('froid'));await p.waitForTimeout(600);
await p.evaluate(()=>{S.work.ret='10:00';renderBrf();});await p.waitForTimeout(300);
console.log('briefing gel',await p.$eval('#secBrf',x=>x.innerText.replace(/\s+/g,' ').slice(0,500)));
await shot('v2-gel');await (await p.$('#secBrf')).screenshot({path:SP+'/v2-gel-card.png'});
await p.evaluate(()=>startDemo('pluie'));await p.waitForTimeout(600);await shot('v2-pluie');
await p.click('[data-act=view][data-v=meteo]');await p.waitForTimeout(600);await p.evaluate(()=>startDemo('froid'));await p.waitForTimeout(600);await shot('v2-meteo');
await p.emulateMedia({colorScheme:'light'});await p.evaluate(()=>{document.querySelector('[data-act=view][data-v=pneus]').click()});await p.waitForTimeout(600);await shot('v2-clair');
console.log('errors',e);await b.close();})();