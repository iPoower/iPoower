const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;',ctx);
const PW=process.env.PW;
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:414,height:896},isMobile:true,hasTouch:true,timezoneId:'Europe/Paris',permissions:['clipboard-read','clipboard-write']});
const p=await c.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
let html=fs.readFileSync('site/index.html','utf8');
await p.route('**/*',r=>{const u=r.request().url();const J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('open-meteo.com')){const q=new URL(u).searchParams;const base=ctx.mk('pluie',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);if(u.includes('ensemble'))return J(ctx.me(base));if(q.get('minutely_15'))return J(ctx.mn(base));return J(base);}
 if(u.includes('/race-control/obs.json'))return J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.includes('/race-control/widget.js'))return r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync('site/widget.js','utf8')});
 if(u.includes('/race-control/sw.js'))return r.fulfill({status:200,contentType:'text/javascript',body:'//'});
 if(u.startsWith('https://ipoower.github.io/iPoower/race-control/'))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const U='https://ipoower.github.io/iPoower/race-control/';
await p.goto(U);await p.waitForTimeout(1500);
console.log('verrouillé',await p.$$eval('#locChips .chip',x=>x.map(y=>y.textContent).slice(0,3)),await p.$eval('#notice',x=>x.textContent.slice(0,60)));
await p.fill('#unlockPw','mauvais-code');await p.click('#unlockForm button[type=submit]');await p.waitForTimeout(2500);console.log('mauvais',await p.$eval('#unlockMsg',x=>x.textContent));
await p.fill('#unlockPw',PW);await p.click('#unlockForm button[type=submit]');await p.waitForTimeout(4000);
console.log('déverrouillé',await p.$$eval('#locChips .chip',x=>x.map(y=>y.textContent).slice(0,4)),await p.$$eval('.car h3',x=>x.map(y=>y.textContent)));
await p.evaluate(()=>{document.querySelector('#settings').open=true});await p.waitForTimeout(300);
await p.click('[data-act=copy-widget]');await p.waitForTimeout(800);const clip=await p.evaluate(()=>navigator.clipboard.readText());console.log('widget copié avec config',/const CFG = \{"home"/.test(clip),/Rosières/.test(clip));
// nouvelle version publiée : déchiffrement auto avec le code gardé
html=html.replace(/window.TWRC_SEALED_V="[0-9a-f]+"/,'window.TWRC_SEALED_V="ffffffffff"');
await p.reload();await p.waitForTimeout(5000);console.log('nouvelle version',await p.$$eval('.car h3',x=>x.map(y=>y.textContent)));
console.log('errors',e);await b.close();})();
