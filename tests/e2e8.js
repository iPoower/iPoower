const PRIV=(()=>{try{return JSON.parse(require('fs').readFileSync('preset.json','utf8'))}catch(e){return null}})();   // préréglage privé local (jamais dans Git)
const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;',ctx);
const calls=[];
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:414,height:896},isMobile:true,hasTouch:true,timezoneId:'Europe/Paris',geolocation:{latitude:48.8584,longitude:2.2945,accuracy:35},permissions:['geolocation']});
const p=await c.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
await p.route('**/*',r=>{const u=r.request().url();const J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('bigdatacloud')){calls.push('rev');return J({locality:'Paris 7e Arrondissement',city:'Paris',principalSubdivision:'Île-de-France'});}
 if(u.includes('open-meteo.com')){const q=new URL(u).searchParams;calls.push('om '+q.get('latitude'));const base=ctx.mk('doux',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);if(u.includes('ensemble'))return J(ctx.me(base));if(q.get('minutely_15'))return J(ctx.mn(base));return J(base);}
 if(u.includes('/race-control/obs.json'))return J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.startsWith('https://ipoower.github.io/iPoower/race-control/'))return r.fulfill({status:200,contentType:'text/html',body:fs.readFileSync('site/index.html','utf8')});
 return r.abort();});
await p.goto('https://ipoower.github.io/iPoower/race-control/');await p.waitForTimeout(2000);
console.log('avant',await p.$$eval('#locChips .chip',x=>x.map(y=>y.textContent)));
await p.click('[data-act=locate]');await p.waitForTimeout(2500);
console.log('après',await p.$$eval('#locChips .chip',x=>x.map(y=>y.textContent+(y.getAttribute('aria-pressed')==='true'?' *':''))));
console.log('titre',await p.$eval('#secCur h2',x=>x.textContent),'| src',await p.$eval('#srcline',x=>x.textContent.slice(0,200)));
await p.reload();await p.waitForTimeout(2500);
console.log('rechargé',await p.$eval('#secCur h2',x=>x.textContent));
const HOME=PRIV&&PRIV.locs[0]||{lat:48.85,lon:2.35};await c.setGeolocation({latitude:HOME.lat,longitude:HOME.lon,accuracy:20});await p.evaluate(()=>locate(true));await p.waitForTimeout(2500);
console.log('déplacé',await p.$$eval('#locChips .chip',x=>x.map(y=>y.textContent).slice(0,2)));
console.log('calls',calls.filter(x=>x==='rev').length,'rev', 'errors',e);await b.close();})();
