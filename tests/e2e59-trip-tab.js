// Onglet TRAJET : une seule intention canonique pilote route, météo, véhicule et vues.
'use strict';
const assert=require('node:assert/strict');
const {session,BR,errors}=require('./lib/context-session');
let n=0,stage=''; const check=async(label,fn)=>{stage=label;await fn();n++;console.log('✅ '+label);};
const tap=(p,dev,sel)=>dev==='iphone'?p.locator(sel).first().tap():p.locator(sel).first().click();
const state=p=>p.evaluate(()=>{const n=USER_STORE.state.dayContext.nextDestination,t=n&&APP_CONTEXT.trips.find(x=>x.key===n.tripKey),l=t&&(t.l||t.planL);return{
 view:UI.view,n,car:APP_CONTEXT.snapshot.activeCarId,status:APP_CONTEXT.snapshot.status,
 destination:APP_CONTEXT.snapshot.destination&&APP_CONTEXT.snapshot.destination.name,
 first:APP_CONTEXT.trips[0]&&{key:APP_CONTEXT.trips[0].key,src:APP_CONTEXT.trips[0].src,dep:APP_CONTEXT.trips[0].dep,carId:APP_CONTEXT.trips[0].carId},
 route:l&&{km:l.km,min:l.min,pending:!!l.originPending,cached:!!l.cachedRoute,offline:!!l.routeOffline},
 context:JSON.parse(localStorage.getItem(USER_STORE.key)||'null')}});

async function setup(s,dev){
 const p=s.p; let geoFail=false,osrmDown=false; const osrmCalls=[];
 await p.route('https://data.geopf.fr/**',r=>{
   if(geoFail)return r.fulfill({status:200,contentType:'application/json',body:'{"features":[]}'});
   const q=new URL(r.request().url()).searchParams.get('q')||'', alt=/Église|Etienne/i.test(q);
   const x=alt?{label:"1 Rue de l'Église 42000 Saint-Étienne",lat:45.4397,lon:4.3872}:{label:'29 Rue Jean Jaurès 80610 Saint-Ouen',lat:50.0385,lon:2.1194};
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({features:[{properties:{label:x.label,context:'80, Somme, Hauts-de-France',type:'housenumber'},geometry:{coordinates:[x.lon,x.lat]}}]})});
 });
 await p.route('https://nominatim.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'application/json',body:geoFail?'[]':JSON.stringify([{lat:'51.5237',lon:'-0.1585',name:'221B Baker Street',display_name:'221B Baker Street, London, England, United Kingdom',addresstype:'house',address:{state:'England'}}])}));
 await p.route('https://geocoding-api.open-meteo.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"results":[]}'}));
 await p.route('https://router.project-osrm.org/**',r=>{
   osrmCalls.push(r.request().url()); if(osrmDown)return r.abort();
   const m=/driving\/([^;]+);([^?]+)/.exec(r.request().url()),a=m?m[1].split(',').map(Number):[2.31,49.91],b=m?m[2].split(',').map(Number):[2.1194,50.0385],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({routes:[{distance:38100,duration:2520,geometry:{coordinates:[a,mid,b]},legs:[{annotation:{duration:[1260,1260]}}]}]})});
 });
 await p.evaluate(async()=>{
   S.locs=[{id:'home',name:'Maison test',lat:49.20,lon:2.58},{id:'work',name:'Travail test',lat:49.91,lon:2.31}];S.customs=[];S.work={from:'home',to:'work',dep:'07:00',ret:'18:00',days:[1,2,3],durMin:40};
   S.cars[0].name='Hyundai i20 N';S.cars[0].short='i20 N';Object.assign(S.cars[0].tire,{type:'summer',size:'215/40 R18 89Y',brand:'Michelin',model:'Pilot Sport 4S',tread:6});
   S.cars[1].name='Peugeot 308';S.cars[1].short='308';Object.assign(S.cars[1].tire,{type:'allseason',size:'225/45 R17 94W',brand:'Pirelli',model:'Cinturato All Season SF3',tread:6});
   USER_STORE.state.dayContext={activeCarId:S.cars[0].id};CAL={events:[]};saveSettings();USER_STORE.flush();await refreshAll();renderAll();
 });
 await tap(p,dev,'#placeBar [data-act=place-confirm][data-place=work]');
 await tap(p,dev,'#viewSeg [data-act=view][data-v=trajet]'); await s.settle(3);
 return {setGeoFail:v=>geoFail=v,setOsrmDown:v=>osrmDown=v,osrmCalls};
}
async function search(p,dev,q){await p.fill('#tripDestQ',q);await tap(p,dev,'#secTrip [data-act=trip-dest-search]');await p.waitForFunction(()=>document.querySelectorAll('#secTrip [data-act=trip-dest-pick]').length>0,{timeout:10000});await tap(p,dev,'#secTrip [data-act=trip-dest-pick]');}
async function later(p,dev,time,car){await p.locator('#secTrip input[name=tripWhen][value=later]').check();await p.fill('#tripTime',time);await p.selectOption('#tripCar',car);await tap(p,dev,'#secTrip [data-act=trip-plan]');await p.waitForFunction(()=>USER_STORE.state.dayContext.nextDestination?.source==='manual');}
async function layout(p){return p.evaluate(()=>{const W=document.documentElement.clientWidth,sec=document.getElementById('secTrip'),nav=document.getElementById('viewSeg'),small=[],wide=[];[...sec.querySelectorAll('button,input,select'),...nav.querySelectorAll('button')].filter(x=>x.getClientRects().length).forEach(x=>{const b=(x.closest('label')||x).getBoundingClientRect();/* cible tactile réelle : le label qui enveloppe un bouton radio */if(b.height<43.5||b.width<43.5)small.push((x.dataset.act||x.id||x.tagName)+':'+Math.round(b.width)+'x'+Math.round(b.height));});[...sec.querySelectorAll('*'),...nav.querySelectorAll('*')].filter(x=>x.getClientRects().length).forEach(x=>{const b=x.getBoundingClientRect();if(b.right>W+1)wide.push(x.className||x.tagName);});return{W,sw:document.documentElement.scrollWidth,small,wide:[...new Set(wide)].slice(0,8),tabs:[...nav.querySelectorAll('[data-act=view]')].map(x=>x.dataset.v)}});}

