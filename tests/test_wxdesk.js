// Poste météo (onglet Météo) : scénarios métier du moteur pur, puis contre-tests (régressions volontaires rejetées).
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const sourcePath = path.join(__dirname, '../src/wxdesk.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(source + '\nthis.desk = wxDesk; this.PEN = ROAD_PEN;', ctx);
  const plain = v => JSON.parse(JSON.stringify(v));
  const desk = input => plain(ctx.desk(plain(input)));
  // heure de base : 06:00 → +23 h, temps calme et doux ; chaque scénario modifie quelques heures
  const H = (from = '2026-10-06T00:00', n = 30, base = {}) => Array.from({ length: n }, (_, k) => {
    const t = new Date(Date.parse(from + ':00Z') + k * 3600e3).toISOString().slice(0, 16);
    return { t, T: 12, Tapp: 11, RH: 70, Td: 6, P: 0, Pl: 0, pp: 5, snow: 0, code: 1, vis: 24000, wind: 10, gust: 20, Tr: 12, ice: { level: 0, score: 0 }, cloud: 20, ...base };
  });
  const set = (hs, hh, patch, n = 1) => { const i = hs.findIndex(x => x.t.slice(11, 13) === hh); for (let k = 0; k < n; k++) Object.assign(hs[i + k], patch); return hs; };
  const trip = (dep, arr, extra = {}) => ({ id: 'go', label: 'trajet aller', from: 'Ville A', to: 'Ville B', dep: '2026-10-06T' + dep, arr: '2026-10-06T' + arr, ...extra });
  const pts = (hs, dep, list) => list.map(([hh, f, km, name]) => ({ t: '2026-10-06T' + hh, f, km, name, x: hs.find(x => x.t === '2026-10-06T' + hh.slice(0, 2) + ':00') }));
  let count = 0;
  const test = (name, fn) => { try { fn(); } catch (error) { error.scenario = name; throw error; } count++; if (!options.quiet) console.log('✅ ' + name); };

  test('conditions calmes : verdict vert, température et ressenti, rien d’inventé', () => {
    const r = desk({ now: '2026-10-06T10:20', hours: H(), cur: { T: 12.4, Tapp: 11.2 } });
    assert.equal(r.level, 0); assert.equal(r.hero.title, 'CONDITIONS NORMALES'); assert.equal(r.hero.emoji, '🟢');
    assert.match(r.hero.lines[0], /^12 °C · ressenti 11 °C$/); assert.match(r.hero.lines[1], /Aucun phénomène notable jusqu’à 23:00/);
    assert.deepEqual(r.current, { T: 12.4, Tapp: 11.2, source: 'current' });
    assert.equal(r.matters.length, 1); assert.match(r.matters[0].text, /Rien de notable/);
    assert.equal(r.road.score, 100); assert.equal(r.road.level, 0); assert.equal(r.trip, null);
  });
  test('aucune donnée, heure courante absente ou date invalide : aucun verdict', () => {
    assert.equal(ctx.desk({ now: '2026-10-06T10:20', hours: [] }), null);
    assert.equal(ctx.desk({ now: '2026-10-06T10:20', hours: H('2026-10-06T14:00') }), null);
    assert.equal(ctx.desk({ now: 'hier', hours: H() }), null);
    assert.equal(ctx.desk(null), null);
  });
  test('valeurs manquantes : aucun phénomène inventé, tirets affichés', () => {
    const hs = H().map(x => ({ t: x.t }));
    const r = desk({ now: '2026-10-06T10:20', hours: hs, cur: {} });
    assert.equal(r.level, 0); assert.match(r.hero.lines[0], /^— °C · ressenti — °C$/);
    assert.deepEqual(r.current, { T: null, Tapp: null, source: 'hourly' });
    assert.equal(r.phen.find(p => p.id === 'fog').line, 'Visibilité non fournie');
    assert.equal(r.road.factors.find(f => f.id === 'fog').why, 'non fournie');
  });
  test('pluie à 07:00 vue à 06:18 : 🟡 « à partir de 07:00 », début dans 42 min, trajet du matin concerné', () => {
    const hs = set(H(), '07', { P: 0.8, Pl: 0.8, pp: 80, code: 61 }, 3);
    const r = desk({ now: '2026-10-06T06:18', hours: hs, trips: [{ ...trip('06:45', '07:28'), points: pts(hs, '06:45', [['06:45', 0, 0, 'Ville A'], ['07:05', 0.5, 22, 'Ville M'], ['07:28', 1, 44, 'Ville B']]) }] });
    assert.equal(r.level, 1); assert.equal(r.hero.title, 'PLUIE FAIBLE À PARTIR DE 07:00');
    assert(r.hero.lines.includes('Début estimé dans 42 min (prévision horaire)'), r.hero.lines.join(' | '));
    assert(r.hero.lines.some(l => /Trajet aller de 06:45 potentiellement concerné/.test(l)), r.hero.lines.join(' | '));
    assert(r.matters.some(m => m.text === 'Pluie probable pendant le trajet aller (06:45)'), JSON.stringify(r.matters));
    assert(r.matters.some(m => m.text === 'Prévoir une couche imperméable'));
  });
  test('pluie au quart d’heure : début précisé, sans mention « prévision horaire »', () => {
    const hs = set(H(), '07', { P: 0.8, Pl: 0.8, pp: 80 }, 2);
    const r = desk({ now: '2026-10-06T06:18', hours: hs, nowcast: { nowWet: false, startIn: 52 } });
    assert.equal(r.hero.title, 'PLUIE FAIBLE À PARTIR DE 07:10'); assert(r.hero.lines.includes('Début estimé dans 52 min'));
  });
  test('verglas : 🔴, fenêtre critique, chaussée estimée', () => {
    const hs = set(set(H(), '05', { T: 1, Tr: -1.2, ice: { level: 2, score: 55 }, RH: 96 }, 2), '00', { T: 4, Tr: 3 }, 5);
    const r = desk({ now: '2026-10-06T04:30', hours: hs });
    assert.equal(r.level, 3); assert.equal(r.hero.title, 'RISQUE DE VERGLAS'); assert.equal(r.hero.emoji, '🔴');
    assert(r.hero.lines.includes('Fenêtre critique 05:00–07:00')); assert(r.hero.lines.includes('Chaussée estimée −1,2 °C ± 2'));
    const ice = r.road.factors.find(f => f.id === 'ice'); assert.equal(ice.pen, 45); assert.equal(ice.lv, 3);
  });
  test('gel gradué : chaussée proche du gel 🟡, gel de surface probable 🟠, jamais « verglas » sans humidité', () => {
    const a = desk({ now: '2026-10-06T05:10', hours: set(H(), '05', { T: 3, Tr: 1 }, 2) });
    assert.equal(a.level, 1); assert.equal(a.hero.title, 'CHAUSSÉE PROCHE DU GEL'); assert.equal(a.timeline.moments[0].text, 'chaussée proche du gel');
    const b = desk({ now: '2026-10-06T05:10', hours: set(H(), '05', { T: 0, Tr: -2.5 }, 2) });
    assert.equal(b.level, 2); assert.equal(b.hero.title, 'GEL DE SURFACE PROBABLE'); assert(!/verglas/i.test(JSON.stringify(b.matters)));
  });
  test('pluie verglaçante annoncée : 🔴 même si la chaussée estimée est positive', () => {
    const hs = set(H(), '10', { code: 66, P: 0.5, Pl: 0.5, Tr: 1.5 }, 1);
    const r = desk({ now: '2026-10-06T10:05', hours: hs });
    assert.equal(r.level, 3); assert.equal(r.hero.dominant, 'ice');
  });
  test('brouillard en cours à 350 m : 🟠, fin probable, visibilité minimale', () => {
    const hs = set(H(), '05', { vis: 350, code: 45 }, 3);
    const r = desk({ now: '2026-10-06T05:30', hours: hs });
    assert.equal(r.level, 2); assert.equal(r.hero.title, 'BROUILLARD EN COURS');
    assert(r.hero.lines.includes('Fin probable vers 08:00')); assert(r.hero.lines.some(l => /Visibilité minimale 350 m/.test(l)));
    assert(r.matters.some(m => /^Brouillard jusqu’à 08:00 · visibilité 350 m$/.test(m.text)), JSON.stringify(r.matters));
    assert.equal(r.timeline.moments[0].t, 'maintenant'); assert(r.timeline.moments.some(m => m.t === '08:00' && /dissipation/.test(m.text)));
  });
  test('seuils de visibilité : 999 m 🟡, 499 m 🟠, 199 m 🔴, 1 000 m rien', () => {
    for (const [v, lv] of [[1000, 0], [999, 1], [499, 2], [199, 3]]) assert.equal(desk({ now: '2026-10-06T10:00', hours: set(H(), '10', { vis: v }) }).level, lv, String(v));
  });
  test('seuils de rafales : 54 rien, 55 🟡, 70 🟠, 90 🔴', () => {
    for (const [g, lv] of [[54, 0], [55, 1], [70, 2], [90, 3]]) assert.equal(desk({ now: '2026-10-06T10:00', hours: set(H(), '12', { gust: g }) }).level, lv, String(g));
  });
  test('seuils de pluie : 0,1 mm rien, 0,2 mm 🟡, 2 mm 🟠, orage 🟠', () => {
    for (const [p, code, lv] of [[0.1, 1, 0], [0.2, 61, 1], [2, 63, 2], [0.5, 95, 2]]) assert.equal(desk({ now: '2026-10-06T10:00', hours: set(H(), '12', { P: p, Pl: p, code }) }).level, lv, p + '/' + code);
  });
  test('neige : 🟠, jamais comptée comme pluie', () => {
    const r = desk({ now: '2026-10-06T10:00', hours: set(H(), '11', { snow: 0.6, P: 0.6, Pl: 0, pp: 90, code: 73, T: 0.5, Tr: 1 }, 2) });
    assert.equal(r.level, 2); assert.equal(r.hero.dominant, 'snow'); assert.equal(r.phen.find(p => p.id === 'rain').title, 'Neige');
    assert(r.road.factors.some(f => f.id === 'snow' && f.pen === 35)); assert.equal(r.road.factors.find(f => f.id === 'rain').pen, 0);
  });
  test('priorité du verdict : le plus grave, puis le plus proche', () => {
    const hs = set(set(H(), '11', { gust: 72 }), '15', { vis: 150 });
    const r = desk({ now: '2026-10-06T10:00', hours: hs });
    assert.equal(r.hero.dominant, 'fog'); assert.equal(r.level, 3);
    assert.equal(r.matters[0].lv, 3); assert.match(r.matters[0].text, /Brouillard possible 15:00–16:00/);
  });
  test('prochain changement : premier événement après maintenant, amélioration détectée', () => {
    const hs = set(H(), '10', { P: 1, Pl: 1, pp: 90 }, 2);
    const r = desk({ now: '2026-10-06T10:15', hours: hs });
    assert.deepEqual(r.nextChange, { t: '12:00', text: 'fin de la pluie', lv: 0 });
    assert(r.timeline.moments.some(m => m.text === 'amélioration' && m.t === '12:00'));
  });
  test('passage de l’air sous 0 °C signalé dans les changements', () => {
    const hs = H().map(x => ({ ...x, T: +x.t.slice(11, 13) >= 20 ? -1 : 3, Tr: 5 }));
    const r = desk({ now: '2026-10-06T14:00', hours: hs });
    assert(r.timeline.moments.some(m => m.t === '20:00' && m.text === 'air sous 0 °C'));
  });
  test('prochain trajet : départ, mi-parcours, arrivée et point critique au kilomètre', () => {
    const hs = set(H(), '07', { P: 0.6, Pl: 0.6, pp: 70, code: 61, T: 8 }, 1); set(hs, '06', { T: 7, code: 3 });
    const r = desk({ now: '2026-10-06T06:10', hours: hs, trips: [{ ...trip('06:45', '07:28', { km: 44 }), points: pts(hs, '06:45', [['06:45', 0, 0, 'Ville A'], ['06:56', 0.25, 11], ['07:06', 0.5, 22, 'Ville M'], ['07:17', 0.75, 33], ['07:28', 1, 44, 'Ville B']]) }] });
    const t = r.trip;
    assert.equal(t.from, 'Ville A'); assert.equal(t.to, 'Ville B'); assert.equal(t.dep, '06:45'); assert.equal(t.arr, '07:28'); assert.equal(t.durMin, 43);
    assert.deepEqual(t.points.map(p => p.label), ['Départ', 'Mi-parcours', 'Arrivée']);
    assert.equal(t.points[0].text, 'couvert'); assert.equal(t.points[0].T, 7); assert.equal(t.points[1].text, 'pluie faible'); assert.equal(t.points[2].text, 'pluie faible');
    assert.equal(t.crit.id, 'rain'); assert.equal(t.crit.text, 'Pluie probable après environ 11–22 km');
  });
  test('plusieurs trajets dans la journée : chronologie triée, suivants listés, conditions route sur le prochain', () => {
    const hs = set(H(), '20', { gust: 75 }, 2);
    const t2 = { ...trip('20:30', '21:10'), id: 'ret', label: 'trajet retour', from: 'Ville B', to: 'Ville A', points: pts(hs, '20:30', [['20:30', 0, 0], ['21:10', 1, 44]]) };
    const t1 = { ...trip('07:45', '08:25'), points: pts(hs, '07:45', [['07:45', 0, 0], ['08:25', 1, 44]]) };
    const r = desk({ now: '2026-10-06T07:00', hours: hs, trips: [t2, t1] });
    const deps = r.timeline.moments.filter(m => m.kind === 'dep').map(m => m.t);
    assert.deepEqual(deps, ['07:45', '20:30']); assert.equal(r.trip.dep, '07:45'); assert.deepEqual(r.trip.later.map(x => x.dep), ['20:30']); assert.equal(r.trip.later[0].lv, 2);
    assert.match(r.road.window.label, /trajet aller 07:45–08:25/); assert.equal(r.road.score, 100);
    assert(r.matters.some(m => m.text === 'Rafales pendant le trajet retour (20:30)'), JSON.stringify(r.matters));
    assert.equal(r.window.to, '22:00');   // fenêtre de 12 h prolongée jusqu'à l'arrivée du dernier trajet
  });
  test('trajet sans météo encore chargée : affiché en attente, sans conditions inventées', () => {
    const r = desk({ now: '2026-10-06T07:00', hours: H(), trips: [{ ...trip('07:45', '08:25'), points: [] }] });
    assert.equal(r.trip.waiting, true); assert.deepEqual(r.trip.points, []); assert.equal(r.trip.crit, null); assert.match(r.road.window.label, /^maintenant →/);
  });
  test('le statut réel de trajet prime sur un horaire de départ déjà passé', () => {
    const input = { now: '2026-10-06T07:00', hours: H(), trips: [trip('06:50', '07:30', { running: false })] };
    assert.equal(desk(input).trip.running, false);
    input.trips[0].running = true; assert.equal(desk(input).trip.running, true);
  });
  test('trajet passé ignoré, trajet en cours conservé jusqu’à l’arrivée', () => {
    const hs = set(H(), '05', { vis: 300 });
    const past = { ...trip('05:00', '05:40'), id: 'old', points: pts(hs, '05:00', [['05:00', 0, 0]]) }, run = { ...trip('06:50', '07:30'), points: pts(hs, '06:50', [['06:50', 0, 0], ['07:30', 1, 44]]) };
    const r = desk({ now: '2026-10-06T07:10', hours: hs, trips: [past, run] });
    assert.equal(r.trip.dep, '06:50'); assert.equal(r.trip.running, true); assert(!r.timeline.moments.some(m => m.trip === 'old')); assert(!r.matters.some(m => /05:00/.test(m.text)), JSON.stringify(r.matters));
  });
  test('soleil rasant sur un trajet : carte 🟡 et 5 points retirés, expliqués', () => {
    const hs = H();
    const r = desk({ now: '2026-10-06T07:00', hours: hs, trips: [{ ...trip('07:45', '08:25'), glare: { ts: '2026-10-06T08:05' }, points: pts(hs, '07:45', [['07:45', 0, 0], ['08:25', 1, 44]]) }] });
    const sun = r.phen.find(p => p.id === 'sun'); assert.equal(sun.lv, 1); assert.match(sun.line, /Vers 08:05/);
    const f = r.road.factors.find(f => f.id === 'sun'); assert.equal(f.pen, 5); assert.equal(r.road.score, 95);
    assert.equal(r.trip.crit.id, 'sun');
  });
  test('conditions route : score = 100 − somme des pénalités, niveau jamais plus doux que le pire facteur', () => {
    const hs = set(H(), '10', { vis: 180, P: 2.5, Pl: 2.5, gust: 72, T: 2, RH: 97 }, 2);
    const r = desk({ now: '2026-10-06T10:00', hours: hs });
    const sum = r.road.factors.reduce((a, f) => a + f.pen, 0);
    assert.equal(r.road.score, Math.max(0, 100 - sum)); assert.equal(r.road.score, 100 - 35 - 20 - 20 - 5);
    assert.equal(r.road.level, 3); assert(r.road.factors.every(f => typeof f.why === 'string' && f.why.length));
    assert.deepEqual(r.road.factors.map(f => f.id), ['temp', 'wind', 'humid', 'rain', 'ice', 'fog']);
    const fog = desk({ now: '2026-10-06T10:00', hours: set(H(), '11', { vis: 150 }) }).road;
    assert.equal(fog.score, 65); assert.equal(fog.level, 3);   // 65/100 seul serait 🟡 : le brouillard < 200 m impose 🔴
  });
  test('ce qui compte : 5 lignes au plus, la plus grave d’abord', () => {
    const hs = set(set(set(set(H(), '10', { vis: 180 }), '12', { gust: 72 }), '14', { P: 3, Pl: 3 }), '16', { Tr: -3, ice: { level: 3, score: 80 } });
    const r = desk({ now: '2026-10-06T09:30', hours: hs, trips: [{ ...trip('14:00', '14:40'), points: pts(hs, '14:00', [['14:00', 0, 0]]) }] });
    assert(r.matters.length <= 5); assert(r.matters.every((m, i) => i === 0 || r.matters[i - 1].lv >= m.lv || m.lv === 0));
    assert.equal(r.matters[0].lv, 3);
  });
  test('rassurance gel seulement par temps froid, jamais en plein été', () => {
    const cold = desk({ now: '2026-10-06T10:00', hours: H().map(x => ({ ...x, T: 3, Tr: 6 })) });
    assert(cold.matters.some(m => /Pas de risque de gel estimé/.test(m.text)));
    const warm = desk({ now: '2026-10-06T10:00', hours: H() });
    assert(!warm.matters.some(m => /gel/.test(m.text)));
  });
  test('données anciennes signalées (plus de 3 h), pas avant', () => {
    assert.equal(desk({ now: '2026-10-06T10:00', hours: H(), ageMin: 200 }).hero.stale, true);
    assert.equal(desk({ now: '2026-10-06T10:00', hours: H(), ageMin: 120 }).hero.stale, false);
  });
  test('déterminisme : mêmes entrées, même résultat, entrées intactes', () => {
    const hs = set(H(), '07', { P: 1, Pl: 1 }, 2), input = { now: '2026-10-06T06:18', hours: hs, trips: [{ ...trip('06:45', '07:28'), points: pts(hs, '06:45', [['06:45', 0, 0], ['07:28', 1, 44]]) }] };
    const before = JSON.stringify(input), a = ctx.desk(input), b = ctx.desk(input);
    assert.deepEqual(plain(a), plain(b)); assert.equal(JSON.stringify(input), before);
  });
  test('sept cartes phénomènes, compactes, détail disponible', () => {
    const r = desk({ now: '2026-10-06T10:00', hours: H() });
    assert.deepEqual(r.phen.map(p => p.id), ['rain', 'fog', 'wind', 'ice', 'temp', 'sun', 'road']);
    assert(r.phen.every(p => p.line.length <= 60 && Array.isArray(p.detail) && p.detail.length >= 1), JSON.stringify(r.phen.map(p => p.line)));
    assert.equal(r.phen.find(p => p.id === 'rain').line, 'Aucune avant 23:00');
  });
  test('chaussée estimée : mouillée sous la pluie, humide après, sèche ensuite', () => {
    const hs = set(H(), '10', { P: 1, Pl: 1 }, 1);
    const wet = desk({ now: '2026-10-06T10:10', hours: hs }).phen.find(p => p.id === 'road');
    assert.match(wet.line, /^Mouillée/);
    const after = desk({ now: '2026-10-06T11:10', hours: hs }).phen.find(p => p.id === 'road');
    assert.match(after.line, /^Humide/);
    const ahead = desk({ now: '2026-10-06T09:10', hours: hs }).phen.find(p => p.id === 'road');
    assert.equal(ahead.line, 'Sèche 12,0 °C → mouillée 10:00'); assert.equal(ahead.lv, 1);
  });
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) {
  const original = fs.readFileSync(sourcePath, 'utf8'), count = runTests(original);
  // contre-tests : chaque régression métier doit être rejetée par au moins un scénario
  const mutations = [
    { name: 'seuil de brouillard abaissé à 500 m', from: 'vis < 1000 ? 1 : 0', to: 'vis < 500 ? 1 : 0' },
    { name: 'verglas ÉLEVÉ rétrogradé en orange', from: 'iceLv >= 2 ? 3 : iceLv === 1 ? 2 : 0', to: 'iceLv >= 2 ? 2 : iceLv === 1 ? 2 : 0' },
    { name: 'pluie verglaçante ignorée', from: 'FZ.has(code) ? 3 :', to: '' },
    { name: 'niveau route limité au score (pire facteur ignoré)', from: 'level: Math.max(sl, ...F.map(f => f.lv))', to: 'level: sl' },
    { name: 'neige comptée comme pluie', from: 'if (!snowy) o.rain', to: 'o.rain' },
    { name: 'trajet passé gardé dans la chronologie', from: 'mins(t.arr || t.dep) >= nowM - 1', to: 'true' },
    { name: 'rassurance « pas de gel » affichée par temps doux (remplissage)', from: 'tmin != null && tmin <= 5', to: 'tmin != null' },
    { name: 'verdict choisi par ordre d’apparition au lieu de la gravité', from: 'b.lv - a.lv || (active(b) - active(a)) ||', to: '' }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    let rejection; try { runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rejection = e; }
    assert(rejection && rejection.scenario, 'La mutation doit être rejetée : ' + m.name + (rejection ? ' (' + rejection.message + ')' : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
