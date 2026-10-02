const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;',ctx);
const scn=process.argv[2]||'froid';
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'dark',timezoneId:'Europe/Paris'})).newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
const calls={ens:0,now:0};
await p.route('**/*',r=>{const u=r.request().url();const J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('opendatasoft'))return J({records:[]});
 if(u.includes('open-meteo.com')){const q=new URL(u).searchParams;const base=ctx.mk(scn,{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);
   if(u.includes('ensemble-api')){calls.ens++;return q.get('models')==='ecmwf_ifs025'?J(ctx.me(base)):r.fulfill({status:400,body:'{}'});}
   if(q.get('minutely_15')){calls.now++;return J(ctx.mn(base));}
   if(q.get('models'))return J(base);return J(base);}
 return u.startsWith('file://')?r.continue():r.abort();});
await p.goto('file:///home/claude/twrc/site/index.html');await p.waitForTimeout(3000);
const T=async(l,f)=>{try{console.log('OK  ',l,JSON.stringify(await f()));}catch(x){console.log('FAIL',l,x.message.split('\n')[0]);}};
await T('nowcast',()=>p.$eval('.nc .sub',x=>x.textContent));
await T('ice proba',()=>p.$$eval('#secIce .note',x=>x.map(y=>y.textContent)));
await T('brief probs',()=>p.$eval('#secBrief .probs',x=>x.innerText.replace(/\n/g,' | ')));
await T('chart band',()=>p.$eval('#chartbox svg',x=>!!x.querySelector('path[opacity=".16"]')));
await T('alert ens',()=>p.$$eval('#secAlerts .al:not(.off) .t',x=>x.map(y=>y.textContent).filter(t=>/scénarios|min$/.test(t))));
await T('fb ice',async()=>{const before=await p.$eval('.car .sub',x=>x.textContent);await p.click('[data-act=fb][data-k=ice]');await p.waitForTimeout(400);return [before,await p.$eval('.fb .disc',x=>x.textContent),await p.$eval('.car .sub',x=>x.textContent)];});
await T('overflow',()=>p.evaluate(()=>document.documentElement.scrollWidth));
console.log('calls',JSON.stringify(calls),'errors',JSON.stringify(e));
for(const id of ['secBrief','secCur']){await (await p.$('#'+id)).screenshot({path:'el6-'+id+'.png'});}
await b.close();})();
