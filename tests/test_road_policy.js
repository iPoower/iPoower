// Chaussée mouillée / humide : UNE définition pour le verdict (engine), le poste Météo (wxdesk) et l'Analyse (tyrelab).
// Avant : engine 0,1 mm/h ou 0,3 mm sur 2 h ; tyrelab 0,2 mm/h ou 0,3 mm sur 3 h ou HR ≥ 95 % ; wxdesk 0,2 mm/h sur une heure des 3 h précédentes.
// Politique commune : pluie ≥ 0,2 mm/h · humide dès 0,1 mm/h ou 0,3 mm cumulés sur 3 heures (heure courante comprise) ·
// air saturé (HR ≥ 95 % et T − Td < 1 °C, ou HR ≥ 95 % si Td inconnu) = humide sans précipitation.
// Un scénario = une série horaire ; les trois moteurs doivent donner le même classement sec / humide / pluie.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
function run(sources = {}, options = {}) {
  const src = n => sources[n] ?? read('src/' + n + '.js');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(['engine', 'wxdesk', 'tirespecs', 'tyrestate', 'tyrelab'].map(src).join('\n') + '\nthis.E = { roadWet, wxDesk, tyreLab, ROAD_POLICY };', ctx);
  const E = ctx.E, plain = v => JSON.parse(JSON.stringify(v));
  let count = 0;
  const test = (name, fn) => { try { fn(); } catch (error) { error.scenario = name; throw error; } count++; if (!options.quiet) console.log('✅ ' + name); };
  // 30 h à partir de 2026-10-06 00:00 ; l'heure courante est 10:00 (now = 10:20) ; `rain` décrit 07:00, 08:00, 09:00, 10:00
  const series = (rain, extra = {}) => Array.from({ length: 30 }, (_, k) => {
    const t = new Date(Date.parse('2026-10-06T00:00:00Z') + k * 3600e3).toISOString().slice(0, 16), h = k, i = h - 7;
    const P = i >= 0 && i < rain.length ? rain[i] : 0;
    return { t, hh: h, T: 12, Tapp: 11, Tr: 12, RH: 70, Td: 6, P, Pl: P, snow: 0, pp: 5, code: 1, vis: 24000, wind: 10, gust: 20, rad: 0, cloud: 20, ice: { level: 0, score: 0 }, ...extra };
  });
  const NOW = '2026-10-06T10:20', I = 10;
  const car = { name: 'Voiture test', tire: { type: 'summer', brand: 'Marque test', model: 'Modèle test', size: '215/45 R17 91V', press: '2,4', tread: 6, pchk: { date: '2026-09-20', T: 15 } } };
  const classOf = {
    engine: hs => E.roadWet(hs, I) ? 'wet' : 'dry',
    tyre: hs => { const s = plain(E.tyreLab(plain({ now: NOW, car, hours: hs }))).env.surf; return s === 'dry' ? 'dry' : s === 'damp' ? 'wet' : 'rain'; },
    desk: hs => { const l = plain(E.wxDesk(plain({ now: NOW, hours: hs }))).phen.find(p => p.id === 'road').line.toLowerCase(); return /^mouillée/.test(l) ? 'rain' : /^humide/.test(l) ? 'wet' : /^sèche/.test(l) ? 'dry' : l; }
  };
  // [description, précipitations 07h-10h, attendu]
  const PRECIP = [
    ['sec', [0, 0, 0, 0], 'dry'],
    ['0,09 mm/h seul : sec', [0, 0, 0, 0.09], 'dry'],
    ['0,10 mm/h : humide', [0, 0, 0, 0.1], 'wet'],
    ['0,19 mm/h : humide, pas encore « pluie »', [0, 0, 0, 0.19], 'wet'],
    ['0,20 mm/h : pluie', [0, 0, 0, 0.2], 'rain'],
    ['cumul 3 h = 0,29 mm : sec', [0, 0.09, 0.1, 0.09].map((v, k) => k === 0 ? 0 : v), 'dry'],
    ['cumul 3 h = 0,30 mm (3 heures de 0,1 mm) : humide', [0, 0.1, 0.1, 0.1], 'wet'],
    ['0,3 mm tombés il y a 2 h : humide', [0, 0.3, 0, 0], 'wet'],
    ['0,3 mm tombés il y a 3 h : plus pris en compte', [0.3, 0, 0, 0], 'dry'],
    ['averse puis arrêt (1 mm il y a 1 h) : humide', [0, 0, 1, 0], 'wet']
  ];
  for (const [what, rain, expected] of PRECIP) test(`précipitations · ${what}`, () => {
    const hs = series(rain);
    assert.equal(classOf.tyre(hs), expected, 'Analyse'); assert.equal(classOf.desk(hs), expected, 'poste Météo');
    assert.equal(classOf.engine(hs), expected === 'dry' ? 'dry' : 'wet', 'verdict');
  });
  // air saturé sans précipitation : humide pour l'Analyse et le poste Météo ; le verdict pneus ne le compte pas comme chaussée mouillée
  for (const [what, extra, expected] of [
    ['HR 95 % et T − Td = 0,5 °C : humide', { RH: 95, Td: 11.5 }, 'wet'],
    ['HR 95 % mais T − Td = 2 °C : sec', { RH: 95, Td: 10 }, 'dry'],
    ['HR 94 % : sec', { RH: 94, Td: 11.8 }, 'dry'],
    ['HR 96 % sans point de rosée : humide', { RH: 96, Td: null }, 'wet']
  ]) test(`air saturé · ${what}`, () => {
    const hs = series([0, 0, 0, 0], extra);
    assert.equal(classOf.tyre(hs), expected, 'Analyse'); assert.equal(classOf.desk(hs), expected, 'poste Météo'); assert.equal(classOf.engine(hs), 'dry', 'verdict : précipitations seulement');
  });
  test('politique unique : valeurs identiques dans les trois moteurs', () => {
    const want = plain(E.ROAD_POLICY);
    assert.deepEqual(want, { rainMmH: 0.2, dampMmH: 0.1, soakMm: 0.3, soakHours: 3, humidRH: 95, humidSpreadC: 1 });
    for (const [file, name] of [['wxdesk.js', 'WXD_ROAD'], ['tyrelab.js', 'TL_ROAD']]) {
      const m = new RegExp('const ' + name + ' = (\\{[^}]*\\});').exec(src(file.replace('.js', '')));
      assert(m, file + ' : ' + name + ' absent'); assert.deepEqual(plain(vm.runInNewContext('(' + m[1] + ')')), want, file);
    }
  });
  test('aucune définition locale de chaussée mouillée ne subsiste dans l’interface', () => {
    for (const f of ['src/app.js', 'src/engine.js']) assert(!/\(x\.P \|\| 0\) >= 0\.1 \|\| recentPrecip/.test(read(f)) && !/recentPrecip\([^)]*, 2\) >= 0\.3/.test(read(f)), f + ' : seuil recopié');
  });
  return count;
}
if (require.main === module) {
  const original = ['engine', 'wxdesk', 'tirespecs', 'tyrestate', 'tyrelab'].map(n => [n, read('src/' + n + '.js')]);
  const count = run();
  const mutations = [
    { file: 'engine', name: 'seuil de pluie du verdict relevé à 0,2 mm/h', from: 'dampMmH: 0.1,', to: 'dampMmH: 0.2,' },
    { file: 'engine', name: 'mémoire de l’eau ramenée à 2 h', from: 'soakHours: 3,', to: 'soakHours: 2,' },
    { file: 'engine', name: 'cumul d’eau relevé à 0,5 mm', from: 'soakMm: 0.3,', to: 'soakMm: 0.5,' },
    { file: 'tyrelab', name: 'Analyse : humidité de l’air seule suffit sans condition de point de rosée', from: '(n(x.Td) == null || Ta - x.Td < TL_ROAD.humidSpreadC)', to: 'true' },
    { file: 'tyrelab', name: 'Analyse : mémoire de l’eau remise à 6 h', from: 'TL_ROAD.soakHours * 60', to: '6 * 60' },
    { file: 'wxdesk', name: 'poste Météo : chaussée humide ignorée après la pluie', from: 'if (soaked || humid)', to: 'if (humid)' },
    { file: 'wxdesk', name: 'poste Météo : seuil de pluie recopié à 0,5 mm/h', from: 'Pl >= WXD_ROAD.rainMmH', to: 'Pl >= 0.5' }
  ];
  for (const m of mutations) {
    const sources = {}; const src = original.find(([n]) => n === m.file)[1];
    assert(src.includes(m.from), 'Mutation introuvable : ' + m.name); sources[m.file] = src.replace(m.from, m.to);
    let rejection; try { run(sources, { quiet: true }); } catch (e) { rejection = e; }
    assert(rejection && rejection.scenario, 'La mutation doit être rejetée : ' + m.name + (rejection ? ' (' + rejection.message + ')' : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
module.exports = { run };
