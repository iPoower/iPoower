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
      await check(dev + ' · diagnostic agenda verrouillé : pas de faux chargement, même dans la copie', async () => {
        await p.getByRole('link', { name: 'Réglages', exact: true }).click();
        assert(await p.locator('#diagBox').isVisible());
        const status = await p.locator('#diagBox dt').filter({ hasText: /^Agenda$/ }).evaluate(el => el.nextElementSibling.textContent);
        assert.match(status, /verrouillé.*déverrouille/i); assert.doesNotMatch(status, /chargement|événements/i);
        assert.match(await p.evaluate(() => diagText()), /Agenda : verrouillé.*déverrouille/i);
        assert.equal(await p.evaluate(() => CAL), null);
        await p.locator('#settings > summary').click();
      });
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
      await check(dev + ' · Saison pneus : aperçu visible et accessible, températures sans GO ni couleur favorable', async () => {
        const season = await txt(p, '#secSeason'); assert.match(season, /APERÇU GÉNÉRIQUE/);
        assert.doesNotMatch(season, /pneus été encore adaptés|pneus hiver adaptés/i);
        const labels = await p.locator('#secSeason .cell').evaluateAll(xs => xs.map(x => x.getAttribute('aria-label')));
        assert(labels.length > 0); assert(labels.every(x => /minimum .*maximum .*Aperçu générique/.test(x)), labels.join(' | '));
        assert.equal(await p.locator('#secSeason .cell:not(.lvx)').count(), 0);
        await view(s, 'pneus');
        const tips = await p.locator('#secDays .pip').evaluateAll(xs => xs.map(x => x.title));
        assert(tips.length > 0); assert(tips.every(x => /aperçu générique/.test(x)));
        assert.equal(await p.locator('#secDays .pip:not(.lvx)').count(), 0);
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
      await check(dev + ' · Agenda avec et sans étapes : météo et planning disponibles, verdict en aperçu', async () => {
        await p.evaluate(() => {
          const H = { ...homeExact(), label: 'Domicile test' }, A = { lat: 49.2, lon: 2.65, label: 'Destination test' };
          const leg = { k: 'go', from: H, to: A, dep: '2026-10-08T09:00', arr: '2026-10-08T09:40', fromKind: 'home',
            km: 50, min: 40, routed: true, pts: [{ f: .5, lat: (H.lat + A.lat) / 2, lon: (H.lon + A.lon) / 2 }], g: [[H.lat, H.lon], [A.lat, A.lon]] };
          CAL = { updated: new Date(Date.now()).toISOString(), events: [
            { id: 'profile-leg', t: 'Rendez-vous avec étape', s: '2026-10-08T09:50', e: '2026-10-08T10:30', ...A, mode: 'maison', legs: [leg] },
            { id: 'profile-place', t: 'Rendez-vous sans étape', s: '2026-10-08T12:00', e: '2026-10-08T13:00', lat: 49.3, lon: 2.8, label: 'Autre destination test' }
          ] }; CALDONE = true; renderAll();
        });
        await view(s, 'meteo'); await s.settle(12);
        for (const id of ['profile-leg', 'profile-place']) {
          const card = p.locator(`#secCal [data-event-id="${id}"]`);
          assert(await card.isVisible()); const text = await card.innerText();
          assert.match(text, /Aperçu générique/); assert.match(text, /Route.*°C/);
          assert.doesNotMatch(text, /\bGO\b|\bCAUTION\b|HIGH RISK|NO GO/);
          assert.equal(await card.locator('.cal-v .pill:not(.lvx)').count(), 0);
        }
      });
      // La fixture personnelle laisse la seconde voiture sans pneus : l'équiper aussi pour tester une vraie comparaison.
      await p.evaluate(() => { S.cars.forEach(c => Object.assign(c.tire, { type: c.tire.type === 'none' ? 'summer' : c.tire.type, brand: 'Marque test', model: 'Modèle test' })); saveSettings(); renderAll(); });
      await view(s, 'pneus');
      await check(dev + ' · monte renseignée : verdict personnel et score rétablis, plus aucun aperçu (contre-épreuve)', async () => {
        const cars = await txt(p, '#secCars article.car');
        assert.doesNotMatch(cars, /APERÇU GÉNÉRIQUE/); assert.match(cars, /\d+\s*\/100/); assert.match(cars, /GO —|CAUTION —|HIGH RISK —|NO GO/);
        assert.equal(await p.locator('#secCars [data-k=generic]').count(), 0);
        assert.match(await txt(p, '#secBrief'), /Score du trajet :\s*\d+\/100/);
        assert.match(await txt(p, '#secCmp'), /Écart d’indice|indice proche \(\d+/);
        assert.equal(await p.locator('#secSeason [data-k=generic]').count(), 0);
        assert(await p.locator('#secSeason .cell:not(.lvx)').count() > 0);
        assert(await p.locator('#secDays .pip:not(.lvx)').count() > 0);
        assert.doesNotMatch(await txt(p, '#secCal'), /Aperçu générique/);
        assert(await p.locator('#secCal .cal-v .pill:not(.lvx)').count() >= 2);
      });
      const homeLatitude = await p.evaluate(() => S.locs[0].lat);
      await check(dev + ' · destination enregistrée choisie : profil évalué sur le vrai lieu sélectionné', async () => {
        await p.evaluate(() => {
          S.locs[1].lat = 50.6292; S.locs[1].lon = 3.0573;
          S.customs.push({ id: 'profile-custom', name: 'Lieu de travail test', lat: 48.9, lon: 2.25 });
          saveSettings(); rebuild(); renderAll();
        });
        await p.selectOption('#quick-work-to', 'profile-custom'); await s.settle(8);
        const r = await p.evaluate(() => ({ selected: S.work.to, generic: PROFILE().generic, ok: PROFILE().commuteOk }));
        assert.equal(r.selected, 'profile-custom'); assert.equal(r.generic, false); assert.equal(r.ok, true);
        await p.locator('[data-act=locs-toggle]').click();
        await p.locator('[data-act=loc][data-id=profile-custom]').click(); await s.settle(2);
        assert.doesNotMatch(await txt(p, '#secCars article.car'), /APERÇU GÉNÉRIQUE/);
      });
      await check(dev + ' · latitude du départ effacée : aperçu, aucun GO personnel et chauffe suspendue', async () => {
        if (!await p.locator('#settings').evaluate(el => el.open)) await p.locator('#settings > summary').click();
        await p.fill('#f-locs-0-lat', ''); await p.locator('#f-locs-0-lat').press('Tab'); await s.settle(4);
        const r = await p.evaluate(() => ({ latitude: S.locs[0].lat, generic: PROFILE().generic, ok: PROFILE().commuteOk,
          thermal: briefThermalHtml({ src: 'work' }, S.cars[0]) }));
        assert.equal(r.latitude, null); assert.equal(r.generic, true); assert.equal(r.ok, false);
        assert.match(r.thermal, /estimation suspendue/); assert.match(r.thermal, /Réglages → Lieux/);
        const cars = await txt(p, '#secCars article.car'); assert.match(cars, /APERÇU GÉNÉRIQUE/);
        assert.doesNotMatch(cars, /\bGO\b|\bCAUTION\b|HIGH RISK|\d+\s*\/\s*100/);
      });
      await check(dev + ' · rechargement et hors ligne : un profil incomplet reste en aperçu', async () => {
        await p.evaluate(() => window.TWRC_VAULT.flush()); await p.reload(); await s.settle(8);
        assert.equal(await p.evaluate(() => PROFILE().generic), true);
        assert.equal(await p.evaluate(() => PROFILE().commuteOk), false);
        await s.c.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await s.settle(2);
        assert.equal(await p.evaluate(() => carProfile(S.cars[0]).generic), true);
        await s.c.setOffline(false);
      });
      await check(dev + ' · lieu renseigné à nouveau : conseil personnel rétabli sans perdre la destination', async () => {
        if (!await p.locator('#settings').evaluate(el => el.open)) await p.locator('#settings > summary').click();
        await p.fill('#f-locs-0-lat', String(homeLatitude)); await p.locator('#f-locs-0-lat').press('Tab'); await s.settle(4);
        assert.equal(await p.evaluate(() => S.work.to), 'profile-custom');
        assert.equal(await p.evaluate(() => PROFILE().generic), false); assert.equal(await p.evaluate(() => PROFILE().commuteOk), true);
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
