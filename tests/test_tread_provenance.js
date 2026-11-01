'use strict';
// Provenance de l'historique de profondeur (revue du 01/11/2026) : chaque ligne d'historique porte l'origine choisie À SA SAISIE
// (mesure à la jauge ou estimation), jamais treadEst (qui décrit l'essieu le plus usé) ; treadEst global = origine de l'essieu le
// plus usé, déduite de SA propre dernière ligne ; aucune ligne ancienne réécrite ni perdue. Données 100 % fictives.
// Exécute les vraies fonctions de src/app.js (datedFicheTread, applyTreadWheels) et de src/tyrestate.js.
// Reproducteur : sur un code sans applyTreadWheels (63293a4), la séquence exacte de l'ancien enregistrement est rejouée.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const SOURCES = { 'app.js': read('app.js'), 'tyrestate.js': read('tyrestate.js') };
const fn = (src, name) => { const m = new RegExp('^function ' + name + '\\([^]*?\\n}\\n', 'm').exec(src); return m ? m[0] : ''; };
function runTests(src = SOURCES, options = {}) {
  const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String }; vm.createContext(ctx);
  const lastOdo = /^const lastOdo = .*$/m.exec(src['app.js']);
  vm.runInContext(read('engine.js') + read('tirespecs.js') + src['tyrestate.js'] + '\nvar S = {}, M = {}, UI = { loc: null };\n' +
    (lastOdo ? lastOdo[0] : '') + '\n' + fn(src['app.js'], 'datedFicheTread') + '\n' + fn(src['app.js'], 'applyTreadWheels') +
    `\nthis.save = (car, input, opt) => {
      if (typeof applyTreadWheels === 'function') return applyTreadWheels(car, input, opt);
      // Séquence exacte de l'enregistrement de 63293a4 (avant correction).
      const r = setTreadWheels(car.tire, input, opt); if (r.error) return r; putTreadWheelsRecord(S, car, r.record); datedFicheTread(car, r.axes, opt.date); return r;
    };
    this.X = { treadAxles, tyreState, reset: () => { S = {}; } };`, ctx);
  const plain = v => JSON.parse(JSON.stringify(v));
  let count = 0;
  const test = (name, f) => { try { f(); } catch (e) { e.scenario = name; if (options.collect) { options.collect.push(name + ' · ' + String(e.message).split('\n')[0]); return; } throw e; } count++; if (!options.quiet) console.log('✅ ' + name); };
  const OLD = [{ d: '2026-09-01', mm: 6.5, km: 10000, ax: 'av' }, { d: '2026-09-01', mm: 4.2, km: 10000, ax: 'ar', est: 1 },
    { d: '2026-10-01', mm: 3.6, km: 11000, ax: 'av', pos: 'centre', wheel: 'front-left' }];
  const car = tire => ({ id: 'voitureA', name: 'Voiture fictive', short: 'Fictive', odo: [{ d: '2026-10-29', km: 12000 }],
    tire: { type: 'summer', brand: 'Marque test', model: 'Modèle test', size: '205/55 R16 91V', ...tire } });
  const lines = (c, d) => plain(c.tire.treads.filter(r => r.d === d));

  test('reproducteur · avant 6,0 / arrière 3,0 estimé ; mesure de l’AVANT seul à 5,0 : ligne AV mesurée, AR toujours estimé, verdict sur l’AR à 3,0', () => {
    ctx.X.reset();
    const c = car({ treadAv: 6, treadAr: 3, tread: 3, treadEst: 1, treads: [...plain(OLD), { d: '2026-10-15', mm: 3, km: 11500, ax: 'ar', est: 1 }, { d: '2026-10-15', mm: 6, km: 11500, ax: 'av' }] });
    const r = plain(ctx.save(c, { fl: { side: 5 }, fr: { side: 5.1, mid: 5.2 } }, { date: '2026-10-30', est: false }));
    assert(!r.error, r.error);
    const av = lines(c, '2026-10-30');
    assert.equal(av.length, 1); assert.equal(av[0].ax, 'av'); assert.equal(av[0].mm, 5);
    assert.equal(av[0].est, undefined, 'la ligne de l’avant est une MESURE (origine choisie à la saisie)');
    assert.equal(c.tire.treadEst, 1, 'treadEst global = origine de l’essieu le plus usé (AR, estimé)');
    assert.deepEqual([c.tire.treadAv, c.tire.treadAr], [5, 3]);
    const st = plain(ctx.X.tyreState(c, { today: '2026-10-30' })); assert.equal(st.tread.mm, 3); assert.equal(st.tread.worstAxle, 'ar'); assert.equal(st.tread.est, true);
  });
  test('symétrique · arrière mesuré, avant estimé et plus usé : ligne AR mesurée, treadEst reste estimé (AV)', () => {
    ctx.X.reset();
    const c = car({ treadAv: 3, treadAr: 6, tread: 3, treadEst: 1, treads: [{ d: '2026-10-15', mm: 3, km: 11500, ax: 'av', est: 1 }, { d: '2026-10-15', mm: 6, km: 11500, ax: 'ar' }] });
    ctx.save(c, { rl: { side: 5 }, rr: { mid: 5.4 } }, { date: '2026-10-30', est: false });
    const ar = lines(c, '2026-10-30'); assert.equal(ar.length, 1); assert.equal(ar[0].ax, 'ar'); assert.equal(ar[0].est, undefined);
    assert.equal(c.tire.treadEst, 1); assert.equal(plain(ctx.X.tyreState(c, { today: '2026-10-30' })).tread.mm, 3);
  });
  test('l’essieu mesuré devient le plus usé : treadEst = 0, déduit de sa propre ligne', () => {
    ctx.X.reset();
    const c = car({ treadAv: 6, treadAr: 3, tread: 3, treadEst: 1, treads: [{ d: '2026-10-15', mm: 3, km: 11500, ax: 'ar', est: 1 }] });
    ctx.save(c, { fl: { side: 2 } }, { date: '2026-10-30', est: false });
    assert.equal(c.tire.treadEst, 0); assert.equal(lines(c, '2026-10-30')[0].est, undefined); assert.equal(ctx.X.treadAxles(c.tire).worst, 2);
  });
  test('estimation saisie : la ligne porte « estimé » même si l’essieu le plus usé est mesuré', () => {
    ctx.X.reset();
    const c = car({ treadAv: 6, treadAr: 3, tread: 3, treadEst: 0, treads: [{ d: '2026-10-15', mm: 3, km: 11500, ax: 'ar' }] });
    ctx.save(c, { fl: { side: 5 } }, { date: '2026-10-30', est: true });
    assert.equal(lines(c, '2026-10-30')[0].est, 1); assert.equal(c.tire.treadEst, 0, 'AR mesuré et toujours le plus usé');
  });
  test('treadEst déduit de la dernière ligne de l’essieu le plus usé, même si le statut global antérieur était incohérent', () => {
    ctx.X.reset();
    // AR le plus usé, dernière ligne AR = MESURE ; treadEst resté à 1 (vestige de l'ancien défaut) ; mesure de l'AV seul.
    const c = car({ treadAv: 6, treadAr: 3, tread: 3, treadEst: 1, treads: [{ d: '2026-10-01', mm: 3, km: 11000, ax: 'ar', est: 1 }, { d: '2026-10-20', mm: 3, km: 11800, ax: 'ar' }] });
    ctx.save(c, { fl: { side: 5 } }, { date: '2026-10-30', est: false });
    assert.equal(c.tire.treadEst, 0, 'origine de la dernière ligne AR (mesure)');
    // À l'inverse, AV plus usé mais estimé : une ligne AR mesurée ne rend pas l'ensemble « mesuré ».
    ctx.X.reset();
    const d = car({ treadAv: 3, treadAr: 6, tread: 3, treadEst: 0, treads: [{ d: '2026-10-20', mm: 3, km: 11800, ax: 'av', est: 1 }] });
    ctx.save(d, { rl: { side: 5 } }, { date: '2026-10-30', est: false });
    assert.equal(d.tire.treadEst, 1, 'origine de la dernière ligne AV (estimation)');
    // La ligne d'un AUTRE essieu, même de valeur égale et plus récente, ne décide jamais de l'origine de l'essieu le plus usé.
    ctx.X.reset();
    const e = car({ treadAv: 6, treadAr: 3, tread: 3, treadEst: 0, treads: [{ d: '2026-10-20', mm: 3, km: 11800, ax: 'ar' }, { d: '2026-10-25', mm: 3, km: 11900, ax: 'av', est: 1 }] });
    ctx.save(e, { fl: { side: 5.5 } }, { date: '2026-10-30', est: false });
    assert.equal(e.tire.treadEst, 0, 'origine de la dernière ligne AR, pas de la ligne AV du 25/10');
  });
  test('historique ancien chargé avant la saisie : aucune ligne réécrite ni perdue, seule la nouvelle ligne est ajoutée', () => {
    ctx.X.reset();
    const before = plain(OLD), c = car({ treadAv: 6.5, treadAr: 4.2, tread: 4.2, treadEst: 1, treads: plain(OLD) });
    ctx.save(c, { fl: { side: 5 }, fr: { side: 5 }, rl: { side: 4 }, rr: { side: 4.1 } }, { date: '2026-10-30', est: false });
    assert.deepEqual(plain(c.tire.treads.slice(0, before.length)), before, 'lignes anciennes identiques, dans le même ordre');
    const added = plain(c.tire.treads.slice(before.length));
    assert.deepEqual(added.map(r => [r.d, r.ax, r.mm, r.est]), [['2026-10-30', 'av', 5, undefined], ['2026-10-30', 'ar', 4, undefined]]);
    assert.equal(c.tire.treadEst, 0);
  });
  return count;
}
module.exports = { runTests, SOURCES };
if (require.main === module) {
  if (process.env.REPRO) {
    const { execSync } = require('child_process'), at = f => execSync(`git show ${process.env.REPRO}:src/${f}`, { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 64e6 });
    const red = [], n = runTests({ 'app.js': at('app.js'), 'tyrestate.js': at('tyrestate.js') }, { collect: red });
    red.forEach(r => console.log('❌ ' + r)); console.log(`Reproducteur sur ${process.env.REPRO} : ${n} conforme(s), ${red.length} constat(s).`); process.exit(0);
  }
  const count = runTests();
  const mutations = [
    { file: 'app.js', name: 'origine de la ligne reprise de treadEst', from: '...((typeof est === \'boolean\' ? est : car.tire.treadEst) ? { est: 1 } : {})', to: '...(car.tire.treadEst ? { est: 1 } : {})' },
    { file: 'app.js', name: 'origine choisie non transmise à l’historique', from: 'datedFicheTread(car, r.axes, date, est === true)', to: 'datedFicheTread(car, r.axes, date)' },
    { file: 'app.js', name: 'treadEst non déduit de la dernière ligne de l’essieu le plus usé', from: 'const o = treadEstFromHistory(car.tire); if (o != null) car.tire.treadEst = o;', to: '' },
    { file: 'tyrestate.js', name: 'treadEst déduit de la dernière ligne de n’importe quel essieu', from: "const axes = tx.ax ? [tx.ax] : ['av', 'ar'];", to: "const axes = ['av', 'ar'];" },
    { file: 'app.js', name: 'lignes anciennes du même essieu remplacées', from: 'r.d === today && r.ax === ax && !r.pos && !r.wheel', to: 'r.ax === ax && !r.pos && !r.wheel' }
  ];
  for (const m of mutations) {
    const src = { ...SOURCES }; assert(src[m.file].includes(m.from), 'Mutation introuvable : ' + m.name);
    src[m.file] = src[m.file].replace(m.from, m.to);
    let rej; try { runTests(src, { quiet: true }); } catch (e) { rej = e; }
    assert(rej && rej.scenario, 'La mutation doit être rejetée : ' + m.name + (rej ? ' (' + rej.message + ')' : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rej.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
