// Cockpit décisionnel (onglet Pneus = accueil) : décision lisible d'abord, trajet ensuite, cohérence décision / confiance /
// alerte principale, aucun faux feu vert, danger jamais caché, onglet et voiture conservés, mises en page iPhone/tablette/PC.
// Fixtures fictives ; captures facultatives (COCKPIT_SHOT). WebKit simule l'iPhone : ce n'est pas un iPhone physique.
'use strict';
const assert = require('node:assert/strict'), fs = require('fs');
const { session, BR, errors, U } = require('./lib/context-session');
const { unlockIfLocked } = require('./lib/unlock');
let n = 0, stage = ''; const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const AT = '2026-10-07T06:00:00+02:00';   // mercredi, trajet domicile-travail à 06:30
const fill = (H, k, v) => { if (Array.isArray(H[k])) H[k] = H[k].map(() => v); };
const WX = {
  pluie: (o, kind) => { const H = o.hourly || {}; if (kind !== 'now') { fill(H, 'precipitation', 3.2); fill(H, 'rain', 3.2); fill(H, 'weather_code', 63); if (kind !== 'arome') fill(H, 'precipitation_probability', 95); } return o; },
  // AROME ne fournit pas la visibilité (requête Q_AR) : la réponse simulée non plus, comme en production
  brouillard: (o, kind) => { const H = o.hourly || {}; if (kind === 'arome') { delete H.visibility; fill(H, 'weather_code', 45); } else if (kind !== 'now') { fill(H, 'visibility', 150); fill(H, 'weather_code', 45); } return o; }
};
const monte = p => p.evaluate(() => { S.cars.forEach((c, i) => Object.assign(c.tire, { brand: i ? 'Marque B' : 'Marque A', model: 'Modèle test', size: c.tire.size || '205/55 R16 91V' })); saveSettings(); renderAll(); });
const core = p => p.evaluate(() => { const el = document.getElementById('decisionCore'); return el && !el.hidden ? { text: el.innerText, label: el.querySelector('h2') && el.querySelector('h2').innerText, items: [...el.querySelectorAll('.decision-matters li')].map(x => x.innerText), level: DECISION_LAST && DECISION_LAST.decision.displayLevel, conf: DECISION_LAST && DECISION_LAST.confidence.key } : null; });
const layout = p => p.evaluate(() => {
  const r = id => { const e = document.getElementById(id); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return b.height ? { top: Math.round(b.top), bottom: Math.round(b.bottom) } : null; };
  const nav = document.getElementById('viewSeg').getBoundingClientRect();
  return { W: innerWidth, H: innerHeight, sw: document.documentElement.scrollWidth, core: r('decisionCore'), brf: r('secBrf'), place: r('placeBar'), navTop: Math.round(nav.top), navBottom: Math.round(nav.bottom),
    order: [...document.querySelectorAll('#decisionCore, #placeBar, #secBrf')].map(e => e.id) };
});
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: AT, dev }), p = s.p; await monte(p); await s.settle(6);
      // (l'outil de session commun ouvre Météo ; l'ouverture à froid sur Pneus est vérifiée plus bas par une vraie réouverture)
      await p.locator('#viewSeg [data-act=view][data-v=pneus]').click(); await s.settle(3);
      await check(dev + ' · cockpit Pneus : décision avant le lieu et le trajet (ordre réel : clavier, lecteur d’écran)', async () => {
        assert.equal(await p.evaluate(() => UI.view), 'pneus');
        const L = await layout(p); assert.deepEqual(L.order, ['decisionCore', 'placeBar', 'secBrf']);
      });
      await check(dev + ' · décision : verdict, confiance, âge des données, lieu, voiture et destination dans une seule carte', async () => {
        const c = await core(p); assert(c, 'carte de décision affichée');
        assert.match(c.text, /CONDITIONS STABLES|SURVEILLANCE|PRUDENCE|DANGER|DONNÉES DÉGRADÉES/); assert.match(c.text, /Confiance · (SOLIDE|À CONFIRMER|DÉGRADÉ) · météo/);
        assert.match(c.text, /Lieu ·\s/); assert.match(c.text, /Voiture ·\s/); assert.match(c.text, /Destination ·\s/);
        if (!c.items.length) assert.match(c.text, /pas une garantie de sécurité/);
        assert(!/Lieu courant à confirmer/.test(c.text.replace(/Lieu · [^\n]*/, '')), 'pas de répétition du lieu');
      });
      await check(dev + ' · cohérence : sans voiture active, « Voiture active à choisir » (jamais « pneus inconnus ») et aucun feu vert acquis si données dégradées', async () => {
        const r = await p.evaluate(() => ({ reasons: DECISION_LAST.confidence.reasons, conf: DECISION_LAST.confidence.level, car: !!appActiveCar() }));
        if (!r.car) { assert(r.reasons.includes('Voiture active à choisir') || r.conf === 0, JSON.stringify(r)); assert(!r.reasons.includes('Pneus montés à confirmer'), JSON.stringify(r)); }
        const brf = await p.locator('#secBrf').innerText();
        if (r.conf >= 2) assert.doesNotMatch(brf, /🟢 GO/);
      });
      if (dev === 'iphone') await check('iPhone 11 Pro Max (414×896) · décision entière et début du trajet visibles sans défilement, aucun débordement', async () => {
        await p.evaluate(() => { document.querySelector('#placeBar [data-act=place-confirm][data-place=home]')?.click(); window.scrollTo(0, 0); }); await s.settle(4);
        const L = await layout(p), visibleBottom = Math.min(L.H, L.navTop > L.H / 2 ? L.navTop : L.H);
        assert(L.sw <= L.W + 1, JSON.stringify(L)); assert(L.core && L.core.bottom <= visibleBottom, 'décision coupée : ' + JSON.stringify(L));
        assert(L.brf && L.brf.top < visibleBottom - 60, 'trajet sous la ligne de flottaison : ' + JSON.stringify(L));
        if (process.env.COCKPIT_SHOT) await p.screenshot({ path: process.env.COCKPIT_SHOT + '-iphone.png' });
      });
      if (dev === 'pc') for (const [w, h] of [[1440, 900], [1920, 1080], [1024, 768]]) await check(`PC ${w}×${h} · décision et prochain trajet visibles d’emblée, aucun débordement`, async () => {
        await p.setViewportSize({ width: w, height: h }); await s.settle(3); await p.evaluate(() => window.scrollTo(0, 0));
        const L = await layout(p); assert(L.sw <= L.W + 1, JSON.stringify(L)); assert(L.core && L.core.bottom <= h, JSON.stringify(L)); assert(L.brf && L.brf.top < (w >= 1200 ? h - 80 : h - 20), JSON.stringify(L));   // bureau : trajet lisible ; tablette (empilée) : trajet entamé
        if (process.env.COCKPIT_SHOT) await p.screenshot({ path: `${process.env.COCKPIT_SHOT}-pc-${w}.png` });
      });
      await check(dev + ' · onglet choisi conservé au rechargement ; réouverture → retour sur Pneus', async () => {
        await p.locator('#viewSeg [data-act=view][data-v=meteo]').click(); await s.settle(2);
        await p.reload(); await s.settle(8); assert.equal(await p.evaluate(() => UI.view), 'meteo');
        const q = await s.c.newPage(); await q.goto(U); for (let i = 0; i < 6; i++) { await q.clock.runFor(500); await q.waitForTimeout(80); }
        await unlockIfLocked(q, async () => { for (let i = 0; i < 8; i++) { await q.clock.runFor(500); await q.waitForTimeout(80); } });
        assert.equal(await q.evaluate(() => UI.view), 'pneus'); await q.close();
      });
      await check(dev + ' · voiture choisie manuellement conservée (rechargement compris)', async () => {
        await p.locator('#viewSeg [data-act=view][data-v=pneus]').click(); await s.settle(2);
        const id = await p.evaluate(() => S.cars[1].id);
        await p.evaluate(id => { const d = appDay(); USER_STORE.state.dayContext = { ...USER_STORE.state.dayContext, activeCarId: id }; USER_STORE.flush(); renderAll(); return window.TWRC_VAULT && window.TWRC_VAULT.flush(); }, id);
        await p.reload(); await s.settle(8);
        assert.equal(await p.evaluate(() => appActiveCar() && appActiveCar().id), id);
        assert.match((await core(p)).text, /Voiture ·\s/);
      });
      await check(dev + ' · bascule de taille iPhone ↔ PC : cockpit présent, aucun débordement', async () => {
        for (const vp of [{ width: 414, height: 896 }, { width: 1440, height: 900 }, { width: 896, height: 414 }]) { await p.setViewportSize(vp); await s.settle(2); const L = await layout(p); assert(L.sw <= L.W + 1, JSON.stringify(L)); assert(L.core, JSON.stringify(L)); }
      });
      await s.c.close();
      // Scénario B — pluie significative sur le trajet ; Scénario C — brouillard important (danger jamais caché, même alerte coupée)
      for (const [scn, re, min] of [['pluie', /pluie/i, 1], ['brouillard', /brouillard|visibilit/i, 2]]) {
        const t = await session(b, { at: AT, dev, wx: WX[scn] }); await monte(t.p);
        await t.p.evaluate(() => { Object.keys(S.alerts).forEach(k => { S.alerts[k] = 0; }); saveSettings(); renderAll(); }); await t.settle(6);
        await t.p.locator('#viewSeg [data-act=view][data-v=pneus]').click(); await t.settle(3);   // cockpit (accueil)
        await check(`${dev} · scénario ${scn} : risque en tête de la décision, cohérent avec le moteur Météo, même alertes coupées`, async () => {
          const c = await core(t.p), d = await t.p.evaluate(() => wxDesk(wxInput()).level);
          assert(d >= min, 'moteur météo : niveau ' + d); assert(c.level >= Math.min(d, 3) || c.conf === 'degraded', JSON.stringify(c));
          assert(c.items.length >= 1 && re.test(c.items[0] + ' ' + c.text), JSON.stringify(c)); assert.doesNotMatch(c.label, /CONDITIONS STABLES/);
        });
        await t.c.close();
      }
      // Scénario D — données insuffisantes : profil générique (appareil verrouillé, monte inconnue) et météo indisponible
      const g = await session(b, { at: AT, dev, unlock: false, meteo: '503' }); await g.settle(8);
      await check(dev + ' · scénario D (météo indisponible, profil inconnu) : incertitude explicite, aucun feu vert', async () => {
        const text = await g.p.evaluate(() => document.body.innerText);
        assert.doesNotMatch(text, /🟢 GO\b|✓ Pneus actuels adaptés/); assert.match(text, /Météo indisponible|indisponible|APERÇU|À CONFIGURER|CONFIGURATION/i);
      });
      await g.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
