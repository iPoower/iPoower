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
 if(u.includes('api.open-meteo.com')&&new URL(u).searchParams.get('latitude').includes(',')){const q=new URL(u).searchParams,la=q.get('latitude').split(','),lo=q.get('longitude').split(',');return J(la.map((x,k)=>ctx.mk(process.env.MIXED&&k===2?'froid':(process.env.SCN||'doux'),{lat:+x,lon:+lo[k]},'Europe/Paris',0)));}
 if(u.includes('open-meteo.com')){const q=new URL(u).searchParams;const base=ctx.mk('doux',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);if(u.includes('ensemble'))return J(ctx.me(base));if(q.get('minutely_15'))return J(ctx.mn(base));return J(base);}
 if(u.includes('api.rainviewer.com')){reqs.rv++;return J({version:'2.0',host:'https://tilecache.rainviewer.com',radar:{past:Array.from({length:13},(_,k)=>({time:now-(12-k)*600,path:'/v2/radar/'+(now-(12-k)*600)}))}});}
 if(u.includes('tilecache.rainviewer.com')){reqs.tile++;return r.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:PX});}
 if(u.includes('arcgisonline.com')){reqs.esri=(reqs.esri||0)+1;if(process.env.ESRI_DOWN)return r.abort();return r.fulfill({status:200,contentType:'image/png',body:PX});}
 if(u.includes('tile.openstreetmap.org')){reqs.osm=(reqs.osm||0)+1;return r.fulfill({status:200,contentType:'image/png',body:PX});}
 if(u.includes('unpkg.com/leaflet@1.9.4/dist/leaflet.js'))return r.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:process.env.TAMPER?Buffer.concat([fs.readFileSync('node_modules/leaflet/dist/leaflet.js'),Buffer.from(';window.PWNED=1;')]):fs.readFileSync('node_modules/leaflet/dist/leaflet.js')});
 if(u.includes('unpkg.com/leaflet@1.9.4/dist/leaflet.css'))return r.fulfill({status:200,contentType:'text/css',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync('node_modules/leaflet/dist/leaflet.css')});
 if(u.includes('/race-control/calendar.sealed.json'))return process.env.NOCAL?r.fulfill({status:404,body:''}):r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(process.env.SP+'/'+(process.env.CALF||'cal.json'),'utf8')});
 if(u.includes('/race-control/obs.json'))return J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.includes('/race-control/sw.js'))return r.fulfill({status:200,contentType:'text/javascript',body:'//'});
 if(u.startsWith('https://ipoower.github.io/iPoower/race-control/'))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const U='https://ipoower.github.io/iPoower/race-control/';
await p.goto(U);await p.waitForTimeout(1200);
await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await p.waitForTimeout(12000);
const txt=()=>p.$eval('#secCal',x=>x.innerText.replace(/\s+/g,' '));
let A1=await txt();console.log('AVANT :',A1.slice(0,1500));
console.log('critique :',(A1.match(/Tronçon critique[^⚠]*?\)/g)||[]).slice(0,2));
await p.click('[data-act=caldirect]');await p.waitForTimeout(4000);
let B1=await txt();console.log('APRÈS enchaînement :',B1.slice(0,1100));
console.log('réglage', await p.evaluate(()=>JSON.stringify(S.calDirect)));
await (await p.$('#secCal')).screenshot({path:SP+'/alt.png'});
await p.reload();await p.waitForTimeout(9000);console.log('après rechargement, toujours enchaîné :',/Enchaîné directement/.test(await txt()));
await p.click('[data-act=caldirect]');await p.waitForTimeout(1500);console.log('retour maison rétabli :',/retour maison supposé/.test(await txt()));
console.log('errors',e);await b.close();})();