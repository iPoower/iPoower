// Audit UI indépendant, aucun accès aux données réelles ni écriture applicative.
// Interactions vraies sur PC Chromium et iPhone 11 Pro Max simulé (WebKit/Chromium).
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors, NETWORK_NOISE } = require('./lib/context-session');
const VIEWS = [
  ['pneus','#secCars'], ['meteo','#secWx'], ['trajet','#secTrip'],
  ['tenue','#secTenue'], ['analyse','#secLab']
];
let count = 0, current = '';
const check = async (name, fn) => { current = name; await fn(); ++count; console.log('✅ '+name); };
const go = async (p, dev, v) => {
  const control=p.locator('#viewSeg [data-act=view][data-v='+v+']');
  assert.equal(await control.count(),1,'un seul bouton pour '+v);
  if (dev==='iphone') await control.tap(); else await control.click();
};
const inspect = p => p.evaluate(() => {
  const ids=new Map(), duplicates=[];
  for (const el of document.querySelectorAll('[id]')) {
    if(ids.has(el.id)) duplicates.push(el.id);
    ids.set(el.id,true);
  }
  const visible = el => {
    if(el.closest('[hidden]') || el.closest('details:not([open])')?.querySelector('summary')!==el && el.closest('details:not([open])'))return false;
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;
  };
  const unnamed=[],tiny=[],blocked=[];
  for(const el of document.querySelectorAll('button, summary, a[href], input:not([type=hidden]), select, textarea')) {
    if(!visible(el)||el.disabled)continue;
    const r=el.getBoundingClientRect();
    const name=(el.getAttribute('aria-label')||el.getAttribute('title')||el.innerText||el.getAttribute('value')||'').trim();
    if(!name && !el.closest('label') && !el.getAttribute('aria-labelledby'))unnamed.push((el.tagName.toLowerCase()+'#'+el.id+' '+(el.dataset.act||'')).trim());
    if(window.innerWidth<600 && (r.width<40 || r.height<40) && el.tagName==='BUTTON')tiny.push((el.dataset.act||el.id||'button')+':'+Math.round(r.width)+'x'+Math.round(r.height));
    if(el.tagName==='BUTTON' && getComputedStyle(el).pointerEvents==='none')blocked.push(el.dataset.act||el.id||'button');
  }
  return {duplicates, unnamed:[...new Set(unnamed)].slice(0,12),tiny:[...new Set(tiny)].slice(0,12),blocked:[...new Set(blocked)].slice(0,12),
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
});
(async () => {
  const b=await BR.launch();
  try{
    for(const dev of ['pc','iphone']){
      const s=await session(b,{at:'2026-10-07T15:00:00+02:00',dev}),p=s.p;
      await check(dev+' · cinq onglets présents, tous activables par un clic réel',async()=>{
        const tabs=await p.locator('#viewSeg [data-act=view]').evaluateAll(xs=>xs.map(x=>x.dataset.v));
        assert.deepEqual(tabs,['meteo','pneus','trajet','tenue','analyse']);
        for(const [v,section] of VIEWS){
          await go(p,dev,v);await s.settle(1);
          assert.equal(await p.evaluate(()=>UI.view),v,'clic sans effet : '+v);
          assert.equal(await p.locator('#viewSeg [data-act=view][data-v='+v+']').getAttribute('aria-pressed'),'true', 'état actif manquant '+v);
          assert(await p.locator(section).isVisible(),'section invisible : '+v+' → '+section);
        }
      });
      await check(dev+' · seconde navigation et cohérence des sections',async()=>{
        for(const [v,section] of [...VIEWS].reverse()){
          await go(p,dev,v);await s.settle(1);
          assert.equal(await p.evaluate(()=>UI.view),v);
          assert(await p.locator(section).isVisible());
        }
      });
      await check(dev+' · paramètres ouvrables et refermables depuis Pneus',async()=>{
        const details=p.locator('#settings'),toggle=details.locator(':scope > summary');
        if(await details.getAttribute('open')!==null)await toggle.click();
        await toggle.click();await s.settle(1);
        assert.equal(await details.getAttribute('open'),'');
        assert(await p.locator('#settingsBody').isVisible(),'panneau vide ou caché');
        await toggle.click();assert.equal(await details.getAttribute('open'),null);
      });
      await check(dev+' · bouton Actualiser relance réellement une demande météo',async()=>{
        const n=s.S.calls;
        const refresh=p.locator('#statusbar [data-act=refresh]');
        assert(await refresh.isVisible(),'bouton Actualiser absent');
        if(dev==='iphone')await refresh.tap();else await refresh.click();
        await s.settle(10);assert(s.S.calls>n,'rafraîchissement sans requête météo ('+n+' → '+s.S.calls+')');
      });
      await check(dev+' · aucune duplication des ID ni débordement sur les cinq vues',async()=>{
        for(const [v] of VIEWS){
          await go(p,dev,v);await s.settle(1);
          const x=await inspect(p);
          assert.deepEqual(x.duplicates,[],'ID dupliqués '+v+': '+JSON.stringify(x.duplicates));
          assert(x.overflow<=1,'débordement horizontal '+v+': '+x.overflow+' px');
          console.log('ℹ️ '+dev+'/'+v+' · accessibilité: '+JSON.stringify({unnamed:x.unnamed,tiny:x.tiny,blocked:x.blocked}));
        }
      });
      await check(dev+' · commandes toujours actives après rechargement',async()=>{
        await go(p,dev,'trajet');await s.settle(2);
        await p.reload();await s.settle(8);
        assert.equal(await p.evaluate(()=>UI.view),'trajet','onglet Trajet perdu au rechargement');
        await go(p,dev,'analyse');await s.settle(2);
        assert.equal(await p.evaluate(()=>UI.view),'analyse');
      });
      await s.c.close();
    }
    await check('zéro erreur JavaScript inattendue',async()=>assert.deepEqual(errors,[],errors.join(' | ').slice(0,700)));
    if(NETWORK_NOISE.length)console.log('ℹ️ Requêtes simulées coupées sous WebKit: '+NETWORK_NOISE.length);
    console.log(count+'/'+count+' scénarios OK · erreurs JS : aucune');
  }finally{await b.close();}
})().catch(e=>{console.error('❌ '+current+' · '+String(e&&e.stack||e).slice(0,1600));process.exit(1);});
