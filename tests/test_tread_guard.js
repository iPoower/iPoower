'use strict';
// PR 1 · sécurité pneumatique : garde-fou de profondeur qui PLAFONNE le verdict (jamais le score physique) sur toutes les surfaces
// alimentées par le moteur (cartes voiture, Trajet, agenda, briefing, Garage, scores, panneau Alertes) et par l'Intelligence
// pneumatique (Engineering Cockpit), plus la règle « pneus été et froid » identique pour toutes les voitures en pneus été.
// Données 100 % fictives. Exécuté sur main (REPRO=main), il sert de reproducteur avant correction. Contre-tests par mutation en fin de fichier.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const read = f => process.env.REPRO === 'main' ? execSync(`git show origin/main:src/${f}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 }) : fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const SOURCES = { 'engine.js': read('engine.js'), 'tyrestate.js': read('tyrestate.js'), 'app/tyre-intelligence.js': read('app/tyre-intelligence.js'), 'app/engineering-cockpit.js': read('app/engineering-cockpit.js'), 'app.js': read('app.js') };

function runTests(src = SOURCES, options = {}) {
  const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String, Intl, console, URL, TextEncoder, TextDecoder }; vm.createContext(ctx);
  // verdictHtml (app.js) : seule la fonction d'affichage du verdict est extraite, telle quelle.
  const vh = /^(?:\/\/[^\n]*\n)*const verdictHtml = [^\n]*(?:\n  [^\n]*)*/m.exec(src['app.js']);
  vm.runInContext(src['engine.js'] + read('tirespecs.js') + src['tyrestate.js'] + read('app/tyre-evidence.js') + src['app/tyre-intelligence.js'] + src['app/engineering-cockpit.js'] +
    '\nconst esc = s => String(s);\n' + (vh ? vh[0] : 'const verdictHtml = () => "";') +
    '\nthis.X = { treadGuard: typeof treadGuard === "function" ? treadGuard : () => null, windowAssess, hourVerdict, computeAlerts, buildHours, narrate, summarize, verdictHtml, TI: TyreIntelligence, EC: EngineeringCockpit };', ctx);
  const X = ctx.X, plain = v => JSON.parse(JSON.stringify(v));
  let count = 0;
  const test = (name, fn) => { try { fn(); } catch (e) { e.scenario = name; if (options.collect) { options.collect.push(name + ' · ' + String(e.message).split('\n')[0]); return; } throw e; } count++; if (!options.quiet) console.log('✅ ' + name); };
  // 24 h d'historique puis 24 h ; 15 novembre (saison froide), 15 °C par défaut pour isoler la profondeur.
  const FIELDS = { T: 'temperature_2m', RH: 'relative_humidity_2m', P: 'precipitation', snow: 'snowfall', code: 'weather_code', cloud: 'cloud_cover', vis: 'visibility', wind: 'wind_speed_10m', gust: 'wind_gusts_10m', rad: 'shortwave_radiation' };
  const hours = (at = () => ({})) => { const hourly = { time: [] }; Object.values(FIELDS).forEach(k => { hourly[k] = []; });
    for (let h = -24; h <= 24; h++) { hourly.time.push(new Date(Date.UTC(2026, 10, 15, 8 + h)).toISOString().slice(0, 13) + ':00');
      const x = { T: 15, RH: 70, P: 0, snow: 0, code: 3, cloud: 80, vis: 20000, wind: 10, gust: 20, rad: null, ...at(h) }; for (const [k, n] of Object.entries(FIELDS)) hourly[n].push(x[k]); }
    return X.buildHours({ hourly }); };
  const NOW = 24, seq = (hs, n = 3) => Array.from({ length: n + 1 }, (_, k) => ({ hs, i: NOW + k }));
  const car = (tire = {}, extra = {}) => ({ id: 'voitureA', short: 'Voiture A', sporty: false, ...extra, tire: { type: 'summer', size: '205/55 R16 91V', tread: null, ...tire } });
  const rain = mm => h => h >= 1 && h <= 2 ? { P: mm, code: 61, RH: 95 } : {};          // pluie PENDANT la fenêtre évaluée (3 h)
  const later = h => h >= 8 && h <= 9 ? { P: 2, code: 63, RH: 95 } : {};                  // pluie hors de la fenêtre de 3 h, dans les 24 h
  const trip = (t, at, n = 3) => plain(X.windowAssess(car(t), seq(hours(at), n), 'trip'));
  const alerts = (t, at, horizon = 24) => plain(X.computeAlerts({ hs: hours(at), nowI: NOW }, [car(t)], { alerts: {} }, {}, horizon));

  // ——— Frontières exactes, route sèche (fenêtre « trajet » et « ici, maintenant » : mêmes niveaux)
  test('sec · 1,59 mm : DANGER, minimum légal cité', () => {
    const w = trip({ tread: 1.59 }); assert.equal(w.level, 3); assert.equal(w.guard.legal, true); assert.match(w.guard.text, /minimum légal de 1,6 mm/);
    assert.equal(plain(X.hourVerdict(car({ tread: 1.59 }), hours(), NOW)).level, 3);
  });
  test('sec · 1,60 mm : légal, PRUDENCE (repère de sécurité interne, non réglementaire)', () => {
    const w = trip({ tread: 1.6 }); assert.equal(w.level, 2); assert.equal(w.guard.legal, false);
    assert.match(w.guard.text, /repère de sécurité interne \(marge de mesure et usure irrégulière\), non réglementaire/); assert.doesNotMatch(w.guard.text, /légal/);
    assert.equal(plain(X.hourVerdict(car({ tread: 1.6 }), hours(), NOW)).level, 2);
  });
  test('sec · 1,80 et 1,99 mm : PRUDENCE même sur route sèche', () => {
    for (const mm of [1.8, 1.99]) { assert.equal(trip({ tread: mm }).level, 2, String(mm)); assert.equal(plain(X.hourVerdict(car({ tread: mm }), hours(), NOW)).level, 2, String(mm)); }
  });
  test('sec · 2,00 et 3,00 mm : aucun plafond de profondeur (RAS conservé)', () => {
    for (const mm of [2, 3]) { const w = trip({ tread: mm }); assert.equal(w.guard, null, String(mm)); assert.equal(w.level, 0, String(mm)); }
  });
  test('score physique inchangé par le garde-fou (1,80 mm = 5,00 mm sur sec) ; seul le niveau est plafonné', () => {
    const a = trip({ tread: 1.8 }), b = trip({ tread: 5 }); assert.equal(a.score, b.score); assert(a.score >= 80, String(a.score)); assert.equal(a.scoreLevel, 0); assert.equal(a.level, 2);
  });
  // ——— Pluie pendant la fenêtre évaluée
  test('pluie 0,4 mm/h pendant le trajet (juste sous 0,5) : PRUDENCE à 1,80 mm', () => { assert.equal(trip({ tread: 1.8 }, rain(0.4)).guard.level, 2); });
  test('pluie 0,5 et 0,6 mm/h pendant le trajet : DANGER à 1,60 / 1,80 / 1,99 mm', () => {
    for (const p of [0.5, 0.6]) for (const mm of [1.6, 1.8, 1.99]) { const w = trip({ tread: mm }, rain(p)); assert.equal(w.level, 3, `${mm} mm · ${p} mm/h`); assert.match(w.guard.text, /pluie prévue/); }
  });
  test('pluie 0,6 mm/h à 2,00 mm : pas de plafond de profondeur', () => { assert.equal(trip({ tread: 2 }, rain(0.6)).guard, null); });
  test('pluie HORS de la fenêtre évaluée (dans 8 h) : PRUDENCE, jamais DANGER ; incluse dans une fenêtre de 12 h : DANGER', () => {
    assert.equal(trip({ tread: 1.8 }, later).level, 2); assert.equal(trip({ tread: 1.8 }, later, 12).guard.level, 3);
  });
  // ——— Les deux horizons du panneau Alertes (24 h) et du verdict « ici, maintenant » (3 h)
  test('alerte de profondeur · deux horizons : sec → PRUDENCE (3 h et 24 h) ; pluie dans 8 h → PRUDENCE à 3 h, DANGER à 24 h', () => {
    for (const h of [3, 24]) { const a = alerts({ tread: 1.8 }, undefined, h).tread; assert.equal(a.sev, 2, String(h)); assert.match(a.detail, /non réglementaire/); }
    assert.equal(alerts({ tread: 1.8 }, later, 3).tread.sev, 2); assert.equal(alerts({ tread: 1.8 }, later, 24).tread.sev, 3);
    assert.equal(alerts({ tread: 1.8 }, rain(0.4), 3).tread.sev, 2); assert.equal(alerts({ tread: 1.8 }, rain(0.5), 3).tread.sev, 3);
    assert.equal(alerts({ tread: 1.59 }, undefined, 3).tread.sev, 3); const two = alerts({ tread: 2 }, undefined, 3).tread; assert.equal(two.sev, 1, '2,00 mm en novembre : seul le repère indicatif de 3 mm (VIGILANCE)'); assert.match(two.title, /3 mm/);
  });
  // ——— Estimation
  test('estimation 1,50 mm : DANGER par précaution, « estimation sous le minimum réglementaire, mesure à confirmer », jamais « légal »', () => {
    const w = trip({ tread: 1.5, treadEst: 1 }); assert.equal(w.level, 3); assert.equal(w.guard.legal, false);
    assert.match(w.guard.text, /estimation sous le minimum réglementaire de 1,6 mm, mesure à confirmer/); assert.doesNotMatch(w.guard.text, /légal/);
    const a = alerts({ tread: 1.5, treadEst: 1 }).tread; assert.equal(a.sev, 3); assert.match(a.title, /mesure à confirmer/); assert.doesNotMatch(a.title, /légal/);
    assert(!w.items[0].parts.some(p => /légal/.test(p.label)), 'raison du score sans affirmation légale');
  });
  test('estimation 1,80 mm : mêmes seuils (PRUDENCE), mention « estimation »', () => { const w = trip({ tread: 1.8, treadEst: 1 }); assert.equal(w.level, 2); assert.match(w.guard.text, /\(estimation\)/); });
  test('météo indisponible (garde-fou appelé sans pluie connue) : PRUDENCE maintenue sous 2 mm, jamais DANGER par défaut', () => {
    const g = plain(X.treadGuard(car({ tread: 1.8 }), null)); assert.equal(g.level, 2); assert.match(g.text, /météo indisponible/);
    assert.equal(plain(X.treadGuard(car({ tread: 1.59 }), null)).level, 3, 'sous 1,6 mm : DANGER indépendamment de la météo');
    assert.equal(X.treadGuard(car({ tread: 2 }), null), null);
  });
  // ——— Profondeur inconnue
  test('profondeur inconnue : niveau météo conservé, RAS remplacé par « Analyse limitée · profondeur non renseignée »', () => {
    const w = trip({}); assert.equal(w.level, 0); assert.equal(w.depthUnknown, true); assert.equal(w.guard, null);
    const html = X.verdictHtml(w.level, false, w); assert.match(html, /ANALYSE LIMITÉE · PROFONDEUR NON RENSEIGNÉE/); assert.doesNotMatch(html, /CONDITIONS ADAPTÉES/);
    const fog = trip({}, h => h >= 0 && h <= 3 ? { vis: 150, RH: 100, code: 45 } : {}); assert(fog.level >= 2, String(fog.level));
    assert.match(X.verdictHtml(fog.level, false, fog), new RegExp(`${['RAS', 'VIGILANCE', 'PRUDENCE', 'DANGER'][fog.level]}.*PROFONDEUR NON RENSEIGNÉE`));
    const a = alerts({}, h => h >= 0 && h <= 3 ? { vis: 150, RH: 100, code: 45 } : {}, 3); assert(a.fog, 'alerte météo jamais masquée'); assert.equal(a.tread, undefined);
    const n = X.narrate(car({}), w, plain(X.summarize(seq(hours())))); assert.match(n.body, /Profondeur non renseignée/);
    assert.match(X.verdictHtml(0, false, trip({ tread: 5 })), /CONDITIONS ADAPTÉES/, 'profondeur connue : libellé RAS habituel');
  });
  test('récit de la carte : cause du plafond = la profondeur, score physique cité', () => {
    const w = trip({ tread: 1.8 }), n = X.narrate(car({ tread: 1.8 }), w, plain(X.summarize(seq(hours()))));
    assert.match(n.head, /PRUDENCE/); assert.match(n.body, /verdict plafonné à PRUDENCE, score physique inchangé/); assert.doesNotMatch(n.body, /pneus été sont hors de leur plage/);
  });
  // ——— Règle « pneus été et froid » : même météo, même heure → même règle pour toutes les voitures en pneus été
  test('pneus été et froid : présente ou absente pour les DEUX voitures en pneus été (11,0 / 11,36 / 11,7 / 12,5 °C, sec et mouillé ; 11,36 °C divergeait sur main)', () => {
    const plainCar = car({ tread: 6 }), sporty = car({ tread: 6, size: '225/40 ZR18 92Y XL' }, { id: 'voitureB', short: 'Voiture B', sporty: true });
    const has = (c, hs) => plain(X.windowAssess(c, seq(hs), 'trip')).items.some(it => it.parts.some(p => /^Pneus été et froid/.test(p.label)));
    for (const T of [11, 11.36, 11.7, 12.5]) for (const wet of [false, true]) {
      const hs = hours(() => ({ T, ...(wet ? { P: 1, code: 61, RH: 95 } : {}) }));
      assert.equal(has(plainCar, hs), has(sporty, hs), `${T} °C ${wet ? 'mouillé' : 'sec'}`);
    }
    assert.equal(has(plainCar, hours(() => ({ T: 11 }))), true); assert.equal(has(plainCar, hours(() => ({ T: 12.5 }))), false);
  });
  // ——— Intelligence pneumatique et Engineering Cockpit
  const TI = (t, samples) => plain(X.TI.analyse({ car: { id: 'voitureA', tire: { type: 'summer', brand: 'Marque test', model: 'Modèle test', size: '205/55 R16 91V', ...t } }, today: '2026-11-15',
    weather: samples ? { samples, ageMin: 5, source: 'Prévision fictive', fetchedAt: '2026-11-15T08:00' } : {} }));
  const dry = [{ t: '2026-11-15T09:00', T: 8, Tr: 8, P: 0, Pl: 0 }], wetS = mm => [{ t: '2026-11-15T09:00', T: 8, Tr: 8, P: mm, Pl: mm }];
  test('Intelligence pneumatique · 1,80 mm sec : règle « guard-depth », verdict plafonné à PRUDENCE (jamais « Aucune alerte »)', () => {
    const r = TI({ treadAv: 1.8, treadAr: 5 }, dry); assert(r.rules.some(x => x.id === 'guard-depth' && x.state === 'Vigilance'));
    assert.equal(r.overview.verdictCap.level, 2); assert.match(r.overview.verdictCap.text, /PRUDENCE · profondeur sous 2 mm, repère de sécurité interne non réglementaire/);
    assert.notEqual(r.overview.safety, 'Aucune alerte déclenchée');
    const ec = plain(X.EC.build(r)); assert(ec.diagnostics.entries.some(x => x.id === 'guard-depth'), 'Engineering Cockpit : règle visible');
  });
  test('Intelligence pneumatique · pluie 0,4 / 0,5 mm/h, météo indisponible, 2,00 mm, estimation, profondeur inconnue', () => {
    assert.equal(TI({ treadAv: 1.8 }, wetS(0.4)).overview.verdictCap.level, 2); assert.equal(TI({ treadAv: 1.8 }, wetS(0.5)).overview.verdictCap.level, 3);
    const off = TI({ treadAv: 1.8 }, null); assert.equal(off.overview.verdictCap.level, 2); assert.match(off.overview.verdictCap.text, /météo indisponible/);
    assert.equal(TI({ treadAv: 2 }, dry).overview.verdictCap, null);
    const est = TI({ treadAv: 1.5, treadEst: 1 }, dry); assert.equal(est.overview.verdictCap.level, 3); assert.match(est.overview.verdictCap.text, /estimation sous le minimum réglementaire de 1,6 mm, mesure à confirmer/);
    assert.notEqual(est.status, 'Risque documenté', 'une estimation n’est jamais un risque documenté');
    assert.match(TI({ treadAv: 1.5 }, dry).overview.verdictCap.text, /sous le minimum légal de 1,6 mm/);
    assert.match(TI({}, dry).overview.verdictCap.text, /Analyse limitée · profondeur non renseignée/);
  });
  return count;
}
module.exports = { runTests, SOURCES };
if (require.main === module) {
  if (process.env.REPRO === 'main') {   // reproducteur : chaque scénario lancé seul sur le code de main, constats affichés
    const red = [], n = runTests(SOURCES, { quiet: false, collect: red });
    red.forEach(r => console.log('❌ ' + r));
    console.log(`Reproducteur sur main : ${n} scénario(s) conforme(s), ${red.length} constat(s) reproduit(s).`); process.exit(0);
  }
  const count = runTests();
  const M = (file, name, from, to) => ({ file, name, from, to });
  const mutations = [
    M('engine.js', 'seuil interne de 2 mm abaissé à 1,9 mm', 'const TREAD_GUARD_MM = 2,', 'const TREAD_GUARD_MM = 1.9,'),
    M('engine.js', 'seuil interne inclusif (≤ 2 mm)', '  if (mm < TREAD_GUARD_MM) return { level:', '  if (mm <= TREAD_GUARD_MM) return { level:'),
    M('engine.js', 'seuil légal inclusif (1,60 mm traité comme illégal)', '  if (mm < TREAD_LEGAL_MM) return { level: 3, mm, legal: !est,', '  if (mm <= TREAD_LEGAL_MM) return { level: 3, mm, legal: !est,'),
    M('engine.js', 'seuil de pluie relevé à 0,6 mm/h', 'TREAD_GUARD_RAIN_MMH = 0.5;', 'TREAD_GUARD_RAIN_MMH = 0.6;'),
    M('engine.js', 'pluie strictement supérieure à 0,5 mm/h', 'const guard = treadGuard(car, valid.some(a => rainMmH(a.x) >= TREAD_GUARD_RAIN_MMH));', 'const guard = treadGuard(car, valid.some(a => rainMmH(a.x) > TREAD_GUARD_RAIN_MMH));'),
    M('engine.js', 'pluie prise sur 24 h au lieu de la fenêtre évaluée', 'const guard = treadGuard(car, valid.some(a => rainMmH(a.x) >= TREAD_GUARD_RAIN_MMH));', 'const guard = treadGuard(car, seq[0].hs.slice(seq[0].i, seq[0].i + 24).some(x => rainMmH(x) >= TREAD_GUARD_RAIN_MMH));'),
    M('engine.js', 'DANGER par défaut quand la météo manque', 'level: rain === true ? 3 : 2,', 'level: rain === false ? 2 : 3,'),
    M('engine.js', 'garde-fou qui modifie le score physique', 'return { items, first, worst: items[kMax], kMax, pNow, pMax, P, score, level:', 'if (guard) score = Math.min(score, 59); return { items, first, worst: items[kMax], kMax, pNow, pMax, P, score, level:'),
    M('engine.js', 'garde-fou absent du verdict « ici, maintenant »', 'level: guard ? Math.max(base, guard.level) : base, baseLevel: base,', 'level: base, baseLevel: base,'),
    M('engine.js', 'estimation présentée comme non-conformité légale', "legal: !est, est, rain, text: est ?", "legal: true, est, rain, text: false ?"),
    M('engine.js', 'alerte de profondeur sans seuil interne de 2 mm', '    if (w.mm < TREAD_GUARD_MM) return { sev:', '    if (false) return { sev:'),
    M('engine.js', 'alerte : pluie hors fenêtre comptée', "const wet = (seq || []).some(s => s && s.hs && rainMmH(s.hs[s.i]) >= TREAD_GUARD_RAIN_MMH);", "const wet = !!(seq && seq[0]) && seq[0].hs.some(x => rainMmH(x) >= TREAD_GUARD_RAIN_MMH);"),
    M('engine.js', '« pneus été et froid » de nouveau dépendant du facteur de performance', 'if (cBase >= 0.5) add(', 'if (cBase * perf >= 0.5) add('),
    M('engine.js', 'récit : cause du plafond masquée', "  if (w.guard && w.guard.level > lv) say(", "  if (false) say("),
    M('app.js', 'profondeur inconnue affichée « RAS — CONDITIONS ADAPTÉES »', 'const unk = !!(w && w.depthUnknown), lim = unk && l === 0;', 'const unk = false, lim = false;'),
    M('app/tyre-intelligence.js', 'Intelligence pneumatique sans règle sous 2 mm', "    if (guard) rule('guard-depth',", "    if (false) rule('guard-depth',"),
    M('app/tyre-intelligence.js', 'Intelligence pneumatique : pluie sous 0,5 mm/h comptée', '>= 0.5), guard = shallow.length', '> 0), guard = shallow.length')
  ];
  for (const m of mutations) {
    const src = { ...SOURCES }; assert(src[m.file].includes(m.from), 'Mutation introuvable : ' + m.name);
    src[m.file] = src[m.file].replace(m.from, m.to);
    let rej; try { runTests(src, { quiet: true }); } catch (e) { rej = e; }
    assert(rej && rej.scenario, 'La mutation doit être rejetée : ' + m.name + (rej ? ' (' + rej.message + ')' : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rej.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
