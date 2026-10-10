// Les cartes et le domaine doivent lire la même tendance ; aucune donnée réelle.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const domain = fs.readFileSync(path.join(root, 'src/tyrestate.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const view = app.slice(app.indexOf('const lastOdo = car'), app.indexOf('function tireExtra'));
const engine = fs.readFileSync(path.join(root, 'src/engine.js'), 'utf8');
function run(source = domain, quiet = false) {
  const ctx = { Intl, esc: String, f1: x => Number(x).toFixed(1).replace('.', ','), fmtDay: String };
  vm.createContext(ctx); vm.runInContext(engine + '\n' + source + '\n' + view + '\nthis.state=tyreState;this.wear=wearInfo;this.line=wearLine;', ctx);
  const car = (span, tire = {}, extra = {}) => ({ tire: { type: 'summer', tread: 6.3,
    treads: [{ d: '2026-09-01', km: 20000, mm: 6.4 }, { d: '2026-10-01', km: 20000 + span, mm: 6.3 }], ...tire }, ...extra });
  let n = 0;
  function test(label, fn) { fn(); n++; if (!quiet) console.log('✅ ' + label); }
  test('100 et 999 km : aucune projection dans le domaine ni dans la carte', () => {
    for (const span of [0, 100, 999]) {
      const c = car(span), before = JSON.stringify(c);
      assert.equal(ctx.state(c).tread.rate, null); assert.equal(ctx.wear(c).rate ?? null, null);
      assert.doesNotMatch(ctx.line(c), /mm \/ 1 000 km|mm vers/); assert.equal(JSON.stringify(c), before);
    }
  });
  test('exactement 1 000 km : même taux et projection mathématique', () => {
    const c = car(1000), w = ctx.wear(c);
    assert.equal(w.rate, ctx.state(c).tread.rate); assert(Math.abs(w.rate - 0.1) < 1e-10);
    assert(Math.abs(w.kmThr - 54000) < 1e-6); assert(Math.abs(w.kmLegal - 68000) < 1e-6);
  });
  test('hiver : seuil de projection de 4 mm, été et 4 saisons de 3 mm', () => {
    for (const [type, threshold] of [['summer', 3], ['allseason', 3], ['winter', 4]]) {
      const c = car(1000, { type }), w = ctx.wear(c);
      assert.equal(w.thr, threshold); assert(Math.abs(w.kmThr - (21000 + (6.3 - threshold) / w.rate * 1000)) < 1e-6);
    }
  });
  test('estimations, profondeur stable ou croissante : aucun taux inventé', () => {
    for (const treads of [[], [{ d: '2026-10-01', km: 21000, mm: 6.3 }],
      [{ km: 20000, mm: 6.4, est: 1 }, { km: 22000, mm: 6.3 }],
      [{ km: 20000, mm: 6.3 }, { km: 22000, mm: 6.3 }],
      [{ km: 20000, mm: 6.2 }, { km: 22000, mm: 6.3 }]]) {
      const c = car(1000, { treads }); assert.equal(ctx.state(c).tread.rate, null); assert.equal(ctx.wear(c).rate ?? null, null);
    }
  });
  test('essieu le plus usé : une mesure arrière récente ne rafraîchit pas l’avant', () => {
    const c = car(1000, { treadAv: 5, treadAr: 7, tread: 5, treads: [
      { d: '2026-01-01', km: 20000, mm: 6, ax: 'av' }, { d: '2026-02-01', km: 22000, mm: 5, ax: 'av' },
      { d: '2026-10-01', km: 23000, mm: 7, ax: 'ar' }] });
    const s = ctx.state(c, { today: '2026-10-10' }), w = ctx.wear(c);
    assert.equal(s.tread.date, '2026-02-01'); assert.equal(s.tread.fresh, 'stale');
    assert.equal(w.last.mm, 5); assert.equal(w.rate, s.tread.rate);
    assert.match(ctx.line(c), /Profondeur <b>5,0 mm/);
  });
  test('essieux égaux : jamais une pente entre une mesure AV et une mesure AR', () => {
    const c = car(2000, { treadAv: 6, treadAr: 6, tread: 6, treads: [
      { d: '2026-09-01', km: 20000, mm: 7, ax: 'av' }, { d: '2026-10-01', km: 22000, mm: 6, ax: 'ar' }] });
    assert.equal(ctx.state(c).tread.rate, null); assert.equal(ctx.wear(c).rate ?? null, null);
  });
  test('ancien relevé des deux essieux et nouveau relevé AV : compatible', () => {
    const c = car(2000, { treadAv: 6, treadAr: 7, treads: [{ km: 20000, mm: 7 }, { km: 22000, mm: 6, ax: 'av' }] });
    assert.equal(ctx.state(c).tread.rate, 0.5); assert.equal(ctx.wear(c).rate, 0.5);
  });
  test('kilomètres et profondeurs anciens en chaînes : projection numérique, jamais concaténée', () => {
    const c = car(2000, { treads: [{ km: '20000', mm: '7,0' }, { km: '22000', mm: '6,0' }] });
    const w = ctx.wear(c); assert.equal(w.rate, 0.5); assert.equal(w.kmThr, 28000); assert(Number.isFinite(w.kmLegal));
  });
  return n;
}
const count = run();
const mutations = [
  ['projection sous 1 000 km', 'b.km - a.km >= 1000', 'b.km - a.km >= 100'],
  ['mesure arrière rajeunissant l’avant', 'last = history.last, mm =', 'last = hist[hist.length - 1] || null, mm ='],
  ['pente calculée entre deux essieux', '!mixedAxles && b.km', 'b.km'],
  ['chaînes non normalisées', 'mm: num(x.mm), km: num(x.km)', 'mm: x.mm, km: x.km']
];
for (const [label, from, to] of mutations) {
  assert(domain.includes(from), 'Mutation introuvable : ' + label);
  assert.throws(() => run(domain.replace(from, to), true), 'Régression non détectée : ' + label);
  console.log('✅ Régression rejetée : ' + label);
}
console.log(count + '/' + count + ' scénarios OK · ' + mutations.length + '/' + mutations.length + ' mutations rejetées');
