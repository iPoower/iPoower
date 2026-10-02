const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');
const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+`;this.mk=makeDemoPayload;`,ctx);
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'dark',timezoneId:'Europe/Paris',locale:'fr-FR'});const p=await c.newPage();
await p.route('**/*',r=>{const u=r.request().url();if(u.includes('api.open-meteo.com')){const q=new URL(u).searchParams;return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(ctx.mk('froid',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0))});}if(u.startsWith('file://'))return r.continue();return r.abort();});
await p.goto('file:///home/claude/twrc/standalone.html');await p.waitForTimeout(1000);
for(const id of ['banners','secChart','secBrief']){await (await p.$('#'+id)).screenshot({path:'el-'+id+'.png'});}
await b.close();})();
