// Journey Replay : scène illustrative PC/iPhone, vrai DOM, provenance et mouvement.
'use strict';
const assert=require('node:assert/strict');
const {session,BR,errors}=require('./lib/context-session');
let total=0,stage='';
async function check(label,fn){stage=label;await fn();total++;console.log('✅ '+label);}
(async()=>{
 const browser=await BR.launch();
 try {
  for(const dev of ['iphone','pc']){
   const s=await session(browser,{at:'2026-10-18T20:30:00+02:00',dev}),p=s.p;
   try{
    await require('./lib/journal-activation')(p);
    const baseline=await p.evaluate(()=>{
      const at=Date.now(), dep=at-30*60000;
      const start={key:'trajet-fictif',at:dep,name:'Route fictive',from:'Lieu A',to:'Lieu B',
        carId:S.cars[0].id,car:'Voiture test',
        prediction:{known:true,conditions:['rain'],fetchedAt:dep-5*60000,offline:true}};
      USER_STORE.state.debrief=Debrief.reply(
        Debrief.close(Debrief.begin(USER_STORE.state.debrief,start,at),{key:start.key,how:'confirmé',
          name:start.name,from:start.from,to:start.to},at),
        start.key,{conditions:['wet','fog'],grip:'unknown'},at+1000);
      renderDebrief();
      return JSON.stringify(USER_STORE.state.debrief);
    });
    await check(dev+' · projection existante dans journal sans seconde interface Garage',async()=>{
      const journal=p.locator('#secDebrief .debrief-journal');
      assert.equal(await journal.count(),1);
      await journal.locator(':scope > summary').click();
      const entry=p.locator('#secDebrief .debrief-entry').first();
      await entry.locator(':scope > summary').click();
      assert.equal(await entry.locator('.jr-replay').count(),1);
      await entry.locator('.jr-replay > summary').click();
      const text=await entry.locator('.jr-replay').innerText();
      assert.match(text,/AVANT · PRÉVISION FIGÉE/);
      assert.match(text,/APRÈS · DÉCLARATION CONDUCTEUR/);
      assert.match(text,/Brume \/ brouillard/);
      assert.match(text,/SANS ÉCHELLE/);
      assert.equal(await p.locator('#secGarage .jr-replay').count(),0);
    });
    await check(dev+' · Play, pause, phases séparées, focus et DOM stables',async()=>{
      const scene=p.locator('#secDebrief .jr-scene').first();
      await scene.scrollIntoViewIfNeeded();
      await p.waitForTimeout(100);
      await p.locator('#secDebrief .jr-replay [data-jr-act=before]').click();
      assert.equal(await scene.getAttribute('data-mode'),'before');
      await p.locator('#secDebrief .jr-replay [data-jr-act=after]').click();
      assert.equal(await scene.getAttribute('data-mode'),'after');
      await p.locator('#secDebrief .jr-replay [data-jr-act=play]').click();
      assert.equal(await scene.getAttribute('data-mode'),'auto');
      // Préserver le DOM durant les rerenders ordinaires.
      const reference=await p.evaluate(()=>{
        renderDebrief();const btn=document.querySelector('#secDebrief [data-jr-act=after]');
        btn.focus();const root=document.querySelector('#secDebrief');const before=JSON.stringify(USER_STORE.state.debrief);
        const observer=new MutationObserver(()=>{});observer.observe(root,{subtree:true,childList:true});
        for(let i=0;i<30;i++)renderDebrief();
        const mutations=observer.takeRecords().filter(x=>x.type==='childList').length;observer.disconnect();
        return {mutations,stable:btn===document.querySelector('#secDebrief [data-jr-act=after]'),
          focused:document.activeElement===btn,same:JSON.stringify(USER_STORE.state.debrief)===before};
      });
      assert.deepEqual(reference,{mutations:0,stable:true,focused:true,same:true});
    });
    await check(dev+' · mouvement réduit et suspension page masquée',async()=>{
      const scene=p.locator('#secDebrief .jr-scene').first();
      await p.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await scene.getAttribute('data-running'),'false');
      assert.equal(await scene.getAttribute('data-mode'),'before');
      assert.equal(await scene.locator('.jr-vehicle').first().evaluate(x=>getComputedStyle(x).animationName),'none');
      await p.emulateMedia({reducedMotion:'no-preference'});
      await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
      assert.equal(await scene.getAttribute('data-running'),'false');
      await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    });
    await check(dev+' · aucune mutation archive, aucune requête nouvelle',async()=>{
      const callsBefore=s.S.calls;
      const out=await p.evaluate(()=>{
        const at=JSON.stringify(USER_STORE.state.debrief);
        for(let i=0;i<20;i++)renderDebrief();
        return {same:at===JSON.stringify(USER_STORE.state.debrief),scenes:document.querySelectorAll('#secDebrief .jr-replay').length,
          loaded:typeof JourneyReplay==='object'};
      });
      assert.equal(out.same,true);assert.equal(out.scenes,1);assert.equal(out.loaded,true);
      await s.settle(1);
      assert.equal(s.S.calls,callsBefore,'Replay ne doit lancer aucune requête météo');
      assert.equal(JSON.stringify(await p.evaluate(()=>USER_STORE.state.debrief)),baseline);
    });
    await check(dev+' · annulation masque le replay mais conserve l’archive',async()=>{
      await p.evaluate(()=>{
        USER_STORE.state.debrief=Debrief.undo(USER_STORE.state.debrief,'trajet-fictif',Date.now()+2000);
        renderDebrief();
      });
      assert.equal(await p.locator('#secDebrief .jr-replay').count(),0);
      assert.equal(await p.evaluate(()=>USER_STORE.state.debrief.entries.length),1);
    });
   }finally{await s.c.close();}
  }
  console.log('✅ '+total+' vérifications Journey Replay '+BR.NAME);
 }finally{await browser.close();}
})().catch(e=>{console.error('❌ '+stage,e);process.exit(1)});
