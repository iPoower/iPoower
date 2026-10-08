// Audit A05 : département reconnu quelle que soit la source, conservé jusqu'à l'alerte montagne, vigilance sourcée et datée.
// Lieux publics fictifs uniquement (aucune adresse personnelle).
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const sourcePath = path.join(__dirname, '../src/engine.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = { console, Math, Date, Intl, JSON, Map, Set }; vm.createContext(ctx);
  const geo = fs.readFileSync(path.join(__dirname, '../src/geosearch.js'), 'utf8');
  const day = fs.readFileSync(path.join(__dirname, '../src/userctx.js'), 'utf8');
  vm.runInContext(source + '\n' + geo + '\n' + day + ';this.E={frAdmin,montagneInfo,montagneWhy,montagneSeason,FR_DEPT,MONT_CODES,MONT_DEPTS,MONT_SRC};this.G=GeoSearch;this.D=DayContext;', ctx);
  const { E, G, D } = ctx, plain = v => JSON.parse(JSON.stringify(v));
  let count = 0;
  const test = (name, fn) => { try { fn(); } catch (error) { error.scenario = name; throw error; } count++; if (!options.quiet) console.log('✅ ' + name); };

  test('référentiel : 101 départements, 34 en Loi Montagne, tous présents dans le référentiel', () => {
    assert.equal(Object.keys(E.FR_DEPT).length, 101); assert.equal(E.MONT_CODES.size, 34);
    assert([...E.MONT_CODES].every(c => E.FR_DEPT[c])); assert.equal(E.MONT_DEPTS.length, 34);
    for (const n of ['Haute-Savoie', 'Savoie', 'Isère', 'Hautes-Pyrénées', 'Vosges', 'Territoire de Belfort', 'Puy-de-Dôme']) assert(E.MONT_DEPTS.includes(n), n);
    for (const n of ['Paris', 'Somme', 'Gironde', 'Corrèze', 'Haute-Corse']) assert(!E.MONT_DEPTS.includes(n), n);
  });
  test('normalisation : contexte BAN, nom sans accent, ISO OSM, code postal, Corse, Outre-mer', () => {
    const c = x => E.frAdmin(x).deptCode;
    assert.equal(c({ dept: '74, Haute-Savoie, Auvergne-Rhône-Alpes' }), '74');   // ancienne donnée enregistrée : reconnue
    assert.equal(c({ dept: 'haute savoie' }), '74'); assert.equal(c({ iso: 'FR-75C' }), '75'); assert.equal(c({ dept: 'Cote d Or' }), '21');
    assert.equal(c({ postcode: '20167' }), '2A'); assert.equal(c({ postcode: '20200' }), '2B'); assert.equal(c({ postcode: '97400' }), '974');
    assert.equal(c({ cityCode: '2B033' }), '2B'); assert.equal(c({ deptCode: '2a' }), '2A');
    assert.equal(c({ dept: 'Auvergne-Rhône-Alpes' }), '', 'une région n’est jamais prise pour un département');
    assert.equal(c({ dept: 'Greater London' }), ''); assert.equal(c({ postcode: '98000' }), '', 'Monaco');
    assert.equal(c({ deptCode: '74', dept: 'Gironde' }), '74', 'le code explicite prime');
  });
  test('critère A05 : même lieu via BAN, OSM, Open-Meteo, lieu enregistré ou trajet manuel → mêmes métadonnées, même vigilance', () => {
    const ban = G.ban({ features: [{ properties: { label: '1 Place fictive 74000 Annecy', context: '74, Haute-Savoie, Auvergne-Rhône-Alpes', city: 'Annecy', citycode: '74010', postcode: '74000' }, geometry: { coordinates: [6.13, 45.9] } }] })[0];
    const osm = G.osm([{ lat: '45.9', lon: '6.13', name: 'Annecy', display_name: 'Annecy, Haute-Savoie, France', address: { town: 'Annecy', county: 'Haute-Savoie', state: 'Auvergne-Rhône-Alpes', 'ISO3166-2-lvl6': 'FR-74', postcode: '74000', country_code: 'fr' } }])[0];
    const om = G.openMeteo({ results: [{ name: 'Annecy', admin2: 'Haute-Savoie', country_code: 'FR', postcodes: ['74000'], latitude: 45.9, longitude: 6.13 }] })[0];
    const legacy = { id: 'c1', name: 'Annecy', dept: '74, Haute-Savoie, Auvergne-Rhône-Alpes', lat: 45.9, lon: 6.13 };   // lieu enregistré avant ce correctif
    const saved = { ...ban, ...E.frAdmin(ban) };                                                                        // lieu ajouté par la recherche
    const manual = D.cleanPoint({ ...osm, ...E.frAdmin(osm), id: 'manual-destination' }, 'x');                          // point manuel TRAJET
    const all = [ban, osm, om, legacy, saved, manual];
    const meta = all.map(x => { const a = E.frAdmin(x); return [a.deptCode, a.dept]; });
    assert(meta.every(m => m[0] === '74' && m[1] === 'Haute-Savoie'), JSON.stringify(meta));
    assert([ban, osm, om, saved, manual].every(x => E.frAdmin(x).city === 'Annecy' && E.frAdmin(x).postcode === '74000'), 'commune et code postal identiques quand la source les fournit');
    const vig = all.map(x => plain(E.montagneInfo(x, '2026-11-03T07:30', 450)));
    assert(vig.every(v => v.inDept && v.concerned && v.season && !v.high && v.deptCode === '74'), JSON.stringify(vig));
    assert.equal(new Set(vig.map(v => JSON.stringify(v))).size, 1, 'vigilance identique');
  });
  test('ancien bug reproduit : la chaîne BAN entière dans « dept » échouait ; à 450 m l’altitude ne rattrapait rien', () => {
    const v = E.montagneInfo({ dept: '74, Haute-Savoie, Auvergne-Rhône-Alpes' }, '2026-11-03', 450);
    assert.equal(v.inDept, true); assert.equal(v.deptName, 'Haute-Savoie');
  });
  test('hors département concerné : repli altitude ≥ 700 m, sinon aucune vigilance', () => {
    const low = E.montagneInfo({ deptCode: '80' }, '2026-12-01', 100), high = E.montagneInfo({ deptCode: '19' }, '2026-12-01', 820), none = E.montagneInfo({}, '2026-12-01', null);
    assert.equal(low.concerned, false); assert.equal(high.concerned, true); assert.equal(high.inDept, false); assert.equal(none.concerned, false);
    assert.match(E.montagneWhy(high, 'Lieu test'), /^Lieu test est en altitude \(820 m\) · Corrèze \(19\) : équipements hiver possibles selon la commune$/);
  });
  test('période : 1er novembre – 31 mars inclus, rien d’autre', () => {
    for (const [d, s] of [['2026-10-31', false], ['2026-11-01', true], ['2027-01-15', true], ['2027-03-31', true], ['2027-04-01', false]]) assert.equal(E.montagneInfo({ deptCode: '73' }, d, null).season, s, d);
  });
  test('formulation : vigilance, jamais « obligation » pour un lieu dont la commune n’est pas vérifiée ; source datée', () => {
    const w = E.montagneWhy(E.montagneInfo({ deptCode: '74' }, '2026-11-03', null), 'Arrivée · Annecy');
    assert.equal(w, 'Arrivée · Annecy · Haute-Savoie (74) : département où certaines communes imposent les équipements hiver'); assert.doesNotMatch(w, /obligatoire/);
    assert.match(E.MONT_SRC.text, /décret n° 2020-1264/); assert.match(E.MONT_SRC.text, /2025-2026/); assert.equal(E.MONT_SRC.asOf, '2025-10-29');
    assert.match(E.MONT_SRC.url, /^https:\/\/www\.service-public\.gouv\.fr\//); assert.match(E.MONT_SRC.communes, /^https:\/\/www\.securite-routiere\.gouv\.fr\//);
  });
  test('saison de la liste : 2025-2026 embarquée, 2026-2027 signalée « à confirmer »', () => {
    assert.deepEqual(plain(E.montagneSeason('2026-02-10T08:00')), { season: '2025-2026', listOk: true, note: '' });
    const n = plain(E.montagneSeason('2026-11-03T08:00')); assert.equal(n.season, '2026-2027'); assert.equal(n.listOk, false); assert.match(n.note, /2026-2027 reste à confirmer/);
  });
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) {
  const original = fs.readFileSync(sourcePath, 'utf8'), count = runTests(original);
  const mutations = [
    { name: 'retour à la comparaison du texte brut', from: 'const a = frAdmin(loc), inDept = MONT_CODES.has(a.deptCode);', to: 'const a = frAdmin(loc), inDept = !!(loc && MONT_DEPTS.includes(loc.dept));' },
    { name: 'département retiré de la liste montagne', from: "'73', '74', '81'", to: "'73', '81'" },
    { name: 'fin de période décalée au 30 mars', from: "md <= '03-31'", to: "md <= '03-30'" },
    { name: 'réserve de saison supprimée', from: 'listOk = season === MONT_SRC.season', to: 'listOk = true' },
    { name: 'Corse mal découpée par code postal', from: "+z.slice(2, 3) <= 1 ? '2A' : '2B'", to: "'2B'" }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    let rejection; try { runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rejection = e; }
    assert(rejection && rejection.scenario, 'La mutation doit être rejetée : ' + m.name);
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
