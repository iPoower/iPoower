const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');
const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+`;this.mk=makeDemoPayload;`,ctx);
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'dark',timezoneId:'Europe/Paris',locale:'fr-FR'});
 const p=await c.newPage(); const errs=[]; let online=true;
 p.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())}); p.on('pageerror',e=>errs.push('pageerror: '+e.message));
 await p.route('**/*',r=>{const u=r.request().url();
  if(u.includes('geocoding-api')){ return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:[{name:'Nice',admin1:'Provence',country:'France',latitude:43.7,longitude:7.26}]})});}
  if(u.includes('api.open-meteo.com')){ if(!online) return r.abort('failed'); const q=new URL(u).searchParams;return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(ctx.mk('pluie',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0))});}
  if(u.includes('geocoding-api')){ return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:[{name:'Nice',admin1:'Provence',country:'France',latitude:43.7,longitude:7.26}]})});}
  if(u.startsWith('file://'))return r.continue(); return r.abort();});
 await p.goto('file:///home/claude/twrc/standalone.html'); await p.waitForTimeout(1000);
 const T=async(l,f)=>{try{const v=await f();console.log('OK  ',l,v===undefined?'':JSON.stringify(v));}catch(e){console.log('FAIL',l,e.message.split('\n')[0]);}};
 const verdicts=()=>p.$$eval('.car .verdict',es=>es.map(e=>e.textContent.trim().slice(0,12)));
 await T('verdicts initial',verdicts);
 await T('308 -> été',async()=>{await p.click('[data-act=tire][data-car="308"][data-type=summer]');return verdicts();});
 await T('persist tire',async()=>p.evaluate(()=>JSON.parse(localStorage.getItem('twrc.settings.v1')).cars[1].tire.type));
 await T('i20 -> hiver',async()=>{await p.click('[data-act=tire][data-car=i20][data-type=winter]');return verdicts();});
 await T('season i20 winter title',async()=>p.$$eval('#secSeason .stat b',es=>es.map(e=>e.textContent)));
 await T('i20 -> été again',async()=>{await p.click('[data-act=tire][data-car=i20][data-type=summer]');return (await p.$$eval('#secSeason .stat b',es=>es.map(e=>e.textContent)));});
 await T('countdown set date',async()=>{const d=new Date(Date.now()+12*864e5).toISOString().slice(0,10);await p.fill('#f-cars-0-plan-date',d);await p.dispatchEvent('#f-cars-0-plan-date','change');return p.$$eval('.cd',es=>es.map(e=>e.textContent));});
 await T('pre alert after date',async()=>p.$$eval('#secAlerts .al .t',es=>es.map(e=>e.textContent).filter(t=>/montage/.test(t))));
 await T('chart select',async()=>{const bb=await p.$eval('#chartbox svg',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}});await p.mouse.move(bb.x+bb.w*0.5,bb.y+bb.h*0.4);await p.mouse.down();await p.mouse.up();return p.$eval('#readout .hh',e=>e.textContent);});
 await T('chart keyboard',async()=>{await p.focus('#chartbox');await p.keyboard.press('ArrowRight');return p.$eval('#readout .hh',e=>e.textContent);});
 await T('dir retour',async()=>{await p.click('[data-act=dir][data-d=ret]');return p.$eval('#secBrief .sub:nth-of-type(1)',e=>e.textContent).catch(()=>p.$eval('#secBrief',e=>e.textContent.slice(300,520)));});
 await T('duration 120',async()=>{await p.fill('#f-work-durMin','120');await p.dispatchEvent('#f-work-durMin','change');return p.$eval('#secBrief .disc',e=>e.textContent.slice(0,60));});
 await T('alert toggle off t7',async()=>{await p.click('[data-alert=t7]',{force:true});return p.evaluate(()=>JSON.parse(localStorage.getItem('twrc.settings.v1')).alerts.t7);});
 await T('geocode add',async()=>{await p.evaluate(()=>{document.querySelector('#settings').open=true});await p.fill('#geoQ','Nice');await p.click('[data-act=geo-search]');await p.waitForSelector('#geoHits button');await p.click('#geoHits button');await p.waitForTimeout(800);return p.$$eval('#locChips .chip',es=>es.map(e=>e.textContent));});
 await T('custom loc chip load',async()=>{await p.click('#locChips .chip:nth-child(3)');await p.waitForTimeout(300);return p.$eval('#secCur h2',e=>e.textContent);});
 await T('trip to Nice',async()=>{const v=await p.$eval('#f-work-to',e=>[...e.options].map(o=>o.textContent));return v;});
 await T('reload keeps settings',async()=>{await p.reload();await p.waitForTimeout(900);return p.$$eval('#locChips .chip',es=>es.length);});
 await p.screenshot({path:'shot-after.png'});
 // offline => cache
 online=false;
 await T('offline refresh -> cache badge',async()=>{await p.click('[data-act=refresh]');await p.waitForTimeout(800);return p.$eval('.badge',e=>e.textContent);});
 // clear cache and go offline => notice
 await T('no cache -> notice',async()=>{await p.evaluate(()=>{Object.keys(localStorage).filter(k=>k.startsWith('twrc.cache')).forEach(k=>localStorage.removeItem(k))});await p.reload();await p.waitForTimeout(1200);return p.$eval('#notice',e=>e.textContent.slice(0,120));});
 await T('demo from notice',async()=>{await p.click('#notice [data-act=demo]');await p.waitForTimeout(500);return [await p.$eval('.badge',e=>e.textContent),await p.$eval('#demoBar',e=>e.textContent.slice(0,60))];});
 await p.screenshot({path:'shot-demo.png'});
 console.log('errors',JSON.stringify(errs));
 // desktop
 const c2=await b.newContext({viewport:{width:1280,height:900},colorScheme:'dark',timezoneId:'Europe/Paris',locale:'fr-FR'});const p2=await c2.newPage();
 await p2.route('**/*',r=>{const u=r.request().url();if(u.includes('api.open-meteo.com')){const q=new URL(u).searchParams;return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(ctx.mk('froid',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0))});}if(u.startsWith('file://'))return r.continue();return r.abort();});
 await p2.goto('file:///home/claude/twrc/standalone.html');await p2.waitForTimeout(1000);await p2.screenshot({path:'shot-desk.png',clip:{x:0,y:0,width:1280,height:1500},fullPage:true});
 await b.close();
})();