(async()=>{const b=await BR.launch();try{
 for(const dev of ['iphone','pc']){
  const s=await session(b,{at:'2026-10-07T15:00:00+02:00',dev}),p=s.p,ctl=await setup(s,dev);
  await check(dev+' · TRAJET visible en un geste, navigation à cinq onglets',async()=>{const L=await layout(p);assert.deepEqual(L.tabs,['meteo','pneus','trajet','tenue','analyse']);assert.equal((await state(p)).view,'trajet');assert(await p.locator('#secTrip').isVisible());});
  await check(dev+' · départ proposé depuis le lieu Travail confirmé',async()=>assert.match(await p.locator('#secTrip').innerText(),/Travail test/));
  await search(p,dev,'29 Rue Jean Jaurès, 80610 Saint-Ouen');
  await check(dev+' · cas réel : adresse exacte fournie par IGN/BAN',async()=>{const t=await p.locator('#secTrip').innerText();assert.match(t,/29 Rue Jean Jaurès 80610 Saint-Ouen/);assert.match(t,/IGN\/BAN/);});
  const [carA,carB]=await p.evaluate(()=>S.cars.map(c=>c.id)); await later(p,dev,'17:15',carA);
  await p.waitForFunction(()=>{const n=USER_STORE.state.dayContext.nextDestination,t=n&&APP_CONTEXT.trips.find(x=>x.key===n.tripKey),l=t&&(t.l||t.planL);return !!(l&&!l.originPending&&Number.isFinite(l.km));},{timeout:20000});
  let key;
  await check(dev+' · manuel 17:15 remplace Travail → Maison et passe dans OSRM',async()=>{const x=await state(p);key=x.n.tripKey;assert.equal(x.n.source,'manual');assert.equal(x.n.dep,'2026-10-07T17:15');assert.equal(x.n.originId,'work');assert.equal(x.n.destinationPoint.address,'29 Rue Jean Jaurès 80610 Saint-Ouen');assert.equal(x.n.destinationPoint.provider,'IGN/BAN');assert.equal(x.car,carA);assert.equal(x.first.key,key);assert.equal(x.first.src,'local');assert(x.route.km>0);assert(ctl.osrmCalls.length>0);});
  await check(dev+' · même destination/voiture dans Météo, Pneus, Tenue, Analyse et Decision Core',async()=>{for(const v of ['meteo','pneus','tenue','analyse']){await tap(p,dev,'#viewSeg [data-act=view][data-v='+v+']');const x=await state(p);assert.equal(x.n.tripKey,key);assert.equal(x.car,carA);assert.match(x.destination,/Saint-Ouen/);}await tap(p,dev,'#viewSeg [data-act=view][data-v=pneus]');assert.match(await p.locator('#secTripSummary').innerText(),/PROCHAIN TRAJET.*17:15.*Travail.*Saint-Ouen.*i20 N/s);assert.match(await p.locator('#decisionCore').innerText(),/Saint-Ouen/);});
  await tap(p,dev,'#secTripSummary [data-act=view][data-v=trajet]');await p.locator('#secTrip input[name=tripWhen][value=later]').check();await p.fill('#tripTime','17:30');await p.selectOption('#tripCar',carB);await tap(p,dev,'#secTrip [data-act=trip-plan]');await p.waitForFunction(id=>APP_CONTEXT.snapshot.activeCarId===id,carB);
  await check(dev+' · modifier heure + véhicule garde la même clé et aucun doublon',async()=>{const x=await state(p);assert.equal(x.n.tripKey,key);assert.equal(x.n.dep,'2026-10-07T17:30');assert.equal(x.car,carB);assert.equal(await p.evaluate(k=>APP_CONTEXT.trips.filter(t=>t.key===k).length,key),1);});
  await p.reload();await s.settle(6);
  await check(dev+' · refresh conserve adresse, heure, véhicule et source manuelle',async()=>{const x=await state(p);assert.equal(x.n.tripKey,key);assert.equal(x.n.dep,'2026-10-07T17:30');assert.equal(x.car,carB);assert.equal(x.n.destinationPoint.address,'29 Rue Jean Jaurès 80610 Saint-Ouen');assert.equal(x.context.dayContext.nextDestination.source,'manual');});
  await s.c.setOffline(true);await p.evaluate(()=>{CANCELROUTEGEN++;CANCELROUTES.clear();rebuild();renderAll();});await s.settle(2);
  await check(dev+' · offline : contexte et dernière route connue restent disponibles',async()=>{const x=await state(p);assert.equal(x.n.tripKey,key);assert(x.route&&x.route.cached);assert(x.route.km>0);assert.match(await p.locator('#secTrip').innerText(),/Hors connexion · dernière route connue/);});
  await s.c.setOffline(false);await tap(p,dev,'#secTrip [data-act=trip-plan-cancel]');
  await check(dev+' · annulation rend la priorité au planning sans perdre le lieu Travail',async()=>{const x=await state(p);assert.equal(x.n,null);assert.equal(x.status,'work');assert(!(await p.evaluate(k=>APP_CONTEXT.trips.some(t=>t.key===k),key)));});
  ctl.setGeoFail(true);await p.fill('#tripDestQ','Adresse impossible ZXCV');await tap(p,dev,'#secTrip [data-act=trip-dest-search]');await s.settle(2);
  // trois fournisseurs interrogés l'un après l'autre : attendre la réponse affichée, pas un délai fixe (échec intermittent sur PC)
  await p.waitForFunction(()=>/Aucun résultat|Recherche impossible/.test(document.getElementById('secTrip').innerText),null,{timeout:15000}).catch(()=>{});
  await check(dev+' · géocodage impossible : erreur explicite, aucun trajet inventé',async()=>{assert.match(await p.locator('#secTrip').innerText(),/Aucun résultat/);assert.equal((await state(p)).n,null);});
  ctl.setGeoFail(false);await search(p,dev,"1 Rue de l'Église, Saint-Étienne");await check(dev+' · accents, apostrophe et tiret conservés',async()=>assert.match(await p.locator('#secTrip').innerText(),/Rue de l'Église.*Saint-Étienne/));
  if(dev==='iphone')await check('iPhone 11 Pro Max · aucun débordement et cibles ≥ 44 pt',async()=>{const L=await layout(p);assert(L.sw<=L.W+1,JSON.stringify(L));assert.deepEqual(L.wide,[]);assert.deepEqual(L.small,[]);});
  await s.c.close();
 }
 await check('aucune erreur JavaScript',async()=>assert.deepEqual(errors,[]));console.log(n+'/'+n+' scénarios OK');
}finally{await b.close();}})().catch(e=>{console.error('❌ '+stage+' · '+e.stack);process.exit(1);});
