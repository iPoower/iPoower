// Audit A06 dans le vrai navigateur : réglage neutre (appareil verrouillé, Paris/Lille d'exemple, voitures sans modèle)
// → « Aperçu générique » au niveau des conclusions, jamais GO ni score /100, aucune échéance de chauffe sur un planning
// à ≈ 380 km/h. Puis vrai profil (fixtures fictives) + monte renseignée → verdict personnel rétabli. iPhone et PC.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
let n = 0, stage = ''; const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const view = (s, v) => s.p.evaluate(v => { UI.view = v; renderAll(); window.scrollTo(0, 0); }, v).then(() => s.settle(4));
const txt = (p, sel) => p.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.textContent).join(' ¦ '), sel);
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-10-08T06:40:00+02:00', dev, unlock: false }), p = s.p;
      await check(dev + ' · verrouillé : profil générique reconnu (lieux d’exemple, monte absente, planning ≈ 380 km/h)', async () => {
        const r = await p.evaluate(() => { const x = PROFILE(); return { locked: LOCKED(), generic: x.generic, ids: x.gaps.map(g => g.id), kmh: x.commute && x.commute.kmh, car: carProfile(S.cars[0]).generic }; });
        assert.equal(r.locked, true); assert.equal(r.generic, true); assert.equal(r.car, true);
        assert.deepEqual(r.ids, ['locked', 'places', 'commute']); assert(r.kmh > 300, String(r.kmh));
      });
      await view(s, 'pneus');
      await check(dev + ' · Pneus : « Aperçu générique » sur chaque voiture, ni GO ni score /100', async () => {
        const cars = await txt(p, '#secCars article.car');
        assert.match(cars, /APERÇU GÉNÉRIQUE — configure tes lieux et ta monte/); assert.match(cars, /appareil verrouillé/);
        assert.doesNotMatch(cars, /\bGO\b|\bCAUTION\b|HIGH RISK|\d+\s*\/\s*100/); assert.equal(await p.locator('#secCars .strip').count(), 0);
        const notes = await p.locator('#secCars [data-k=generic]').count(); assert(notes >= 1, String(notes));
      });
      await check(dev + ' · briefing départ et comparaison : aucun verdict personnel caché dans les paragraphes', async () => {
        const brief = await txt(p, '#secBrief'), compare = await txt(p, '#secCmp');
        assert.match(brief, /APERÇU GÉNÉRIQUE/); assert.match(brief, /Prévision de référence/);
        assert.doesNotMatch(brief, /\bGO\b|\bCAUTION\b|HIGH RISK|\d+\s*\/\s*100|Score du trajet/);
        assert.match(compare, /Comparaison personnalisée en attente/);
        assert.doesNotMatch(compare, /\d+\s*\/\s*100|Écart d’indice|indice proche \(\d+/);
        assert.doesNotMatch(await txt(p, '#secBrf'), /🟢 Aucun risque identifié/);
      });
      await check(dev + ' · briefing : aucune conclusion favorable ni échéance de chauffe sur un planning impossible', async () => {
        const brf = await txt(p, '#secBrf');
        assert.match(brf, /PROCHAIN TRAJET/i, 'le trajet domicile-travail d’exemple est bien briefé'); assert.match(brf, /🧪 APERÇU/); assert.match(brf, /APERÇU GÉNÉRIQUE/);
        assert.doesNotMatch(brf, /✓ Pneus actuels adaptés au trajet|🟢 GO|🟡 CAUTION|HIGH RISK|NO GO|\/ 100|\d+\/100/);
        assert.match(brf, /Gomme · estimation suspendue/); assert.match(brf, /≈ \d{3} km\/h de moyenne/); assert.doesNotMatch(brf, /Fenêtre favorable atteinte|N’atteint pas sa fenêtre/);
        assert.equal(await p.locator('#secBrf .gauge text.g-l').first().textContent(), 'aperçu');
      });
      await view(s, 'analyse');
      await check(dev + ' · Analyse : aperçu dans le verdict, visible sans défilement sur iPhone', async () => {
        const lab = await txt(p, '#secLab .lab-hero');
        if (lab) { assert.match(lab, /Aperçu générique — configure tes lieux et ta monte/); const top = await p.locator('#secLab .lab-hero').first().boundingBox(); assert(top && top.y < (dev === 'iphone' ? 896 : 800), JSON.stringify(top)); }
      });
      // vrai profil (fixtures fictives) : lieux plausibles, trajet cohérent, puis monte renseignée
      await p.fill('#unlockPw', require('fs').readFileSync('.passphrase', 'utf8').trim());
      await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); await s.settle(10);
      await check(dev + ' · profil réel sans modèle de pneu : seule la monte reste à renseigner', async () => {
        const r = await p.evaluate(() => ({ generic: PROFILE().generic, ok: PROFILE().commuteOk, car: carProfile(S.cars[0]).gaps.map(g => g.id) }));
        assert.equal(r.generic, false); assert.equal(r.ok, true); assert.deepEqual(r.car, ['monte']);
        await view(s, 'pneus');
        assert.doesNotMatch(await txt(p, '#secCars, #secBrief, #secCmp'), /\bGO\b|\bCAUTION\b|HIGH RISK|\d+\s*\/\s*100|Écart d’indice|indice proche \(\d+/);
      });
      await p.evaluate(() => { S.cars.forEach(c => Object.assign(c.tire, { brand: 'Marque test', model: 'Modèle test' })); saveSettings(); renderAll(); });
      await view(s, 'pneus');
      await check(dev + ' · monte renseignée : verdict personnel et score rétablis, plus aucun aperçu (contre-épreuve)', async () => {
        const cars = await txt(p, '#secCars article.car');
        assert.doesNotMatch(cars, /APERÇU GÉNÉRIQUE/); assert.match(cars, /\d+\s*\/100/); assert.match(cars, /GO —|CAUTION —|HIGH RISK —|NO GO/);
        assert.equal(await p.locator('#secCars [data-k=generic]').count(), 0);
        assert.match(await txt(p, '#secBrief'), /Score du trajet :\s*\d+\/100/);
        assert.match(await txt(p, '#secCmp'), /Écart d’indice|indice proche \(\d+/);
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
