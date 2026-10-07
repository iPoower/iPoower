// État pneumatique unique (onglet Pneus = source de vérité) relié au moteur Analyse : cas A–K demandés, puis contre-tests.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const sourcePath = path.join(__dirname, '../src/tyrestate.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(['engine.js', 'tirespecs.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n') + source + fs.readFileSync(path.join(__dirname, '../src/tyrelab.js'), 'utf8') + '\nthis.ts = tyreState; this.valid = tyreMemoryValid; this.lab = tyreLab; this.mount = confirmWinterMount; this.switchTire = switchTire; this.setAx = setTreadAxle; this.axles = treadAxles;', ctx);
  const plain = v => JSON.parse(JSON.stringify(v)), TS = (c, o) => plain(ctx.ts(plain(c), o)), today = '2026-10-06';
  const H = (b = {}) => Array.from({ length: 40 }, (_, k) => ({ t: new Date(Date.parse('2026-10-05T18:00:00Z') + k * 36e5).toISOString().slice(0, 16), T: 12, Tr: 12, RH: 70, P: 0, Pl: 0, gust: 15, rad: 0, ice: { level: 0 }, ...b }));
  const car = (tire = {}, extra = {}) => ({ id: 'carA', name: 'Voiture test', odo: [{ d: '2026-10-01', km: 23400 }], ...extra,
    tire: { type: 'summer', brand: 'Michelin', model: 'Pilot Sport 4S', size: '215/40 ZR18 89Y XL', tread: 6.4, treads: [{ d: '2026-09-20', mm: 6.4, km: 23000 }], press: '2,3 AV / 2,3 AR',
      pchk: { date: '2026-10-01', T: 14 }, dot: '1825', mounted: '2026-04-01', mountKm: 18000, ...tire } });
  const analyse = (c, b = {}) => { const st = ctx.ts(plain(c), { today }); return plain(ctx.lab({ now: '2026-10-06T08:00', car: plain(c), hours: H(b), state: st, drive: { active: true, since: '2026-10-06T07:30', kind: 'autoroute' } })); };
  let count = 0;
  const test = (name, fn) => { try { fn(); } catch (e) { e.scenario = name; throw e; } count++; if (!options.quiet) console.log('✅ ' + name); };

  test('A · profondeur modifiée dans Pneus → aquaplaning et freinage pluie recalculés', () => {
    const rain = { P: 1, Pl: 1 }, a = analyse(car({ tread: 6.4 }), rain), b = analyse(car({ tread: 2.4 }), rain);
    assert(b.grip.aqua.lv > a.grip.aqua.lv, `${a.grip.aqua.lv} → ${b.grip.aqua.lv}`); assert(b.grip.mu < a.grip.mu);
    assert.equal(TS(car({ tread: 4.8 }), { today }).tread.mm, 4.8); assert.equal(TS(car({ tread: 4.8 }), { today }).tread.src, 'USER_MEASURED');
  });
  test('B · pression cible modifiée → estimation à froid et alerte de sous-gonflage recalculées', () => {
    const a = analyse(car({ press: '2,3', pchk: { date: '2026-10-01', T: 14 } }), { T: 2, Tr: 2 }), b = analyse(car({ press: '2,6', pchk: { date: '2026-10-01', T: 30 } }), { T: 2, Tr: 2 });
    assert.notEqual(a.press.cold, b.press.cold); assert.equal(b.press.low, true);
  });
  test('C · jeu été → jeu hiver : autre modèle thermique (fenêtres de la saison)', () => {
    const s = analyse(car(), { T: 3, Tr: 3 }), w = analyse(car({ type: 'winter', brand: 'Marque test', model: 'Hiver test', size: '215/40 R18 89V' }), { T: 3, Tr: 3 });
    assert.notDeepEqual(s.thermal.win, w.thermal.win); assert.equal(w.tyre.season, 'hiver');
  });
  test('D · DOT modifié → âge mis à jour (fabrication ≠ montage), aucune formule d’adhérence', () => {
    const a = TS(car({ dot: '1825' }), { today }), b = TS(car({ dot: '1015' }), { today });
    assert.equal(a.dot.week, 18); assert.equal(a.dot.year, 2025); assert(a.dot.ageY > 1.3 && a.dot.ageY < 1.5); assert.match(a.dot.txt, /fabrication semaine 18 \/ 2025 · ≈ 1 an 5 mois/);
    assert(b.dot.ageY > 11); assert(b.maint.some(m => /plus de 10 ans/.test(m.text)));
    assert(a.mount.serviceY < 0.6, 'âge d’usage distinct de l’âge de fabrication');
    const g1 = analyse(car({ dot: '1825' })), g2 = analyse(car({ dot: '1015' }));
    assert.equal(g1.grip.mu, g2.grip.mu);   // l'âge nourrit la surveillance et la confiance, pas une pénalité inventée
  });
  test('E · données absentes : confiance réduite, rien d’inventé', () => {
    const full = analyse(car()), poor = analyse(car({ tread: null, treads: [], dot: '', pchk: { date: '', T: null }, brand: '', model: '' }));
    assert(poor.confidence.score < full.confidence.score); const st = TS(car({ tread: null, treads: [], dot: '' }), { today });
    assert.equal(st.tread.mm, null); assert.equal(st.tread.src, null); assert.equal(st.dot, null); assert(st.quality.find(q => q.k === 'Profondeur').st === '⚪');
  });
  test('F · Analyse utilise automatiquement la monte active (car.tire)', () => {
    const r = analyse(car()); assert.equal(r.tyre.title, 'Michelin Pilot Sport 4S'); assert.equal(r.state.active.type, 'summer');
  });
  test('G · un jeu stocké n’est jamais analysé', () => {
    const c = car({}, { sets: { summer: { brand: 'Ancien', model: 'Copie été', size: '215/40 R18' }, winter: { brand: 'Stock', model: 'Hiver rangé', size: '205/55 R16' } } }), r = analyse(c), st = TS(c, { today });
    assert.equal(r.tyre.title, 'Michelin Pilot Sport 4S'); assert.deepEqual(st.stored.map(x => x.title), ['Stock Hiver rangé']); assert(!JSON.stringify(r.thermal).includes('Hiver rangé'));
  });
  test('J · changement de monte : l’ancienne mémoire thermique est invalidée', () => {
    const s = TS(car(), { today }), w = TS(car({ type: 'winter', brand: 'Marque test', model: 'Hiver test' }), { today });
    assert.equal(ctx.valid({ at: '2026-10-06T07:50', T: 40, sig: s.sig }, s), true); assert.equal(ctx.valid({ at: '2026-10-06T07:50', T: 40, sig: s.sig }, w), false);
    assert.equal(ctx.valid({ at: '2026-10-06T07:50', T: 40 }, s), false);   // ancienne mémoire sans identité de monte : ignorée (prudent)
    assert.equal(TS(car({ tread: 3 }), { today }).sig, s.sig);   // une nouvelle mesure ne change pas la monte
  });
  test('K · avant / arrière distingués quand les pressions diffèrent, sans différence inventée', () => {
    const st = TS(car({ press: '2,3 AV / 2,6 AR' }), { today });
    assert.equal(st.axles.front.press, 2.3); assert.equal(st.axles.rear.press, 2.6); assert.equal(st.axles.differ, true); assert.equal(st.axles.front.tread, st.axles.rear.tread);
  });
  test('fraîcheur par type : pression vieillit vite, profondeur lentement, DOT permanent', () => {
    const old = TS(car({ pchk: { date: '2026-08-01', T: 20 }, treads: [{ d: '2025-12-01', mm: 6.4, km: 20000 }] }), { today });
    assert.equal(old.pressure.check.fresh, 'stale'); assert.equal(old.tread.fresh, 'stale'); assert(old.maint.some(m => /Pression à contrôler/.test(m.text)));
    const r = analyse(car({ pchk: { date: '2026-08-01', T: 20 } }));
    assert(r.confidence.reasons.some(x => /Pression contrôlée il y a 66 j/.test(x)));
  });
  test('kilométrage du jeu et usure : seulement avec les données nécessaires', () => {
    const st = TS(car(), { today }); assert.equal(st.mount.kmSince, 5400); assert.equal(st.tread.rate, null);
    const two = TS(car({ treads: [{ d: '2026-05-01', mm: 7.8, km: 18500 }, { d: '2026-09-20', mm: 6.4, km: 23000 }] }), { today });
    assert(Math.abs(two.tread.rate - 0.311) < 0.01, String(two.tread.rate));
    assert.equal(TS(car({ mountKm: null }), { today }).mount.kmSince, null);
  });
  test('profil technique : fiche constructeur ou profil générique déclaré', () => {
    assert.equal(TS(car(), { today }).profile.kind, 'manufacturer-specific');
    assert.equal(TS(car({ brand: 'Inconnue', model: 'X' }), { today }).profile.label, 'profil générique été haute performance');
  });
  test('monte inconnue : pas d’état actif inventé', () => {
    const st = TS(car({ type: 'unknown' }), { today }); assert.equal(st.known, false); assert.equal(st.active, null);
  });
  test('montage confirmé : jeu démonté archivé, hiver stocké repris, mesures et pression jamais inventées', () => {
    const c = car({}, { plan: { on: 1, brand: 'Goodyear', model: 'UltraGrip Performance 3', date: '2026-11-26' },
      sets: { winter: { brand: 'Goodyear', model: 'UltraGrip Performance 3', size: '215/40 R18 89V', dot: '1825', tread: 6.9,
        treads: [{ d: '2026-03-01', mm: 6.9, km: 12000 }], mounted: '2025-11-01', mountKm: 9000, lastRot: 10000, pchk: { date: '2026-03-01', T: 10 } } } });
    const before = plain(c), r = plain(ctx.mount(c, { date: today, km: '25000', today }));
    assert.deepEqual(c, before); assert(!r.error); assert.equal(r.car.tire.type, 'winter');
    for (const k of ['brand','model','size','dot','tread','treads','mounted','mountKm','lastRot','pchk']) assert.deepEqual(r.car.sets.summer[k], before.tire[k] ?? null);
    assert.equal(r.car.tire.dot, '1825'); assert.equal(r.car.tire.tread, 6.9); assert.deepEqual(r.car.tire.treads, c.sets.winter.treads);
    assert.equal(r.car.tire.mounted, today); assert.equal(r.car.tire.mountKm, 25000); assert.equal(r.car.tire.lastRot, null);
    assert.deepEqual(r.car.tire.pchk, { date: '', T: null }); assert.equal(r.car.plan.on, 0); assert.equal(r.car.plan.date, '2026-11-26');
    assert.equal(TS(r.car, { today }).mount.kmSince, 0);
    assert.equal(ctx.valid({ sig: TS(c, { today }).sig, T: 40 }, ctx.ts(r.car, { today })), false);
    ctx.switchTire(r.car, 'summer'); for (const k of ['tread','treads','pchk','dot','mounted','mountKm']) assert.deepEqual(r.car.tire[k], before.tire[k]);
  });
  test('montage prévu : références reprises, compteur vide inconnu, aucun relevé ou profondeur fabriqué', () => {
    const c = car({}, { plan: { on: 1, brand: 'Goodyear', model: 'UltraGrip Performance 3', size: '215/40 R18 89V', date: '2026-11-26' } });
    const r = plain(ctx.mount(c, { date: today, km: '', today }));
    assert.equal(r.car.tire.model, c.plan.model); assert.equal(r.car.tire.size, c.plan.size); assert.equal(r.car.tire.tread, null);
    assert.equal(r.car.tire.mountKm, null); assert.deepEqual(r.car.odo, c.odo); assert.equal(TS(r.car, { today }).mount.kmSince, null);
    const z = plain(ctx.mount(car({}, { odo: [], plan: { on: 1 } }), { date: today, km: '0', today })); assert.equal(z.car.tire.mountKm, 0);
  });
  test('montage : date future, impossible ou vide, compteur incohérent, et double validation refusés sans mutation', () => {
    const c = car({}, { plan: { on: 1 } }), before = plain(c);
    for (const v of [{ date: '2026-10-07', km: '25000' }, { date: '2026-02-30', km: '' }, { date: '', km: '' },
      { date: today, km: '-1' }, { date: today, km: '25000.5' }, { date: today, km: 'abc' }, { date: today, km: '23000' }]) {
      assert(ctx.mount(c, { ...v, today }).error, JSON.stringify(v)); assert.deepEqual(c, before);
    }
    const mounted = ctx.mount(c, { date: today, km: '25000', today }).car;
    assert(ctx.mount(mounted, { date: today, km: '25000', today }).error);
  });
  test('montage daté après coup : compteur encadré par les relevés avant et après', () => {
    const c = car({}, { plan: { on: 1 }, odo: [{ d: '2026-10-01', km: 100 }, { d: '2026-10-05', km: 200 }] });
    const good = plain(ctx.mount(c, { date: '2026-10-03', km: '150', today })); assert(!good.error); assert.equal(TS(good.car, { today }).mount.kmSince, 50);
    for (const km of ['90', '201']) assert(ctx.mount(c, { date: '2026-10-03', km, today }).error);
  });
  test('L · profondeur par essieu : AV 2,3 / AR 5,5 → calculs sur l’essieu le plus usé, essieux distincts, jamais une moyenne', () => {
    const st = TS(car({ treadAv: 2.3, treadAr: 5.5 }), { today });
    assert.equal(st.tread.mm, 2.3); assert.equal(st.tread.worstAxle, 'av'); assert.equal(st.axles.front.tread, 2.3); assert.equal(st.axles.rear.tread, 5.5);
    assert.equal(st.axles.treadDiffer, true); assert.match(st.quality.find(q => q.k === 'Profondeur').txt, /AV 2,3 \/ AR 5,5 mm/);
    const rain = { P: 1, Pl: 1 }, split = analyse(car({ treadAv: 2.3, treadAr: 5.5 }), rain), worn = analyse(car({ tread: 2.3 }), rain), good = analyse(car({ tread: 5.5 }), rain);
    assert.equal(split.grip.aqua.lv, worn.grip.aqua.lv); assert(split.grip.aqua.lv > good.grip.aqua.lv, `${good.grip.aqua.lv} → ${split.grip.aqua.lv}`);
    const rev = TS(car({ treadAv: 6, treadAr: 2.9 }), { today }); assert.equal(rev.tread.mm, 2.9); assert.equal(rev.tread.worstAxle, 'ar');
  });
  test('M · saisie d’un essieu : l’autre garde l’ancienne profondeur commune ; un essieu jamais connu reste inconnu', () => {
    const t = { tread: 2.3 }; ctx.setAx(t, 'av', 4); assert.equal(t.treadAv, 4); assert.equal(t.treadAr, 2.3); assert.equal(t.tread, 2.3);
    ctx.setAx(t, 'ar', 6); assert.equal(t.tread, 4); ctx.setAx(t, 'both', 7.5); assert.deepEqual([t.treadAv, t.treadAr, t.tread], [7.5, 7.5, 7.5]);
    const u = { tread: null }; ctx.setAx(u, 'av', 3); assert.equal(u.treadAr, null); assert.equal(u.tread, 3);
    assert.equal(TS(car({ tread: 3, treadAv: 3, treadAr: null }), { today }).axles.rear.tread, null);
    const v = { treadAv: 3, treadAr: null, tread: 3 }; ctx.setAx(v, 'av', null); assert.equal(v.tread, null);
    const legacy = TS(car({ tread: 4.1 }), { today }); assert.equal(legacy.tread.split, false); assert.equal(legacy.axles.front.tread, 4.1); assert.equal(legacy.axles.rear.tread, 4.1);
  });
  test('N · profondeur estimée : provenance USER_ESTIMATED, qualité 🟡, mesure à la jauge demandée, confiance réduite', () => {
    const e = TS(car({ treadAv: 2.3, treadAr: 5, treadEst: 1 }), { today }), m = TS(car({ treadAv: 2.3, treadAr: 5, treadEst: 0 }), { today });
    assert.equal(e.tread.src, 'USER_ESTIMATED'); assert.equal(e.tread.est, true); assert.equal(m.tread.src, 'USER_MEASURED');
    const q = e.quality.find(x => x.k === 'Profondeur'); assert.equal(q.st, '🟡'); assert.match(q.txt, /estimée/);
    assert(e.maint.some(x => /jauge/.test(x.text))); assert(!m.maint.some(x => /jauge/.test(x.text)));
    const ae = analyse(car({ treadAv: 2.3, treadAr: 5, treadEst: 1 })), am = analyse(car({ treadAv: 2.3, treadAr: 5, treadEst: 0 }));
    assert(ae.confidence.score < am.confidence.score); assert(ae.confidence.reasons.some(r => /estimée/.test(r)));
    assert.equal(TS(car({ tread: null, treads: [], treadEst: 1 }), { today }).tread.src, null);   // rien saisi : ni mesurée ni estimée
  });
  test('O · tendance d’usure : mesures réelles du même essieu seulement (ni estimation, ni autre essieu)', () => {
    const base = { treadAv: 5, treadAr: 7 };
    const withEst = TS(car({ ...base, treads: [{ d: '2026-05-01', mm: 8, km: 18000, est: 1 }, { d: '2026-09-20', mm: 5, km: 23000, ax: 'av' }] }), { today });
    assert.equal(withEst.tread.rate, null);
    const otherAxle = TS(car({ ...base, treads: [{ d: '2026-05-01', mm: 8, km: 18000, ax: 'ar' }, { d: '2026-09-20', mm: 5, km: 23000, ax: 'av' }] }), { today });
    assert.equal(otherAxle.tread.rate, null);
    const same = TS(car({ ...base, treads: [{ d: '2026-05-01', mm: 6, km: 18000, ax: 'av' }, { d: '2026-09-20', mm: 5, km: 23000, ax: 'av' }] }), { today });
    assert(Math.abs(same.tread.rate - 0.2) < 0.01, String(same.tread.rate));
  });
  test('P · changement de jeu : les profondeurs par essieu et leur origine restent avec leur jeu', () => {
    const c = car({ treadAv: 2.3, treadAr: 5, treadEst: 1 }, { plan: { on: 1, brand: 'Goodyear', model: 'UltraGrip Performance 3', size: '215/40 R18 89V' } });
    ctx.switchTire(c, 'winter'); assert.equal(c.tire.treadAv, undefined); assert.equal(TS(c, { today }).tread.mm, null);
    ctx.switchTire(c, 'summer'); assert.deepEqual([c.tire.treadAv, c.tire.treadAr, c.tire.treadEst], [2.3, 5, 1]);
  });
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) {
  const original = fs.readFileSync(sourcePath, 'utf8'), count = runTests(original);
  const mutations = [
    { name: 'mémoire thermique gardée après changement de monte', from: 'rec.sig == null ? false : rec.sig === state.sig', to: 'true' },
    { name: 'profondeur inventée quand absente', from: "num(t.tread) ?? (last ? num(last.mm) : null);", to: "num(t.tread) ?? (last ? num(last.mm) : 7);" },
    { name: 'moyenne des essieux au lieu du plus usé', from: 'Math.min(av, ar)', to: '(av + ar) / 2' },
    { name: 'estimation présentée comme une mesure', from: "(est ? 'USER_ESTIMATED' : 'USER_MEASURED')", to: "'USER_MEASURED'" },
    { name: 'tendance calculée sur des estimations', from: 'num(x.km) != null && !x.est &&', to: 'num(x.km) != null &&' },
    { name: 'essieu jamais saisi inventé', from: 'if (t[o] == null && legacy != null) t[o] = legacy;', to: 'if (t[o] == null) t[o] = legacy ?? 8;' },
    { name: 'jeu stocké pris pour la monte active', from: "k !== type && v &&", to: "v &&" },
    { name: 'tendance d’usure extrapolée depuis une seule mesure', from: 'if (withKm.length >= 2) {', to: 'if (withKm.length === 1) rate = 0.5; if (withKm.length >= 2) {' }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    let rej; try { runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rej = e; }
    assert(rej && rej.scenario, 'La mutation doit être rejetée : ' + m.name + (rej ? ' (' + rej.message + ')' : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rej.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
