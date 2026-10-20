// Garage à la place de Tenue : vrai clic PC/iPhone, données existantes et aucune suppression.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BR,session,errors}=require('./lib/context-session');
let n=0,stage='';
const check=async(t,fn)=>{stage=t;await fn();n++;console.log('✅ '+t)};
// Référence reproductible : réseau et profil entièrement fictifs, aucun secret de production.
async function precisionReference(browser,dev){
 const s=await session(browser,{at:'2026-10-07T06:00:00+02:00',dev}),p=s.p;
 try{
  await p.evaluate(()=>{
   USER_STORE.state.dayContext.activeCarId=S.cars[0].id;
   F1Pure.FEATURES.forEach(f=>{S.flags['f1'+f.id[0].toUpperCase()+f.id.slice(1)]=1;});
   S.cars[0].plan={on:1,model:'Hiver test',etaFrom:'2026-12-01'};
   document.querySelector('#placeBar [data-act=place-confirm][data-place=home]').click();
  });
  await s.settle(4);
  const views=[];
  for(const view of ['meteo','pneus','trajet','garage','analyse']){
   const button=p.locator('#viewSeg [data-v='+view+']');
   if(dev==='iphone')await button.tap();else await button.click();
   await s.settle(2);
   views.push(await p.evaluate(()=>{
    const rect=id=>{const e=document.getElementById(id),r=e&&e.getBoundingClientRect();return r&&r.height?{top:Math.round(r.top+scrollY),bottom:Math.round(r.bottom+scrollY)}:null;};
    return {view:UI.view,modules:[...document.querySelectorAll('.f1-extension')].filter(e=>e.getBoundingClientRect().height).map(e=>e.dataset.f1),
     width:innerWidth,viewport:innerHeight,scrollWidth:document.documentElement.scrollWidth,decision:rect('decisionCore'),trip:rect('secBrf'),dock:rect('f1Dock'),
     engineerOpen:document.querySelector('#f1-panel-raceEngineer')?.open??null};
   }));
  }
  await p.locator('#viewSeg [data-v=garage]').click();await s.settle(2);
  await p.locator('#secGarage .garage-plan > summary').first().click();
  const rendering=await p.evaluate(()=>{
   const root=document.getElementById('secGarage'),button=root.querySelector('button.garage-edit'),plan=root.querySelector('.garage-plan');button.focus();
   const observer=new MutationObserver(()=>{});observer.observe(root,{childList:true,subtree:true});
   const t=performance.now();for(let k=0;k<20;k++)renderGarage();const elapsed=performance.now()-t;
   const mutations=observer.takeRecords().filter(r=>r.type==='childList').length;observer.disconnect();
   return {renders:20,elapsedMs:Math.round(elapsed*100)/100,childMutations:mutations,
    buttonPreserved:button===root.querySelector('button.garage-edit'),focusPreserved:document.activeElement===button,planOpen:!!root.querySelector('.garage-plan')?.open};
  });
  const choose=p.locator('#secGarage .garage-car:nth-child(2) [data-act=day-car]'),target=await choose.getAttribute('data-id');
  await choose.hover();const box=await choose.boundingBox();
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();
  await p.evaluate(()=>renderAll());await p.mouse.up();await s.settle(2);
  const interruptedClickWorks=await p.evaluate(id=>APP_CONTEXT.snapshot.activeCarId===id,target);
  const reference={browser:BR.NAME,device:dev,views,garageRendering:rendering,interruptedClickWorks,physicalDevice:false};
  fs.writeFileSync(path.join(process.env.SP,'place-precision-'+dev+'.json'),JSON.stringify(reference,null,2));
  console.log('PRECISION_REFERENCE '+JSON.stringify(reference));
 }finally{await s.c.close();}
}
async function twinScenario(browser){
 const s=await session(browser,{at:'2026-10-07T06:00:00+02:00',dev:'iphone'}),p=s.p;
 try{
  await p.evaluate(()=>{
   S.cars[0].name='Hyundai i20 N · démonstration fictive';S.cars[1].name='Peugeot 308 · démonstration fictive';
   USER_STORE.state.dayContext.activeCarId=S.cars[0].id;
   UI.view='garage';renderAll();APP_CONTEXT.rendering=true;
   const hs=[{t:'2026-10-07T06:00',T:7,Tr:6,P:1,Pl:1,rain:1,RH:95,vis:800,gust:30,wind:15,dir:270,code:45},
    {t:'2026-10-07T07:00',T:2,Tr:1,P:0.4,snow:.3,RH:95,vis:4000,gust:25,wind:12,code:73},
    {t:'2026-10-07T07:00',T:9,Tr:8,P:0,RH:80,vis:10000,gust:5,code:0}];
   M.twinFixture={hs,mode:'live',days:[{date:'2026-10-07',sunrise:'2026-10-07T07:00',sunset:'2026-10-07T19:00'}]};RAW.twinFixture={t:Date.now()};
   window.__twinSource=M.twinFixture;window.__twinReceived=RAW.twinFixture;
   window.__twinTrip={key:'fictif',from:'Lieu A',to:'Lieu B',dep:'2026-10-07T06:30',arr:'2026-10-07T07:15',
    seq:hs.map((h,i)=>({hs,i,t:i===0?'2026-10-07T06:30':'2026-10-07T07:15',loc:i===0?'Lieu A':i===2?'Lieu B':'Point météo test'})),res:[]};
   window.__twinRender=()=>{M.twinFixture=window.__twinSource;RAW.twinFixture=window.__twinReceived;APP_CONTEXT.snapshot=Object.freeze({...APP_CONTEXT.snapshot,nextTrip:window.__twinTrip});renderGarage();};
   window.__twinRender();
  });
  await check('Mission · identité véhicule, origine, destination et météo avec Twin Garage',async()=>{
   const o=await p.evaluate(()=>{
    const root=document.querySelector('#missionControl'),twin=document.querySelector('.twin-route');
    const car=Garage.overview(S.cars,appActiveCar() && appActiveCar().id,tyreStateOf).find(x=>x.active);
    const scene=Garage.preview(APP_CONTEXT.snapshot.nextTrip,{sourceFor:garageWeatherSources(),offline:offlineNow(),now:Date.now(),freshness:Reliability.freshState});
    return {car:root.querySelector('[data-mission-car]')?.textContent,expectedCar:car?.name,
     origin:root.querySelector('[data-mission-from]')?.textContent,
     destination:root.querySelector('[data-mission-to]')?.textContent,
     twin: [...twin.querySelectorAll('b')].map(x=>x.textContent),
     temperature:root.querySelector('.mission-grid b')?.textContent,
     expectedTemperature:scene.samples[0]?.temperature,
     withoutExtras:!root.querySelector('script,img'),state:root.querySelector('.mission-grid').textContent};
   });
   assert.equal(o.car,o.expectedCar);assert.deepEqual([o.origin,o.destination],o.twin);
   assert(o.temperature.includes(String(o.expectedTemperature).replace('.',',')),JSON.stringify(o));
   assert(o.withoutExtras);assert.match(o.state,/PRÉVISION|INDISPONIBLE|CACHE|CONFIRMER/);
  });
  await check('Mission · détails accessibles au clavier, sans reconstruire le focus',async()=>{
   const summary=p.locator('#missionControl [data-ux=mission-sources] > summary');
   await summary.focus();await p.keyboard.press('Enter');
   const before=await p.evaluate(()=>({
    opened:document.querySelector('#missionControl [data-ux=mission-sources]').open,
    focused:document.activeElement===document.querySelector('#missionControl [data-ux=mission-sources] > summary')
   }));
   assert(before.opened&&before.focused,JSON.stringify(before));
   await p.evaluate(()=>{__twinSource.hs[0].T=6;__twinRender();});
   const after=await p.evaluate(()=>({
    opened:document.querySelector('#missionControl [data-ux=mission-sources]').open,
    focused:document.activeElement===document.querySelector('#missionControl [data-ux=mission-sources] > summary'),
    updated:document.querySelector('#missionControl .mission-grid b').textContent.includes(f1(6)+' °C')
   }));
   assert(after.opened&&after.focused&&after.updated,JSON.stringify(after));
  });
  await check('Twin · scène schématique, effets documentés et aucun GPS simulé',async()=>{
   const text=await p.locator('#secGarage').innerText();assert.match(text,/TWIN GARAGE LIVE/);assert.match(text,/SCHÉMA SANS ÉCHELLE/);assert.match(text,/sans suivi GPS/);
   for(const cls of ['twin-rain','twin-snow','twin-fog','twin-wind','twin-moon','twin-sun'])assert(await p.locator('#secGarage .'+cls).count(),cls);
   assert.match(await p.locator('.twin-wind').evaluate(e=>e.parentElement.getAttribute('transform')),/^rotate\(0 /,'vent venant de l’ouest : mouvement vers l’est');
   assert.equal(await p.locator('.twin-samples li').count(),3);assert.equal(await p.locator('.twin-car-svg').count(),3);
  });
  await check('Twin · clavier, pause volontaire, mouvement réduit et reprise iOS',async()=>{
   await p.locator('.twin-scene').scrollIntoViewIfNeeded();await p.waitForTimeout(150);
   assert.equal(await p.locator('.twin-scene').getAttribute('data-running'),'true','animation visible');
   await p.locator('#garageMotion').focus();await p.keyboard.press('Space');
   assert.equal(await p.locator('.twin-scene').getAttribute('data-running'),'false','pause clavier');
   await p.keyboard.press('Space');
   await p.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await p.locator('.twin-drive').evaluate(e=>getComputedStyle(e).animationName),'none','mouvement réduit');
   await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForTimeout(100);
   await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal(await p.locator('.twin-scene').getAttribute('data-running'),'false','document masqué');
   await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));});
   await p.waitForFunction(()=>document.querySelector('.twin-scene').dataset.running==='true',null,{timeout:3000});
   assert.equal(await p.locator('.twin-scene').getAttribute('data-running'),'true','reprise document');
   await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await p.locator('.twin-scene').getAttribute('data-running'),'false','pagehide');
   await p.evaluate(()=>window.dispatchEvent(new Event('pageshow')));assert.equal(await p.locator('.twin-scene').getAttribute('data-running'),'true','pageshow');
  });
  await check('Twin · suspension réelle hors écran via IntersectionObserver',async()=>{
   await p.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await p.clock.runFor(300);await p.waitForTimeout(150);
   await p.waitForFunction(()=>document.querySelector('.twin-scene').dataset.running==='false',null,{timeout:3000});
   assert.equal(await p.locator('.twin-scene').getAttribute('data-running'),'false',JSON.stringify(await p.evaluate(()=>({y:scrollY,top:document.querySelector('.twin-scene').getBoundingClientRect().top,visible:GARAGE_MOTION.visible}))));
   await p.locator('.twin-scene').scrollIntoViewIfNeeded();await p.clock.runFor(300);await p.waitForTimeout(150);
   await p.waitForFunction(()=>document.querySelector('.twin-scene').dataset.running==='true',null,{timeout:3000});
   assert.equal(await p.locator('.twin-scene').getAttribute('data-running'),'true');
  });
  await check('Twin · rendu sans minuterie par image ni requête supplémentaire',async()=>{
   // Les événements de reprise précédents requalifient les vrais caches :
   // réinstaller l'entrée fictive avant de mesurer cinquante entrées identiques.
   await p.evaluate(()=>__twinRender());
   const calls=s.S.calls,result=await p.evaluate(()=>{
    const root=document.querySelector('#secGarage'),node=root.querySelector('.twin-scene'),before=JSON.stringify(S.cars),obs=new MutationObserver(()=>{});obs.observe(root,{childList:true,subtree:true});
    const start=performance.now();for(let i=0;i<50;i++)renderGarage();const elapsed=performance.now()-start;
    const mutations=obs.takeRecords().length;obs.disconnect();
    return {same:node===root.querySelector('.twin-scene'),unchanged:before===JSON.stringify(S.cars),mutations,elapsedMs:elapsed};
   });assert.equal(s.S.calls,calls);assert(result.same&&result.unchanged,JSON.stringify(result));assert.equal(result.mutations,0,JSON.stringify(result));assert(result.elapsedMs<1000,JSON.stringify(result));
   fs.writeFileSync(path.join(process.env.SP,'twin-performance-'+BR.NAME+'.json'),JSON.stringify(result,null,2));
  });
  await check('Twin · focus boutons et panneaux ouverts conservés après vraies modifications',async()=>{
   const result=await p.evaluate(()=>{
    const root=document.querySelector('#secGarage'),b=root.querySelector('.garage-edit');b.focus();S.cars[0].odo=[{d:'2026-10-07',km:12345}];renderGarage();
    const buttonFocus=document.activeElement===root.querySelector('.garage-edit');
    const fold=root.querySelector('[data-ux=garage-sources]');fold.open=true;fold.querySelector('summary').focus();M.twinFixture.hs[0].T=6;renderGarage();
    return {buttonFocus,foldOpen:root.querySelector('[data-ux=garage-sources]').open,foldFocus:document.activeElement===root.querySelector('[data-ux=garage-sources] > summary')};
   });assert.deepEqual(result,{buttonFocus:true,foldOpen:true,foldFocus:true});
  });
  for(const theme of ['dark','light'])for(const width of [320,375,414,1440]){
   await check('Twin · '+theme+' '+width+' px sans débordement ni cible trop petite',async()=>{
    await p.setViewportSize({width,height:896});await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.querySelector('[data-ux=garage-sources]').open=false;},theme);
    const result=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('#secGarage *')].filter(e=>{
     if(e.closest('svg')||!e.getBoundingClientRect().height)return false;const r=e.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5;
    }).map(e=>e.tagName+'.'+e.className),targets:[...document.querySelectorAll('#secGarage .btn')].map(e=>e.getBoundingClientRect().height)}));
    assert(result.scroll<=result.width+1,JSON.stringify(result));assert.deepEqual(result.overflow,[]);assert(result.targets.every(h=>h>=44));
    if([414,1440].includes(width))await p.locator('#secGarage').screenshot({path:path.join(process.env.SP,'twin-'+BR.NAME+'-'+theme+'-'+width+'.jpg'),type:'jpeg',quality:80,scale:'css',animations:'disabled',style:'.statusbar{visibility:hidden}'});
   });
  }
  await check('Twin · thème automatique clair conserve une ambiance de nuit distincte',async()=>{
   await p.emulateMedia({colorScheme:'light'});await p.evaluate(()=>document.documentElement.dataset.theme='auto');
   const colors=await p.evaluate(()=>({night:getComputedStyle(document.querySelector('.twin-night')).fill,foreground:getComputedStyle(document.body).color}));
   assert.equal(colors.night,colors.foreground);await p.evaluate(()=>document.documentElement.dataset.theme='light');
  });
  await check('Twin · cycle minute V1.3 projette le Garage et conserve le contrôle focalisé',async()=>{
   const result=await p.evaluate(()=>{
    const root=document.querySelector('#secGarage'),input=root.querySelector('#garageMotion'),button=root.querySelector('.garage-edit');
    input.focus({preventScroll:true});const checked=input.checked,y=scrollY;
    APP_CONTEXT.rendering=false;
    try {
     tickLocalClock(true);
     const t=APP_CONTEXT.snapshot.nextTrip,labels=[...root.querySelectorAll('.twin-route b')].map(x=>x.textContent);
     return {expected:t&&[t.from,t.to],labels,focus:document.activeElement===root.querySelector('#garageMotion'),
      checked:root.querySelector('#garageMotion').checked===checked,sameButton:button===root.querySelector('.garage-edit'),scroll:Math.abs(scrollY-y)};
    } finally {APP_CONTEXT.rendering=true;}
   });
   assert(result.expected);assert.deepEqual(result.labels,result.expected);assert(result.focus&&result.checked&&result.sameButton,JSON.stringify(result));assert(result.scroll<=1);
   await p.evaluate(()=>__twinRender());
  });
  await check('Twin · comparaison incomplète explicite, pression cible distincte du contrôle',async()=>{
   await p.evaluate(()=>{const f=document.querySelector('[data-ux=garage-comparison]');f.open=true;});
   const text=await p.locator('[data-ux=garage-comparison]').innerText();assert.match(text,/DONNÉES INSUFFISANTES/);assert.match(text,/Pression cible/i);assert.match(text,/Contrôle déclaré/i);
   await p.evaluate(()=>{__twinSource.mode='demo';__twinRender();});
   assert.match(await p.locator('.twin-trip .mod-h .src').innerText(),/DÉMO · SIMULATION/);
   assert.equal(await p.locator('.twin-scene').getAttribute('data-running'),'false');
   await p.evaluate(()=>{__twinSource.mode='live';__twinRender();});
  });
  await check('Twin · changement de lieu et labels non interprétés comme HTML',async()=>{
   await p.evaluate(()=>{__twinTrip={...__twinTrip,from:'Lieu C',to:'<img src=x onerror=alert(1)>'};__twinRender();});
   assert.match(await p.locator('.twin-route').innerText(),/Lieu C/);assert.equal(await p.locator('.twin-route img').count(),0);
  });
  await check('Twin · hors ligne puis météo absente : aucune animation trompeuse',async()=>{
   await s.c.setOffline(true);await p.evaluate(()=>__twinRender());assert.match(await p.locator('.twin-trip').innerText(),/HORS LIGNE/);assert.equal(await p.locator('.twin-scene').getAttribute('data-running'),'false');
   assert.match(await p.locator('#missionControl').innerText(),/HORS LIGNE/);
   await s.c.setOffline(false);await p.evaluate(()=>{__twinTrip={...__twinTrip,seq:[]};__twinRender();});
   assert.match(await p.locator('.twin-trip').innerText(),/Aucun effet météo représenté/);assert.equal(await p.locator('.twin-rain,.twin-snow,.twin-fog,.twin-wind').count(),0);
  });
  await check('Twin · aucun trajet : fiches intactes et observateur déconnecté',async()=>{
   await p.evaluate(()=>{__twinTrip=null;__twinRender();});assert.equal(await p.locator('.twin-scene').count(),0);assert.equal(await p.locator('.garage-car').count(),2);
   assert.match(await p.locator('#missionControl').innerText(),/Aucun prochain trajet connu/);
   assert.equal(await p.evaluate(()=>GARAGE_MOTION.observer),null);
  });
  await check('Twin · aucune violation de CSP',async()=>assert.deepEqual(await p.evaluate(()=>window.__csp),[]));
 }finally{await s.c.close();}
}
(async()=>{
 const browser=await BR.launch();
 try{
  for(const dev of ['iphone','pc'])await precisionReference(browser,dev);
  for(const dev of ['iphone','pc']){
   const s=await session(browser,{at:'2026-10-10T12:00:00+02:00',dev}),p=s.p;
   const tap=async selector=>{
    stage=dev+' · '+selector;const el=p.locator(selector).first();
    if(dev==='iphone')await el.tap({timeout:20000});else await el.click({timeout:20000});
    await s.settle(3);
   };
   try{
    await check(dev+' · cinq onglets, Garage visible, Tenue absent',async()=>{
     assert.deepEqual(await p.locator('#viewSeg [data-act=view]').evaluateAll(xs=>xs.map(x=>x.dataset.v)),
      ['meteo','pneus','trajet','garage','analyse']);
     assert.equal(await p.locator('#viewSeg [data-v=tenue]').count(),0);
    });
    await tap('#viewSeg [data-act=view][data-v=garage]');
    await check(dev+' · Garage ouvert au toucher et 2 fiches déjà enregistrées',async()=>{
     assert(await p.locator('#secGarage').isVisible());
     assert.equal(await p.locator('#secGarage .garage-car').count(),2);
     assert.equal(await p.locator('#secTenue').isVisible(),false);
     assert.match(await p.locator('#secGarage').innerText(),/THE GARAGE/);
     assert.equal(await p.locator('#secGarage button.garage-edit').count(),2);
    });
    const before=await p.evaluate(()=>JSON.stringify(S.cars));
    // Valeurs fictives affectées uniquement à la session CI, aucun stockage utilisateur.
    await p.evaluate(()=>{
      const c=S.cars[0];
      c.odo=[{d:'2026-10-02',km:121000}];
      c.tire.type='summer';c.tire.brand='Marque test';c.tire.model='Pneu test';c.tire.size='215/40R18';
      c.tire.tread=4.7;c.tire.treadEst=1;c.tire.press='2.3';c.tire.pchk={date:'2026-10-01',T:15};
      c.plan={on:1,brand:'Marque hiver',model:'Neige test',etaFrom:'2026-12-01',etaTo:'2026-12-04',appointmentDate:'2027-01-05',appointmentConfirmed:0};
      renderAll();
    });
    const synthetic=await p.evaluate(()=>JSON.stringify(S.cars));
    await check(dev+' · compteur, mesure estimée, pression cible et plan hiver explicites',async()=>{
      const car=p.locator('#secGarage .garage-car').first();
      await tap('#secGarage .garage-car:first-child details[data-ux] > summary');
      assert.match(await car.innerText(),/121\s?000 km|121.000 km/);
      assert.match(await car.innerText(),/Estimée, non mesurée/);
      assert.match(await car.innerText(),/Cible renseignée|Contrôle déclaré/);
      assert.match(await car.innerText(),/Entretien mécanique : aucun carnet/);
      await tap('#secGarage .garage-car:first-child .garage-plan > summary');
      assert.match(await car.innerText(),/01\/12\/2026/);
    });
    await check(dev+' · actualisation identique : plan ouvert, boutons et focus conservés',async()=>{
      const result=await p.evaluate(()=>{
       const root=document.getElementById('secGarage'),button=root.querySelector('button.garage-edit');button.focus();
       const observer=new MutationObserver(()=>{});observer.observe(root,{childList:true,subtree:true});
       renderAll();renderAll();
       const mutations=observer.takeRecords().filter(r=>r.type==='childList').length;observer.disconnect();
       return {open:root.querySelector('.garage-plan').open,sameButton:button===root.querySelector('button.garage-edit'),focus:document.activeElement===button,mutations};
      });
      assert.deepEqual(result,{open:true,sameButton:true,focus:true,mutations:0},JSON.stringify(result));
    });
    await check(dev+' · donnée actualisée : compteur visible et plan hiver toujours ouvert',async()=>{
      await p.evaluate(()=>{S.cars[0].odo[0].km=121001;renderAll();});
      assert.match(await p.locator('#secGarage .garage-car').first().innerText(),/121\s?001 km|121.001 km/);
      assert.equal(await p.locator('#secGarage .garage-plan').first().evaluate(e=>e.open),true);
      await p.evaluate(()=>{S.cars[0].odo[0].km=121000;renderAll();});
    });
    await check(dev+' · clic en cours conservé pendant une actualisation',async()=>{
      const button=p.locator('#secGarage .garage-car:nth-child(2) [data-act=day-car]'),target=await button.getAttribute('data-id');
      // hover attend une cible stable et réellement accessible (y compris sous les barres fixes).
      await button.hover();const box=await button.boundingBox();
      await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();
      await p.evaluate(()=>renderAll());await p.mouse.up();await s.settle(3);
      assert.equal(await p.evaluate(()=>APP_CONTEXT.snapshot.activeCarId),target);
      await p.evaluate(()=>appSetCar(S.cars[0].id));await s.settle(2);
    });
    await check(dev+' · visualisation pure : les deux fiches sources restent identiques',async()=>{
      assert.equal(await p.evaluate(()=>JSON.stringify(S.cars)),synthetic);
    });
    await check(dev+' · sélection de voiture réutilise la source canonique',async()=>{
      const target=await p.evaluate(()=>S.cars[1].id);
      await tap('#secGarage .garage-car:nth-child(2) [data-act=day-car]');
      assert.equal(await p.evaluate(()=>APP_CONTEXT.snapshot.activeCarId),target);
      assert.equal(await p.locator('#secGarage .garage-car:nth-child(2) .garage-active').count(),1);
    });
    await check(dev+' · modification ouvre les paramètres historiques sans duplication',async()=>{
      await tap('#secGarage .garage-car:first-child [data-act=goset-cfg]');
      assert.equal(await p.locator('#settings').evaluate(x=>x.open),true);
      assert(await p.locator('#settingsBody [data-bind="cars.0.tire.type"]').count());
    });
    await tap('#viewSeg [data-act=view][data-v=analyse]');
    await tap('#viewSeg [data-act=view][data-v=garage]');
    await check(dev+' · changement onglet ne supprime aucun relevé',async()=>{
      assert.equal(await p.evaluate(()=>JSON.stringify(S.cars)),synthetic);
      assert.equal(await p.locator('#secGarage .garage-car').count(),2);
    });
    await p.reload();await s.settle(12);
    await check(dev+' · onglet Garage restauré après rechargement, sans effacer les données',async()=>{
      assert.equal(await p.evaluate(()=>UI.view),'garage');
      assert(await p.locator('#secGarage').isVisible());
      assert.equal(await p.locator('#secGarage .garage-car').count(),2);
      // Le scénario n'a jamais appelé saveSettings sur ses valeurs fictives.
      assert.equal(await p.evaluate(()=>JSON.stringify(S.cars)),before);
    });
    await s.c.setOffline(true);
    await p.evaluate(()=>renderAll());
    await check(dev+' · Garage reste consultable hors connexion',async()=>{
      assert.equal(await p.locator('#secGarage .garage-car').count(),2);
      assert.equal(await p.locator('#viewSeg [data-v=garage]').getAttribute('aria-pressed'),'true');
    });
   } finally{await s.c.close();}
  }
  await twinScenario(browser);
  await check('Garage · aucune erreur JS',async()=>assert.deepEqual(errors,[]));
 }finally{await browser.close();}
 console.log(n+'/'+n+' scénarios Garage PC/iPhone OK');
})().catch(e=>{console.error('❌ Garage · '+stage+' · '+String(e&&e.message||e).split('\n')[0].slice(0,220));process.exit(1)});
