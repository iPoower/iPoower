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
  await check('Garage · aucune erreur JS',async()=>assert.deepEqual(errors,[]));
 }finally{await browser.close();}
 console.log(n+'/'+n+' scénarios Garage PC/iPhone OK');
})().catch(e=>{console.error('❌ Garage · '+stage+' · '+String(e&&e.message||e).split('\n')[0].slice(0,220));process.exit(1)});
