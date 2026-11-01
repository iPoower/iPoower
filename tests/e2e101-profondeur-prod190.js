// Compatibilité avec le build EN PRODUCTION 502852864dbd (run 190), celui qui tournera sur le PC et l'iPhone pendant la transition.
// Copie figée tests/fixtures/race-control.prod-190.html : code de l'app identique à l'octet près (empreintes vérifiées ci-dessous),
// seule la configuration scellée chiffrée est retirée. Données 100 % fictives.
// Prouve, avec le vrai code de l'ancienne version : (1) sa fusion PC ↔ iPhone reçoit le nouveau format sans perte ; (2) elle lit la
// bonne profondeur (minimum par essieu) et lève son alerte ; (3) ses saisies par essieu, changements de monte et rechargements
// n'effacent jamais l'enregistrement séparé settings.treadWheels ; (4) elle EFFACE en revanche un champ inconnu placé dans
// car.tire (raison du choix d'un enregistrement séparé) ; (5) la nouvelle version relit le résultat et signale l'essieu dépassé.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), BR = require('./lib/browser');
const FIX = path.join(__dirname, 'fixtures');
const { check: checkFixture } = require('./lib/prod-build-fixture');
const html = fs.readFileSync(path.join(FIX, 'race-control.prod-190.html'), 'utf8'), manifest = JSON.parse(fs.readFileSync(path.join(FIX, 'race-control.prod-190.json'), 'utf8'));
// Nouvelle version (sources de cette branche) exécutée hors navigateur pour produire et relire le nouveau format.
const SRC = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const N = {}; vm.createContext(N);
vm.runInContext(SRC('engine.js') + SRC('tirespecs.js') + SRC('tyrestate.js') + SRC('journal-archive.js') + SRC('debrief.js') + SRC('sync-merge.js') +
  '\nthis.X = { treadAxles, treadWheels, setTreadWheels, putTreadWheelsRecord, treadWheelsRecord, SyncMerge };', N);
