'use strict';
// Profondeur PAR PNEU : migration sans perte depuis la valeur par essieu, minimum par essieu pour le verdict et l'alerte,
// usure irrégulière (écart côté / milieu > 1 mm, repère indicatif), relevé dépassé par une saisie par essieu plus récente,
// enregistrement séparé fusionné PC ↔ iPhone sans perte. Données 100 % fictives. Contre-tests par mutation en fin de fichier.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const SOURCES = { 'tyrestate.js': read('tyrestate.js'), 'engine.js': read('engine.js') };

function runTests(src = SOURCES, options = {}) {
  const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String, Intl, console }; vm.createContext(ctx);
  vm.runInContext(src['engine.js'] + read('tirespecs.js') + src['tyrestate.js'] + read('journal-archive.js') + read('debrief.js') + read('sync-merge.js') +
    '\nthis.X = { treadAxles, setTreadAxle, switchTire, tyreState, treadWheels, setTreadWheels, treadGapRows, treadWheelsRecord, putTreadWheelsRecord, computeAlerts, buildHours, SyncMerge };', ctx);
  const X = ctx.X, plain = v => JSON.parse(JSON.stringify(v));
  let count = 0;
  const test = (name, fn) => { try { fn(); } catch (e) { e.scenario = name; throw e; } count++; if (!options.quiet) console.log('✅ ' + name); };
  const tire = (extra = {}) => ({ type: 'summer', brand: 'Marque test', model: 'Modèle test', size: '205/55 R16 91V', tread: null, treadAv: null, treadAr: null, treadEst: 0, treads: [], ...extra });
  const car = (t = {}, id = 'voitureA') => ({ id, name: 'Voiture fictive', short: 'Fictive', tire: tire(t), odo: [] });
  const FULL = { fl: { side: '6,0', mid: '6,2' }, fr: { side: 5.1, mid: 6.4 }, rl: { side: 7, mid: 7.1 }, rr: { side: 6.8, mid: 6.9 } };
  const enter = (t, input = FULL, date = '2026-10-30') => plain(X.setTreadWheels(t, input, { date }));
  // 24 h d'historique puis 12 h, saison froide fictive (mêmes conventions que test_engine_verdicts.js)
  const FIELDS = { T: 'temperature_2m', RH: 'relative_humidity_2m', P: 'precipitation', snow: 'snowfall', code: 'weather_code', cloud: 'cloud_cover', vis: 'visibility', wind: 'wind_speed_10m', gust: 'wind_gusts_10m', rad: 'shortwave_radiation' };
  const hours = () => { const hourly = { time: [] }; Object.values(FIELDS).forEach(k => { hourly[k] = []; });
    for (let h = -24; h <= 12; h++) { hourly.time.push(new Date(Date.UTC(2026, 0, 15, 8 + h)).toISOString().slice(0, 13) + ':00');
      const x = { T: 12, RH: 70, P: 0, snow: 0, code: 3, cloud: 80, vis: 20000, wind: 10, gust: 20, rad: null }; for (const [k, n] of Object.entries(FIELDS)) hourly[n].push(x[k]); }
    return X.buildHours({ hourly }); };
  const alerts = (cars, S) => plain(X.computeAlerts({ hs: hours(), nowI: 24 }, cars, { alerts: {}, ...S }, {}));

  // ——— Migration : les valeurs actuelles par essieu sont conservées
  test('migration · ancien format (tread seul) : lu à l’identique, aucun relevé par pneu inventé', () => {
    const t = tire({ tread: 6.4 });
    assert.deepEqual(plain(X.treadAxles(t)), { av: 6.4, ar: 6.4, worst: 6.4, ax: null, split: false });
    assert.equal(X.treadWheels(t, null), null);
    assert.equal(X.treadWheelsRecord({ cars: [] }, car({ tread: 6.4 })), null);
  });
  test('migration · ancien format (tread seul) + premier relevé de l’avant seul : l’arrière garde 6,4 mm', () => {
    const t = tire({ tread: 6.4 }), r = enter(t, { fl: { side: 4.2, mid: 4.4 }, fr: { mid: 4.6 } });
    assert.deepEqual(r.axes, ['av']);
    assert.deepEqual([t.treadAv, t.treadAr, t.tread], [4.2, 6.4, 4.2]);
    assert.equal(r.record.ar, null); assert.deepEqual(r.record.rl, { side: null, mid: null });
  });
  test('migration · format par essieu (AV 5 / AR 7) + relevé de l’avant seul : l’arrière garde 7 mm', () => {
    const t = tire({ treadAv: 5, treadAr: 7, tread: 5 }); enter(t, { fl: { side: 4.8 }, fr: { side: 4.9, mid: 5 } });
    assert.deepEqual([t.treadAv, t.treadAr, t.tread], [4.8, 7, 4.8]);
  });
  test('migration · relevé de l’arrière seul : l’avant garde sa valeur, l’historique existant reste intact', () => {
    const treads = [{ d: '2026-09-01', mm: 5.5, km: 12000, ax: 'av' }], t = tire({ treadAv: 5.5, treadAr: 6, tread: 5.5, treads: plain(treads) });
    enter(t, { rr: { side: 5.9, mid: 6 } });
    assert.deepEqual([t.treadAv, t.treadAr, t.tread], [5.5, 5.9, 5.5]); assert.deepEqual(t.treads, treads);
  });
  // ——— Saisie complète : minimum par essieu
  test('saisie des 4 pneus : valeur par essieu = point le plus bas de l’essieu ; tread = essieu le plus usé', () => {
    const t = tire({ treadAv: 7, treadAr: 7, tread: 7 }), r = enter(t);
    assert.deepEqual([r.record.av, r.record.ar], [5.1, 6.8]);
    assert.deepEqual([t.treadAv, t.treadAr, t.tread], [5.1, 6.8, 5.1]);
    assert.deepEqual(r.record.fl, { side: 6, mid: 6.2 }); assert.equal(r.record.d, '2026-10-30');
  });
  test('point vide jamais inventé ; saisie invalide refusée sans aucune écriture', () => {
    const t = tire({ treadAv: 6, treadAr: 6, tread: 6 }), before = plain(t);
    for (const bad of [{ fl: { side: '13' } }, { fl: { side: '-1' } }, { rr: { mid: 'abc' } }, {}, { fl: { side: '' } }]) {
      const r = enter(t, bad); assert(r.error, JSON.stringify(bad)); assert.deepEqual(plain(t), before);
    }
    assert.match(enter(t, FULL, '2026-02-30').error, /date/); assert.deepEqual(plain(t), before);
    const r = enter(t, { fl: { side: 5.5 } }); assert.deepEqual(r.record.fl, { side: 5.5, mid: null });
    const v = plain(X.treadWheels(t, r.record)); assert.equal(v.wheels.fl.gap, null); assert.equal(v.wheels.fr.min, null);
  });
  // ——— Origine du relevé (mesure / estimation) : remplace correctement le statut précédent, y compris par essieu
  test('origine · mesure complète : remplace un statut « estimé » antérieur ; estimation complète : le pose', () => {
    const t = tire({ treadAv: 6, treadAr: 6, tread: 6, treadEst: 1 }), r = plain(X.setTreadWheels(t, FULL, { date: '2026-10-30', est: false }));
    assert.equal(t.treadEst, 0); assert.equal(r.record.est, 0);
    const u = tire({ treadAv: 6, treadAr: 6, tread: 6, treadEst: 0 }); X.setTreadWheels(u, FULL, { date: '2026-10-30', est: true }); assert.equal(u.treadEst, 1);
  });
  test('origine · relevé partiel par essieu : le statut suit l’essieu le plus usé', () => {
    // AR estimé et le plus usé (3 mm) ; mesure de l'AV seul à 5 mm → l'AR reste le plus usé, toujours estimé.
    const a = tire({ treadAv: 6, treadAr: 3, tread: 3, treadEst: 1, treads: [{ d: '2026-10-01', mm: 3, ax: 'ar', est: 1 }, { d: '2026-10-01', mm: 6, ax: 'av', est: 1 }] });
    X.setTreadWheels(a, { fl: { side: 5 }, fr: { side: 5.2 } }, { date: '2026-10-30', est: false }); assert.deepEqual([a.treadAv, a.treadAr, a.treadEst], [5, 3, 1]);
    // Mesure de l'AV seul à 2 mm → l'AV devient le plus usé, mesuré : statut « mesuré ».
    const b = tire({ treadAv: 6, treadAr: 3, tread: 3, treadEst: 1, treads: [{ d: '2026-10-01', mm: 3, ax: 'ar', est: 1 }] });
    X.setTreadWheels(b, { fl: { side: 2 } }, { date: '2026-10-30', est: false }); assert.deepEqual([b.treadAv, b.treadAr, b.treadEst], [2, 3, 0]);
  });
  // ——— Usure irrégulière
  test('usure irrégulière : écart strictement supérieur à 1 mm (1,0 non, 1,1 oui, 1,3 oui)', () => {
    const t = tire(), r = enter(t, { fl: { side: 6.4, mid: 5.4 }, fr: { side: 5.0, mid: 6.1 }, rl: { side: 7, mid: 8.3 }, rr: { side: 7, mid: 7 } });
    const v = plain(X.treadWheels(t, r.record));
    assert.deepEqual([v.wheels.fl.gap, v.wheels.fr.gap, v.wheels.rl.gap], [1, 1.1, 1.3]);
    assert.deepEqual(v.irregular.map(w => w.k), ['fr', 'rl']);
    const rows = plain(X.treadGapRows(t, r.record)); assert.match(rows[0].text, /AV droit : écart côté \/ milieu de 1,1 mm \(côté 5, milieu 6,1 mm\)/);
  });
  test('verdict et entretien : minimum de l’essieu, géométrie conseillée, seuil indicatif non réglementaire', () => {
    const c = car({ treadAv: 7, treadAr: 7, tread: 7 }), r = enter(c.tire);
    const st = plain(X.tyreState(c, { today: '2026-10-31', wheels: r.record }));
    assert.equal(st.tread.mm, 5.1); assert.deepEqual([st.tread.av, st.tread.ar], [5.1, 6.8]);
    const m = st.maint.find(x => x.k === 'tread-gap'); assert(m, 'entretien attendu');
    assert.match(m.text, /AV droit/); assert.match(m.text, /contrôle de géométrie conseillé/); assert.match(m.text, /indicatif de 1 mm, non réglementaire/);
    assert.equal(plain(X.tyreState(c, { today: '2026-10-31' })).maint.some(x => x.k === 'tread-gap'), false, 'sans relevé : rien d’inventé');
  });
  test('alertes : profondeur sur le minimum (1,4 mm → sous le minimum légal) et usure irrégulière en VIGILANCE', () => {
    const c = car({ treadAv: 7, treadAr: 7, tread: 7 }), r = enter(c.tire, { ...FULL, fr: { side: 1.4, mid: 2.6 } }), S = {};
    X.putTreadWheelsRecord(S, c, r.record);
    const a = alerts([c], S);
    assert.equal(a.tread.sev, 3); assert.match(a.tread.title, /1,4 mm, sous le minimum légal/);
    assert.equal(a.treadgap.sev, 1); assert.match(a.treadgap.title, /usure irrégulière AV droit/);
    assert.match(a.treadgap.detail, /Contrôle de géométrie conseillé/); assert.match(a.treadgap.detail, /Seuil indicatif de 1 mm, non réglementaire/);
    assert.equal(alerts([c], {}).treadgap, undefined, 'sans relevé par pneu : aucune alerte inventée');
  });
  // ——— Saisie par essieu plus récente (appareil pas encore à jour)
  test('saisie par essieu plus récente : le détail de cet essieu est dépassé, jamais réappliqué ; l’autre essieu reste valide', () => {
    const c = car({ treadAv: 7, treadAr: 7, tread: 7 }), r = enter(c.tire, { ...FULL, rl: { side: 5, mid: 6.5 } });
    assert.equal(plain(X.treadWheels(c.tire, r.record)).wheels.rl.irregular, true);
    X.setTreadAxle(c.tire, 'ar', 4);   // ce que fait la version précédente quand on saisit « Profondeur arrière »
    const v = plain(X.treadWheels(c.tire, r.record));
    assert.deepEqual(v.stale, ['ar']); assert.equal(v.wheels.rl.irregular, false); assert.equal(v.wheels.fr.irregular, true);
    assert.equal(X.treadAxles(c.tire).worst, 4); assert.equal(plain(X.tyreState(c, { wheels: r.record })).tread.mm, 4);
    const S = {}; X.putTreadWheelsRecord(S, c, r.record); assert.doesNotMatch(alerts([c], S).treadgap.title, /AR gauche/);
  });
  // ——— Enregistrement séparé, par voiture et par monte
  test('enregistrement séparé : clé « car-<id> » même pour un identifiant numérique, une entrée par monte', () => {
    const S = { cars: [] }, c = car({}, '308'), r = enter(c.tire);
    assert.equal(X.putTreadWheelsRecord(S, c, r.record), 'treadWheels.car-308.summer');
    assert.deepEqual(Object.keys(S.treadWheels), ['car-308']); assert.equal(Array.isArray(S.treadWheels), false);
    assert.deepEqual(plain(X.treadWheelsRecord(S, c)), r.record);
    c.tire.type = 'winter'; assert.equal(X.treadWheelsRecord(S, c), null, 'le relevé été ne s’applique pas à la monte hiver');
    assert.equal(X.putTreadWheelsRecord(S, { id: 'a.b', tire: { type: 'summer' } }, r.record), null, 'identifiant non adressable refusé');
  });
  test('changement de monte : le relevé reste hors de car.tire, retrouvé au retour sur la même monte', () => {
    const S = {}, c = car({ treadAv: 6, treadAr: 6, tread: 6 }), r = enter(c.tire); X.putTreadWheelsRecord(S, c, r.record);
    X.switchTire(c, 'winter'); X.switchTire(c, 'summer');
    assert.deepEqual(plain(X.treadWheelsRecord(S, c)), r.record); assert.deepEqual([c.tire.treadAv, c.tire.treadAr], [5.1, 6.8]);
    assert.deepEqual(plain(X.treadWheels(c.tire, r.record)).stale, []);
  });
  // ——— Synchronisation PC ↔ iPhone (moteur de fusion de cette version)
  test('fusion : nouveau format reçu par un appareil sans relevé par pneu → relevé et valeurs par essieu repris sans perte', () => {
    const base = { v: 1, configured: 1, cars: [car({ treadAv: 7, treadAr: 7, tread: 7 }, '308'), car({}, 'voitureB')], calib: [], journal: {}, edits: {} };
    const neu = plain(base), r = enter(neu.cars[0].tire); X.putTreadWheelsRecord(neu, neu.cars[0], r.record);
    const stamps = plain(X.SyncMerge.edits(base, neu, {}, 2000));
    const out = plain(X.SyncMerge.settings(plain(base), neu, {}, stamps));
    assert.deepEqual(out.report.conflicts, []);
    assert.deepEqual(out.settings.treadWheels, neu.treadWheels); assert.equal(Array.isArray(out.settings.treadWheels), false);
    assert.deepEqual([out.settings.cars[0].tire.treadAv, out.settings.cars[0].tire.treadAr], [5.1, 6.8]);
  });
  test('fusion : saisie par essieu reçue d’un ancien appareil → valeur par essieu reprise, relevé par pneu conservé et signalé dépassé', () => {
    const base = { v: 1, configured: 1, cars: [car({ treadAv: 7, treadAr: 7, tread: 7 }, '308'), car({}, 'voitureB')], calib: [], journal: {}, edits: {} };
    const neu = plain(base), r = enter(neu.cars[0].tire); X.putTreadWheelsRecord(neu, neu.cars[0], r.record);
    const s1 = plain(X.SyncMerge.edits(base, neu, {}, 2000));
    // L'ancien appareil a reçu le relevé (clé de premier niveau conservée telle quelle), puis saisit « Profondeur arrière ».
    const old = plain(neu); X.setTreadAxle(old.cars[0].tire, 'ar', 4.5);
    const s2 = plain(X.SyncMerge.edits(neu, old, plain(s1), 3000));
    // Sans ancêtre commun, deux modifications horodatées divergentes restent un conflit : valeur locale gardée, rien de perdu.
    const blind = plain(X.SyncMerge.settings(plain(neu), old, s1, s2));
    assert(blind.report.conflicts.includes('cars.0.tire.treadAr')); assert.deepEqual(blind.settings.treadWheels, neu.treadWheels);
    // Fusion à trois voies (ancêtre commun = état synchronisé précédent) : la saisie par essieu la plus récente est reprise.
    const out = plain(X.SyncMerge.settings(plain(neu), old, s1, s2, { base: s1 }));
    assert.deepEqual(out.report.conflicts, []);
    assert.deepEqual(out.settings.treadWheels, neu.treadWheels, 'relevé par pneu conservé');
    assert.equal(out.settings.cars[0].tire.treadAr, 4.5);
    // Pire cas : une copie distante SANS le relevé (appareil qui ne l'a jamais reçu) ne l'efface jamais : conflit visible, relevé gardé.
    const bare = plain(old); delete bare.treadWheels;
    const s3 = plain(X.SyncMerge.edits(neu, bare, plain(s1), 3000));
    const keep = plain(X.SyncMerge.settings(plain(neu), bare, s1, s3, { base: s1 }));
    assert.deepEqual(keep.settings.treadWheels, neu.treadWheels, 'absence distante jamais appliquée');
    assert(keep.report.conflicts.some(p => p.startsWith('treadWheels')), 'absence signalée comme conflit');
    const v = plain(X.treadWheels(out.settings.cars[0].tire, X.treadWheelsRecord(out.settings, out.settings.cars[0])));
    assert.deepEqual(v.stale, ['ar']); assert.equal(X.treadAxles(out.settings.cars[0].tire).worst, 4.5);
  });
  return count;
}
module.exports = { runTests, SOURCES };
if (require.main === module) {
  const count = runTests();
  const mutations = [
    { file: 'tyrestate.js', name: 'statut « estimé » conservé après une mesure complète', from: "if (typeof est === 'boolean') t.treadEst = est ? 1 : 0; }", to: '}' },
    { file: 'tyrestate.js', name: 'origine ignorée pour un relevé partiel', from: "else setTreadAxle(t, axes[0], rec[axes[0]], typeof est === 'boolean' ? est : undefined);", to: 'else setTreadAxle(t, axes[0], rec[axes[0]]);' },
    { file: 'tyrestate.js', name: 'moyenne au lieu du minimum de l’essieu', from: 'rec[ax] = mins.length ? Math.min(...mins) : null;', to: 'rec[ax] = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null;' },
    { file: 'tyrestate.js', name: 'seuil d’usure irrégulière atteint à 1,0 mm (≥ au lieu de >)', from: 'wheels[k].gap > TREAD_GAP_MM', to: 'wheels[k].gap >= TREAD_GAP_MM' },
    { file: 'tyrestate.js', name: 'détail par pneu dépassé réappliqué', from: 'const stale = min != null && (', to: 'const stale = false && (' },
    { file: 'tyrestate.js', name: 'point vide inventé', from: 'v = empty ? null : treadMm(raw);', to: 'v = empty ? 8 : treadMm(raw);' },
    { file: 'tyrestate.js', name: 'essieu sans aucun point écrasé', from: 'if (mins.length) axes.push(ax);', to: 'axes.push(ax);' },
    { file: 'tyrestate.js', name: 'clé numérique (la fusion créerait une liste)', from: "? 'car-' + car.id : null;", to: '? car.id : null;' },
    { file: 'tyrestate.js', name: 'écriture partielle malgré une saisie invalide', from: "if (!empty && (v == null || v < 0 || v > 12)) return {", to: "if (!empty && (v == null || v < 0 || v > 12)) { setTreadAxle(t, 'av', 0); return {" , close: true },
    { file: 'tyrestate.js', name: 'mention « non réglementaire » retirée de l’entretien', from: 'Seuil indicatif de 1 mm, non réglementaire.` });', to: 'Seuil de 1 mm.` });' },
    { file: 'engine.js', name: 'alerte d’usure irrégulière sans « contrôle de géométrie conseillé »', from: '. Contrôle de géométrie conseillé. Seuil indicatif de 1 mm, non réglementaire.` };', to: '.` };' },
    { file: 'engine.js', name: 'alerte de profondeur sur la moyenne des essieux', from: "const w = treadWorst(t); if (w.mm == null) return null;", to: "const w = treadWorst(t); if (w.mm == null) return null; if (t.treadAv != null && t.treadAr != null) w.mm = (t.treadAv + t.treadAr) / 2;" }
  ];
  for (const m of mutations) {
    const src = { ...SOURCES }; assert(src[m.file].includes(m.from), 'Mutation introuvable : ' + m.name);
    src[m.file] = src[m.file].replace(m.from, m.to + (m.close ? '' : ''));
    if (m.close) src[m.file] = src[m.file].replace("saisis une profondeur de 0 à 12 mm.` };", "saisis une profondeur de 0 à 12 mm.` }; }");
    let rej; try { runTests(src, { quiet: true }); } catch (e) { rej = e; }
    assert(rej && rej.scenario, 'La mutation doit être rejetée : ' + m.name + (rej ? ' (' + rej.message + ')' : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rej.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
