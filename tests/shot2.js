const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;',ctx);
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'dark',timezoneId:'Europe/Paris'})).newPage();
await p.route('**/*',r=>{const u=r.request().url();if(u.includes('opendatasoft'))return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({records:[{fields:{dep:'80',nom_dep:'Somme',phenomene:'Vent violent',couleur:'Jaune'}}]})});
 if(u.includes('api.open-meteo.com')){const q=new URL(u).searchParams;const pl=ctx.mk('pluie',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(pl)});}
 return u.startsWith('file://')?r.continue():r.abort();});
await p.goto('file:///home/claude/twrc/site/index.html');await p.waitForTimeout(1300);
await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('twrc.settings.v1')||'null');});
await p.evaluate(()=>document.querySelector('#settings').open=true);await p.fill('#f-cars-0-tire-press','2,5');await p.dispatchEvent('#f-cars-0-tire-press','change');await p.fill('#f-cars-0-tire-dot','2321');await p.dispatchEvent('#f-cars-0-tire-dot','change');
await p.fill('#f-cars-0-tire-pchk-date','2026-09-20');await p.dispatchEvent('#f-cars-0-tire-pchk-date','change');await p.fill('#f-cars-0-tire-pchk-T','19');await p.dispatchEvent('#f-cars-0-tire-pchk-T','change');
await p.waitForTimeout(300);
await (await p.$('.car')).screenshot({path:'el-car1.png'});await (await p.$('#secAlerts')).screenshot({path:'el-alerts.png'});
const s=await p.$('#settings');await s.screenshot({path:'el-set.png'});
console.log(await p.$$eval('#secAlerts .al .t',x=>x.map(y=>y.textContent).slice(0,4)));
await b.close();})();
