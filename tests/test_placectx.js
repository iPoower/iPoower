// Lieu courant (localisation métier) : hiérarchie de confiance, garde de précision, fin d'une confirmation, puis contre-tests.
// Lieux 100 % fictifs ; « Ville réseau test » représente une position approximative, à 60 km du travail.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const sourcePath = path.join(__dirname, '../src/placectx.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(source + '\nthis.pc = placeContext; this.cls = placeFixClass;', ctx);
  const plain = v => JSON.parse(JSON.stringify(v)), P = input => plain(ctx.pc(plain(input)));
  const T0 = Date.parse('2026-10-06T05:42:00Z'), min = m => T0 + m * 60e3;
  const places = [{ id: 'home', name: 'Maison test', kind: 'home', lat: 49.80, lon: 2.70 }, { id: 'work', name: 'Travail test', kind: 'work', lat: 49.95, lon: 2.35 }];
  const COARSE = { lat: 49.50, lon: 1.60, acc: 25000 };   // ≈ 60 km du travail, précision d'adresse IP
  const fix = (p, m, acc) => ({ lat: p.lat, lon: p.lon, acc, ts: min(m) });
  const confW = { placeId: 'work', at: T0, how: 'arrival', day: '2026-10-06' };
  const base = (o = {}) => ({ now: min(3), today: '2026-10-06', places, ...o });
  let count = 0;
  const test = (name, fn) => { try { fn(); } catch (e) { e.scenario = name; throw e; } count++; if (!options.quiet) console.log('✅ ' + name); };

  test('arrivée confirmée au travail, puis un relevé approximatif à 60 km trois minutes plus tard : le lieu reste Travail', () => {
    const r = P(base({ conf: confW, fix: fix(COARSE, 3, COARSE.acc), net: { ...fix(COARSE, 3, COARSE.acc), name: 'Ville réseau test' } }));
    assert.equal(r.place.id, 'work'); assert.equal(r.source, 'manual'); assert.equal(r.trust, 'Confirmée'); assert.equal(r.originLock, 'work');
    assert.equal(r.title, '🏢 AU TRAVAIL'); assert.match(r.badge, /Confirmé à 05:42 · source : confirmation utilisateur/); assert.equal(r.net, 'Position approximative ignorée pour le lieu confirmé');
    assert(r.rejected.length >= 1 && r.rejected.every(x => /réseau|précision/.test(x.source + x.reason)));
  });
  test('changement de position approximative sans déplacement : aucune ville réseau ne devient le lieu', () => {
    for (const v of [COARSE, { lat: 48.9, lon: 2.3, acc: 30000 }, { lat: 50.6, lon: 3.0, acc: 8000 }]) {
      const r = P(base({ conf: confW, fix: fix(v, 3, v.acc), net: fix(v, 3, v.acc) }));
      assert.equal(r.place.id, 'work'); assert.equal(r.ended, null);
    }
  });
  test('position approximative (± 1 km) loin du lieu confirmé : écartée, confirmation conservée', () => {
    const r = P(base({ conf: confW, fix: fix(COARSE, 3, 1000) }));
    assert.equal(r.place.id, 'work'); assert(r.rejected.some(x => /précision insuffisante/.test(x.reason)));
  });
  test('relevé précis mais déplacement impossible (60 km en 3 min) : rejeté comme incohérent', () => {
    const r = P(base({ conf: confW, fix: fix(COARSE, 3, 30) }));
    assert.equal(r.place.id, 'work'); assert(r.rejected.some(x => /déplacement impossible/.test(x.reason)));
  });
  test('GPS précis et cohérent loin du travail (départ réel) : la confirmation se termine légitimement', () => {
    const away = { lat: 49.85, lon: 2.55 }, r = P(base({ now: min(40), conf: confW, fix: fix(away, 39, 15) }));
    assert.equal(r.ended.reason, 'position précise ailleurs (départ réel)'); assert.equal(r.source, 'gps'); assert.equal(r.trust, 'Fiable'); assert.equal(r.confirmed, undefined);
  });
  test('trajet vivant parti après la confirmation : départ détecté, état « en route »', () => {
    const r = P(base({ now: min(600), conf: confW, moving: true, movingSince: min(590) }));
    assert.equal(r.ended.reason, 'départ détecté (trajet en cours)'); assert.equal(r.source, 'trip');
    const before = P(base({ now: min(5), conf: confW, moving: true, movingSince: min(-30) }));
    assert.equal(before.source, 'manual');   // un trajet commencé avant la confirmation ne l'annule pas
  });
  test('fin de la journée de travail : confirmation du travail expirée le lendemain', () => {
    const r = P(base({ now: min(20 * 60), today: '2026-10-07', conf: confW }));
    assert.equal(r.ended.reason, 'fin de la journée de travail'); assert.notEqual(r.source, 'manual');
  });
  test('domicile : « Je suis chez moi » valable jusqu’au départ, plafond de sécurité de 20 h', () => {
    const c = { placeId: 'home', at: T0, how: 'manual', day: '2026-10-06' };
    assert.equal(P(base({ now: min(19 * 60), today: '2026-10-07', conf: c })).place.id, 'home');
    assert.match(P(base({ now: min(21 * 60), conf: c })).ended.reason, /plus de 20 h/);
    assert.equal(P(base({ conf: c })).title, '🏠 À LA MAISON');
  });
  test('aucune géolocalisation et aucune confirmation : « Localisation physique indisponible »', () => {
    const r = P(base({})); assert.equal(r.place, null); assert.equal(r.source, 'none'); assert.equal(r.trust, 'Indisponible'); assert.equal(r.title, '📍 Localisation physique indisponible');
  });
  test('seulement une position réseau : jamais présentée comme position réelle, nom affiché comme approximation', () => {
    const r = P(base({ fix: null, net: { ...fix(COARSE, 2, 25000), name: 'Ville réseau test' } }));
    assert.equal(r.place, null); assert.equal(r.source, 'network'); assert.equal(r.trust, 'Incertaine'); assert.equal(r.originLock, null);
    assert.equal(r.title, '📍 Localisation physique indisponible'); assert.equal(r.badge, 'Position réseau approximative · précision ~25 km · Ville réseau test');
  });
  test('GPS précis près du travail : lieu reconnu, source GPS, origine verrouillée', () => {
    const r = P(base({ fix: fix({ lat: 49.951, lon: 2.351 }, 2, 20) }));
    assert.equal(r.place.id, 'work'); assert.equal(r.source, 'gps'); assert.equal(r.trust, 'Fiable'); assert.equal(r.originLock, 'work'); assert.match(r.badge, /GPS navigateur · ± 20 m/);
  });
  test('localisation navigateur peu précise (± 900 m) près du domicile : estimée, sans verrou d’origine', () => {
    const r = P(base({ fix: fix({ lat: 49.805, lon: 2.70 }, 2, 900) }));
    assert.equal(r.place.id, 'home'); assert.equal(r.trust, 'Estimée'); assert.equal(r.originLock, null);
  });
  test('relevé précis trop ancien : ignoré au profit du dernier lieu fiable', () => {
    const r = P(base({ now: min(60), fix: fix(COARSE, 0, 20), last: { placeId: 'work', at: min(-10), source: 'manual' } }));
    assert.equal(r.source, 'last'); assert.equal(r.place.id, 'work'); assert.equal(r.trust, 'Estimée');
  });
  test('dernier lieu fiable : valable 12 h, oublié au-delà', () => {
    assert.equal(P(base({ now: min(11 * 60), last: { placeId: 'work', at: T0 } })).source, 'last');
    assert.equal(P(base({ now: min(13 * 60), last: { placeId: 'work', at: T0 } })).source, 'none');
  });
  test('saut impossible depuis le dernier lieu fiable (sans confirmation) : rejeté, dernier lieu conservé', () => {
    const r = P(base({ last: { placeId: 'work', at: min(1) }, fix: fix(COARSE, 3, 40) }));
    assert.equal(r.source, 'last'); assert(r.rejected.some(x => /saut impossible/.test(x.reason)));
  });
  test('classes de précision : ≤ 100 m GPS, ≤ 1,5 km approximative, au-delà trop large (fournisseur inconnu)', () => {
    assert.equal(ctx.cls({ acc: 100 }), 'gps'); assert.equal(ctx.cls({ acc: 101 }), 'approx'); assert.equal(ctx.cls({ acc: 1500 }), 'approx'); assert.equal(ctx.cls({ acc: 1501 }), 'coarse'); assert.equal(ctx.cls({}), 'coarse');
  });
  test('architecture générique : un lieu favori se confirme comme le travail', () => {
    const r = P({ now: min(1), places: [...places, { id: 'c1', name: 'Club test', kind: 'custom', lat: 49.7, lon: 2.4 }], conf: { placeId: 'c1', at: T0, how: 'manual' } });
    assert.equal(r.place.id, 'c1'); assert.equal(r.title, '📍 SUR PLACE'); assert.equal(r.originLock, 'c1');
  });
  test('confirmation d’un lieu inconnu ou supprimé : ignorée', () => {
    assert.equal(P(base({ conf: { placeId: 'disparu', at: T0 } })).source, 'none');
  });
  test('déterminisme : mêmes entrées, même résultat, entrées intactes', () => {
    const input = base({ conf: confW, fix: fix(COARSE, 3, 25000), net: fix(COARSE, 3, 25000) }), before = JSON.stringify(input);
    assert.deepEqual(plain(ctx.pc(input)), plain(ctx.pc(input))); assert.equal(JSON.stringify(input), before);
  });
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) {
  const original = fs.readFileSync(sourcePath, 'utf8'), count = runTests(original);
  const mutations = [
    { name: 'tout relevé lointain met fin à la confirmation (COARSE écrase Travail)', from: "if (far && cls === 'gps' && age <= PLACE_GPS_AGE) {", to: 'if (far) {' },
    { name: 'position réseau traitée comme approximative', from: 'const PLACE_ACC_GPS = 100, PLACE_ACC_APPROX = 1500,', to: 'const PLACE_ACC_GPS = 100, PLACE_ACC_APPROX = 1e9,' },
    { name: 'garde de vitesse supprimée', from: 'const PLACE_VMAX = 200,', to: 'const PLACE_VMAX = 1e9,' },
    { name: 'départ détecté ignoré', from: "else if (inp.moving && Number.isFinite(inp.movingSince) && inp.movingSince > conf.at)", to: 'else if (false)' },
    { name: 'confirmation du travail éternelle', from: "if (kind === 'work' && inp.today && conf.day && conf.day !== inp.today)", to: 'if (false)' },
    { name: 'position réseau devenue lieu métier', from: "if (net) return out({ place: null, source: 'network'", to: "if (net) return out({ place: places[0] || null, source: 'network'" }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    let rej; try { runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rej = e; }
    assert(rej && rej.scenario, 'La mutation doit être rejetée : ' + m.name + (rej ? ' (' + rej.message + ')' : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rej.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