const plain = v => JSON.parse(JSON.stringify(v));
const O = 'https://race-control-ipoower.pages.dev', U = O + '/';
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 400))); if (!ok) fail++; };
(async () => {
  const problems = checkFixture(html, manifest);
  check(`copie figée = build de production ${manifest.build} (empreinte : original à l’octet près, seule la configuration scellée remplacée)`, !problems.length && manifest.build === '502852864dbd', problems.join(', '));
  const b = await BR.launch();
  try {
    const c = await b.newContext({ viewport: { width: 414, height: 896 }, timezoneId: 'Europe/Paris', locale: 'fr-FR' });
    const p = await c.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/*', r => { const u = new URL(r.request().url()); return u.origin === O && !/\.(js|json|png|webmanifest)$/.test(u.pathname) ? r.fulfill({ status: 200, contentType: 'text/html', body: html }) : r.abort(); });
    const boot = async () => { await p.goto(U); await p.waitForFunction(() => typeof S === 'object' && Array.isArray(S.cars) && S.cars.length > 0, null, { timeout: 30000 }); await p.waitForTimeout(600); };
    await boot();
    const loaded = await p.evaluate(() => ({ build: window.TWRC_BUILD, html: document.documentElement.outerHTML.includes('window.TWRC_BUILD="502852864dbd"') }));
    check('ancienne version chargée : build 502852864dbd (' + JSON.stringify(loaded) + ')', loaded.build === '502852864dbd' || loaded.html, JSON.stringify(loaded));
    // État fictif de l'ancien appareil, enregistré par l'ancienne version elle-même.
    await p.evaluate(() => { const t = S.cars[0].tire; Object.assign(t, { type: 'summer', brand: 'Marque test', model: 'Modèle test', size: '205/55 R16 91V', tread: 7, treadAv: 7, treadAr: 7, treadEst: 0 }); saveSettings(); });
    const old = await p.evaluate(() => JSON.parse(JSON.stringify(S)));
    // La nouvelle version saisit un relevé par pneu (AV droit côté 1,4 mm, usure irrégulière) et le synchronise.
    const neu = plain(old), car = neu.cars[0];
    const r = plain(N.X.setTreadWheels(car.tire, { fl: { side: 6, mid: 6.2 }, fr: { side: 1.4, mid: 2.6 }, rl: { side: 7, mid: 7.1 }, rr: { side: 6.8, mid: 6.9 } }, { date: '2026-11-01' }));
    const recPath = N.X.putTreadWheelsRecord(neu, car, r.record);
    check('nouvelle version : minima par essieu écrits (AV 1,4 / AR 6,8) et relevé séparé', car.tire.treadAv === 1.4 && car.tire.treadAr === 6.8 && !!recPath && !('treadWheels' in car.tire), JSON.stringify({ av: car.tire.treadAv, ar: car.tire.treadAr, recPath }));
    // (1) Fusion par l'ANCIENNE version (son propre moteur SyncMerge), copie distante = nouvelle version.
    const merged = await p.evaluate(({ old, neu }) => { const st = SyncMerge.edits(old, neu, {}, Date.now()); const m = SyncMerge.settings(old, neu, {}, st); return JSON.parse(JSON.stringify(m)); }, { old, neu });
    check('ancienne version · fusion PC ↔ iPhone : relevé par pneu et minima repris sans conflit ni perte', JSON.stringify(merged.settings.treadWheels) === JSON.stringify(neu.treadWheels) &&
      merged.settings.cars[0].tire.treadAv === 1.4 && merged.settings.cars[0].tire.treadAr === 6.8 && !merged.report.conflicts.length, JSON.stringify(merged.report));
    // Application comme le ferait la synchronisation, puis rechargement de l'ancienne version.
    await p.evaluate(s => { lsSet('twrc.settings.v1', JSON.stringify(s)); }, merged.settings); await boot();
    const read = await p.evaluate(() => ({ rec: S.treadWheels || null, worst: treadAxles(S.cars[0].tire).worst, alert: treadAlert([S.cars[0]], { Pmax: 0 }, []) }));
    check('ancienne version · rechargement : relevé par pneu conservé tel quel', JSON.stringify(read.rec) === JSON.stringify(neu.treadWheels), JSON.stringify(read.rec).slice(0, 200));
    check('ancienne version · lit la bonne profondeur (minimum de l’essieu : 1,4 mm) et lève l’alerte légale', read.worst === 1.4 && read.alert && read.alert.sev === 3 && /1,4 mm/.test(read.alert.title), JSON.stringify(read));
    // (3) Saisie « Profondeur arrière » dans l'interface de l'ancienne version.
    await p.evaluate(() => { const d = document.getElementById('settings'); if (d && !d.open) d.open = true; renderSettings(true); });
    const ar = p.locator('#f-cars-0-tire-treadAr'); await ar.scrollIntoViewIfNeeded(); await ar.fill('4'); await ar.dispatchEvent('change'); await p.waitForTimeout(400);
    const afterAxle = await p.evaluate(() => ({ rec: S.treadWheels || null, ar: S.cars[0].tire.treadAr, av: S.cars[0].tire.treadAv }));
    check('ancienne version · saisie par essieu (AR 4 mm) : relevé par pneu jamais effacé', afterAxle.ar === 4 && afterAxle.av === 1.4 && JSON.stringify(afterAxle.rec) === JSON.stringify(neu.treadWheels), JSON.stringify(afterAxle).slice(0, 300));
    // (3)+(4) Changement de monte dans l'interface de l'ancienne version, avec un champ inconnu placé DANS car.tire pour comparaison.
    await p.evaluate(() => { S.cars[0].tire.champInconnuTest = { fictif: 1 }; saveSettings(); renderSettings(true); });
    const type = p.locator('#f-cars-0-tire-type'); await type.scrollIntoViewIfNeeded();
    await type.selectOption('winter'); await p.waitForTimeout(400); await p.locator('#f-cars-0-tire-type').selectOption('summer'); await p.waitForTimeout(400);
    const afterSwitch = await p.evaluate(() => ({ rec: S.treadWheels || null, inTire: 'champInconnuTest' in S.cars[0].tire, av: S.cars[0].tire.treadAv, ar: S.cars[0].tire.treadAr }));
    check('ancienne version · changement de monte été → hiver → été : relevé séparé conservé, minima retrouvés', JSON.stringify(afterSwitch.rec) === JSON.stringify(neu.treadWheels) && afterSwitch.av === 1.4 && afterSwitch.ar === 4, JSON.stringify(afterSwitch).slice(0, 300));
    check('ancienne version · un champ inconnu placé dans car.tire est effacé au changement de monte (justifie l’enregistrement séparé)', afterSwitch.inTire === false, JSON.stringify(afterSwitch));
    await boot();
    const final = await p.evaluate(() => JSON.parse(JSON.stringify(S)));
    check('ancienne version · après rechargement : relevé séparé toujours présent', JSON.stringify(final.treadWheels) === JSON.stringify(neu.treadWheels));
    // (5) La nouvelle version relit l'état écrit par l'ancienne : verdict sur les minima actuels, essieu arrière signalé dépassé.
    const v = plain(N.X.treadWheels(final.cars[0].tire, N.X.treadWheelsRecord(final, final.cars[0])));
    check('nouvelle version · relit l’état de l’ancienne : AR dépassé (saisie par essieu plus récente), AV valide, minimum 1,4 mm', JSON.stringify(v.stale) === '["ar"]' && N.X.treadAxles(final.cars[0].tire).worst === 1.4 && v.wheels.fr.irregular === true, JSON.stringify(v.stale));
    // Fusion par la NOUVELLE version de l'état de l'ancienne (trois voies, ancêtre = état synchronisé) : rien n'est perdu.
    const s1 = plain(N.X.SyncMerge.edits(old, neu, {}, 2000)), s2 = plain(N.X.SyncMerge.edits(neu, final, plain(s1), 3000));
    const back = plain(N.X.SyncMerge.settings(plain(neu), final, s1, s2, { base: s1 }));
    check('nouvelle version · fusion de l’état de l’ancienne : AR 4 mm repris, relevé par pneu conservé', back.settings.cars[0].tire.treadAr === 4 && JSON.stringify(back.settings.treadWheels) === JSON.stringify(neu.treadWheels), JSON.stringify(back.report));
    check('ancienne version : aucune erreur JavaScript', !errors.length, errors.join(' / '));
    await c.close();
  } finally { await b.close(); }
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' contrôles « compatibilité build 502852864dbd »');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
