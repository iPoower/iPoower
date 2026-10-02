const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;',ctx);
const run=async(b,aromeOk)=>{const p=await (await b.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Paris'})).newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
await p.route('**/*',r=>{const u=r.request().url();if(u.includes('api.open-meteo.com')){const q=new URL(u).searchParams;const ar=q.get('models')==='meteofrance_seamless';
 if(ar&&!aromeOk)return r.fulfill({status:400,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{"error":true,"reason":"x"}'});
 const pl=ctx.mk('pluie',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',ar?2:0);
 if(ar){delete pl.daily;const keep=q.get('hourly').split(',');Object.keys(pl.hourly).forEach(k=>{if(k!=='time'&&!keep.includes(k))delete pl.hourly[k]});const n=(1+3)*24;Object.keys(pl.hourly).forEach(k=>pl.hourly[k]=pl.hourly[k].slice(0,n));}
 return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(pl)});}return u.startsWith('file://')?r.continue():r.abort();});
await p.goto('file:///home/claude/twrc/site/index.html');await p.waitForTimeout(1000);
const o=await p.evaluate(()=>({T:document.querySelector('.bigT')?.textContent,src:document.querySelector('#srcline').innerText.slice(0,230),vis:[...document.querySelectorAll('.mt')].find(x=>/Visibilit/.test(x.textContent))?.textContent.trim()}));console.log(aromeOk?'AROME OK':'AROME KO',JSON.stringify(o),e);};
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});await run(b,true);await run(b,false);await b.close();})();
