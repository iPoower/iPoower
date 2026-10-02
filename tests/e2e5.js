const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;',ctx);
let calls={om:0,mid:0,vigi:0};
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'dark',timezoneId:'Europe/Paris'})).newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
await p.route('**/*',r=>{const u=r.request().url();
 if(u.includes('opendatasoft')){calls.vigi++;return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({records:[{fields:{dep:'80',nom_dep:'Somme',phenomene:'Vent violent',couleur:'Jaune'}},{fields:{dep:'80',nom_dep:'Somme',phenomene:'Pluie-inondation',couleur:'Orange'}},{fields:{dep:'76',nom_dep:'Seine-Maritime',phenomene:'Orages',couleur:'Rouge'}}]})});}
 if(u.includes('geocoding'))return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:[{name:'Chamonix-Mont-Blanc',admin1:'Auvergne-Rhône-Alpes',admin2:'Haute-Savoie',country:'France',country_code:'FR',latitude:45.9237,longitude:6.8694}]})});
 if(u.includes('api.open-meteo.com')){calls.om++;const q=new URL(u).searchParams;const lat=+q.get('latitude');if(lat<49.6&&lat>46)calls.mid++;
   if(q.get('models'))return r.fulfill({status:400,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"error":true}'});
   const pl=ctx.mk('froid',{lat,lon:+q.get('longitude')},'Europe/Paris',lat<46.5?-4:0);pl.elevation=lat<46.5?1035:60;
   return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(pl)});}
 return u.startsWith('file://')?r.continue():r.abort();});
await p.goto('file:///home/claude/twrc/site/index.html');await p.waitForTimeout(1500);
const T=async(l,f)=>{try{console.log('OK  ',l,JSON.stringify(await f()));}catch(x){console.log('FAIL',l,x.message.split('\n')[0]);}};
await T('tirebox extra',()=>p.$$eval('.car .tirebox',x=>x.map(y=>y.textContent.replace(/\s+/g,' ').trim().slice(0,110))));
await T('vigi',()=>p.$eval('#secAlerts .note',x=>x.textContent.slice(0,120)));
await T('alerts actives',()=>p.$$eval('#secAlerts .al:not(.off) .t',x=>x.map(y=>y.textContent).slice(0,14)));
await T('pchk',async()=>{await p.click('[data-act=pchk][data-car=i20]');return p.$eval('.car .tirebox:nth-of-type(2)',x=>x.textContent.replace(/\s+/g,' ').slice(0,140));});
await T('dot',async()=>{await p.evaluate(()=>document.querySelector('#settings').open=true);await p.fill('#f-cars-0-tire-dot','1918');await p.dispatchEvent('#f-cars-0-tire-dot','change');return p.$$eval('.car .pill',x=>x.map(y=>y.textContent));});
await T('glare row',()=>p.$$eval('#secBrief tr',x=>x.map(y=>y.textContent).filter(t=>/Soleil/.test(t))));
await T('add Chamonix',async()=>{await p.fill('#geoQ','Chamonix');await p.click('[data-act=geo-search]');await p.waitForSelector('#geoHits button');await p.click('#geoHits button');await p.waitForTimeout(1500);return p.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('twrc.settings.v1')).customs));});
await T('trip long',async()=>{await p.fill('#f-work-durMin','480');await p.dispatchEvent('#f-work-durMin','change');await p.waitForTimeout(2500);return p.$eval('#secBrief .disc',x=>x.textContent.slice(0,200));});
await T('loi montagne note',()=>p.$eval('#secBrief .note',x=>x.textContent.slice(0,160)));
await T('mont alert',()=>p.$$eval('#secAlerts .al .t',x=>x.map(y=>y.textContent).filter(t=>/Montagne|montagne/.test(t))));
await T('overflow',()=>p.evaluate(()=>document.documentElement.scrollWidth));
console.log('calls',JSON.stringify(calls),'errors',JSON.stringify(e));
await p.screenshot({path:'shot-batch.png',fullPage:true});
await b.close();})();
