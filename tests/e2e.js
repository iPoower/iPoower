const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');
const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+`;this.mk=makeDemoPayload;`,ctx);
const scn=process.argv[2]||'froid', scheme=process.argv[3]||'dark', tag=process.argv[4]||scn+'-'+scheme;
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']}).catch(async e=>{console.log('launch1 fail',e.message.slice(0,200));return chromium.launch({args:['--no-sandbox']});});
 const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:scheme,timezoneId:'Europe/Paris',locale:'fr-FR'});
 const p=await c.newPage(); const errs=[];
 p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())}); p.on('pageerror',e=>errs.push('pageerror: '+e.message));
 await p.route('**/*',r=>{const u=r.request().url();
  if(u.includes('api.open-meteo.com')){const q=new URL(u).searchParams;const lat=+q.get('latitude'),lon=+q.get('longitude');
    return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(ctx.mk(scn,{lat,lon},'Europe/Paris',lat>49.9?-0.3:0))});}
  if(u.includes('geocoding-api'))return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({results:[{name:'Nice',admin1:'Provence-Alpes-Côte d\'Azur',country:'France',latitude:43.7,longitude:7.26}]})});
  if(u.startsWith('file://'))return r.continue(); return r.abort();});
 await p.goto('file:///home/claude/twrc/standalone.html'); await p.waitForTimeout(1200);
 const info=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,h:document.documentElement.scrollHeight,badge:document.querySelector('.badge')?.textContent,upd:document.querySelector('.upd')?.textContent,cars:[...document.querySelectorAll('.car .verdict')].map(e=>e.textContent.trim()),scores:[...document.querySelectorAll('.car .score')].map(e=>e.textContent)}));
 console.log(JSON.stringify(info));
 // overflow offenders
 const off=await p.evaluate(()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>W+1&&r.width>0&&!e.closest('.scroll')&&!e.closest('svg')}).slice(0,8).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right))});
 console.log('overflow',JSON.stringify(off));
 await p.screenshot({path:`shot-${tag}-full.png`,fullPage:true});
 console.log('errors',JSON.stringify(errs));
 await b.close();
})();
