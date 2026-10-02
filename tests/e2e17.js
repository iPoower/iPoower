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
const D=await mkPage();await unlock(D);
await D.evaluate(()=>{const d=document.querySelector('#settings');d.open=true;renderSettings(true);});await D.waitForTimeout(300);
// modifie chaque champ de réglage (texte, nombre, date, heure, liste) avec une valeur distincte
const changed=await D.evaluate(()=>{const out=[];document.querySelectorAll('#settings [data-bind], #secSeason [data-bind]').forEach((el,k)=>{const b=el.dataset.bind;if(/tire\.type$|\.plan\.on$|sporty$/.test(b))return;let v;
 if(el.tagName==='SELECT'){const o=[...el.options].find(o=>o.value!==el.value);if(!o)return;v=o.value;}
 else if(el.type==='date')v='2027-01-1'+(k%9);else if(el.type==='time')v='07:1'+(k%9);else if(el.type==='number'||el.dataset.num)v=String(3+(k%7));else v='Test '+k;
 el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));out.push(b);});return out;});
await D.waitForTimeout(500);
const snap=()=>D.evaluate(b=>b.map(p=>[p,JSON.stringify(p.split('.').reduce((a,k)=>a==null?undefined:a[k],S))]),changed);
const before=await snap();
await D.evaluate(()=>localStorage.setItem('twrc.presetv','ancienne'));await D.reload();await D.waitForTimeout(3000);
const after=await snap();
const lost=before.filter((x,j)=>x[1]!==after[j][1]).map((x,j)=>x[0]+' : '+x[1]+' → '+after[before.indexOf(x)][1]);
console.log('champs testés',changed.length,'| perdus',lost.length);lost.forEach(l=>console.log('  ✗',l));
console.log('errors',D.errs);await b.close();})();