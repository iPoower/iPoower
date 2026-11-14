// Garage · coûts et pleins (reprise de #231) : calculs purs, journal sans perte, fusion PC ↔ iPhone sans résurrection. Données fictives.
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const G = require(path.join(__dirname, '../src/app/garage-economics-core.js'));
let n = 0; const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const id = k => ('test' + k).padEnd(8, '0');
const build = () => {
  let e = { ref: { purchasePriceCents: 400000, purchaseDate: '2026-01-10', purchaseOdometerKm: 100000, annualDistanceKm: 12000, estimatedResaleCents: 200000 } };
  e = G.addEntry(e, { date: '2026-02-01', category: 'fuel', amountCents: 6000, volumeMl: 35500, km: 101000, fullTank: true, fuelType: 'diesel' }, id('a'));
  e = G.addEntry(e, { date: '2026-02-10', category: 'fuel', amountCents: 3000, volumeMl: 17750, km: 101400 }, id('b'));
  e = G.addEntry(e, { date: '2026-02-20', category: 'fuel', amountCents: 5000, volumeMl: 30000, km: 102000, fullTank: true }, id('c'));
  return G.addEntry(e, { date: '2026-03-01', category: 'insurance', amountCents: 4500, note: '  Assurance fictive  ' }, id('d'));
};
check('saisie : euros et litres à la française, vide = inconnu, invalide = erreur (jamais deviné)', () => {
  assert.equal(G.parseMoney('4 000'), 400000); assert.equal(G.parseMoney('60,5'), 6050); assert.equal(G.parseMoney('0,99'), 99); assert.equal(G.parseMoney(''), null);
  for (const bad of ['-5', '12,345', 'abc', '1e3', '10000000']) assert.throws(() => G.parseMoney(bad), /Montant invalide/, bad);
  assert.equal(G.parseLitres('35,5'), 35500); assert.equal(G.parseLitres('26,667'), 26667); assert.equal(G.parseLitres(''), null);
  for (const bad of ['0', '201', '1,2345', 'x']) assert.throws(() => G.parseLitres(bad), /Volume/, bad);
  assert.equal(G.parseKm('101 000'), 101000); assert.equal(G.parseKm(''), null); assert.throws(() => G.parseKm('12,5'), /Kilométrage/);
  assert.equal(G.parseDay('2026-02-28'), '2026-02-28'); assert.throws(() => G.parseDay('2026-02-29'), /Date/); assert.equal(G.parseDay('2028-02-29'), '2028-02-29'); assert.equal(G.parseDay(''), null);
});
check('ajout : copie, jamais de modification en place ; carburant normalisé ; libellé tronqué', () => {
  const e0 = { ref: { purchasePriceCents: 1 } }, snap = JSON.stringify(e0);
  const e1 = G.addEntry(e0, { date: '2026-01-01', category: 'fuel', amountCents: 100, fuelType: 'inconnu-xyz' }, id('x'));
  assert.equal(JSON.stringify(e0), snap); assert.deepEqual(e1.ref, e0.ref);
  assert.deepEqual(e1.entries[0], { id: id('x'), date: '2026-01-01', category: 'fuel', amountCents: 100, fuelType: 'unknown', fullTank: false });
  const e2 = G.addEntry({}, { date: '2026-01-01', category: 'other', amountCents: 1, note: 'x'.repeat(200) }, id('y'));
  assert.equal(e2.entries[0].note.length, 80); assert.equal('fuelType' in e2.entries[0], false);
});
check('ajout refusé : identifiant en double, champs manquants, plein complet sans litres ou compteur, journal plein', () => {
  const e = build();
  assert.throws(() => G.addEntry(e, { date: '2026-04-01', category: 'other', amountCents: 1 }, id('a')), /Identifiant/);
  assert.throws(() => G.addEntry(e, { date: null, category: 'other', amountCents: 1 }, id('z')), /manquant/);
  assert.throws(() => G.addEntry(e, { date: '2026-04-01', category: 'pizza', amountCents: 1 }, id('z')), /manquant/);
  assert.throws(() => G.addEntry(e, { date: '2026-04-01', category: 'fuel', amountCents: 1, fullTank: true, km: 5 }, id('z')), /Plein complet/);
  let big = {}; for (let i = 0; i < G.MAX_ENTRIES; i++) big = { entries: (big.entries || []).concat([{ id: 'row-' + String(i).padStart(6, '0'), date: '2026-01-01', category: 'other', amountCents: 1 }]) };
  assert.throws(() => G.addEntry(big, { date: '2026-04-01', category: 'other', amountCents: 1 }, id('z')), /Journal plein/);
});
check('bilan : amortissement net de la revente, dépenses par catégorie et par mois, coût déclaré au km', () => {
  const p = G.project(build(), { today: '2026-04-01', currentKm: 103500 });
  assert.equal(p.price, 400000); assert.equal(p.spentCents, 18500); assert.equal(p.entries, 4);
  assert.equal(p.amortized36, Math.round(200000 / 36)); assert.equal(p.amortized60, Math.round(200000 / 60)); assert.equal(p.resaleUsed, true);
  assert.deepEqual(p.byCategory, { fuel: 14000, insurance: 4500 }); assert.deepEqual(p.byMonth, { '2026-02': 14000, '2026-03': 4500 });
  assert.equal(p.distanceKm, 3500); assert.equal(p.costPerKmCents, Math.round(418500 / 3500)); assert.equal(p.days, 81); assert.equal(p.shortHistory, false);
});
check('bilan prudent : sans prix ni compteur, aucun chiffre inventé ; revente supérieure au prix ignorée ; moins de 1 000 km = pas de coût au km', () => {
  const none = G.project({}, { today: '2026-04-01' });
  assert.equal(none.price, null); assert.equal(none.amortized60, null); assert.equal(none.costPerKmCents, null); assert.equal(none.shortHistory, true); assert.equal(none.spentCents, 0);
  const odd = G.project({ ref: { purchasePriceCents: 1000, estimatedResaleCents: 5000 } }); assert.equal(odd.resaleUsed, false); assert.equal(odd.amortized60, Math.round(1000 / 60));
  const near = G.project(build(), { today: '2026-04-01', currentKm: 100500 }); assert.equal(near.costPerKmCents, null);
});
check('carburant : prix moyen sur les seuls tickets avec litres, consommation entre deux pleins complets', () => {
  const p = G.project(build()), f = p.fuel, c = p.consumption;
  assert.equal(f.count, 3); assert.equal(f.measured, 3); assert.equal(f.litres, 83.25); assert.ok(Math.abs(f.euroPerLitre - 14000 * 10 / 83250) < 1e-9);
  assert.equal(G.project(G.addEntry({}, { date: '2026-01-01', category: 'fuel', amountCents: 6000, volumeMl: 35500 }, id('p'))).fuel.euroPerLitre.toFixed(3), '1.690');
  assert.deepEqual({ ...c }, { startDate: '2026-02-01', endDate: '2026-02-20', distanceKm: 1000, litres: 47.75, litresPer100: 4.775, eurosPer100: 8 });
  const noVol = G.addEntry(build(), { date: '2026-03-05', category: 'fuel', amountCents: 2000 }, id('n')), q = G.project(noVol);
  assert.equal(q.fuel.missingVolume, 1); assert.ok(Math.abs(q.fuel.euroPerLitre - f.euroPerLitre) < 1e-12, 'ticket sans litres exclu du prix moyen');
});
check('consommation refusée : un ravitaillement intermédiaire sans volume, deux tickets le même jour, compteur incohérent', () => {
  let e = build(); e.entries = e.entries.map(x => x.id === id('b') ? { ...x, volumeMl: undefined } : x); assert.equal(G.project(e).consumption, null);
  e = build(); e.entries = e.entries.map(x => x.id === id('b') ? { ...x, date: '2026-02-01' } : x); assert.equal(G.project(e).consumption, null);
  e = build(); e.entries = e.entries.map(x => x.id === id('b') ? { ...x, km: 99000 } : x); assert.equal(G.project(e).consumption, null);
});
check('journal : lignes illisibles comptées et exclues, jamais effacées ; doublons d’identifiant ignorés', () => {
  const e = build(), dirty = { ...e, entries: e.entries.concat([null, { id: id('q'), date: 'hier', category: 'fuel', amountCents: 1 }, { ...e.entries[0], amountCents: 1 }]) };
  const j = G.ledger(dirty); assert.equal(j.rows.length, 4); assert.equal(j.invalid, 3); assert.equal(dirty.entries.length, 7);
});
check('retrait : la ligne disparaît et son identifiant est mémorisé ; retrait inconnu refusé', () => {
  const e = build(), r = G.removeEntry(e, id('d'));
  assert.equal(r.entries.length, 3); assert.deepEqual(r.removed, [id('d')]); assert.equal(e.entries.length, 4, 'original intact');
  assert.throws(() => G.removeEntry(r, id('d')), /introuvable/);
  assert.equal(G.ledger({ ...e, removed: [id('a')] }).rows.length, 3, 'une ligne retirée n’est plus comptée même si elle est encore présente');
});
check('fusion PC ↔ iPhone : union par identifiant, aucun ajout perdu, aucun retrait ressuscité, commutative et idempotente', () => {
  const base = build();
  const pc = G.addEntry(base, { date: '2026-03-10', category: 'tolls', amountCents: 850 }, id('pc'));
  const phone = G.removeEntry(G.addEntry(base, { date: '2026-03-11', category: 'fuel', amountCents: 4000, volumeMl: 22000 }, id('ip')), id('b'));
  const ab = G.mergeJournal(pc, phone), ba = G.mergeJournal(phone, pc);
  assert.deepEqual(ab, ba, 'commutative');
  assert.deepEqual(ab.entries.map(x => x.id).sort(), [id('a'), id('c'), id('d'), id('ip'), id('pc')].sort(), 'deux ajouts concurrents gardés, retrait respecté');
  assert.deepEqual(ab.removed, [id('b')]);
  const twin = { entries: [{ ...pc.entries.find(x => x.id === id('pc')), amountCents: 900 }] }; assert.deepEqual(G.mergeJournal(pc, twin), G.mergeJournal(twin, pc), 'même identifiant, contenus différents : même choix des deux côtés');
  assert.deepEqual(G.mergeJournal(ab, ab), ab, 'idempotente'); assert.deepEqual(G.mergeJournal(ab, pc), ab, 'une ancienne copie ne ressuscite rien');
});
console.log(n + '/' + n + ' scénarios OK');
