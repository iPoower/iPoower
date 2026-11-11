// Catalogue pneus enrichi par le registre européen EPREL (tools/tire-catalog/merge-eprel.js) et lecture par le moteur.
// Fiches EPREL fictives pour les règles ; contrôle d'intégrité sur la base publiée src/tiredb.json. Aucun appel réseau.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const M = require('../tools/tire-catalog/merge-eprel.js');
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8') + ';this.E={loadTireDB,findTire,tireLabels,tireLabel,tireSheet,compatible,TIRE_DB,decodeSize};', ctx);
const E = ctx.E;
let n = 0; const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const NOW = Date.parse('2026-11-11T12:00:00Z');
const hit = o => ({ status: 'PUBLISHED', blocked: false, tyreClass: 'C1', availabilityInEUEEACountries: 'ALL', modelAvailabilityInCountries: [],
  energyClass: 'C', wetGripClass: 'B', externalRollingNoiseValue: 71, externalRollingNoiseClass: 'B', severeSnowTyre: false, iceTyre: false,
  loadCapacityIndex: 89, loadCapacityIndicator: 'XL', speedCategorySymbol: 'Y', supplierOrTrademark: 'MARQUETEST', eprelRegistrationNumber: '100',
  additionalDetails: { commercialName: 'MODELE ETE' }, ...o });
const base = () => ({ version: 3, updated: '2026-10-18', sizes: {}, tires: [
  { b: 'Michelin', m: 'Pilot Sport 4S', t: 'summer', p: 0, s: { '215/40 R18': 'vérifié' }, c: 'Été UHP', tier: 'premium' },
  { b: 'Hankook', m: 'Ventus S1 evo3 K127', t: 'summer', p: 0, s: {}, c: 'Été' },
  { b: 'Vredestein', m: 'Wintrac', t: 'winter', p: 1, s: {}, c: 'Hiver' }] });

