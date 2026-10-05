// Onglet Analyse : moteur pneumatique pur (thermique avec mémoire, chauffe, refroidissement, adhérence, freinage, aquaplaning,
// pression, confiance), puis contre-tests : chaque régression physique volontaire doit être rejetée par au moins un scénario.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const sourcePath = path.join(__dirname, '../src/tyrelab.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../src/tirespecs.js'), 'utf8') + source + '\nthis.lab = tyreLab;', ctx);
  const plain = v => JSON.parse(JSON.stringify(v));
  const lab = input => plain(ctx.lab(plain(input)));
  const ts = (h, day = '2026-10-06') => `${day}T${h}`;
  // 36 h de météo homogène à partir de la veille 18:00 ; chaque scénario modifie les champs utiles
  const H = (base = {}, from = '2026-10-05T18:00', n = 40) => Array.from({ length: n }, (_, k) => ({
    t: new Date(Date.parse(from + ':00Z') + k * 3600e3).toISOString().slice(0, 16), T: 12, Tr: 12, RH: 70, P: 0, Pl: 0, snow: 0, code: 1, gust: 15, rad: 0, ice: { level: 0, score: 0 }, ...base }));
  const car = (tire = {}) => ({ name: 'Voiture test', tire: { type: 'summer', brand: 'Marque test', model: 'Modèle test', size: '215/45 R17 91V', press: '2,4', tread: 6, pchk: { date: '2026-09-20', T: 15 }, ...tire } });
  const drive = (since, kind, extra = {}) => ({ active: true, since: ts(since), kind, ...extra });
  let count = 0;
  const test = (name, fn) => { try { fn(); } catch (error) { error.scenario = name; throw error; } count++; if (!options.quiet) console.log('✅ ' + name); };

  test('monte inconnue : message clair, aucun autre pneu analysé', () => {
    for (const t of [{ type: 'unknown' }, { type: 'none' }, null]) {
      const r = lab({ now: ts('07:00'), car: t ? car(t) : { name: 'X' }, hours: H() });
      assert.equal(r.known, false); assert.equal(r.reason, 'Monte active inconnue — sélectionner les pneus montés.'); assert.equal(r.thermal, undefined);
    }
  });
  test('absence de météo : pneu identifié, aucune estimation thermique inventée', () => {
    const r = lab({ now: ts('07:00'), car: car(), hours: [] });
    assert.equal(r.known, true); assert.equal(r.noWeather, true); assert.equal(r.thermal, undefined); assert.equal(r.confidence.level, 'faible');
  });
  test('monte réelle décodée : dimension, charge, vitesse, saison, positions', () => {
    const r = lab({ now: ts('07:00'), car: car({ size: '215/40 ZR18 89Y XL', brand: 'Michelin', model: 'Pilot Sport 4S' }), hours: H() });
    assert.equal(r.tyre.title, 'Michelin Pilot Sport 4S'); assert.equal(r.tyre.li, 89); assert.equal(r.tyre.kg, 580); assert.equal(r.tyre.si, 'Y'); assert.equal(r.tyre.xl, true);
    assert.equal(r.tyre.season, 'été'); assert.equal(r.tyre.uhp, true); assert.match(r.tyre.axles, /avant et à l’arrière/);
    const ax = lab({ now: ts('07:00'), car: car({ press: '2,3 AV / 2,6 AR' }), hours: H() });
    assert.deepEqual(ax.tyre.pressAxles, { av: 2.3, ar: 2.6, differ: true }); assert.match(ax.tyre.axles, /AV 2,3 \/ AR 2,6 bar/);
  });
  test('données constructeur partielles : sources reliées, rubriques manquantes « non disponible », jamais estimées', () => {
    const r = lab({ now: ts('07:00'), car: car({ brand: 'Michelin', model: 'Pilot Sport 4S' }), hours: H() });
    const known = r.spec.known.filter(x => x.v), missing = r.spec.known.filter(x => !x.v).map(x => x.k);
    assert(known.length >= 3 && known.every(x => /^https:\/\/www\.michelin/.test(x.src) && x.kind === 'fabricant'));
    assert(missing.includes('Étiquette UE') && missing.includes('Homologation constructeur'));
    const g = lab({ now: ts('07:00'), car: car(), hours: H() });
    assert(g.spec.known.every(x => x.v === null)); assert(g.confidence.reasons.some(x => /Fiche constructeur non disponible/.test(x)));
  });
  test('voiture stationnée toute la nuit : pneu froid, retour proche de l’état froid', () => {
    const r = lab({ now: ts('06:30'), car: car(), hours: H({ T: 4, Tr: 3 }), history: { at: ts('19:00', '2026-10-05'), T: 32 } });
    assert.equal(r.thermal.state, 'Pneu froid'); assert.equal(r.cool.label, 'Retour proche de l’état froid'); assert(r.cool.kept <= 5);
  });
  test('départ après un trajet récent : la chaleur est conservée (mémoire thermique)', () => {
    const r = lab({ now: ts('08:20'), car: car(), hours: H({ T: 10, Tr: 10 }), history: { at: ts('08:10'), T: 38 } });
    assert.equal(r.cool.label, 'Température conservée'); assert(r.cool.kept >= 75); assert.equal(r.thermal.state, 'Fenêtre favorable');
  });
  test('arrêt court (5 min) : l’essentiel conservé ; arrêt long (3 h) : proche du froid', () => {
    const short = lab({ now: ts('10:05'), car: car(), hours: H(), history: { at: ts('10:00'), T: 40 } }), long = lab({ now: ts('13:00'), car: car(), hours: H(), history: { at: ts('10:00'), T: 40 } });
    assert(short.thermal.T > 36 && long.thermal.T < 15, `${short.thermal.T} / ${long.thermal.T}`);
  });
  test('2 °C chauffe moins vite que 20 °C (même pneu, même route)', () => {
    const cold = lab({ now: ts('10:00'), car: car(), hours: H({ T: 2, Tr: 2 }), drive: drive('09:50', 'route') }), warm = lab({ now: ts('10:00'), car: car(), hours: H({ T: 20, Tr: 20 }), drive: drive('09:50', 'route') });
    assert(cold.thermal.T - 2 > 0 && warm.thermal.s > cold.thermal.s);
    const c0 = lab({ now: ts('10:00'), car: car(), hours: H({ T: 2, Tr: 2 }) }), w0 = lab({ now: ts('10:00'), car: car(), hours: H({ T: 16, Tr: 16 }) });
    assert(c0.warm.never || c0.warm.km[0] > w0.warm.km[0], JSON.stringify([c0.warm, w0.warm]));
  });
  test('pluie froide : ralentit puis inverse la montée en température', () => {
    const hs = H({ T: 4, Tr: 4 }); hs.filter(x => x.t >= ts('10:00')).forEach(x => Object.assign(x, { P: 4, Pl: 4 }));
    const dry = lab({ now: ts('10:30'), car: car(), hours: H({ T: 4, Tr: 4 }), history: { at: ts('09:59'), T: 30 }, drive: drive('10:00', 'route') });
    const wet = lab({ now: ts('10:30'), car: car(), hours: hs, history: { at: ts('09:59'), T: 30 }, drive: drive('10:00', 'route') });
    assert(wet.thermal.T < 30 && wet.thermal.T < dry.thermal.T, `${wet.thermal.T} / ${dry.thermal.T}`);   // gomme chaude qui refroidit sous la pluie
  });
  test('autoroute et ville n’évoluent pas pareil', () => {
    const a = lab({ now: ts('10:20'), car: car(), hours: H({ T: 8, Tr: 8 }), drive: drive('10:00', 'autoroute') }), v = lab({ now: ts('10:20'), car: car(), hours: H({ T: 8, Tr: 8 }), drive: drive('10:00', 'ville') });
    assert(a.thermal.T > v.thermal.T + 3, `${a.thermal.T} / ${v.thermal.T}`); assert(a.drivenKm > v.drivenKm);
  });
  test('pneu hiver et pneu été ne réagissent pas pareil à 3 °C', () => {
    const s = lab({ now: ts('07:00'), car: car(), hours: H({ T: 3, Tr: 3 }) }), w = lab({ now: ts('07:00'), car: car({ type: 'winter' }), hours: H({ T: 3, Tr: 3 }) });
    assert(w.thermal.s > s.thermal.s, `${w.thermal.state} / ${s.thermal.state}`); assert(w.grip.mu > s.grip.mu);
    const hot = H({ T: 28, Tr: 34 }), sh = lab({ now: ts('15:00'), car: car(), hours: hot }), wh = lab({ now: ts('15:00'), car: car({ type: 'winter' }), hours: hot });
    assert(wh.grip.mu < sh.grip.mu, 'pneu hiver pénalisé par la chaleur');
  });
  test('forte chaleur sur autoroute : chaud ou très chaud, jamais « favorable » par défaut', () => {
    const r = lab({ now: ts('16:00'), car: car(), hours: H({ T: 36, Tr: 52, rad: 800 }), drive: drive('14:30', 'autoroute') });
    assert(r.thermal.s >= 3, r.thermal.state); assert.notEqual(r.hero.state, 'Fenêtre favorable');
  });
  test('proche de 0 °C sur chaussée humide : verglas possible, freinage très dégradé, aucune distance', () => {
    const r = lab({ now: ts('06:30'), car: car(), hours: H({ T: 0.5, Tr: -0.5, RH: 97, P: 0.2, Pl: 0.2 }) });
    assert.equal(r.env.surf, 'ice'); assert.equal(r.grip.lv, 3); assert.equal(r.grip.word, 'Très dégradé'); assert.equal(r.grip.dist, null);
  });
  test('pluie et pluie forte : freinage dégradé, aquaplaning gradué', () => {
    const light = lab({ now: ts('10:00'), car: car(), hours: H({ P: 1, Pl: 1 }), history: { at: ts('09:58'), T: 35 } });
    const heavy = lab({ now: ts('10:00'), car: car({ tread: 2.5 }), hours: H({ P: 8, Pl: 8 }), drive: drive('09:30', 'autoroute') });
    assert(light.grip.lv >= 1 && heavy.grip.lv >= 2); assert(heavy.grip.aqua.lv > light.grip.aqua.lv); assert.equal(heavy.grip.aqua.word, 'Critique');
    assert(heavy.grip.dist.now[0] > light.grip.dist.now[0]);
  });
  test('freinage : optimal sur sec avec un pneu en température, facteur dominant expliqué quand froid', () => {
    const ok = lab({ now: ts('15:00'), car: car(), hours: H({ T: 20, Tr: 24 }), drive: drive('14:00', 'route') });
    assert.equal(ok.grip.word, 'Optimal'); assert.equal(ok.grip.dom, null);
    const cold = lab({ now: ts('07:00'), car: car(), hours: H({ T: 4, Tr: 3 }) });
    assert(['Bon', 'Dégradé'].includes(cold.grip.word)); assert(/Gomme|7 °C/.test(cold.grip.dom.k)); assert.match(cold.hero.limiting, /gomme|7 °C/);
  });
  test('distances : plages, référence et réaction séparées, jamais une valeur unique', () => {
    const r = lab({ now: ts('15:00'), car: car(), hours: H({ T: 20, Tr: 24 }), drive: drive('14:00', 'route') }), d = r.grip.dist;
    assert.equal(d.v, 80); assert.equal(d.react, 22); assert(d.dry[0] < d.dry[1] && d.wet[0] < d.wet[1] && d.now[0] < d.now[1]); assert(d.wet[0] > d.dry[1]);
    assert.deepEqual(d.dry, [28, 36]);   // v²/(2µg) à 80 km/h, µ 0,9 et 0,7
  });
  test('aucune fausse précision : température toujours en plage d’au moins 6 °C, jamais une valeur seule', () => {
    for (const r of [lab({ now: ts('07:00'), car: car(), hours: H() }), lab({ now: ts('10:20'), car: car(), hours: H(), drive: drive('10:00', 'autoroute') })]) {
      assert(r.thermal.range[1] - r.thermal.range[0] >= 6); assert.equal(r.hero.T, undefined); assert(!/\b\d+ °C\b/.test(r.hero.state + r.hero.warm));
    }
  });
  test('trajet sec puis pluie : l’état suit le parcours, début de pluie et impacts signalés', () => {
    const hs = H({ T: 9, Tr: 8 }); hs.filter(x => x.t >= ts('07:00')).forEach(x => Object.assign(x, { P: 1.5, Pl: 1.5 }));
    const pts = [['06:45', 0, 0, 'Ville A'], ['06:55', 0.3, 12, 'Ville M'], ['07:05', 0.6, 25], ['07:20', 1, 42, 'Ville B']].map(([h, f, km, name]) => ({ t: ts(h), f, km, name }));
    const r = lab({ now: ts('06:30'), car: car(), hours: hs, trip: { label: 'trajet aller', km: 42, kind: 'route', points: pts } });
    assert.equal(r.trip.rows.length, 4); assert.equal(r.trip.rows[0].state, 'Pneu froid');
    const ev = r.trip.rows.flatMap(x => x.events); assert(ev.some(e => /Début pluie/.test(e.text) && e.impact.includes('freinage mouillé dégradé')), JSON.stringify(ev));
    assert.equal(r.compare.a, 'Départ 06:45'); assert.equal(r.compare.b, 'Arrivée 07:20');
  });
  test('trajet court reste froid, trajet long atteint la fenêtre favorable', () => {
    const hs = H({ T: 12, Tr: 12 }), P = (list) => list.map(([h, km]) => ({ t: ts(h), km }));
    const short = lab({ now: ts('08:00'), car: car(), hours: hs, trip: { km: 4, points: P([['08:10', 0], ['08:18', 4]]) } });
    const long = lab({ now: ts('08:00'), car: car(), hours: hs, trip: { km: 90, points: P([['08:10', 0], ['08:40', 40], ['09:05', 90]]) } });
    assert(short.trip.rows.at(-1).s <= 1, short.trip.rows.at(-1).state); assert.equal(long.trip.rows.at(-1).state, 'Fenêtre favorable');
  });
  test('aucun trajet : hypothèse de route affichée, comparaison « maintenant / après ~15 km »', () => {
    const r = lab({ now: ts('07:00'), car: car(), hours: H({ T: 8, Tr: 7 }) });
    assert.equal(r.trip, null); assert.match(r.warm.hyp, /hypothèse : route/); assert.equal(r.compare.a, 'Maintenant'); assert.equal(r.compare.b, 'Après ~15 km');
    assert.equal(r.compare.rows.length, 5);
  });
  test('en roulage depuis peu : temps et distance restants en plages, puis « atteinte depuis »', () => {
    const early = lab({ now: ts('10:06'), car: car(), hours: H({ T: 10, Tr: 9 }), drive: drive('10:00', 'route') });
    assert(early.warm.min && early.warm.min[0] < early.warm.min[1] && early.warm.km[0] < early.warm.km[1], JSON.stringify(early.warm));
    const later = lab({ now: ts('11:00'), car: car(), hours: H({ T: 14, Tr: 14 }), drive: drive('10:00', 'route') });
    assert.equal(later.warm.reached, true); assert(later.warm.sinceMin > 0); assert.match(later.hero.warm, /atteinte depuis ~\d+ min/);
  });
  test('pression : enregistrée vs estimée ; inconnue → aucune estimation', () => {
    const r = lab({ now: ts('07:00'), car: car({ press: '2,4', pchk: { date: '2026-08-15', T: 25 } }), hours: H({ T: 5, Tr: 4 }) });
    assert(r.press.known && r.press.cold < 2.4 - 0.2 && r.press.low); assert(r.press.notes.some(x => /pression enregistrée/.test(x)) && r.press.notes.some(x => /estimation/.test(x)));
    const u = lab({ now: ts('07:00'), car: car({ press: '' }), hours: H() });
    assert.equal(u.press.known, false); assert.match(u.press.text, /non renseignée/);
  });
  test('données manquantes ou anciennes : confiance plus faible ; GPS et données complètes : moyenne au plus (aucun capteur), axes séparés', () => {
    const full = lab({ now: ts('10:20'), car: car({ brand: 'Michelin', model: 'Pilot Sport 4S' }), hours: H(), drive: drive('10:00', 'route'), ageMin: 10 });
    const poor = lab({ now: ts('10:20'), car: car({ brand: '', model: '', press: '', tread: null }), hours: H(), ageMin: 240 });
    const parked = lab({ now: ts('10:20'), car: car({ brand: 'Michelin', model: 'Pilot Sport 4S' }), hours: H(), history: { at: ts('09:00'), T: 30 }, trip: null, ageMin: 10 });
    assert.equal(full.confidence.level, 'moyenne'); assert.deepEqual(full.confidence.axes.map(x => x[0]), ['Données pneu', 'Trajet', 'Météo', 'Modèle thermique', 'Capteur direct']); assert.equal(full.confidence.axes[4][1], 'non');
    assert(full.press.notes.some(x => /En roulage : ≈ [\d,]+–[\d,]+ bar \(ordre de grandeur : \+0,1 à \+0,3 bar/.test(x)), full.press.notes.join(' | ')); assert.equal(poor.confidence.level, 'faible'); assert.notEqual(parked.confidence.level, 'élevée');
    assert(poor.thermal.range[1] - poor.thermal.range[0] > full.thermal.range[1] - full.thermal.range[0]);
    assert(full.confidence.reasons[0].includes('aucun capteur'));
    const noHist = lab({ now: ts('10:20'), car: car({ brand: 'Michelin', model: 'Pilot Sport 4S' }), hours: H(), ageMin: 10 });
    assert(noHist.confidence.score < parked.confidence.score && noHist.confidence.reasons.some(x => /Historique de roulage inconnu/.test(x)));
  });
  test('adhérence : cinq barres expliquées, aquaplaning distinct', () => {
    const r = lab({ now: ts('10:00'), car: car(), hours: H({ P: 3, Pl: 3, gust: 60 }), drive: drive('09:40', 'route') });
    assert.deepEqual(r.grip.bars.map(b => b.label), ['Accélération', 'Freinage', 'Virage', 'Stabilité', 'Aquaplaning']);
    assert(r.grip.bars.every(b => b.b >= 0 && b.b <= 10 && b.why.length));
    assert(r.grip.bars.find(b => b.id === 'stab').why.some(x => /Rafales 60/.test(x)));
  });
  test('neige : pneu été bien plus pénalisé qu’un 4 saisons 3PMSF ou un hiver', () => {
    const snow = H({ T: -1, Tr: -0.5, snow: 0.8, code: 73 });
    const s = lab({ now: ts('08:00'), car: car(), hours: snow }), a = lab({ now: ts('08:00'), car: car({ type: 'allseason' }), hours: snow, db: { pmsf: true } }), w = lab({ now: ts('08:00'), car: car({ type: 'winter' }), hours: snow });
    assert.equal(s.env.surf, 'snow'); assert.equal(s.grip.dist, null);   // neige : indice relatif seulement
    assert(s.grip.mu < a.grip.mu && a.grip.mu <= w.grip.mu);
  });
  test('signalement terrain : verglas signalé aggrave la surface, brouillard = humidité accrue seulement', () => {
    const ice = lab({ now: ts('07:00'), car: car(), hours: H({ T: 3, Tr: 2 }), reports: [{ kind: 'ice', at: ts('06:50') }] });
    assert.equal(ice.env.surf, 'ice'); assert.equal(ice.grip.word, 'Très dégradé'); assert(ice.thermal.why.some(x => /signalée par vous/.test(x)));
    const fog = lab({ now: ts('07:00'), car: car(), hours: H({ T: 8, Tr: 8 }), reports: [{ kind: 'fog', at: ts('06:55') }] });
    assert.equal(fog.env.surf, 'damp');
    const old = lab({ now: ts('09:00'), car: car(), hours: H({ T: 8, Tr: 8 }), reports: [{ kind: 'ice', at: ts('06:50') }] });
    assert.equal(old.env.surf, 'dry');
  });
  test('déterminisme : mêmes entrées, même résultat, entrées intactes', () => {
    const input = { now: ts('10:20'), car: car(), hours: H(), drive: drive('10:00', 'route'), history: { at: ts('09:00'), T: 25 } };
    const before = JSON.stringify(input); assert.deepEqual(plain(ctx.lab(input)), plain(ctx.lab(input))); assert.equal(JSON.stringify(input), before);
  });
  test('départ à chaud : la mémoire enregistrée pendant le roulage est reprise (pas de retour au pneu froid)', () => {
    const c = car({ brand: 'Michelin', model: 'Pilot Sport 4S' }), base = { now: ts('10:20'), car: c, hours: H(), drive: drive('10:00', 'route'), ageMin: 10 };
    const cold = lab(base), warm = lab({ ...base, history: { at: ts('10:15'), T: 45 } });
    assert(warm.thermal.T > cold.thermal.T + 3, `${cold.thermal.T} → ${warm.thermal.T}`);
  });
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) {
  const original = fs.readFileSync(sourcePath, 'utf8'), count = runTests(original);
  const mutations = [
    { name: 'mémoire du roulage en cours ignorée', from: 'else if (hist && mins(hist.at) <= nowM) { T0 = hist.T; t0 = mins(hist.at); }', to: '' },
    { name: 'refroidissement 10× plus lent (mémoire éternelle)', from: 'const TL_TAU_PARK = 50;', to: 'const TL_TAU_PARK = 500;' },
    { name: 'ville et autoroute identiques', from: "ville: { dT: 14, tauKm: 7, v: 30", to: "ville: { dT: 26, tauKm: 10, v: 115" },
    { name: 'la pluie ne refroidit plus la gomme', from: "{ dry: 1, damp: 0.85, rain: 0.65, heavy: 0.5, pool: 0.5, snow: 0.5, ice: 0.6 }[e.surf]", to: '1' },
    { name: 'pneu hiver traité comme un pneu été', from: 'winter: [-5, 5, 35, 50]', to: 'winter: [10, 20, 50, 65]' },
    { name: 'plage d’incertitude supprimée (fausse précision)', from: "const u = 3 + 0.25 * Math.abs(T - eNow.Tenv)", to: "const u = 0 * Math.abs(T - eNow.Tenv)" },
    { name: 'historique inconnu supposé chaud', from: "else { T = eNow.Tenv; phase = 'unknown';", to: "else { T = eNow.Tenv + 25; phase = 'unknown';" },
    { name: 'distance affichée sur verglas', from: "if (!['snow', 'ice'].includes(e.surf)) {", to: 'if (true) {' },
    { name: 'confiance indépendante des données manquantes', from: "  if (phase === 'unknown') { score -= 1;", to: "  if (false) { score -= 1;" }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    let rejection; try { runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rejection = e; }
    assert(rejection && rejection.scenario, 'La mutation doit être rejetée : ' + m.name + (rejection ? ' (' + rejection.message + ')' : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
