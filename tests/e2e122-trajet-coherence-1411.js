// Mission « Cohérence gel et trajet », PR 2 (constat en production du 14/11/2026) :
// A4 · « Prochain trajet 06:30 : … aucun risque de gel » sans date pour un trajet du LUNDI 16/11 (cartes voiture, Ingénieur
//      de course, « Quelle voiture prendre ? », onglet Trajet) ; « aucun risque de gel » non borné à la fenêtre du trajet.
// A5 · Météo : « État de la route » en VIGILANCE (pluie prévue) et « Risque global : RAS · aucune cause identifiée » pour le
//      MÊME trajet. Même trajet, même fenêtre, mêmes seuils (poste Météo : 0,2 mm/h VIGILANCE, 2 mm/h PRUDENCE).
// Fixture fictive (tests/fixtures/trip-1411.js). Dix contrôles, chacun vérifié sur PC ET iPhone.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
const fx = require('./fixtures/trip-1411');
const N = 10; let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 600)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 600)); } };
const norm = s => String(s || '').replace(/\s+/g, ' ');
async function grab(b, dev, at, rain) {
  const s = await session(b, { at, dev, wx: fx.wx(rain) }), p = s.p; await s.settle(4);
  await p.evaluate(fx.setup); await s.settle(8);
  const text = sel => p.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.innerText).join(' ¦ '), sel).then(norm);
  const d = {};
  await p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(6);
  d.cards = await text('.car-trip-frost'); d.core = await text('#decisionCore'); d.eng = await text('#f1-panel-raceEngineer'); d.cmp = await text('#secCmp');
  d.risk = await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip, r = t && tripRisk(t); return r && { lv: r.lv, k: r.k, why: r.why, dep: t.dep }; });
  await p.evaluate(() => { UI.view = 'meteo'; renderAll(); }); await s.settle(6);
  d.track = await text('#f1-panel-trackConditions');
  d.trackLv = await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip, x = t && F1Pure.trackConditions(t.seq); return x && x.available ? Math.max(...x.sectors.map(s => s.level)) : null; });
  await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(6);
  d.tripTab = await text('#secTripSummary');
  await s.c.close();
  return d;
}
(async () => {
  const b = await BR.launch(), D = {};
  try {
    for (const dev of ['pc', 'iphone']) D[dev] = {
      later: await grab(b, dev, '2026-11-14T20:30:00+01:00', 0.6),   // samedi soir, trajet lundi, pluie faible pendant le trajet
      dry: await grab(b, dev, '2026-11-14T20:30:00+01:00', 0),       // même trajet, sec
      today: await grab(b, dev, '2026-11-16T05:00:00+01:00', 0)      // lundi 05:00, trajet du jour
    };
  } finally { await b.close(); }
  const both = f => ['pc', 'iphone'].every(dev => f(D[dev])), show = f => JSON.stringify({ pc: f(D.pc), iphone: f(D.iphone) });
  const W = 'lun. 16/11 · 06:30';
  expect('1. A4 · cartes voiture : « Prochain trajet lun. 16/11 · 06:30 → 07:10 », jamais l’heure seule pour un autre jour', both(d => d.later.cards.includes('Prochain trajet ' + W + ' → 07:10 :') && !/Prochain trajet 06:30/.test(d.later.cards)), show(d => d.later.cards.slice(0, 300)));
  expect('2. A4 · cartes voiture : « aucun risque de gel » explicitement limité à la fenêtre du trajet', both(d => /aucun risque de gel sur la fenêtre du trajet/.test(d.dry.cards) && !/aucun risque de gel(?! sur la fenêtre du trajet)/.test(d.dry.cards)), show(d => d.dry.cards.slice(0, 300)));
  expect('3. A4 · bandeau de décision : « fenêtre du trajet lun. 16/11 · 06:30 → 07:10 »', both(d => d.later.core.includes('fenêtre du trajet ' + W + ' → 07:10')), show(d => d.later.core.slice(0, 400)));
  expect('4. A4 · Ingénieur de course : « départ prévu lun. 16/11 · 06:30 » et gel borné à la fenêtre', both(d => d.dry.eng.includes('départ prévu ' + W) && /aucun risque de gel sur cette fenêtre/.test(d.dry.eng)), show(d => d.dry.eng.slice(0, 400)));
  expect('5. A4 · « Quelle voiture prendre ? » : trajet daté, gel borné à la fenêtre', both(d => d.dry.cmp.includes('(' + W + ' → 07:10)') && /aucun risque de gel sur la fenêtre du trajet/.test(d.dry.cmp)), show(d => d.dry.cmp.slice(0, 500)));
  expect('6. A4 · onglet Trajet : prochain trajet daté « lun. 16/11 · 06:30 »', both(d => d.later.tripTab.includes(W)), show(d => d.later.tripTab.slice(0, 200)));
  expect('7. A4 · trajet du jour : l’heure seule, sans date (cartes, bandeau, onglet Trajet)', both(d => d.today.cards.includes('Prochain trajet 06:30 → 07:10 :') && d.today.core.includes('fenêtre du trajet 06:30 → 07:10') && /06:30/.test(d.today.tripTab) && !/lun\. 16\/11/.test(d.today.cards + d.today.tripTab)), show(d => ({ cards: d.today.cards.slice(0, 160), tab: d.today.tripTab.slice(0, 120) })));
  expect('8. A5 · pluie faible pendant le trajet : « État de la route » VIGILANCE ET risque global VIGILANCE (cause pluie nommée)', both(d => d.later.trackLv === 1 && /VIGILANCE/.test(d.later.track) && d.later.risk && d.later.risk.lv >= 1 && (d.later.risk.k === 'rain' || d.later.risk.lv > 1) && /pluie/.test(JSON.stringify(d.later.risk))), show(d => ({ track: d.later.track.slice(0, 260), trackLv: d.later.trackLv, risk: d.later.risk })));
  expect('9. A5 · trajet sec : l’état de la route redescend (RAS) comme le risque global', both(d => d.dry.trackLv === 0 && d.dry.risk && d.dry.risk.lv === 0 && !/VIGILANCE|PRUDENCE|DANGER/.test(d.dry.track.replace(/ÉTAT DE LA ROUTE/i, ''))), show(d => ({ track: d.dry.track.slice(0, 260), trackLv: d.dry.trackLv, risk: d.dry.risk })));
  expect('10. A5 · même trajet, même fenêtre : niveau de l’état de la route ≤ risque global dans les trois scénarios (le pire l’emporte)', both(d => ['later', 'dry', 'today'].every(k => d[k].risk && d[k].trackLv != null && d[k].trackLv <= d[k].risk.lv)), show(d => ['later', 'dry', 'today'].map(k => [d[k].trackLv, d[k].risk && d[k].risk.lv])));
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n}/${N} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length || n !== N) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.stack); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
