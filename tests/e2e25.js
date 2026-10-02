const {chromium}=require('playwright');const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('engine.js','utf8')+fs.readFileSync('demo.js','utf8');let ctx;
const mkCtx=T0=>{const RD=Date;const FD=class extends RD{constructor(...a){super(...(a.length?a:[T0]))} static now(){return T0}};ctx={console,Math,Date:FD,Intl,Map,Set,JSON};vm.createContext(ctx);vm.runInContext(src+';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;',ctx);};
const PW=fs.readFileSync('.passphrase','utf8').trim(), SP=process.env.SP;
const png=(r,g,b,a)=>{const {PNG}=(()=>{try{return require('pngjs')}catch(e){return {}}})();return null};
const PX=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const SC=[
 ['TT ven. 10:00 avec agenda ce soir','2026-10-02T10:00:00+02:00',[/^🏁 PROCHAIN TRAJET · AGENDA.*aujourd’hui · \d\d:\d\d.*Aller · Spectacle.*Ensuite.*Retour · Spectacle/i,/Prochain trajet domicile-travail.*lun\. 05\/10 · 06:30/i,/Aucun risque identifié sur les trajets prévus/i],['domicile-travail ·']],
 ['TT ven. 23:30, plus rien aujourd’hui (agenda demain)','2026-10-02T23:30:00+02:00',[/^🏁 PROCHAIN TRAJET · AGENDA.*demain · 06:12.*Réunion fournisseur/i],['Aucun trajet prévu']],
 ['Sam. 14:36, 1 min avant départ','2026-10-03T14:36:00+02:00',[/^🏁 PROCHAIN TRAJET · AGENDA.*aujourd’hui · 14:37.*Aller · Assurance/i,/départ dans 1 min/i]],
 ['Sam. 14:38, 1 min après départ','2026-10-03T14:38:00+02:00',[/^🏎️ TRAJET EN COURS · AGENDA.*parti à 14:37.*arrivée prévue 16:50.*Aller · Assurance/i,/Ensuite.*23:25/i]],
 ['Sam. 15:30, pendant le trajet','2026-10-03T15:30:00+02:00',[/^🏎️ TRAJET EN COURS · AGENDA.*arrivée prévue 16:50/i]],
 ['Sam. 16:51, 1 min après arrivée','2026-10-03T16:51:00+02:00',[/^🏁 PROCHAIN TRAJET · AGENDA.*23:25.*Retour · Concert/i],['Trajet en cours','Assurance']],
 ['Dim. 10:00, rien aujourd’hui','2026-10-04T10:00:00+02:00',[/Aucun trajet prévu aujourd’hui/i,/Prochain trajet domicile-travail.*demain · 06:30/i]],
 ['Dim. 21:00, veille du lundi, froid','2026-10-04T21:00:00+02:00',[/^🏁 PROCHAIN TRAJET · DOMICILE-TRAVAIL.*Aller domicile-travail/i,/Prochain risque sur mes trajets.*demain 06:43.*Journée Lille/i],[],'froid'],
 ['Lun. 06:31, trajet boulot en cours','2026-10-05T06:31:00+02:00',[/^🏎️ TRAJET EN COURS · DOMICILE-TRAVAIL.*arrivée prévue 07:10/i,/Ensuite.*16:00 · 🏁 Retour domicile-travail/i]],
 ['Lun. 07:11, arrivé au travail (journée Lille en cours dans le jeu de test)','2026-10-05T07:11:00+02:00',[/^🏎️ TRAJET EN COURS · AGENDA.*Journée Lille/i,/Ensuite.*16:00 · 🏁 Retour domicile-travail/i],['en cours · domicile-travail']],
 ['Mar. 10:00, boulot + agenda le même jour','2026-10-06T10:00:00+02:00',[/^🏁 PROCHAIN TRAJET · AGENDA.*Aller · Sport.*Ensuite.*16:00 · 🏁 Retour domicile-travail.*17:10 · 📅 Retour · Sport/i]]];
