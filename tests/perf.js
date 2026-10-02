const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm'),zlib=require('zlib');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;',ctx);
const sizes={};const add=(k,n)=>{sizes[k]=(sizes[k]||0)+n;};
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:414,height:896},deviceScaleFactor:3,isMobile:true,hasTouch:true,colorScheme:'dark',timezoneId:'Europe/Paris',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
const p=await c.newPage();const cdp=await c.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:+(process.argv[2]||4)});
await p.addInitScript(()=>{window.__lt=[];try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))).observe({type:'longtask',buffered:true});}catch(e){}});
await p.route('**/*',r=>{const u=r.request().url();const J=(o,k)=>{const s=JSON.stringify(o);add(k,s.length);return r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:s});};
 if(u.includes('open-meteo.com')){const q=new URL(u).searchParams;const base=ctx.mk('froid',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);
  if(u.includes('ensemble'))return J(ctx.me(base),'ensemble');
  if(q.get('minutely_15'))return J(ctx.mn(base),'nowcast');
  if(q.get('models')){const keep=q.get('hourly').split(',');delete base.daily;Object.keys(base.hourly).forEach(k=>{if(k!=='time'&&!keep.includes(k))delete base.hourly[k]});Object.keys(base.hourly).forEach(k=>base.hourly[k]=base.hourly[k].slice(0,96));return J(base,'arome');}
  return J(base,'base');}
 if(u.includes('opendatasoft'))return J({records:[]},'vigi');
 return u.startsWith('file://')?r.continue():r.abort();});
const t0=Date.now();await p.goto('file:///home/claude/twrc/site/index.html');
await p.waitForFunction(()=>document.querySelector('#secCars .car'),null,{timeout:60000});const tFirst=Date.now()-t0;
await p.waitForTimeout(4000);
const r=await p.evaluate(async()=>{const T=f=>{const a=performance.now();f();return Math.round(performance.now()-a);};
 const res={};res.rebuild=T(()=>rebuild());res.renderAll=T(()=>renderAll());res.softRender=T(()=>softRender());
 let a=performance.now();
 for(let k=0;k<30;k++){UI.chartIdx=CX.m.nowI+(k%24);drawChart();renderReadout();}
 res.chartMove30=Math.round(performance.now()-a);
 const m=M[UI.loc];const en=ENSRAW[UI.loc];let b2=performance.now();const pl=makeDemoEnsemble(m.payload);res.ensGen=Math.round(performance.now()-b2);b2=performance.now();ensembleStats(pl,m);res.ensStats1loc=Math.round(performance.now()-b2);b2=performance.now();CX.cars.forEach(c=>c.season&&seasonAnalysis(m,c.car));res.season=Math.round(performance.now()-b2);b2=performance.now();renderDays();res.days=Math.round(performance.now()-b2);res.dom=document.querySelectorAll('*').length;
 res.ls=Object.keys(localStorage).reduce((s,k)=>s+(localStorage.getItem(k)||'').length,0);res.longtasks=window.__lt.slice(0,20);res.heapMB=performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null;
 res.smallTargets=[...document.querySelectorAll('button,.chip,input,select,label.thumb,summary')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<40;}).length;
 res.smallFontInputs=[...document.querySelectorAll('input,select')].filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).length;
 res.scrollW=document.documentElement.scrollWidth;return res;});
const html=fs.readFileSync('site/index.html');
console.log(JSON.stringify({cpu:'x'+(process.argv[2]||4),firstCarsMs:tFirst,...r,htmlKB:Math.round(html.length/1024),htmlGzKB:Math.round(zlib.gzipSync(html).length/1024),netKB:Object.fromEntries(Object.entries(sizes).map(([k,v])=>[k,Math.round(v/1024)]))},null,1));
await b.close();})();
