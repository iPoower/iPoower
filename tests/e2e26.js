const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;',ctx);
const PW=fs.readFileSync('.passphrase','utf8').trim(), SP=process.env.SP;
const png=(r,g,b,a)=>{const {PNG}=(()=>{try{return require('pngjs')}catch(e){return {}}})();return null};
const PX=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:414,height:896},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Europe/Paris',colorScheme:'dark',permissions:['geolocation'],geolocation:{latitude:49.995,longitude:2.66}});
const p=await c.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));const reqs={rv:0,tile:0,aq:0};
const html=fs.readFileSync('site/index.html','utf8');const now=Math.floor(Date.now()/600000)*600;
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
await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);await p.clock.runFor(6000);
const sec=async()=>({cur:await p.$eval('#secCur',x=>x.innerText.replace(/\s+/g,' ').slice(0,110)).catch(()=>'(absent)'),pressed:await p.$$eval('[data-act=loc][aria-pressed=true]',x=>x.map(y=>y.textContent.trim()))});
const chips=await p.$$eval('[data-act=loc]',x=>x.map(y=>({id:y.dataset.id,t:y.textContent.trim()})));console.log('pastilles :',chips.map(c=>c.t).join(' | '));
for(const v of ['pneus','meteo']){await p.click(`[data-act=view][data-v=${v}]`).catch(()=>{});await p.waitForTimeout(800);console.log('== vue',v);
 for(const ch of chips){if(v==='meteo'){await p.click('[data-act=locs-toggle]');await p.waitForTimeout(400);}await p.click(`[data-act=loc][data-id="${ch.id}"]`);await p.waitForTimeout(1200);const s=await sec();
  const lbl=v==='meteo'?await p.$eval('[data-act=locs-toggle]',x=>x.textContent.trim()):'';const ok=(v==='meteo'?lbl.includes(ch.t):s.pressed.length===1&&s.pressed[0]===ch.t)&&s.cur.toLowerCase().includes(ch.t.split(' / ')[0].toLowerCase().slice(0,8));
  console.log((ok?'✅':'❌')+' '+ch.t.padEnd(26)+'→ actif: '+(v==='meteo'?lbl:s.pressed.join(','))+' | '+s.cur);}
}
const lb=await p.$('[data-act=locate]');console.log('bouton Ma position :',!!lb);if(lb){await lb.click();await p.waitForTimeout(4000);const s=await sec();console.log('après Ma position → actif:',s.pressed.join(','),'|',s.cur);}
await p.screenshot({path:SP+'/locs.png'});
console.log('errors',e);await b.close();})();