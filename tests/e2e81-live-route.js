// Vraie vue Garage + Leaflet, uniquement sur route, météo et positions fictives.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { session, BR, errors } = require('./lib/context-session');
let n=0, stage=''; const check=async(label,fn)=>{stage=label;await fn();n++;console.log('✅ '+label);};
(async()=>{
 const browser=await BR.launch();
 try {
  for(const dev of ['iphone','pc']){
   const s=await session(browser,{at:'2026-10-20T08:00:00+02:00',dev}),p=s.p;
   try{
    // Fond explicitement fictif : la géométrie et Leaflet sont réellement rendus.
    await s.c.route(/arcgisonline|tile\.openstreetmap/,r=>r.fulfill({status:200,contentType:'image/svg+xml',body:
     '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#131c26"/><path d="M0 110H256M100 0V256M0 220L256 15" stroke="#283847" stroke-width="6"/><text x="12" y="40" fill="#637487" font-size="10">FOND FICTIF · ESSAI</text></svg>'}));
    await p.evaluate(()=>{
     UI.view='garage';renderAll();APP_CONTEXT.rendering=true;
     const hs=[{t:'2026-10-20T08:00',T:9,P:0,vis:10000,wind:8,gust:12,code:3},
      {t:'2026-10-20T08:00',T:7,P:1.5,vis:800,wind:18,gust:30,code:45}];
     M.liveRouteFixture={hs,mode:'live',days:[]};RAW.liveRouteFixture={t:Date.now()};
     const dep='2026-10-20T08:00';
     window.__lrTrip={key:'live-route-fixture',src:'local',from:'Lieu A',to:'Lieu B',dep,arr:addMin(dep,30),running:false,
      l:{routed:true,km:8,min:30,from:{lat:48,lon:2},to:{lat:48.02,lon:2.06},g:[[48,2],[48.02,2],[48.02,2.06]]},
      seq:[{hs,i:0,f:0,lat:48,lon:2,t:dep},{hs,i:1,f:.65,lat:48.02,lon:2.02,t:addMin(dep,20)},{hs,i:0,f:1,lat:48.02,lon:2.06,t:addMin(dep,30)}]};
     window.__lrRender=()=>{APP_CONTEXT.snapshot=Object.freeze({...APP_CONTEXT.snapshot,nextTrip:__lrTrip,activeTrip:__lrTrip&&__lrTrip.running?__lrTrip:null});renderGarage();};
     __lrRender();
    });
    await p.locator('#garageLiveRoute').scrollIntoViewIfNeeded();
    await p.waitForFunction(()=>!!GARAGE_LIVE.map&&!!GARAGE_LIVE.marker);
    await check(dev+' · carte Leaflet, même Garage premium et même silhouette',async()=>{
     assert.equal(await p.locator('#viewSeg [data-act=view]').count(),5);
     assert.equal(await p.locator('.garage-car').count(),2);
     assert.equal(await p.locator('#garageLiveRoute .leaflet-container').count(),1);
     assert.equal(await p.locator('#garageLiveRoute .lr-vehicle-icon .twin-car-svg').count(),1);
     assert.equal(await p.locator('#garageLiveRoute .lr-sectors span').count(),3);
     assert.match(await p.locator('#garageLiveRoute').innerText(),/SIMULATION.*PRÉPARATION/s);
     assert.match(await p.locator('[data-lr-value=weather]').innerText(),/Visibilité réduite prévue/);
     assert.equal(await p.locator('.lr-weather-icon').count(),3);
    });
    await check(dev+' · curseur réel, distance, durée et lecture indépendante du GPS',async()=>{
     await p.locator('#garageRouteTime').focus();await p.keyboard.press('Home');
     for(let i=0;i<5;i++)await p.keyboard.press('ArrowRight');
     const before=await p.evaluate(()=>({f:GARAGE_LIVE.fraction,gps:FIX&&{...FIX},car:appDay().activeCarId,dest:JSON.stringify(appDay().nextDestination),network:performance.getEntriesByType('resource').filter(x=>/open-meteo|project-osrm/.test(x.name)).length}));
     assert(before.f>0);
     await p.locator('[data-lr=play]').click();await p.clock.runFor(1700);
     await p.locator('[data-lr=play]').click();
     const after=await p.evaluate(()=>({f:GARAGE_LIVE.fraction,gps:FIX&&{...FIX},car:appDay().activeCarId,dest:JSON.stringify(appDay().nextDestination),network:performance.getEntriesByType('resource').filter(x=>/open-meteo|project-osrm/.test(x.name)).length}));
     assert(after.f>before.f);assert.deepEqual(after.gps,before.gps);assert.equal(after.car,before.car);assert.equal(after.dest,before.dest);assert.equal(after.network,before.network);
     assert.match(await p.locator('[data-lr-value=clock]').innerText(),/Durée simulée.*passage simulé/);
    });
    await check(dev+' · rerendus et météo actualisée préservent carte, zoom, curseur et focus',async()=>{
     const result=await p.evaluate(()=>{
      const root=GARAGE_LIVE.root,map=GARAGE_LIVE.map,slider=root.querySelector('input');slider.focus();const f=GARAGE_LIVE.fraction;
      map.setZoom(12);const zoom=map.getZoom();const original=JSON.stringify(__lrTrip);
      for(let i=0;i<12;i++)renderGarage();const unchanged=original===JSON.stringify(__lrTrip);
      M.liveRouteFixture.hs[0].T=10;const updated=JSON.stringify(__lrTrip);__lrRender();
      return{sameRoot:root===GARAGE_LIVE.root,sameMap:map===GARAGE_LIVE.map,focus:document.activeElement===slider,f:GARAGE_LIVE.fraction,expected:f,zoom:map.getZoom(),expectedZoom:zoom,unchanged:unchanged&&updated===JSON.stringify(__lrTrip)};
     });
     assert(result.sameRoot&&result.sameMap&&result.focus&&result.unchanged,JSON.stringify(result));assert.equal(result.f,result.expected);assert.equal(result.zoom,result.expectedZoom);
    });
    await check(dev+' · vue compacte et thèmes sans débordement sur 320, 375, 414 et PC',async()=>{
     await p.locator('[data-lr=compact]').click();assert.equal(await p.locator('#garageLiveRoute').getAttribute('data-compact'),'true');
     await p.evaluate(()=>{UI.view='meteo';renderGarage();UI.view='garage';__lrRender();});
     await p.locator('#garageLiveRoute').scrollIntoViewIfNeeded();await p.waitForFunction(()=>!!GARAGE_LIVE.map);
     assert.equal(await p.locator('[data-lr=compact]').getAttribute('aria-pressed'),'true');
     await p.locator('[data-lr=compact]').click();
     for(const theme of ['dark','light'])for(const width of [320,375,414,1280]){
      await p.setViewportSize({width,height:896});await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
      await p.evaluate(()=>garageLiveEnsure());
      const sizes=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,targets:[...document.querySelectorAll('#garageLiveRoute .btn,#garageRouteTime')].map(x=>x.getBoundingClientRect().height)}));
      assert(sizes.scroll<=sizes.width+1,JSON.stringify(sizes));assert(sizes.targets.every(h=>h>=44),JSON.stringify(sizes));
     }
     await p.setViewportSize({width:dev==='iphone'?414:1280,height:896});await p.evaluate(()=>{document.documentElement.dataset.theme='dark';});await p.evaluate(()=>garageLiveEnsure());
     await p.locator('#garageLiveRoute').screenshot({path:path.join(process.env.SP,'place-live-route-'+BR.NAME+'-'+dev+'.png'),scale:'css',animations:'disabled'});
    });
    await check(dev+' · mouvement réduit et hors écran arrêtent la lecture sans saut temporel',async()=>{
     await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(150);await p.clock.runFor(1200);
     await p.waitForFunction(()=>document.querySelector('#garageLiveRoute [data-lr=play]').disabled,null,{timeout:5000});
     assert(await p.locator('[data-lr=play]').isDisabled());
     await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForTimeout(150);await p.clock.runFor(1200);
     await p.waitForFunction(()=>!document.querySelector('#garageLiveRoute [data-lr=play]').disabled,null,{timeout:5000});
     await p.locator('[data-lr=play]').click();await p.clock.runFor(250);
     await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await p.waitForTimeout(150);await p.clock.runFor(250);
     assert.equal(await p.evaluate(()=>GARAGE_LIVE.playing),false);
     const f=await p.evaluate(()=>GARAGE_LIVE.fraction);await p.clock.runFor(3000);assert.equal(await p.evaluate(()=>GARAGE_LIVE.fraction),f);
     await p.locator('#garageLiveRoute').scrollIntoViewIfNeeded();await p.waitForTimeout(100);
    });
    await check(dev+' · vrai mode GPS alimenté par les fixes canoniques, simulation désactivée',async()=>{
     await p.evaluate(()=>{
      S.gpsAuto=1;PLACE_HOLD=false;PLACE_PENDING=null;PLACE.conf=null;USER_STORE.state.lastDeparture=null;
      __lrTrip.planL=__lrTrip.l;__lrTrip.running=true;LIVE.key=__lrTrip.key;LIVE.phase='active';LIVE.manual=Date.now()-300000;
      FIX={lat:48.005,lon:2,acc:10,ts:Date.now(),speed:null};__lrRender();garageLiveRefresh();
     });
     assert.equal(await p.locator('#garageLiveRoute').getAttribute('data-live'),'true');
     assert.match(await p.locator('.lr-mode').innerText(),/GPS LIVE/);
     assert(await p.locator('[data-lr=simulation]').isDisabled());assert(await p.locator('#garageRouteTime').isDisabled());
     const initial=await p.evaluate(()=>GARAGE_LIVE.gps.fraction);await p.clock.runFor(10000);
     await p.evaluate(()=>{FIX={...FIX,lat:48.008,ts:Date.now()};garageLiveRefresh();});
     assert((await p.evaluate(()=>GARAGE_LIVE.gps.fraction))>initial);
     assert.match(await p.locator('[data-lr-value=gps-trust]').innerText(),/±10 m.*position projetée/);
    });
    await check(dev+' · position périmée : véhicule figé, distance et ETA courantes absentes',async()=>{
     const point=await p.evaluate(()=>{const p=GARAGE_LIVE.marker.getLatLng();return[p.lat,p.lng];});
     await p.clock.runFor(16000);
     assert.equal(await p.locator('#garageLiveRoute').getAttribute('data-live'),'false');
     assert.match(await p.locator('.lr-mode').innerText(),/Position non actualisée/);
     assert.equal(await p.locator('[data-lr-value=distance]').innerText(),'—');assert.equal(await p.locator('[data-lr-value=eta]').innerText(),'—');
     const later=await p.evaluate(()=>{const p=GARAGE_LIVE.marker.getLatLng();return[p.lat,p.lng];});assert.deepEqual(later,point);
    });
    await check(dev+' · GPS imprécis et hors route restent explicites',async()=>{
     await p.evaluate(()=>{FIX={...FIX,acc:2000,ts:Date.now()};garageLiveRefresh();});assert.match(await p.locator('.lr-mode').innerText(),/imprécis/);
     await p.clock.runFor(3000);await p.evaluate(()=>{GARAGE_LIVE.lastGood=null;FIX={...FIX,acc:10,lat:48.01,lon:2.03,ts:Date.now()};garageLiveRefresh();});
     assert.match(await p.locator('.lr-mode').innerText(),/hors du tracé/);assert.equal(await p.locator('#garageLiveRoute').getAttribute('data-live'),'false');
    });
    await check(dev+' · reprise : un nouveau fix est requis après suspension',async()=>{
     await p.evaluate(()=>{FIX={...FIX,lat:48.01,lon:2,ts:Date.now()};garageLiveRefresh();});
     assert.equal(await p.locator('#garageLiveRoute').getAttribute('data-live'),'true');
     await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await p.clock.runFor(100);
     await p.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await p.evaluate(()=>__lrRender());
     assert.equal(await p.locator('#garageLiveRoute').getAttribute('data-live'),'false');
     await p.evaluate(()=>{FIX={...FIX,ts:Date.now()};garageLiveRefresh();});
     assert.equal(await p.locator('#garageLiveRoute').getAttribute('data-live'),'true');
    });
    await check(dev+' · GPS effacé : dernière position du cockpit supprimée et marqueur masqué',async()=>{
     await p.evaluate(()=>{S.gpsAuto=0;FIX=null;garageLiveRefresh();});
     const state=await p.evaluate(()=>{const m=GARAGE_LIVE.marker.getLatLng();return{last:GARAGE_LIVE.lastGood,opacity:GARAGE_LIVE.marker.options.opacity,valid:GARAGE_LIVE.gps.valid,marker:[m.lat,m.lng],start:GARAGE_LIVE.route.pts[0]};});
     assert.equal(state.last,null);assert.equal(state.opacity,0);assert.equal(state.valid,false);
     assert.deepEqual(state.marker,state.start);
     assert.equal(await p.locator('[data-lr-value=distance]').innerText(),'—');
    });
    await check(dev+' · annulation, trajet sans géométrie et sortie du Garage nettoient la carte',async()=>{
     await p.evaluate(()=>{LIVE.phase='idle';LIVE.key=null;__lrTrip={...__lrTrip,key:'route-remplacée',running:false,l:{routed:false},planL:null,seq:[]};__lrRender();});
     assert.equal(await p.locator('#garageLiveRoute .lr-vehicle-icon').count(),0);
     await p.evaluate(()=>{__lrTrip=null;__lrRender();});assert.equal(await p.locator('#garageLiveRoute').count(),0);
     const clean=await p.evaluate(()=>({map:GARAGE_LIVE.map,observer:GARAGE_LIVE.observer,timer:GARAGE_LIVE.timer,raf:GARAGE_LIVE.raf,trip:GARAGE_LIVE.trip}));
     assert.deepEqual(clean,{map:null,observer:null,timer:null,raf:null,trip:null});
     assert.equal(await p.locator('.garage-car').count(),2);
    });
    await check(dev+' · aucune violation CSP',async()=>assert.deepEqual(await p.evaluate(()=>window.__csp),[]));
   }finally{await s.c.close();}
  }
  await check('aucune erreur JavaScript',async()=>assert.deepEqual(errors,[],errors.join(' | ').slice(0,800)));
  console.log(n+'/'+n+' scénarios LIVE ROUTE OK');
 }finally{await browser.close();}
})().catch(e=>{console.error('❌ '+stage+' · '+e.stack);process.exit(1);});
