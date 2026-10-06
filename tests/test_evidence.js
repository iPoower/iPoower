// Moteur de preuves météo v2 : cas obligatoires A–L, red team, et rejeu de l'incident réel du 5 octobre 2026 (METAR publics LFAQ).
// Lieux fictifs pour les points ; les stations LFAQ et LFAY et leurs METAR sont publics (obs.json du relais).
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const sourcePath = path.join(__dirname, '../src/evidence.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(source + '\nthis.ev = evidenceEngine; this.score = evidenceScore; this.CFG = EV_CFG;', ctx);
  const plain = v => JSON.parse(JSON.stringify(v)), E = input => plain(ctx.ev(plain(input)));
  const NOW = Date.parse('2026-10-05T04:30:00Z');   // 06:30 à Paris
  const HOME = { lat: 48.80, lon: 2.30 };            // point fictif, ≈ 19 km de LFAQ
  const clear = { T: 9, Td: 6, RH: 81, vis: 24000, wind: 9, gust: 15, code: 1, P: 0, Pl: 0, Tr: 9, ice: { level: 0 } };
  const pt = (x, extra = {}) => ({ ...HOME, label: 'départ', t: '2026-10-05T06:30', ms: NOW, x: { ...clear, ...x }, ...extra });
  const LFAQ = (o) => ({ id: 'LFAQ', name: 'Albert-Bray', lat: 48.9715, lon: 2.2976, obs: [o] });
  const metar = (raw, t, T, Td, vis, wind, wx) => ({ t, T, Td, vis, wind, wx, raw });
  const base = (o = {}) => ({ now: NOW, points: [pt({})], stations: [], reports: [], location: { trust: 'Confirmée' }, fresh: { modelAgeMin: 10 }, ...o });
  let count = 0;
  const test = (name, fn) => { try { fn(); } catch (e) { e.scenario = name; throw e; } count++; if (!options.quiet) console.log('✅ ' + name); };

  test('INCIDENT 05/10 : modèle « clair » + METAR LFAQ réel (T = Td, brume 2,1 km, nuages à 300 ft, vent 9 km/h) → brouillard local probable, contradiction visible', () => {
    const o = metar('METAR LFAQ 050430Z AUTO 33005KT 2100 BR FEW003 OVC140 08/08 Q1025', '2026-10-05T04:30:00Z', 8, 8, 2100, 9, 'BR');
    const r = E(base({ points: [pt({ T: 9, Td: 8.5, RH: 97, vis: 24000, wind: 8 })], stations: [LFAQ(o)] }));
    assert.equal(r.worst.lv, 2); assert.equal(r.headline.text, 'BROUILLARD LOCAL PROBABLE');
    assert.equal(r.contradiction, 'Les modèles sous-estiment probablement un phénomène local de visibilité.');
    assert(r.headline.proofs.some(x => /Albert-Bray/.test(x)) && r.headline.proofs.some(x => /point de rosée/.test(x)));
    assert.notEqual(r.phen.find(p => p.id === 'fog').trustTxt, 'élevée');   // contradiction : jamais une confiance élevée
  });
  test('INCIDENT 05/10, 03:00 UTC : METAR seul (brume 3,7 km saturée, vent 9 km/h) face à un modèle sec → brouillard local probable', () => {
    const o = metar('METAR LFAQ 050300Z AUTO 35005KT 3700 BR NSC 09/09 Q1026', '2026-10-05T03:00:00Z', 9, 9, 3700, 9, 'BR');
    const r = E(base({ points: [pt({ T: 12, Td: 6, RH: 66, vis: 24000, wind: 12 })], stations: [LFAQ(o)] }));
    assert.equal(r.worst.physLv, 0); assert.equal(r.worst.obsLv, 2); assert.equal(r.worst.lv, 2);
  });
  test('A · T = Td, vent faible, matin → risque de brouillard élevé (physique seule, jamais « dense »)', () => {
    const r = E(base({ points: [pt({ T: 7, Td: 7, RH: 100, wind: 4, vis: 24000 })] }));
    assert.equal(r.worst.lv, 2); assert.equal(r.worst.physLv, 2);
  });
  test('B · T − Td élevé + visibilité observée bonne → risque faible', () => {
    const o = metar('METAR LFAQ 050430Z 24012KT 9999 FEW040 14/06 Q1018', '2026-10-05T04:20:00Z', 14, 6, 10000, 22, '');
    const r = E(base({ points: [pt({ T: 14, Td: 6, RH: 58, wind: 20 })], stations: [LFAQ({ ...o, lat: 48.80 })] }));
    assert.equal(r.worst.lv, 0); assert.equal(r.headline, null);
  });
  test('C · code « peu nuageux » mais visibilité 180 m → la visibilité gagne', () => {
    const r = E(base({ points: [pt({ code: 2, vis: 180 })] }));
    assert.equal(r.worst.lv, 3); assert.equal(r.headline.text, 'BROUILLARD DENSE POSSIBLE'); assert.equal(r.worst.range, 'moins de 200 m possible');
  });
  test('D · trois modèles « clairs » + observation récente à 300 m tout près → l’observation gagne', () => {
    const st = { id: 'X', name: 'Station test', lat: 48.81, lon: 2.30, obs: [metar('METAR XXXX 050420Z 00000KT 0300 FG VV001 07/07', '2026-10-05T04:20:00Z', 7, 7, 300, 0, 'FG')] };
    const r = E(base({ points: [pt({ vis: 24000 })], stations: [st] }));
    assert(r.worst.lv >= 2 && r.worst.obsLv >= 2); assert(r.contradiction);
  });
  test('E · METAR brouillard à 60 km → indice régional seulement', () => {
    const st = { id: 'Y', name: 'Station lointaine', lat: 49.34, lon: 2.30, obs: [metar('METAR YYYY 050420Z 00000KT 0200 FG 07/07', '2026-10-05T04:20:00Z', 7, 7, 200, 0, 'FG')] };
    const r = E(base({ points: [pt({ T: 9, Td: 5, wind: 15 })], stations: [st] }));
    assert(r.worst.lv <= 1); assert(r.worst.ev.some(e => /indice régional/.test(e.text)));
  });
  test('F · localisation non fiable (VPN) → confiance plafonnée, jamais élevée pour un phénomène local', () => {
    const strong = o => base({ ...o, points: [pt({ T: 7, Td: 7, wind: 3, vis: 800 })], reports: [{ kind: 'fog', at: NOW - 5 * 60e3, ...HOME }],
      stations: [{ id: 'S', name: 'S', lat: 48.81, lon: 2.30, obs: [metar('m', '2026-10-05T04:20:00Z', 7, 7, 400, 0, 'FG')] }] });
    assert.equal(E(strong({})).phen.find(p => p.id === 'fog').trustTxt, 'élevée');   // trois couches concordantes, lieu confirmé
    const r = E(strong({ location: { trust: 'Incertaine' } }));
    assert.equal(r.phen.find(p => p.id === 'fog').trustTxt, 'faible'); assert.equal(r.phen.find(p => p.id === 'loc').lv, 2);
  });
  test('G · observation vieille de 3 h → forte décote', () => {
    const fresh = { id: 'S', name: 'S', lat: 48.81, lon: 2.30, obs: [metar('m', '2026-10-05T04:20:00Z', 7, 7, 300, 0, 'FG')] };
    const old = { ...fresh, obs: [{ ...fresh.obs[0], t: '2026-10-05T01:20:00Z' }] };
    const a = E(base({ stations: [fresh] })).worst.ev.find(e => e.layer === 'A'), b = E(base({ stations: [old] })).worst.ev.find(e => e.layer === 'A');
    assert(a.w >= 0.9 && b.w <= 0.1, `${a.w} / ${b.w}`); assert(E(base({ stations: [old] })).worst.lv <= 1);
  });
  test('H · l’utilisateur confirme du brouillard → verdict recalculé (observation non officielle)', () => {
    const r = E(base({ reports: [{ kind: 'fog', at: NOW - 5 * 60e3, ...HOME }] }));
    assert.equal(r.worst.lv, 2); assert(r.worst.ev.some(e => e.layer === 'D' && /non officielle/.test(e.text)));
  });
  test('I · plusieurs signalements communautaires récents sur le trajet → risque augmenté', () => {
    const items = [0, 1, 2].map(k => ({ kind: 'fog', at: NOW - 5 * 60e3, lat: 48.80 + k * 0.01, lon: 2.30 }));
    const r = E(base({ points: [pt({ T: 8, Td: 7.2, wind: 6 })], community: { available: true, items } }));
    assert.equal(r.worst.comLv, 2); assert(r.worst.lv >= 2);
    const one = E(base({ community: { available: true, items: [{ kind: 'fog', at: NOW - 40 * 60e3, lat: 48.98, lon: 2.30 }] } }));
    assert(one.worst.lv <= 1);   // signalement isolé lointain : indice faible
  });
  test('J · aucun signal communautaire → ne réduit pas le risque', () => {
    const x = { T: 7, Td: 7, wind: 3 };
    assert.equal(E(base({ points: [pt(x)], community: { available: true, items: [] } })).worst.lv, E(base({ points: [pt(x)] })).worst.lv);
  });
  test('K · communauté indisponible (Waze) → aucun impact, statut documenté', () => {
    const r = E(base({ points: [pt({ T: 7, Td: 7, wind: 3 })] }));
    assert.equal(r.community, 'non disponible (aucune source autorisée)'); assert.equal(r.worst.lv, 2);
  });
  test('L · sources contradictoires → confiance réduite et contradiction visible (jamais moyennées)', () => {
    const st = { id: 'S', name: 'S', lat: 48.81, lon: 2.30, obs: [metar('m', '2026-10-05T04:20:00Z', 12, 4, 10000, 15, '')] };
    const r = E(base({ points: [pt({ vis: 300, code: 45 })], stations: [st] }));
    assert(/trop pessimiste/.test(r.contradiction)); assert.equal(r.worst.lv, 1); assert.notEqual(r.phen.find(p => p.id === 'fog').trustTxt, 'élevée');
  });
  test('pire condition crédible : 10 km, 8 km, 700 m, 250 m → brouillard sur une portion, pas la moyenne', () => {
    const P = [24000, 8000, 700, 250].map((v, k) => ({ lat: 48.80 + k * 0.03, lon: 2.20, label: ['départ', '25 %', '50 %', '75 %'][k], t: '2026-10-05T06:3' + k, ms: NOW + k * 5 * 60e3, x: { ...clear, vis: v } }));
    const r = E(base({ points: P }));
    assert.equal(r.worst.lv, 2); assert.equal(r.worst.label, '75 %'); assert.equal(r.headline.where, 'portion du trajet : 75 %');
  });
  test('échéance : une observation n’informe plus la prévision au-delà de 3 h', () => {
    const st = { id: 'S', name: 'S', lat: 48.81, lon: 2.30, obs: [metar('m', '2026-10-05T04:20:00Z', 7, 7, 300, 0, 'FG')] };
    const r = E(base({ points: [{ ...pt({ T: 14, Td: 7, wind: 15 }), ms: NOW + 5 * 3600e3, t: '2026-10-05T11:30' }], stations: [st] }));
    assert.equal(r.worst.lv, 0);
  });
  test('confiance par phénomène : sept lignes, jamais un pourcentage', () => {
    const r = E(base({}));
    assert.deepEqual(r.phen.map(p => p.id), ['temp', 'rain', 'wind', 'fog', 'vis', 'frost', 'loc']);
    assert(r.phen.every(p => ['faible', 'moyenne', 'élevée'].includes(p.trustTxt))); assert(!/%/.test(JSON.stringify(r.phen.map(p => p.trustTxt))));
    assert.deepEqual(Object.keys(r.axes), ['data', 'models', 'location', 'observations', 'freshness']);
  });
  test('hors ligne : confiance décroît d’un cran', () => {
    const a = E(base({ points: [pt({ T: 7, Td: 7, wind: 3 })], stations: [LFAQ(metar('m', '2026-10-05T04:20:00Z', 7, 7, 800, 4, 'BR'))] }));
    const b = E(base({ points: [pt({ T: 7, Td: 7, wind: 3 })], stations: [LFAQ(metar('m', '2026-10-05T04:20:00Z', 7, 7, 800, 4, 'BR'))], fresh: { offline: true } }));
    assert(b.phen.find(p => p.id === 'fog').trust < a.phen.find(p => p.id === 'fog').trust || a.phen.find(p => p.id === 'fog').trust === 0);
  });
  test('red team · vent fort et pluie forte (mauvaise visibilité par la pluie) : pas de brouillard inventé', () => {
    const r = E(base({ points: [pt({ T: 10, Td: 9.5, RH: 97, wind: 35, gust: 60, P: 6, Pl: 6, vis: 6000 })] }));
    assert(r.worst.lv <= 1);
  });
  test('red team · station 300 m plus haute : poids réduit', () => {
    const st = { id: 'H', name: 'Sommet', elev: 450, lat: 48.81, lon: 2.30, obs: [metar('m', '2026-10-05T04:20:00Z', 7, 7, 200, 0, 'FG')] };
    const r = E(base({ points: [{ ...pt({}), elev: 120 }], stations: [st] }));
    assert(r.worst.ev.find(e => e.layer === 'A').w <= 0.6);
  });
  test('red team · fournisseur en panne (aucune observation, modèle seul) : confiance brouillard au plus moyenne', () => {
    const r = E(base({ points: [pt({ vis: 24000 })] }));
    assert.notEqual(r.phen.find(p => p.id === 'fog').trustTxt, 'élevée'); assert.equal(r.axes.observations, 'aucune observation récente');
  });
  test('alerte utile seulement : phénomène important × crédibilité × impact trajet', () => {
    assert.equal(E(base({ onTrip: true, points: [pt({ code: 2, vis: 150 })] })).alert, true);
    assert.equal(E(base({ onTrip: true, points: [pt({ T: 12, Td: 4 })] })).alert, false);
  });
  test('journal prévision / observation : faux négatifs, précision, rappel, Brier', () => {
    const s = plain(ctx.score([{ pred: 0, obs: 1 }, { pred: 2, obs: 1 }, { pred: 2, obs: 0 }, { pred: 0, obs: 0 }]));
    assert.deepEqual([s.tp, s.fp, s.fn, s.tn], [1, 1, 1, 1]); assert.equal(s.precision, 0.5); assert.equal(s.recall, 0.5); assert(s.brier > 0 && s.brier < 1);
  });
  test('déterminisme : mêmes entrées, même résultat', () => {
    const i = base({ points: [pt({ T: 7, Td: 7, wind: 3 })] }); assert.deepEqual(plain(ctx.ev(i)), plain(ctx.ev(i)));
  });
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) {
  const original = fs.readFileSync(sourcePath, 'utf8'), count = runTests(original);
  const mutations = [
    { name: 'code météo prioritaire sur la visibilité', from: 'const modelLv = Math.max(mvLv || 0, fogCode ? 2 : 0);', to: 'const modelLv = fogCode ? 2 : 0;' },
    { name: 'brume saturée ignorée (raté du 5 octobre)', from: 'if (br && osp != null && osp <= C.spread[1] && (o.wind == null || o.wind <= C.windCalm)) lv = Math.max(lv, 2);', to: '' },
    { name: 'moyenne des points au lieu du pire crédible', from: 'c.f.lv > b.f.lv ||', to: 'c.f.lv < b.f.lv ||' },
    { name: 'distance des stations ignorée', from: "dist: [[10, 1], [25, 0.7], [50, 0.4], [Infinity, 0.15]]", to: "dist: [[Infinity, 1]]" },
    { name: 'âge des observations ignoré', from: "age: [[30, 1], [60, 0.8], [120, 0.5], [180, 0.25], [Infinity, 0.1]]", to: "age: [[Infinity, 1]]" },
    { name: 'localisation ne plafonne plus la confiance', from: 'trust = Math.min(trust, locCap);', to: '' },
    { name: 'contradiction moyennée et effacée', from: "if (modelLv <= 1 && physical >= 2) contra =", to: "if (false) contra =" }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    let rej; try { runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rej = e; }
    assert(rej && rej.scenario, 'La mutation doit être rejetée : ' + m.name + (rej ? ' (' + rej.message + ')' : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rej.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
