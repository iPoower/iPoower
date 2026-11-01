// PR 1 · sécurité pneumatique, vraies vues (PC et iPhone selon le navigateur de la CI), données fictives.
// Constat du 01/11/2026 : avec 1,8 mm à l'avant (pneus été, novembre), seul le panneau Alertes disait VIGILANCE ; cartes, scores,
// « Alertes de sécurité », Engineering Cockpit, Intelligence pneumatique et Garage restaient à RAS / « aucune règle déclenchée ».
// Attendu : le garde-fou plafonne le verdict partout (PRUDENCE sur sec, DANGER sous la pluie ≥ 0,5 mm/h dans la fenêtre),
// sans toucher au score physique ; profondeur inconnue → « ANALYSE LIMITÉE · profondeur non renseignée » au lieu d'un RAS.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
const AT = '2026-11-16T07:00:00+01:00';   // lundi : trajet domicile-travail du profil fictif
// Pluie forcée : nulle partout (sec) ou 1,5 mm/h partout (pluie pendant toute fenêtre évaluée).
const weather = mm => (o, kind) => {
  for (const block of [o.hourly, o.minutely_15, kind === 'now' ? o.current : null].filter(Boolean)) {
    for (const k of ['precipitation', 'rain', 'showers']) if (Array.isArray(block[k])) block[k] = block[k].map(() => mm); else if (k in block) block[k] = mm;
    if (Array.isArray(block.weather_code)) block.weather_code = block.weather_code.map(c => mm ? 61 : (c >= 51 ? 3 : c));
  }
  return o;
};
let n = 0; const check = (label, ok, detail) => { assert(ok, label + ' · ' + String(detail || '').slice(0, 900)); n++; console.log('✅ ' + label); };
const view = async (s, v) => { await s.p.evaluate(v => { UI.view = v; renderAll(); window.scrollTo(0, 0); }, v); await s.settle(6); };
const text = (s, sel) => s.p.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.textContent.replace(/[ \t]+/g, ' ')).join('\n'), sel);
(async () => {
  const b = await BR.launch();
  try {
    for (const [dev, label, mm] of [['iphone', 'sec', 0], ['pc', 'pluie', 1.5]]) {
      const s = await session(b, { at: AT, dev, wx: weather(mm) }), p = s.p; await s.settle(4);
      const today = AT.slice(0, 10);
      const setup = await p.evaluate(today => {
        if (S.cars.length < 2) return { error: 'profil de test : deux voitures attendues' };
        const [a, o] = S.cars;
        Object.assign(a.tire, { type: 'summer', brand: 'Marque A', model: 'Modèle test', size: '205/55 R16 91V', tread: 1.8, treadAv: 1.8, treadAr: 5, treadEst: 0,
          treads: [{ d: today, mm: 1.8, km: null, ax: 'av' }, { d: today, mm: 5, km: null, ax: 'ar' }], pchk: { date: today, T: 8, av: 2.3, ar: 2.3 }, press: '2,3 AV / 2,3 AR', dot: '1224' });
        Object.assign(o.tire, { type: 'summer', brand: 'Marque B', model: 'Modèle test', size: '205/55 R16 91V', tread: 6, treadAv: 6, treadAr: 6, treadEst: 0,
          treads: [{ d: today, mm: 6, km: null, ax: 'both' }], pchk: { date: today, T: 8, av: 2.3, ar: 2.3 }, press: '2,3 AV / 2,3 AR', dot: '1224' });
        saveSettings(); appSetCar(a.id); rebuild(); renderAll();
        const ca = CX.cars.find(x => x.car.id === a.id), cb = CX.cars.find(x => x.car.id === o.id);
        return { a: a.short || a.name, w: ca && ca.w ? { level: ca.w.level, score: ca.w.score, sl: ca.w.scoreLevel, g: ca.w.guard } : null, wb: cb && cb.w ? { level: cb.w.level, score: cb.w.score } : null,
          alert: CX.alerts.tread ? { sev: CX.alerts.tread.sev, t: CX.alerts.tread.title } : null, alertNow: CX.alertsNow.tread ? CX.alertsNow.tread.sev : null };
      }, today);
      assert(!setup.error, setup.error);
      const want = mm ? 3 : 2, name = mm ? 'DANGER' : 'PRUDENCE';
      check(`${dev} · ${label} · moteur : verdict plafonné à ${name}, score physique conservé`, setup.w && setup.w.level === want && setup.w.g && setup.w.g.level === want && setup.w.sl < want, JSON.stringify(setup));
      check(`${dev} · ${label} · alerte de profondeur (24 h et « ici, maintenant ») : ${name}`, setup.alert && setup.alert.sev === want && setup.alertNow === want, JSON.stringify(setup));
      // Pneus : bloc de décision et carte voiture.
      await view(s, 'pneus');
      const core = await text(s, '#decisionCore'), cards = await text(s, '#secCars .verdict');
      check(`${dev} · ${label} · Pneus : décision ${name}`, core.includes(name), core.slice(0, 500));
      check(`${dev} · ${label} · Pneus : carte voiture ${name}, jamais « CONDITIONS ADAPTÉES » pour cette voiture`, cards.split('\n').some(l => l.includes(name)), cards);
      const intel = await text(s, '#secCars .tread-cap');
      check(`${dev} · ${label} · Intelligence pneumatique : verdict plafonné affiché`, new RegExp(name + ' · profondeur sous 2 mm, repère de sécurité interne non réglementaire').test(intel), intel);
      // Météo : panneau Alertes.
      await view(s, 'meteo');
      const al = await text(s, '#secAlerts');
      check(`${dev} · ${label} · Météo › panneau Alertes : repère de sécurité de 2 mm, non réglementaire`, /sous le repère de sécurité de 2 mm/.test(al), al.slice(0, 800));
      // Analyse : Engineering Cockpit.
      await view(s, 'analyse');
      const lab = await text(s, '#secLab');
      check(`${dev} · ${label} · Analyse › Engineering Cockpit : verdict plafonné et règle visible`, lab.includes('Verdict plafonné par la profondeur') && lab.includes(name), lab.slice(0, 900));
      // Trajet, agenda, briefing : chaque verdict affiché pour un trajet évalué avec cette voiture n'est jamais plus favorable.
      await view(s, 'trajet');
      const trip = await p.evaluate(() => [...document.querySelectorAll('.brf-lv, .cal-v .pill, .decision-trip-verdict')].map(e => e.textContent.trim()));
      if (!trip.length) console.log('ℹ️ ' + dev + ' · trajets : ' + JSON.stringify(await p.evaluate(() => ({ view: UI.view, trip: (APP_CONTEXT.snapshot || {}).nextTrip ? 'oui' : 'non', brf: (document.getElementById('secBrf') || {}).textContent || '' })).catch(() => null)).slice(0, 600));
      check(`${dev} · ${label} · Trajet / agenda / briefing : ${trip.length} verdict(s) affiché(s), aucun RAS ni VIGILANCE`, trip.length > 0 && trip.every(t => !/^\W*(RAS|VIGILANCE)\b/u.test(t) || /Aperçu/.test(t)), JSON.stringify(trip));
      // Garage.
      await view(s, 'garage');
      const gar = await text(s, '#secGarage');
      check(`${dev} · ${label} · Garage : ${name} ou données insuffisantes, jamais RAS pour cette voiture`, new RegExp(name + '|DONNÉES INSUFFISANTES').test(gar) && !new RegExp(setup.a + '[^\\n]{0,80}\\bRAS\\b').test(gar), gar.slice(0, 900));
      // Profondeur inconnue : aucun RAS rassurant, niveau non relevé.
      if (!mm) {
        const unk = await p.evaluate(() => { const a = S.cars[0]; Object.assign(a.tire, { tread: null, treadAv: null, treadAr: null, treads: [] }); saveSettings(); rebuild(); renderAll();
          const ca = CX.cars.find(x => x.car.id === a.id); return { level: ca.w.level, unknown: ca.w.depthUnknown }; });
        await view(s, 'pneus');
        const c2 = await text(s, '#decisionCore'), v2 = await text(s, '#secCars .verdict');
        check(`${dev} · profondeur inconnue : niveau météo inchangé (${unk.level}), jamais « CONDITIONS ADAPTÉES »`, unk.unknown === true && unk.level === 0 && !/CONDITIONS ADAPTÉES/.test(v2.split('\n')[0]) && /PROFONDEUR NON RENSEIGNÉE/.test(v2), JSON.stringify(unk) + ' | ' + v2);
        check(`${dev} · profondeur inconnue : décision « ANALYSE LIMITÉE », profondeur non renseignée`, /ANALYSE LIMITÉE/.test(c2) && /[Pp]rofondeur non renseignée/.test(c2), c2.slice(0, 500));
      }
      await s.c.close();
    }
    assert.deepEqual(errors, [], 'aucune erreur de page');
    console.log(`\n✅ ${n} contrôles au vert`);
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
