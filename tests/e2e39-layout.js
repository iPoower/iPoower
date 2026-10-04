// Une seule Race Control sur iPhone 11 Pro Max (414×896 @3x, portrait et paysage) et sur PC (1280, 1920) :
// aucun défilement horizontal, cibles tactiles ≥ 44 pt au doigt, encoche et horloge iOS respectées, mêmes sections partout.
// Les zones de sécurité (encoche) sont émulées par Chromium (CDP) ; sur WebKit, ces deux contrôles sont signalés non applicables.
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');
const T0=new Date('2026-10-03T14:00:00+02:00').getTime(),RD=Date,FD=class extends RD{constructor(...a){super(...(a.length?a:[T0]))}static now(){return T0}};
const ctx={console,Math,Date:FD,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;',ctx);
const PW=fs.readFileSync('.passphrase','utf8').trim(),SP=process.env.SP,html=fs.readFileSync('site/index.html','utf8');
const U='https://ipoower.github.io/iPoower/race-control/',BR=require('./lib/browser'),PX=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
let fail=0;const rows=[],check=(n,ok,d)=>{rows.push((ok?'✅':'❌')+' '+n+(ok||!d?'':' · '+d));if(!ok)fail++};
const VPS=[['iPhone portrait',{width:414,height:896},true,{top:44,bottom:34,left:0,right:0}],['iPhone paysage',{width:896,height:414},true,{top:0,bottom:21,left:44,right:44}],
  ['PC 1280',{width:1280,height:800},false,null],['PC 1920',{width:1920,height:1080},false,null]];
(async()=>{const b=await BR.launch();const sections={};
for(const [name,vp,mobile,inset] of VPS){
  const c=await b.newContext({viewport:vp,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:1,timezoneId:'Europe/Paris'});
  const p=await c.newPage();await p.clock.install({time:T0});p.on('pageerror',e=>rows.push('ERR '+e.message));
  await p.route('**/*',r=>{const u=r.request().url(),J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
    if(u.includes('open-meteo.com')){const q=new URL(u).searchParams,lats=String(q.get('latitude')).split(','),lons=String(q.get('longitude')).split(','),one=i=>ctx.mk('doux',{lat:+lats[i],lon:+lons[i]},'Europe/Paris',0);if(lats.length>1)return J(lats.map((_,i)=>one(i)));const base=one(0);return J(u.includes('ensemble')?ctx.me(base):q.get('minutely_15')?ctx.mn(base):base);}
    if(u.includes('/race-control/calendar.sealed.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(SP+'/cal.fake.json','utf8')});
    if(u.includes('api.rainviewer.com')){const n=Math.floor(T0/600000)*600;return J({version:'2.0',host:'https://tilecache.rainviewer.com',radar:{past:Array.from({length:3},(_,k)=>({time:n-(2-k)*600,path:'/v2/radar/'+(n-(2-k)*600)}))}});}
    if(/tilecache\.rainviewer|arcgisonline|tile\.openstreetmap/.test(u))return r.fulfill({status:200,contentType:'image/png',body:PX});
    if(u.includes('leaflet@1.9.4/dist/leaflet.js'))return r.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync('node_modules/leaflet/dist/leaflet.js')});
    if(u.includes('leaflet@1.9.4/dist/leaflet.css'))return r.fulfill({status:200,contentType:'text/css',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync('node_modules/leaflet/dist/leaflet.css')});
    if(u.includes('/race-control/obs.json'))return J({stations:{}});
    if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
    if(u.startsWith(U)&&!/\.(js|json)$/.test(new URL(u).pathname))return r.fulfill({status:200,contentType:'text/html',body:html});
    return r.abort();});
  let emulated=false;
  if(inset&&BR.NAME==='chromium'){const s=await c.newCDPSession(p);await s.send('Emulation.setSafeAreaInsetsOverride',{insets:inset});emulated=true;}
  await p.goto(U);await p.clock.runFor(2500);await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);
  for(let i=0;i<14;i++){await p.clock.runFor(500);await p.waitForTimeout(100);}
  for(const view of ['pneus','meteo','tenue']){
    await p.evaluate(v=>{UI.view=v;renderAll();const s=document.getElementById('settings');s.open=true;renderSettings(true);},view);await p.clock.runFor(800);await p.waitForTimeout(150);
    const r=await p.evaluate(mobile=>{const W=document.documentElement.clientWidth,small=[];
      const vis=e=>{const s=getComputedStyle(e);if(s.display==='none'||s.visibility==='hidden'||e.closest('[hidden]'))return false;const b=e.getBoundingClientRect();return b.width>0&&b.height>0;};
      // cibles tactiles : boutons, puces, résumés, liens-boutons, champs ; les liens dans le texte et les interrupteurs (zone élargie) sont exclus
      document.querySelectorAll('button,.chip,summary,a.btn,.jump a,select,input[type=text],input[type=time],input[type=date],input[type=number],input[type=range]').forEach(e=>{
        if(!vis(e)||e.closest('.leaflet-container'))return;const b=e.getBoundingClientRect();if(mobile&&b.height<43.5)small.push((e.dataset.act||e.id||e.tagName.toLowerCase())+' '+Math.round(b.width)+'×'+Math.round(b.height));});
      const ids=[...document.querySelectorAll('main.wrap > section, main.wrap > .grid2, main.wrap > details')].filter(vis).map(e=>e.id);
      return {sw:document.documentElement.scrollWidth,W,small:[...new Set(small)],ids,badge:document.querySelector('#statusbar .badge').getBoundingClientRect().top,
        left:document.querySelector('main.wrap').getBoundingClientRect().left,right:W-document.querySelector('main.wrap').getBoundingClientRect().right,
        veil:getComputedStyle(document.documentElement,'::before').height};},mobile);
    check(`39 · ${name} · ${view} : aucun défilement horizontal`,r.sw<=r.W,`scrollWidth ${r.sw} > ${r.W}`);
    if(mobile)check(`39 · ${name} · ${view} : cibles tactiles ≥ 44 pt`,!r.small.length,r.small.slice(0,8).join(', '));
    if(emulated&&view==='pneus'){
      if(inset.top)check(`39 · ${name} : bandeau LIVE sous l’horloge iOS, voile opaque de ${inset.top} px`,r.badge>=inset.top&&r.veil===inset.top+'px',`badge ${r.badge}, voile ${r.veil}`);
      if(inset.left)check(`39 · ${name} : contenu hors de l’encoche (${inset.left} px)`,r.left>=inset.left&&r.right>=inset.right,`gauche ${r.left}, droite ${r.right}`);
    }
    (sections[view]=sections[view]||[]).push([name,r.ids.join(',')]);
    if(view==='meteo'&&name==='iPhone portrait'){
      // carte radar défilée sous le bandeau : le bandeau (et le voile de l'horloge) restent au-dessus de Leaflet
      await p.evaluate(()=>{const m=document.querySelector('#secRadar');if(m)m.scrollIntoView();});
      for(let i=0;i<20&&!(await p.evaluate(()=>!!document.querySelector('#secRadar .leaflet-pane')));i++){await p.clock.runFor(500);await p.waitForTimeout(150);}
      await p.evaluate(()=>{const m=document.querySelector('#secRadar .rmap');if(m){const b=document.querySelector('.statusbar').getBoundingClientRect();window.scrollBy(0,m.getBoundingClientRect().top-b.top-10);}});await p.waitForTimeout(300);
      const top=await p.evaluate(()=>{const m=document.querySelector('#secRadar .rmap .leaflet-pane'),b=document.querySelector('#statusbar').getBoundingClientRect(),el=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return {map:!!m,inBar:!!(el&&el.closest('.statusbar'))};});
      check('39 · carte radar sous le bandeau : le bandeau reste au-dessus (Leaflet isolé)',top.map&&top.inBar,JSON.stringify(top));
      await p.evaluate(()=>window.scrollTo(0,0));
    }
  }
  await c.close();
}
if(BR.NAME!=='chromium')rows.push('↪️ 39 · encoche et horloge iOS : émulation CDP Chromium uniquement (non applicable sur '+BR.NAME+')');
for(const [view,list] of Object.entries(sections))check(`39 · ${view} : mêmes sections sur iPhone et PC`,list.every(([,ids])=>ids===list[0][1]),list.map(([n,ids])=>n+': '+ids).join(' | '));
console.log(rows.join('\n')+'\n\n'+(rows.filter(x=>/^[✅❌]/.test(x)).length-fail)+'/'+rows.filter(x=>/^[✅❌]/.test(x)).length+' scénarios OK · erreurs JS : '+(rows.some(x=>x.startsWith('ERR '))?'présentes':'aucune'));
await b.close();process.exit(fail||rows.some(x=>x.startsWith('ERR '))?1:0);})();