let ok=0;const e=[];
for(const [lbl,iso,must,mustNot,scn] of SC){const SCN=scn||'doux';const T0=new Date(iso).getTime();mkCtx(T0);
const c=await b.newContext({viewport:{width:414,height:896},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Europe/Paris',colorScheme:'dark'});
const p=await c.newPage();await p.clock.install({time:T0});p.on('pageerror',x=>e.push(lbl+': '+x.message));const reqs={rv:0,tile:0,aq:0};
const html=fs.readFileSync('site/index.html','utf8');const now=Math.floor(T0/600000)*600;
await p.route('**/*',r=>{const u=r.request().url();const J=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 if(u.includes('air-quality-api')){reqs.aq++;const q=new URL(u).searchParams;return J(ctx.ma(ctx.mk(SCN,{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0)));}
 if(u.includes('open-meteo.com')){if(!u.includes('ensemble')&&!new URL(u).searchParams.get('minutely_15')&&!u.includes('meteofrance'))reqs.fc=(reqs.fc||0)+1;const q=new URL(u).searchParams;const base=ctx.mk(SCN,{lat:+q.get('latitude'),lon:+q.get('longitude')},'Europe/Paris',0);if(u.includes('ensemble'))return J(ctx.me(base));if(q.get('minutely_15'))return J(ctx.mn(base));return J(base);}
 if(u.includes('api.rainviewer.com')){reqs.rv++;return J({version:'2.0',host:'https://tilecache.rainviewer.com',radar:{past:Array.from({length:13},(_,k)=>({time:now-(12-k)*600,path:'/v2/radar/'+(now-(12-k)*600)}))}});}
 if(u.includes('tilecache.rainviewer.com')){reqs.tile++;return r.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:PX});}
 if(u.includes('arcgisonline.com')){reqs.esri=(reqs.esri||0)+1;if(process.env.ESRI_DOWN)return r.abort();return r.fulfill({status:200,contentType:'image/png',body:PX});}
 if(u.includes('tile.openstreetmap.org')){reqs.osm=(reqs.osm||0)+1;return r.fulfill({status:200,contentType:'image/png',body:PX});}
 if(u.includes('cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'))return r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync('node_modules/leaflet/dist/leaflet.js')});
 if(u.includes('cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'))return r.fulfill({status:200,contentType:'text/css',body:fs.readFileSync('node_modules/leaflet/dist/leaflet.css')});
 if(u.includes('/race-control/calendar.sealed.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync(SP+'/cal.fake.json','utf8')});
 if(u.includes('/race-control/obs.json'))return J({stations:{}});
 if(u.includes('/race-control/tiredb.json'))return r.fulfill({status:200,contentType:'application/json',body:fs.readFileSync('site/tiredb.json','utf8')});
 if(u.includes('/race-control/sw.js'))return r.fulfill({status:200,contentType:'text/javascript',body:'//'});
 if(u.startsWith('https://ipoower.github.io/iPoower/race-control/'))return r.fulfill({status:200,contentType:'text/html',body:html});
 return r.abort();});
const U='https://ipoower.github.io/iPoower/race-control/';
await p.goto(U);await p.clock.runFor(3000);
await p.fill('#unlockPw',PW);await Promise.all([p.waitForNavigation({timeout:60000}),p.click('#unlockForm button[type=submit]')]);for(let k=0;k<60;k++){if(await p.evaluate(()=>typeof CAL!=='undefined'&&(!!CAL||CALDONE)).catch(()=>false))break;await p.clock.runFor(200);await p.waitForTimeout(300);}await p.clock.runFor(1500);await p.waitForTimeout(800);
await p.waitForFunction(()=>typeof CALDONE!=='undefined'&&CALDONE,null,{timeout:20000}).catch(()=>console.log('   (agenda non lu en 20 s)'));await p.waitForTimeout(300);for(let k=0;k<40;k++){const busy=await p.$eval('#secBrf',x=>/⏳/.test(x.innerText)).catch(()=>false);if(!busy)break;await p.clock.runFor(500);await p.waitForTimeout(250);}const txt=await p.$eval('#secBrf',x=>x.innerText.replace(/\n+/g,' ⏎ ').replace(/[ \t]+/g,' ').trim()).catch(()=>'(absent)');
const first=await p.$eval('#secBrf',x=>{const f=x.querySelector('.db, .brf-h');return f?(f.classList.contains('db')?'agenda':'boulot/aucun'):'?'}).catch(()=>'?');
const pass=must.every(r=>r.test(txt.replace(/^\s+/,'')))&&(mustNot||[]).every(s=>!txt.toLowerCase().includes(s.toLowerCase()));if(pass)ok++;
console.log((pass?'✅':'❌')+' '+lbl+'\n   1er bloc : '+first+'\n   '+txt.slice(0,520));
if(lbl.startsWith('Mar.'))console.log('   ordre des blocs :',await p.$$eval('#secBrf > .db, #secBrf > .brf-h, #secBrf .db-after',x=>x.map(y=>y.className)));
if(lbl.startsWith('TT ven. 10'))await p.screenshot({path:SP+'/brf-tt.png'});
if(lbl.startsWith('Sam. 15:30'))await p.screenshot({path:SP+'/brf-sam.png'});
await c.close();}
console.log(ok+'/'+SC.length+' scénarios OK · erreurs JS :',e.length?e:'aucune');await b.close();})();