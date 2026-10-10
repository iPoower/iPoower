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
  vm.createContext(ctx); vm.runInContext(engine + '\n' + source + '\n' + view + '\nthis.state=tyreState;this.wear=wearInfo;this.line=wearLine;this.setAx=setTreadAxle;', ctx);
  const start = app.indexOf("    if (a === 'tread-add') { const input ="), end = app.indexOf("    if (a === 'rot')", start);
  assert(start >= 0 && end > start, 'le vrai handler de profondeur doit être testé');
  vm.runInContext(`this.readDepth = (c, mm, ax, est) => {
    const a = 'tread-add', i = 0, today = '2026-10-10';
    const inputs = { '#trd-0': { value: String(mm) }, '#trdax-0': { value: ax }, '#trdest-0': { value: est ? '1' : '0' } }, $ = id => inputs[id];
    ${app.slice(start, end)}
    return tyreState(c, { today });
  };`, ctx);
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
  const fresh = () => car(2000, { tread: 6.4, treads: [], treadAv: null, treadAr: null, treadEst: 0 });
  test('avant estimé puis arrière mesuré : estimation du plus usé, avertissement et qualité conservés', () => {
    const c = fresh(); ctx.readDepth(c, 2.3, 'av', true); const s = ctx.readDepth(c, 6.5, 'ar', false);
    assert.equal(s.tread.mm, 2.3); assert.equal(s.tread.est, true); assert.equal(s.tread.src, 'USER_ESTIMATED');
    assert.equal(s.quality.find(q => q.k === 'Profondeur').st, '🟡'); assert(s.maint.some(m => /jauge/.test(m.text)));
    assert.equal(c.tire.treads[0].est, 1); assert.equal(c.tire.treads[1].est, undefined);
  });
  test('arrière estimé puis avant mesuré : même règle symétrique', () => {
    const c = fresh(); ctx.readDepth(c, 2.3, 'ar', true); const s = ctx.readDepth(c, 6.5, 'av', false);
    assert.equal(s.tread.worstAxle, 'ar'); assert.equal(s.tread.est, true);
  });
  test('essieu le plus usé mesuré : une estimation de l’autre ne change pas sa provenance', () => {
    const c = fresh(); ctx.readDepth(c, 2.3, 'av', false); const s = ctx.readDepth(c, 6.5, 'ar', true);
    assert.equal(s.tread.est, false); assert.equal(s.tread.src, 'USER_MEASURED');
  });
  test('nouvel essieu le plus usé : sa propre origine connue est retrouvée', () => {
    const c = fresh(); ctx.readDepth(c, 3, 'ar', true); ctx.readDepth(c, 2.3, 'av', false);
    const s = ctx.readDepth(c, 5, 'av', false); assert.equal(s.tread.worstAxle, 'ar'); assert.equal(s.tread.est, true);
  });
  test('essieux égaux : une mesure isolée ne transforme pas l’autre estimation en mesure', () => {
    const c = fresh(); ctx.readDepth(c, 3, 'av', true); assert.equal(ctx.readDepth(c, 3, 'ar', false).tread.est, true);
    assert.equal(ctx.readDepth(c, 3, 'both', false).tread.est, false);
  });
  test('correction manuelle de l’origine et ancienne API restent respectées sans réécrire l’historique', () => {
    const c = fresh(); ctx.readDepth(c, 2.3, 'av', true); c.tire.treadEst = 0;
    assert.equal(ctx.readDepth(c, 6.5, 'ar', false).tread.est, false);
    const before = JSON.stringify(c.tire.treads); c.tire.treadEst = 1; ctx.setAx(c.tire, 'av', 2.4);
    assert.equal(c.tire.treadEst, 1); assert.equal(JSON.stringify(c.tire.treads), before);
  });
  test('essieux égaux : un choix manuel global reste prioritaire sur l’ancien relevé', () => {
    for (const estimated of [false, true]) {
      const c = fresh(); ctx.readDepth(c, 6.5, 'both', !estimated); c.tire.treadEst = estimated ? 1 : 0;
      assert.equal(ctx.readDepth(c, 7, 'ar', false).tread.est, estimated);
    }
  });
  return n;
}
const count = run();
const mutations = [
  ['projection sous 1 000 km', 'b.km - a.km >= 1000', 'b.km - a.km >= 100'],
  ['mesure arrière rajeunissant l’avant', 'last = history.last, mm =', 'last = hist[hist.length - 1] || null, mm ='],
  ['pente calculée entre deux essieux', '!mixedAxles && b.km', 'b.km'],
  ['chaînes non normalisées', 'mm: num(x.mm), km: num(x.km)', 'mm: x.mm, km: x.km'],
  ['origine remplacée par celle de l’autre essieu', 'x.ax ? keptEst : est || keptEst', 'x.ax ? est : est'],
  ['choix manuel écrasé après égalité des essieux', 'before.ax && before.ax !== x.ax', 'before.ax !== x.ax']
];
for (const [label, from, to] of mutations) {
  assert(domain.includes(from), 'Mutation introuvable : ' + label);
  assert.throws(() => run(domain.replace(from, to), true), 'Régression non détectée : ' + label);
  console.log('✅ Régression rejetée : ' + label);
}
console.log(count + '/' + count + ' scénarios OK · ' + mutations.length + '/' + mutations.length + ' mutations rejetées');