test('registre : seuls les pneus C1 publiés, vendus en France et encore commercialisés sont retenus', () => {
  const dumps = { '215/40 R18': [hit({}), hit({ tyreClass: 'C2', eprelRegistrationNumber: '2' }), hit({ blocked: true, eprelRegistrationNumber: '3' }),
    hit({ status: 'DRAFT', eprelRegistrationNumber: '4' }), hit({ availabilityInEUEEACountries: 'AS_SPECIFIED', modelAvailabilityInCountries: ['DE'], eprelRegistrationNumber: '5' }),
    hit({ availabilityInEUEEACountries: 'AS_SPECIFIED', modelAvailabilityInCountries: ['FR'], eprelRegistrationNumber: '6', energyClass: 'B' }),
    hit({ onMarketEndDateTS: NOW / 1000 - 86400, eprelRegistrationNumber: '7' }), hit({ onMarketEndDateTS: NOW / 1000 + 86400, eprelRegistrationNumber: '8', wetGripClass: 'A' }),
    hit({ energyClass: null, eprelRegistrationNumber: '9' }), hit({ additionalDetails: { commercialName: '  ' }, eprelRegistrationNumber: '10' })] };
  const { db, stats } = M.merge(base(), dumps, NOW);
  const t = db.tires.find(x => x.b === 'Marquetest');
  assert.deepEqual(t.e['215/40 R18'].map(v => v.split('|')[7]).sort(), ['100', '6', '8']);
  assert.equal(stats.kept, 3);
});
test('variante compacte : indices, étiquette, 3PMSF, glace, numéro EPREL ; tri par mouillé puis consommation', () => {
  const dumps = { '225/45 R17': [hit({ loadCapacityIndex: 94, speedCategorySymbol: 'PAR_Y_PAR', eprelRegistrationNumber: '11', wetGripClass: 'C' }),
    hit({ loadCapacityIndex: 91, loadCapacityIndicator: 'SL', speedCategorySymbol: 'W', eprelRegistrationNumber: '12', wetGripClass: 'A', energyClass: 'D', severeSnowTyre: true, iceTyre: true })] };
  const t = M.merge(base(), dumps, NOW).db.tires.find(x => x.b === 'Marquetest');
  assert.deepEqual(t.e['225/45 R17'], ['91W|D|A|71|B|1|1|12', '94(Y) XL|C|C|71|B|0|0|11']);
});
test('modèles connus : enrichis sans changer leur saison ; alias vérifiés ; cas douteux séparés', () => {
  const dumps = { '215/40 R18': [hit({ supplierOrTrademark: 'MICHELIN', additionalDetails: { commercialName: 'PILOT SPORT 4 S' }, eprelRegistrationNumber: '20' }),
    hit({ supplierOrTrademark: 'HANKOOK', additionalDetails: { commercialName: 'VENTUS S1 EVO3' }, eprelRegistrationNumber: '21' }),
    hit({ supplierOrTrademark: 'VREDESTEIN', additionalDetails: { commercialName: 'WINTRAC PRO+' }, severeSnowTyre: true, eprelRegistrationNumber: '22' })] };
  const { db } = M.merge(base(), dumps, NOW);
  const ps = db.tires.find(x => x.m === 'Pilot Sport 4S'), hk = db.tires.find(x => x.m === 'Ventus S1 evo3 K127');
  assert.equal(ps.t, 'summer'); assert.equal(ps.s['215/40 R18'], 'vérifié'); assert.equal(ps.q, undefined); assert.equal(ps.e['215/40 R18'][0].split('|')[7], '20');
  assert.equal(hk.e['215/40 R18'][0].split('|')[7], '21'); assert.equal(hk.s['215/40 R18'], 'eprel');
  assert.equal(db.tires.find(x => x.m === 'Wintrac').e, undefined, 'Wintrac ≠ Wintrac Pro+');
  assert(db.tires.find(x => x.m.toUpperCase() === 'WINTRAC PRO+' && x.e));
});
test('saison déduite (q) : sans 3PMSF = été ; 3PMSF + nom hivernal = hiver ; 3PMSF sinon = 4 saisons, jamais présentée comme vérifiée', () => {
  const mk = (name, snow, id) => hit({ supplierOrTrademark: 'AUTRE', additionalDetails: { commercialName: name }, severeSnowTyre: snow, eprelRegistrationNumber: id });
  const { db } = M.merge(base(), { '215/40 R18': [mk('SPORT ONE', false, '30'), mk('SNOWMASTER 2', true, '31'), mk('CLIMA PLUS', true, '32'), mk('AS-3', false, '33')] }, NOW);
  const by = m => db.tires.find(x => x.b === 'Autre' && x.m.toUpperCase() === m);
  assert.deepEqual(['SPORT ONE', 'SNOWMASTER 2', 'CLIMA PLUS', 'AS-3'].map(m => [by(m).t, by(m).p, by(m).q]),
    [['summer', 0, 1], ['winter', 1, 1], ['allseason', 1, 1], ['summer', 0, 1]]);
  assert.match(by('CLIMA PLUS').c, /à confirmer/);
});
test('nom commercial : dimension et indices recopiés retirés ; marques normalisées', () => {
  assert.equal(M.modelName('215/40R18 89V SV-4 XL L EUHA'), 'SV-4');
  assert.equal(M.modelName('225/45ZR17 94Y AS-3 XL L M+S'), 'AS-3');
  assert.equal(M.modelName('PILOT SPORT 5'), 'Pilot Sport 5');
  const known = new Map([['michelin', 'Michelin']]);
  assert.deepEqual(['NEXENTIRE', 'TOYO TIRES', 'NOKIAN TYRES', 'MICHELIN', 'KUMHO WP52'].map(b => M.brandName(b, known)), ['Nexen', 'Toyo', 'Nokian', 'Michelin', 'Kumho']);
});
test('moteur : étiquette lue par variante ; la fiche ne montre que la variante exacte du pneu monté', () => {
  const { db } = M.merge(base(), { '215/40 R18': [hit({ supplierOrTrademark: 'MICHELIN', additionalDetails: { commercialName: 'PILOT SPORT 4S' }, eprelRegistrationNumber: '40', energyClass: 'D', wetGripClass: 'A', externalRollingNoiseValue: 70 }),
    hit({ supplierOrTrademark: 'MICHELIN', additionalDetails: { commercialName: 'PILOT SPORT 4S' }, loadCapacityIndex: 85, loadCapacityIndicator: 'SL', eprelRegistrationNumber: '41', energyClass: 'A', wetGripClass: 'A' })] }, NOW);
  const pad = ['A', 'B', 'C'].map(x => ({ b: 'Remplissage', m: 'Modèle ' + x, t: 'summer', p: 0, s: {}, c: '' }));   // le moteur exige au moins 5 modèles
  assert.equal(E.loadTireDB(JSON.parse(JSON.stringify({ ...db, tires: [...db.tires, ...pad] })), 'test'), true);
  const t = E.findTire('Michelin', 'Pilot Sport 4S'), L = E.tireLabels(t, '215/40 R18');
  assert.deepEqual(JSON.parse(JSON.stringify(L.map(l => [l.idx, l.li, l.si, l.xl, l.energy, l.wet, l.db, l.eprel]))), [['85Y', 85, 'Y', false, 'A', 'A', 71, '41'], ['89Y XL', 89, 'Y', true, 'D', 'A', 70, '40']]);
  const line = s => E.tireSheet({ brand: 'Michelin', model: 'Pilot Sport 4S', size: s }, '2026-11-11').lines.find(x => /Étiquette UE/.test(x));
  assert.match(line('215/40 ZR18 89Y XL'), /EPREL 40\) : adhérence sur mouillé A · consommation D · bruit 70 dB/);
  assert.equal(line('215/40 R18 91Y XL'), undefined, 'variante absente : aucune étiquette d’une autre variante');
  assert.equal(E.tireLabel('89Y|F|A|70|B|0|0|1'), null, 'classe hors A–E refusée');
});
test('base publiée : intégrité (étiquettes lisibles, aucun doublon, saisons vérifiées conservées, dimensions cohérentes)', () => {
  const db = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/tiredb.json'), 'utf8'));
  assert(db.version >= 4 && db.labels && /EPREL/.test(db.labels.source) && db.labels.fetched);
  const keys = new Set(); let variants = 0;
  for (const t of db.tires) {
    const k = (t.b + '|' + t.m).toLowerCase().replace(/[^a-z0-9|*+]/g, ''); assert(!keys.has(k), 'doublon ' + k); keys.add(k);
    assert(['summer', 'winter', 'allseason'].includes(t.t), t.b + ' ' + t.m);
    for (const [size, list] of Object.entries(t.e || {})) {
      assert(Object.keys(db.sizes).includes(size) && t.s[size], size);
      for (const v of list) { const l = E.tireLabel(v); assert(l && l.li >= 80 && l.si && /^\d+$/.test(l.eprel), v); variants++; }
    }
    if (t.q) assert(t.e && /registre|déduite|confirmer/.test(t.c), 'saison déduite signalée : ' + t.m);
  }
  assert(db.tires.length > 1500 && variants > 3000, db.tires.length + ' / ' + variants);
  const known = db.tires.filter(t => !t.q);
  assert(known.length >= 102, 'les modèles vérifiés restent');
  for (const [b, m, ty] of [['Michelin', 'Pilot Sport 4S', 'summer'], ['Goodyear', 'UltraGrip Performance 3', 'winter'], ['Rovelo', 'RPX-988', 'summer']])
    assert.equal(known.find(t => t.b === b && t.m === m).t, ty);
  const gy = known.find(t => t.m === 'UltraGrip Performance 3');
  assert.equal(gy.v['215/40 R18'].partNumber, '580667', 'fiche SAP conservée');
});
console.log(n + '/' + n + ' scénarios OK');
