// Onglet Analyse : moteur pneumatique pur (thermique avec mémoire, chauffe, refroidissement, adhérence, freinage, aquaplaning,
// pression, confiance), puis contre-tests : chaque régression physique volontaire doit être rejetée par au moins un scénario.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const sourcePath = path.join(__dirname, '../src/tyrelab.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../src/tirespecs.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../src/tyrestate.js'), 'utf8') + source + '\nthis.lab = tyreLab; this.lastDrive = tyreLabLastDrive; this.coldCombine = tlColdCombine; this.treadWet = tlTreadWet;', ctx);
  const plain = v => JSON.parse(JSON.stringify(v));
  // Ces scénarios thermiques utilisent une météo reçue depuis 5 min, sauf cas d'âge explicite.
  const lab = input => plain(ctx.lab({ ageMin: 5, ...plain(input) }));
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
    assert.equal(r.thermal.level, 'Pneu froid'); assert.equal(r.cool.label, 'Retour proche de l’état froid'); assert(r.cool.kept <= 5);
  });
  test('départ après un trajet récent : la chaleur est conservée (mémoire thermique)', () => {
    const r = lab({ now: ts('08:20'), car: car(), hours: H({ T: 10, Tr: 10 }), history: { at: ts('08:10'), T: 38 } });
    assert.equal(r.cool.label, 'Température conservée'); assert(r.cool.kept >= 75); assert.equal(r.thermal.level, 'Fenêtre favorable');
  });
  test('arrêt court (5 min) : l’essentiel conservé ; arrêt long (3 h) : proche du froid', () => {
    const short = lab({ now: ts('10:05'), car: car(), hours: H(), history: { at: ts('10:00'), T: 40 } }), long = lab({ now: ts('13:00'), car: car(), hours: H(), history: { at: ts('10:00'), T: 40 } });
    assert(short.thermal.T > 36 && long.thermal.T < 15, `${short.thermal.T} / ${long.thermal.T}`);
  });
  // 0 km/h est une vitesse mesurée (voiture arrêtée), pas une vitesse inconnue : la gomme ne chauffe pas à l'arrêt.
  test('roulage suivi à 0 km/h : aucune chauffe, la gomme refroidit comme à l’arrêt', () => {
    const base = { now: ts('10:00'), car: car(), hours: H({ T: 10, Tr: 10 }), history: { at: ts('09:00'), T: 45 } };
    const unknown = lab({ ...base, drive: drive('09:30', 'route', { speedKmh: null }) });
    for (const v of [0, 1, 2.9]) {
      const stopped = lab({ ...base, drive: drive('09:30', 'route', { speedKmh: v }) }), parked = lab({ ...base, drive: undefined });
      assert(stopped.thermal.T < unknown.thermal.T - 3, `${v} km/h : ${stopped.thermal.T} contre inconnue ${unknown.thermal.T}`);
      assert(stopped.thermal.T <= parked.thermal.T + 0.5, `${v} km/h chauffe au-delà de l’arrêt : ${stopped.thermal.T} / ${parked.thermal.T}`);
      assert.notEqual(stopped.thermal.trend, 'heating'); assert(stopped.thermal.why.some(x => /À l’arrêt|0 km\/h|arrêt/.test(x)), JSON.stringify(stopped.thermal.why));
    }
  });
  test('départ à froid à 0 km/h : reste à la température ambiante, jamais « en chauffe »', () => {
    const r = lab({ now: ts('10:00'), car: car(), hours: H({ T: 8, Tr: 8 }), drive: drive('09:40', 'route', { speedKmh: 0 }) });
    assert(Math.abs(r.thermal.T - 8) < 1.5 && r.thermal.trend !== 'heating', JSON.stringify([r.thermal.T, r.thermal.trend]));
    const moving = lab({ now: ts('10:00'), car: car(), hours: H({ T: 8, Tr: 8 }), drive: drive('09:40', 'route', { speedKmh: 70 }) });
    assert(moving.thermal.T > r.thermal.T + 3, 'le roulage normal doit rester inchangé');
  });
  test('profondeur sous 1,6 mm : état critique prioritaire sur l’indice de freinage, par temps sec', () => {
    const r = lab({ now: ts('15:00'), car: car({ tread: 1.2 }), hours: H({ T: 20, Tr: 24 }), drive: drive('14:00', 'route') });
    assert.equal(r.hero.lvl, 3); assert.equal(r.grip.lv, 3); assert.match(r.hero.limiting, /minimum légal/); assert.notEqual(r.hero.brake, 'Optimal');
    assert.equal(r.compare.rows.find(x => x.label === 'Freinage sec').b.lv, 3); assert.match(r.hero.critical, /1,2 mm.*minimum légal.*remplacer/); assert.equal(r.hero.emoji, '🔴');
    const legal = lab({ now: ts('15:00'), car: car({ tread: 1.6 }), hours: H({ T: 20, Tr: 24 }), drive: drive('14:00', 'route') });
    assert(legal.hero.lvl < 3 || !/minimum légal/.test(legal.hero.limiting)); assert.equal(legal.hero.critical, null);
  });
  test('minimum légal de sculpture : une seule valeur (1,6 mm) dans le moteur, l’Analyse et l’entretien', () => {
    const src = f => fs.readFileSync(path.join(__dirname, '../src/' + f), 'utf8');
    assert.equal(/const TREAD_LEGAL_MM = (\d+(?:\.\d+)?);/.exec(src('engine.js'))[1], '1.6');
    assert.equal(/const TL_LEGAL_MM = (\d+(?:\.\d+)?);/.exec(src('tyrelab.js'))[1], '1.6');
    assert(/mm < 1\.6 \? 3 : 1/.test(src('tyrestate.js')), 'entretien : seuil 1,6 mm');
  });
  test('limites affichées : ce qui est estimé, supposé ou hors domaine est dit en clair', () => {
    const L = r => r.confidence.limits.join(' | ');
    const moving = lab({ now: ts('15:00'), car: car(), hours: H({ T: 20, Tr: 24 }), drive: drive('14:00', 'route', { speedKmh: 60 }) });
    assert.match(L(moving), /Aucun capteur/); assert.match(L(moving), /moyenne depuis le départ/); assert.match(L(moving), /Chaussée estimée par la météo/); assert.match(L(moving), /jamais une garantie d’arrêt/);
    const stopped = lab({ now: ts('15:00'), car: car(), hours: H({ T: 20, Tr: 24 }), drive: drive('14:00', 'route', { speedKmh: 0 }) });
    assert.match(L(stopped), /Arrêt déduit d’une vitesse moyenne sous 3 km\/h/);
    const unknown = lab({ now: ts('15:00'), car: car(), hours: H({ T: 20, Tr: 24 }) }); assert.match(L(unknown), /Historique d’arrêt inconnu/);
    const ice = lab({ now: ts('15:00'), car: car(), hours: H({ T: -2, Tr: -3, P: 1, Pl: 1 }), drive: drive('14:00', 'route') }); assert.match(L(ice), /Aucune distance de freinage chiffrée/);
    const worn = lab({ now: ts('15:00'), car: car({ tread: 1.2 }), hours: H({ T: 20, Tr: 24 }), drive: drive('14:00', 'route') }); assert.match(L(worn), /sous le minimum légal/);
    const old = lab({ now: ts('15:00'), car: car(), hours: H({ T: 20, Tr: 24 }), drive: drive('14:00', 'route'), ageMin: 240 }); assert.match(L(old), /Météo ancienne \(4 h\)/);
    const reported = lab({ now: ts('15:00'), car: car(), hours: H({ T: 20, Tr: 24 }), drive: drive('14:00', 'route'), reports: [{ kind: 'wet', at: ts('14:50') }] }); assert.match(L(reported), /signalée par vous/);
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
    // pluie forte persistante = eau stagnante probable : aucune distance (aquaplaning imprévisible), message explicite
    assert.equal(heavy.env.surf, 'pool'); assert.equal(heavy.grip.dist, null); assert.match(heavy.grip.distNote, /Eau stagnante.*Aucune distance/);
    const burst = lab({ now: ts('10:00'), car: car({ tread: 2.5 }), hours: H().map(x => x.t === '2026-10-06T10:00' ? { ...x, P: 3, Pl: 3 } : x), history: { at: ts('09:58'), T: 35 } });
    assert.equal(burst.env.surf, 'heavy'); assert(burst.grip.dist.now[0] > light.grip.dist.now[0], 'pluie forte sans eau accumulée : distance plus longue que la pluie faible');
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
  test('cohérence mouillé : pneu idéal sous la pluie = référence mouillé ; sec = référence sec ; humide entre les deux', () => {
    const warm = (b, tread = 8) => lab({ now: ts('15:00'), car: car({ tread }), hours: H({ T: 20, Tr: 24, ...b }), drive: drive('14:00', 'route') }).grip.dist;
    const dry = warm({}), rain = warm({ P: 1, Pl: 1 }), damp = warm({ RH: 96 });
    assert.deepEqual(dry.now, dry.dry, 'sec : maintenant = référence sec');
    assert.deepEqual(rain.now, rain.wet, 'pluie, pneu idéal : maintenant = référence mouillé (plus de contradiction)');
    assert(damp.now[0] > dry.now[0] && damp.now[1] < rain.now[1], 'humide : entre sec et mouillé ' + JSON.stringify({ d: dry.now, h: damp.now, p: rain.now }));
    assert(rain.now[0] >= rain.wet[0], 'sous la pluie, maintenant n’est jamais meilleur que la référence mouillé');
  });
  test('usure sur mouillé : courbe progressive, fourchette prudente/optimiste, provisoire, rien au-delà de 8 mm', () => {
    const at = tread => lab({ now: ts('15:00'), car: car({ tread }), hours: H({ T: 20, Tr: 24, P: 1, Pl: 1 }), drive: drive('14:00', 'route') }).grip;
    const depths = [8, 6, 5, 4, 3, 2.3, 1.6], d = depths.map(x => at(x).dist);
    for (let i = 1; i < d.length; i++) { assert(d[i].now[0] >= d[i - 1].now[0] && d[i].now[1] >= d[i - 1].now[1], 'distance non décroissante quand la gomme s’use : ' + depths[i]); }
    assert(d[d.length - 1].now[1] > d[0].now[1] + 10, 'écart neuf → minimum légal sensible');
    const g8 = at(8), g23 = at(2.3), g16 = at(1.6);
    assert(!g8.f.some(x => /Profondeur/.test(x.k)) && g8.dist.provisional === false, '8 mm : aucun facteur d’usure');
    assert(g23.dist.provisional === true && /hypothèse non calibrée/.test(g23.f.find(x => /Profondeur/.test(x.k)).k));
    assert(g23.dist.now[1] - g23.dist.now[0] > g8.dist.now[1] - g8.dist.now[0], 'la fourchette s’élargit (écarts optimiste et prudent distincts)');
    // écarts mesurés AJOUTÉS à la référence mouillé, pas convertis en ratio : +6,9 / +13 m à 1,6 mm, quelle que soit la référence
    const tw = ctx.treadWet(1.6); assert.deepEqual([tw.opt, tw.pru], [6.9, 13]);
    const t3 = ctx.treadWet(3); assert(Math.abs(t3.opt - 2.65) < 1e-9 && t3.pru === 5); assert.equal(ctx.treadWet(9).pru, 0); assert.equal(ctx.treadWet(null), null);
    const t12 = ctx.treadWet(1.2); assert.deepEqual([t12.opt, t12.pru, t12.belowLegal], [6.9, 13, true], 'sous 1,6 mm : aucune extrapolation inventée');
    assert(Math.abs(g16.dist.now[0] - g16.dist.wet[0] - 6.9) <= 1 && Math.abs(g16.dist.now[1] - g16.dist.wet[1] - 13) <= 1, 'écarts publiés retrouvés tels quels : ' + JSON.stringify(g16.dist));
    assert(/minimum légal/.test(g16.f.find(x => /Profondeur/.test(x.k)).k) === false && /minimum légal/.test(at(1.2).f.find(x => /Profondeur/.test(x.k)).k));
    assert.notEqual(g16.dist, null, '1,6 mm exactement : encore dans le domaine des essais');
    const est = lab({ now: ts('15:00'), car: car({ tread: 2.3 }), state: { tread: { est: true } }, hours: H({ T: 20, Tr: 24, P: 1, Pl: 1 }), drive: drive('14:00', 'route') }).grip;
    assert.match(est.f.find(x => /Profondeur/.test(x.k)).k, /estimée, non mesurée/);
    const dryWorn = lab({ now: ts('15:00'), car: car({ tread: 2.3 }), hours: H({ T: 20, Tr: 24 }), drive: drive('14:00', 'route') }).grip;
    assert(!dryWorn.f.some(x => /Profondeur/.test(x.k)), 'sur sec, aucune pénalité d’usure');
  });
  test('domaine de la courbe d’usure : humide/pluie seulement, jamais neige, verglas ni eau stagnante', () => {
    const on = b => lab({ now: ts('07:00'), car: car({ tread: 2.3 }), hours: H(b) }).grip;
    const snow = on({ T: -1, Tr: -1, snow: 0.5, code: 73 }), ice = on({ T: 0.5, Tr: -0.5, RH: 97, P: 0.2, Pl: 0.2 }), pool = on({ P: 8, Pl: 8 }), damp = on({ RH: 96 });
    assert.equal(snow.dist, null); assert.equal(ice.dist, null);
    for (const g of [snow, ice, pool]) assert(!g.f.some(x => /Profondeur/.test(x.k)), 'aucune courbe mouillé hors de son domaine');
    assert(damp.f.some(x => /Profondeur/.test(x.k)) && damp.dist.provisional === true, 'sol humide : courbe appliquée');
  });
  test('garde-fous : sous 1,6 mm ou profondeur inconnue, aucune distance chiffrée, alertes conservées ; estimée = fourchette provisoire', () => {
    const at = (tread, b = { T: 20, Tr: 24, P: 1, Pl: 1 }, extra = {}) => lab({ now: ts('15:00'), car: car({ tread }), hours: H(b), drive: drive('14:00', 'route'), ...extra }).grip;
    for (const b of [{ T: 20, Tr: 24, P: 1, Pl: 1 }, { T: 20, Tr: 24 }]) {
      const worn = at(1.2, b), unknown = at(null, b);
      assert.equal(worn.dist, null); assert.match(worn.distNote, /sous le minimum légal.*non conforme.*Aucune distance.*remplacer/);
      assert.equal(unknown.dist, null); assert.match(unknown.distNote, /Profondeur de sculpture inconnue.*aucune distance.*autres alertes restent actives/);
      assert(Number.isFinite(worn.mu) && worn.bars.length === 5 && Number.isFinite(unknown.mu) && unknown.bars.length === 5, 'indicateur relatif, barres et aquaplaning conservés');
    }
    assert.match(at(1.2, { T: 1, Tr: -1, snow: 0.5, code: 73 }).distNote, /minimum légal/, 'non-conformité prioritaire, même sur neige');
    const est = at(2.3, undefined, { state: { tread: { est: true } } });
    assert(est.dist && est.dist.provisional === true && /estimée, non mesurée/.test(est.f.find(x => /Profondeur/.test(x.k)).k), 'profondeur estimée : fourchette provisoire identifiée');
  });
  test('garde-fou par essieu : un essieu inconnu suspend la distance ; deux essieux ou profondeur commune restent chiffrés', () => {
    const at = tire => lab({ now: ts('15:00'), car: car({ tread: null, ...tire }), hours: H({ T: 20, Tr: 24, P: 1, Pl: 1 }), drive: drive('14:00', 'route') }).grip;
    const avOnly = at({ treadAv: 5 }), arOnly = at({ treadAr: 5 });
    assert.equal(avOnly.dist, null); assert.match(avOnly.distNote, /avant 5,0 mm, arrière inconnue.*renseigne les deux essieux/);
    assert.equal(arOnly.dist, null); assert.match(arOnly.distNote, /avant inconnue, arrière 5,0 mm/);
    assert(Number.isFinite(avOnly.mu) && avOnly.bars.length === 5, 'indicateur relatif et barres conservés');
    assert.match(at({ treadAv: 1.2 }).distNote, /sous le minimum légal/, 'profondeur connue sous 1,6 mm : alerte prioritaire');
    const both = at({ treadAv: 5, treadAr: 4 }), legacy = at({ tread: 4 });
    assert(both.dist && legacy.dist, 'deux essieux renseignés ou profondeur commune historique : distance chiffrée');
    assert.deepEqual(both.dist.now, legacy.dist.now, 'deux essieux : l’essieu le plus usé (4 mm) fait foi, comme la profondeur commune');
  });
  test('froid pneu été : trois formulations comparables, comportement historique conservé par défaut', () => {
    const P = ctx.coldCombine(0.85, 0.9, 'product'), O = ctx.coldCombine(0.85, 0.9, 'overlap'), M = ctx.coldCombine(0.85, 0.9, 'max');
    assert(Math.abs(P - 0.765) < 1e-9 && Math.abs(O - 0.8075) < 1e-9 && M === 0.85 && P < O && O < M);
    assert.equal(ctx.coldCombine(0.93, 1, 'product'), 0.93, 'au-dessus de 7 °C : seul l’état de la gomme compte');
    const cold = lab({ now: ts('07:00'), car: car({ tread: 8 }), hours: H({ T: 4, Tr: 3 }) }).grip;
    const gum = cold.f.find(x => x.k.startsWith('Gomme')).v, c7 = cold.f.find(x => /sous 7 °C/.test(x.k)).v;
    assert.equal(c7, 0.9, 'mode par défaut = produit (historique) tant que le propriétaire n’a pas choisi');
    assert(Math.abs(cold.mu - gum * c7) < 1e-9);
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
  test('progression inversée ou sans durée : projection suspendue, estimation actuelle conservée', () => {
    const cases = [
      [['06:30', 14], ['06:45', 0], ['07:10', 41]],
      [['06:30', 0], ['06:30', 41]],
      [['invalide', 0], ['07:10', 41]]
    ];
    for (const list of cases) {
      const r = lab({ now: ts('06:00'), car: car(), hours: H({ T: 8, Tr: 8 }),
        trip: { km: 41, points: list.map(([h, km]) => ({ t: ts(h), km })) } });
      assert.equal(r.trip, null); assert.match(r.tripIssue, /incohérentes/);
      assert(r.confidence.reasons.includes(r.tripIssue)); assert(Number.isFinite(r.thermal.T));
    }
  });
  test('points valides livrés hors ordre : comparaison et projection suivent les mêmes extrémités', () => {
    const hs = H({ T: 8, Tr: 8 }), points = [['07:10', 41], ['06:30', 0], ['06:50', 20]].map(([h, km]) => ({ t: ts(h), km }));
    const r = lab({ now: ts('06:00'), car: car(), hours: hs, trip: { km: 41, points } });
    assert.deepEqual(r.trip.rows.map(p => p.km), [0, 20, 41]); assert.equal(r.tripIssue, null);
    assert.equal(r.compare.a, 'Départ 06:30'); assert.equal(r.compare.b, 'Arrivée 07:10');
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
  test('météo de 60 min encore valable, de 61 min « ancienne » : même seuil que les autres vues', () => {
    const base = { now: ts('10:20'), car: car({ brand: 'Michelin', model: 'Pilot Sport 4S' }), hours: H(), drive: drive('10:00', 'route') };
    const fresh = lab({ ...base, ageMin: 10 }), edge = lab({ ...base, ageMin: 60 }), old = lab({ ...base, ageMin: 61 });
    assert.deepEqual(edge, fresh, '60 min : aucune pénalité de fraîcheur');
    assert.notDeepEqual(old, fresh, '61 min : incertitude et confiance dégradées');
    assert(/Météo ancienne/.test(JSON.stringify(old)), 'le motif est affiché'); assert(!/Météo ancienne/.test(JSON.stringify(edge)));
  });
  test('âge météo inconnu ou invalide : jamais récent, confiance et incertitude dégradées', () => {
    const base = { now: ts('10:20'), car: car({ brand: 'Michelin', model: 'Pilot Sport 4S' }), hours: H(), drive: drive('10:00', 'route') };
    const fresh = plain(ctx.lab({ ...base, ageMin: 5 }));
    for (const ageMin of [null, undefined, -1, NaN, Infinity]) {
      const r = plain(ctx.lab({ ...base, ageMin }));
      assert.equal(r.confidence.axes.find(x => x[0] === 'Météo')[1], 'âge inconnu');
      assert(r.confidence.reasons.some(x => /Âge météo inconnu/.test(x)));
      assert(r.thermal.range[1] - r.thermal.range[0] > fresh.thermal.range[1] - fresh.thermal.range[0]);
    }
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
  const lastDrive = (input, record) => plain(ctx.lastDrive(plain(input), plain(record)));
  const manualInput = () => ({ now: ts('10:00'), car: car(), hours: H(), state: { sig: 'monte-test' } });
  const record = extra => ({ at: ts('09:00'), minutes: 40, kind: 'route', ...extra });
  test('dernier roulage déclaré : estimation, provenance, identité de la monte, aucune position', () => {
    const input = manualInput(), entry = record(), before = JSON.stringify({ input, entry }), result = lastDrive(input, entry);
    assert(result.ok, result.error); assert.equal(result.history.source, 'manual'); assert.equal(result.history.sig, 'monte-test');
    assert(result.history.T > 20); assert.deepEqual(Object.keys(result.history).sort(), ['T', 'at', 'kind', 'minutes', 'sig', 'source']);
    assert.equal(JSON.stringify({ input, entry }), before); assert.deepEqual(lastDrive(input, entry), result);
    assert.equal(lastDrive(input, { ...entry, T: 200 }).history.T, result.history.T, 'aucune température saisie acceptée');
  });
  test('dernier roulage : durée, ville/autoroute et pluie influencent la chauffe estimée', () => {
    const input = manualInput(), short = lastDrive(input, record({ minutes: 2 })), long = lastDrive(input, record({ minutes: 60 }));
    const city = lastDrive(input, record({ kind: 'ville' })), highway = lastDrive(input, record({ kind: 'autoroute' }));
    const rain = lastDrive({ ...input, hours: H({ P: 3, Pl: 3 }) }, record());
    assert(long.history.T > short.history.T + 5); assert(highway.history.T > city.history.T + 3); assert(rain.history.T < long.history.T);
  });
  test('dernier roulage : dates impossibles, futur, ancien, durée et route invalides rejetés', () => {
    for (const extra of [{ at: '2026-02-30T09:00' }, { at: ts('11:00') }, { at: ts('08:00', '2026-10-05') },
      { minutes: 0 }, { minutes: -1 }, { minutes: 721 }, { minutes: 2.5 }, { minutes: 'abc' }, { kind: '__proto__' }, { kind: 'piste' }])
      assert.equal(lastDrive(manualInput(), record(extra)).ok, false, JSON.stringify(extra));
  });
  test('dernier roulage : météo absente ou incomplète et monte inconnue refusées', () => {
    const input = manualInput();
    for (const hours of [[], H({}, ts('09:00'), 3), H().filter(x => x.t !== ts('08:00'))])
      assert.equal(lastDrive({ ...input, hours }, record()).ok, false);
    assert.equal(lastDrive({ ...input, car: car({ type: 'none' }) }, record()).ok, false);
  });
  test('dernier roulage : ne remplace jamais le suivi pendant un trajet en cours', () => {
    const input = { ...manualInput(), drive: drive('09:00', 'route') };
    assert.equal(lastDrive(input, record()).ok, false);
  });
  test('dernier roulage : refroidissement après saisie, incertitude conservée, aucun capteur', () => {
    const input = manualInput(), history = lastDrive(input, record()).history;
    const parked = lab({ ...input, history }), later = lab({ ...input, now: ts('13:00'), history });
    const tracked = lab({ ...input, history: { at: history.at, T: history.T } });
    assert.equal(parked.phase, 'parked'); assert(later.thermal.T < parked.thermal.T);
    assert(parked.thermal.range[1] - parked.thermal.range[0] > tracked.thermal.range[1] - tracked.thermal.range[0]);
    assert(parked.confidence.reasons.some(x => /Historique déclaré par vous/.test(x))); assert.notEqual(parked.confidence.level, 'élevée');
  });
  /* ---------- ÉTAT ≠ TENDANCE : « en chauffe » n'est plus un état permanent ---------- */
  const UHP = (extra = {}) => car({ size: '215/40 ZR18 89Y XL', ...extra });   // été haute performance : fenêtre 15 / 25 / 50 / 65 °C
  const scn = (hours, drv, extra = {}) => lab({ now: ts('09:00'), car: UHP(), hours: H(hours), drive: drv, ageMin: 10, ...extra });
  test('T1 · été UHP · air 12 °C · route sèche · 20 min : encore en chauffe, sous la plage favorable', () => {
    const r = scn({ T: 12, Tr: 13 }, drive('08:40', 'route'));
    assert.equal(r.thermal.trend, 'heating'); assert.equal(r.thermal.level, 'Sous la plage favorable'); assert.equal(r.hero.state, 'En chauffe · sous la plage favorable');
  });
  test('T2 · été UHP · air 12 °C · route sèche · 60 min : stabilisé sous la plage favorable (plus « en chauffe »), incertitude inchangée et prudence expliquée', () => {
    const r = scn({ T: 12, Tr: 13 }, drive('08:00', 'route'));
    assert.equal(r.thermal.trend, 'stable'); assert.equal(r.hero.state, 'Stabilisé · sous la plage favorable'); assert.equal(r.thermal.state, r.hero.state);
    assert(!/en chauffe/i.test(r.hero.state)); assert(Math.abs(r.thermal.T - r.thermal.eq) < 1, `${r.thermal.T} / ${r.thermal.eq}`);
    assert.deepEqual(r.thermal.range, [24, 41]);   // ±(3 + 25 % de l'écart à l'environnement) : la stabilisation ne réduit pas l'erreur sur ΔT
    assert(r.thermal.why.some(x => /Estimation centrale ≈ 32 °C \(favorable\)/.test(x) && /bas de plage ≈ 24 °C/.test(x) && /prudence/.test(x)), r.thermal.why.join(' | '));
    assert.equal(r.warm.marginal, true); assert.equal(r.hero.warm, 'limite'); assert(!/\d+ °C/.test(r.hero.warm), r.hero.warm);   // libellé compact ; explication prudente complète dans thermal.why
  });
  test('T3 · été UHP · air 25 °C · soleil · garé, sans historique : température seulement supposée ambiante (jamais « en chauffe » ni « au repos ») ; « Au repos · ambiant » réservé à un arrêt connu', () => {
    const r = scn({ T: 25, Tr: 30, rad: 600 }, null);
    assert.equal(r.phase, 'unknown'); assert.equal(r.thermal.trend, 'rest'); assert.equal(r.hero.state, 'Supposé ambiant'); assert(!/chauffe|au repos/i.test(r.hero.state));
    const k = lab({ now: ts('09:00'), car: UHP(), hours: H({ T: 25, Tr: 30, rad: 600 }), history: { at: ts('02:00'), T: 30 }, ageMin: 10 });
    assert.equal(k.phase, 'parked'); assert.equal(k.hero.state, 'Au repos · ambiant');   // « au repos » seulement avec un historique d’arrêt connu
    assert(r.confidence.reasons.some(x => /Historique de roulage inconnu/.test(x)));
  });
  test('T4 · été UHP · air 18 °C · route sèche · 20 min : dans la fenêtre, température encore en hausse', () => {
    const r = scn({ T: 18, Tr: 20 }, drive('08:40', 'route'));
    assert.equal(r.thermal.s, 2); assert.equal(r.thermal.trend, 'heating'); assert.equal(r.hero.state, 'En chauffe · favorable');
  });
  test('T5 · été UHP · air < 7 °C : stabilisé sous la plage, règle des 7 °C expliquée et facteur limitant', () => {
    const r = scn({ T: 4, Tr: 3 }, drive('08:00', 'route'));
    assert.equal(r.thermal.trend, 'stable'); assert.equal(r.hero.state, 'Stabilisé · sous la plage favorable');
    assert(r.thermal.why.some(x => /Pneu été sous 7 °C/.test(x) && /règle des 7 °C/.test(x)), r.thermal.why.join(' | '));
    assert(/sous 7 °c/i.test(r.hero.limiting), r.hero.limiting);
  });
  test('T6 · roulage puis arrêt : refroidissement, puis retour au repos ambiant', () => {
    const base = { car: UHP(), hours: H({ T: 12, Tr: 13 }), history: { at: ts('08:30'), T: 45 }, ageMin: 10 };
    const soon = lab({ ...base, now: ts('09:00') }), later = lab({ ...base, now: ts('12:00') });
    assert.equal(soon.phase, 'parked'); assert.equal(soon.thermal.trend, 'cooling'); assert(/^En refroidissement · /.test(soon.hero.state), soon.hero.state);
    assert.equal(soon.warm.marginal, true); assert.equal(soon.hero.warm, 'limite'); assert.equal(soon.thermal.level, 'Sous la plage favorable');
    assert.equal(later.thermal.trend, 'rest'); assert.equal(later.hero.state, 'Au repos · ambiant · froid'); assert(later.thermal.T < soon.thermal.T - 10);
  });
  test('T7 · reprise après un arrêt avec historique : repart de la chaleur conservée, pas d’un pneu supposé froid', () => {
    const base = { now: ts('09:05'), car: UHP(), hours: H({ T: 12, Tr: 13 }), drive: drive('09:00', 'route'), ageMin: 10 };
    const noHist = lab(base), withHist = lab({ ...base, history: { at: ts('08:50'), T: 30 } });
    assert(withHist.thermal.T > noHist.thermal.T + 5, `${noHist.thermal.T} → ${withHist.thermal.T}`); assert.equal(withHist.thermal.trend, 'heating');
    assert(withHist.thermal.s >= noHist.thermal.s);
  });
  test('T8 · pneus hiver et 4 saisons : même vocabulaire état / tendance, états inchangés', () => {
    const w = lab({ now: ts('09:00'), car: car({ type: 'winter', size: '205/55 R16 91H' }), hours: H({ T: 2, Tr: 1 }), drive: drive('08:00', 'route'), ageMin: 10 });
    const a = lab({ now: ts('09:00'), car: car({ type: 'allseason', size: '205/55 R16 91H' }), hours: H({ T: 8, Tr: 9 }), drive: drive('08:00', 'route'), ageMin: 10 });
    for (const r of [w, a]) { assert.equal(r.thermal.trend, 'stable'); assert.equal(r.thermal.level, 'Fenêtre favorable'); assert.equal(r.hero.state, 'Stabilisé · favorable'); assert.equal(r.hero.lvl, 0); }
    assert.deepEqual(w.thermal.win, [-5, 5, 35, 50]); assert.deepEqual(a.thermal.win, [5, 15, 45, 60]);
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
    { name: 'stabilisation jamais détectée (toujours « en chauffe »)', from: "trend = Math.abs(gap) <= Math.max(TL_SETTLE * Math.abs(rise), 1) ? 'stable' : gap > 0 ? 'heating' : 'cooling';", to: "trend = 'heating';" },
    { name: 'tout roulage déclaré stabilisé dès le départ', from: "trend = Math.abs(gap) <= Math.max(TL_SETTLE * Math.abs(rise), 1) ? 'stable' : gap > 0 ? 'heating' : 'cooling';", to: "trend = 'stable';" },
    { name: 'pneu garé à l’ambiante non reconnu', from: 'ambient = Math.abs(T - eNow.Tenv) <= TL_BASE_U;', to: 'ambient = false;' },
    { name: 'refroidissement à l’arrêt non détecté', from: "trend = !ambient && T - q.Teq > 0 ? 'cooling' : 'rest';", to: "trend = 'rest';" },
    { name: 'incertitude réduite de moitié pour faire apparaître « favorable »', from: "const u = 3 + 0.25 * Math.abs(T - eNow.Tenv)", to: "const u = 1.5 + 0.125 * Math.abs(T - eNow.Tenv)" },
    { name: 'prudence supprimée (état pris sur l’estimation centrale)', from: 'const stateOf = (t, uu) => { const a = cls(t - uu); if (a <= 1) return a;', to: 'const stateOf = (t, uu) => { const a = cls(t); if (a <= 1) return a;' },
    { name: 'règle des 7 °C non expliquée', from: "if (type === 'summer' && eNow.Tenv < 7) why.push(", to: "if (false) why.push(" },
    { name: 'distance affichée sur verglas', from: "if (['snow', 'ice'].includes(e.surf)) distNote =", to: "if (false) distNote =" },
    { name: 'pluie à nouveau calculée depuis la base sèche (deux méthodes)', from: "const base = e.surf === 'dry' ? TL_MU.dry : TL_MU.wet.map(x => x * S / SURF.rain);", to: "const base = TL_MU.dry.map(x => x * S);" },
    { name: 'usure ignorée sur mouillé', from: "const tw = TL_WEAR_SURF.includes(e.surf) ? tlTreadWet(tread) : null", to: "const tw = null" },
    { name: 'usure redevenue un palier (rien entre 3 et 8 mm)', from: "pru: [[1.6, 13], [3, 5], [8, 0]]", to: "pru: [[1.6, 13], [2.99, 13], [3, 0], [8, 0]]" },
    { name: 'fourchette d’usure écrasée en une valeur unique', from: "addHi = worn ? tw.pru : 0", to: "addHi = worn ? tw.opt : 0" },
    { name: 'écarts d’usure reconvertis en ratio sur la référence', from: "Math.round(v * v / (2 * lo * g) + addHi)", to: "Math.round(v * v / (2 * lo * g) * (1 + addHi / 35))" },
    { name: 'courbe mouillé appliquée à la neige et au verglas', from: "const TL_WEAR_SURF = ['damp', 'rain', 'heavy'];", to: "const TL_WEAR_SURF = ['damp', 'rain', 'heavy', 'pool', 'snow', 'ice'];" },
    { name: 'distance affichée sur eau stagnante', from: "else if (e.surf === 'pool') distNote =", to: "else if (false) distNote =" },
    { name: 'distance chiffrée sous le minimum légal', from: "if (tread != null && tread < 1.6) distNote =", to: "if (false) distNote =" },
    { name: 'distance chiffrée sans profondeur connue', from: "else if (tread == null) distNote =", to: "else if (false) distNote =" },
    { name: 'un seul essieu renseigné pris pour les deux', from: "else if (axleMissing) distNote =", to: "else if (false) distNote =" },
    { name: 'seuil de météo ancienne rétabli à 90 min (dérive entre vues)', from: 'const TL_STALE_AFTER_MIN = 60;', to: 'const TL_STALE_AFTER_MIN = 90;' },
    { name: '0 km/h pris pour une vitesse inconnue (chauffe à l’arrêt)', from: "if (drive && !(drive.v != null && drive.v < TL_STOP_KMH)) {", to: "if (drive) {" },
    { name: 'seuil d’arrêt supprimé', from: 'const TL_STOP_KMH = 3;', to: 'const TL_STOP_KMH = 0;' },
    { name: 'limites : mention de l’absence de capteur retirée', from: "'Aucun capteur : la température de la gomme et la pression sont des estimations, jamais des mesures.'", to: "''" },
    { name: 'tendance « en chauffe » à l’arrêt', from: "if (phase === 'driving' && !stopped) {", to: "if (phase === 'driving') {" },
    { name: 'pneu sous le minimum légal adouci par l’indice de freinage', from: 'const lv = criticalTread ? 3 :', to: 'const lv = false ? 3 :' },
    { name: 'minimum légal abaissé à 1,0 mm', from: 'const TL_LEGAL_MM = 1.6;', to: 'const TL_LEGAL_MM = 1.0;' },
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
