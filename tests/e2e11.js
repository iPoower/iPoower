const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');const ctx={console,Math,Date,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;',ctx);
const PW=fs.readFileSync('.passphrase','utf8').trim(), SP=process.env.SP;const html=fs.readFileSync('site/index.html','utf8');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const mkPage=async()=>{const c=await b.newContext({viewport:{width:414,height:896},isMobile:true,hasTouch:true,timezoneId:'Europe/Paris',acceptDownloads:true});const p=await c.newPage();p.errs=[];p.on('pageerror',x=>p.errs.push(x.message));p.on('dialog',d=>d.accept());
 await p.route('**/*',r=>{const u=r.request().url();const J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('air-quality-api')){const q=new URL(u).searchParams;return J(ctx.ma(ctx.mk('doux',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0)));}
 if(u.includes('open-meteo.com')){const q=new URL(u).searchParams;const base=ctx.mk('doux',{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);if(u.includes('ensemble'))return J(ctx.me(base));if(q.get('minutely_15'))return J(ctx.mn(base));return J(base);}
 if(u.includes('/race-control/obs.json'))return J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.includes('/race-control/sw.js'))return r.fulfill({status:200,contentType:'text/javascript',body:'//'});
 if(u.startsWith('https://ipoower.github.io/iPoower/race-control/'))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
 await p.goto('https://ipoower.github.io/iPoower/race-control/');await p.waitForTimeout(1000);return p;};
const unlock=async p=>{await p.fill('#unlockPw',PW);await p.click('#unlockForm button[type=submit]');await p.waitForTimeout(3500);};
const openSet=async p=>{await p.evaluate(()=>{const d=document.querySelector('#settings');d.open=true;renderSettings(true);});await p.waitForTimeout(200);};
const probe=p=>p.evaluate(()=>({odo:JSON.stringify(S.cars[0].odo),journal:Object.keys(S.journal||{}).length,dot:S.cars[0].tire.dot,locs:S.locs.map(l=>l.name).join('/'),view:UI.view}));
// téléphone A
const A=await mkPage();await unlock(A);
await A.evaluate(()=>{S.cars[0].odo=[{d:'2026-09-01',km:12345},{d:'2026-10-01',km:13300}];S.journal={'2026-09-30':{t:1},'2026-10-01':{t:2}};saveSettings();UI.view='meteo';lsSet('twrc.view','meteo');});
console.log('A',await probe(A));
await openSet(A);const [dl]=await Promise.all([A.waitForEvent('download'),A.click('[data-act=bk-export]')]);const file=SP+'/'+dl.suggestedFilename();await dl.saveAs(file);await A.waitForTimeout(300);
console.log('export',dl.suggestedFilename(),fs.statSync(file).size,'o |',await A.$eval('#bkMsg',x=>x.textContent),'| contient Rosières ?',/Rosi/.test(fs.readFileSync(file,'utf8')));
// téléphone B : déverrouillé puis import (code mémorisé)
const B=await mkPage();await unlock(B);console.log('B avant',await probe(B));await openSet(B);
await B.setInputFiles('#bkFile',file);await B.waitForTimeout(4500);console.log('B après',await probe(B));
// téléphone C : mauvais code puis import verrouillé avec le bon code, puis déverrouillage
const C=await mkPage();await openSet(C);await C.fill('#bkPw','mauvais-code-123');await C.setInputFiles('#bkFile',file);await C.waitForTimeout(2500);console.log('C mauvais code :',await C.$eval('#bkMsg',x=>x.textContent));
await C.fill('#bkPw',PW);await C.setInputFiles('#bkFile',file);await C.waitForTimeout(4500);console.log('C verrouillé après import',await probe(C));
await unlock(C);console.log('C après déverrouillage',await probe(C));
console.log('errors',A.errs,B.errs,C.errs);await b.close();})();
