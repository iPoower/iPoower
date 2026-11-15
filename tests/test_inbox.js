// Boîte de dépôt (saisies préparées par Claude, collées puis validées par Bryan) : lecture stricte d'un texte NON FIABLE,
// application sur une copie seulement, doublons détectés, chronologie respectée. Données entièrement fictives.
'use strict';
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
const R = require(path.join(__dirname, '../src/app/inbox-core.js'));
const G = require(path.join(__dirname, '../src/app/garage-economics-core.js'));
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/tyrestate.js'), 'utf8') + ';this.d={switchTire,setTreadAxle,treadAxles,max:TREAD_HISTORY_MAX};', ctx);
const deps = { switchTire: ctx.d.switchTire, setTreadAxle: ctx.d.setTreadAxle, treadAxles: ctx.d.treadAxles, maxTreads: ctx.d.max, addEntry: G.addEntry };
let n = 0; const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const TODAY = '2026-04-10';
const block = (entries, extra = {}) => JSON.stringify({ format: 'rc-depot-v1', source: 'claude', createdAt: '2026-04-10T08:00:00Z', entries, ...extra });
const e = (type, values, extra = {}) => ({ id: 'dep-' + type.toLowerCase() + '-01', date: '2026-04-05', car: 'Test A', type, status: 'measured', values, ...extra });
const car = () => ({ id: 'carA', short: 'Test A', name: 'Voiture test A', odo: [{ d: '2026-03-01', km: 100000 }, { d: '2026-04-08', km: 100900 }],
  tire: { type: 'summer', brand: 'Marque A', model: 'Modèle A', size: '205/55 R16', tread: 6, treadAv: 6, treadAr: 6, treadEst: 0, press: '2,3', mounted: '2025-04-01', dot: '1124', info: '', pchk: { date: '2026-03-01', T: 8, av: 2.2, ar: 2.2 }, treads: [{ d: '2026-03-01', mm: 6, km: 100000, ax: 'both' }] },
  maint: { rev: { d: '2025-09-01', km: 92000, everyKm: 20000, everyMonths: 12 }, ct: { d: '2025-02-01', next: '2027-02-01' } } });
const one = (entry, today = TODAY) => R.parse(block([entry]), today)[0];
const ok = entry => { const r = one(entry); assert.equal(r.error, null, r.error); return r.entry; };

check('bloc valide : six types lus, valeurs normalisées (litres → mL), aucune saisie appliquée par la lecture', () => {
  const list = R.parse(block([e('fuel', { amountCents: 6050, litres: 35.5, km: 100850, fullTank: true, fuelType: 'diesel' }), e('odometer', { km: 100950 }, { id: 'dep-odo-0001' }),
    e('pressure', { av: 2.4, ar: 2.3, T: 9.5 }), e('tread', { mm: 5.4, ax: 'av' }), e('tireMount', { type: 'winter', brand: 'Marque B', dot: '3825', km: 100960 }), e('maintenance', { kind: 'revision', km: 100970, amountCents: 18900 })]), TODAY);
  assert.deepEqual(list.map(x => x.error), [null, null, null, null, null, null]);
  assert.equal(list[0].entry.values.volumeMl, 35500); assert.equal(Object.isFrozen(list[0].entry), true);
});
check('bloc entouré de ``` json (copié depuis la conversation) accepté', () => {
  assert.equal(R.parse('```json\n' + block([e('odometer', { km: 100950 })]) + '\n```', TODAY)[0].error, null);
});
check('enveloppe refusée : JSON invalide, format, source, champ inconnu, liste vide ou trop longue, texte trop long', () => {
  const bad = ['pas du json', '[]', block([e('odometer', { km: 1 })], { format: 'rc-depot-v2' }), block([e('odometer', { km: 1 })], { source: 'autre' }),
    block([e('odometer', { km: 1 })], { extra: 1 }), block([]), block(Array.from({ length: 51 }, (_, i) => e('odometer', { km: i }, { id: 'dep-odo-' + String(i).padStart(4, '0') }))),
    block([e('odometer', { km: 1 })], { createdAt: 'hier' }), 'x'.repeat(R.MAX_TEXT + 1)];
  for (const b of bad) assert.throws(() => R.parse(b, TODAY), Error, b.slice(0, 40));
  assert.throws(() => R.parse(42, TODAY), /Rien à lire/);
});
check('pièges : __proto__, constructor et prototype refusés partout (aucune pollution de prototype)', () => {
  for (const b of ['{"__proto__":{"x":1},"format":"rc-depot-v1","source":"claude","entries":[]}', block([{ ...e('odometer', { km: 1 }), values: JSON.parse('{"km":1,"__proto__":{"polluted":1}}') }]),
    '{"format":"rc-depot-v1","source":"claude","entries":[{"id":"dep-odo-0001","date":"2026-04-05","car":"Test A","type":"odometer","status":"measured","values":{"km":1,"constructor":{"prototype":{"x":1}}}}]}'])
    assert.throws(() => R.parse(b, TODAY), /illisible/);
  assert.equal({}.polluted, undefined); assert.equal({}.x, undefined);
});
check('saisie refusée (les autres restent lisibles) : champ inconnu, identifiant, date, futur, type, statut, voiture', () => {
  const list = R.parse(block([e('odometer', { km: 1 }, { extra: 1 }), e('odometer', { km: 1 }, { id: 'DEP-1' }), e('odometer', { km: 1 }, { date: '2026-02-30' }),
    e('odometer', { km: 1 }, { date: '2026-04-11' }), e('odometer', { km: 1 }, { type: 'wash' }), e('odometer', { km: 1 }, { status: 'guess' }), e('odometer', { km: 1 }, { car: '' }),
    e('odometer', { km: 1 }, { id: 'dep-valid-01' })]), TODAY);
  assert.deepEqual(list.map(x => !!x.error), [true, true, true, true, true, true, true, false]);
  assert.match(list[0].error, /champ inconnu/); assert.match(list[3].error, /futur/); assert.equal(list[0].id, 'dep-odometer-01');
});
check('valeurs refusées : champ inconnu, bornes physiques, décimales, types, plein complet incomplet, estimation hors profondeur', () => {
  const bad = [e('fuel', { amountCents: 6050, tva: 1 }), e('fuel', { amountCents: 60.5 }), e('fuel', { amountCents: 0 }), e('fuel', { amountCents: 6050, litres: 250 }), e('fuel', { amountCents: 6050, litres: 1.2345 }),
    e('fuel', { amountCents: 6050, fullTank: true }), e('fuel', { amountCents: 6050, fullTank: 'oui' }), e('fuel', { amountCents: 6050, fuelType: 'kérosène' }),
    e('odometer', { km: -1 }), e('odometer', { km: '100000' }), e('pressure', {}), e('pressure', { av: 9 }), e('pressure', { av: 2.345 }), e('tread', { mm: 13, ax: 'av' }), e('tread', { mm: 5, ax: 'gauche' }),
    e('tireMount', { type: 'neige' }), e('tireMount', { type: 'winter', dot: '38/25' }), e('tireMount', { type: 'winter', brand: 'x'.repeat(41) }),
    e('maintenance', { kind: 'vidange' }), e('odometer', { km: 1 }, { status: 'estimated' }), e('fuel', { amountCents: 100 }, { values: [] })];
  for (const x of bad) assert.ok(one(x).error, JSON.stringify(x.values));
  assert.equal(one(e('tread', { mm: 4.5, ax: 'both' }, { status: 'estimated' })).error, null);
});
check('texte : balises et caractères de contrôle refusés (note, voiture, marque) ; note bornée à 80', () => {
  for (const x of [e('odometer', { km: 1 }, { note: '<img src=x onerror=alert(1)>' }), e('odometer', { km: 1 }, { car: 'Test A<script>' }), e('odometer', { km: 1 }, { note: 'ligne\u0007' }),
    e('tireMount', { type: 'winter', brand: '<b>Marque</b>' }), e('odometer', { km: 1 }, { note: 'x'.repeat(81) })]) assert.ok(one(x).error);
  assert.equal(ok(e('odometer', { km: 1 }, { note: '  Ticket de la station fictive  ' })).note, 'Ticket de la station fictive');
});
check('identifiant en double dans le même bloc : la seconde saisie est refusée', () => {
  const list = R.parse(block([e('odometer', { km: 1 }), e('odometer', { km: 2 })]), TODAY);
  assert.equal(list[0].error, null); assert.match(list[1].error, /double/);
});
check('voiture : nom court ou nom complet (sans casse), identifiant ; inconnue ou ambiguë → aucune devinette', () => {
  const cars = [car(), { id: 'carB', short: 'Test B', name: 'Voiture test B' }];
  assert.equal(R.matchCar({ car: 'test a' }, cars).id, 'carA'); assert.equal(R.matchCar({ car: 'Voiture test B' }, cars).id, 'carB'); assert.equal(R.matchCar({ car: 'carB' }, cars).id, 'carB');
  assert.equal(R.matchCar({ car: 'Inconnue' }, cars), null); assert.equal(R.matchCar({ car: 'Test A' }, [car(), { ...car(), id: 'carC' }]), null);
});
check('plein : ligne du budget avec l’identifiant de la saisie ; voiture d’origine intacte ; réappliquer = doublon', () => {
  const c = car(), snap = JSON.stringify(c), x = ok(e('fuel', { amountCents: 6050, litres: 35.5, km: 100850, fullTank: true, fuelType: 'diesel' }, { note: 'Station fictive' }));
  const r = R.apply(c, x, deps);
  assert.equal(JSON.stringify(c), snap, 'original non modifié');
  assert.deepEqual(r.car.economics.entries, [{ id: 'dep-fuel-01', date: '2026-04-05', category: 'fuel', amountCents: 6050, km: 100850, note: 'Station fictive', volumeMl: 35500, fuelType: 'diesel', fullTank: true }]);
  assert.deepEqual(r.paths, ['economics.entries', 'odo']); assert.match(r.lines.join(' '), /60,50 €/);
  assert.deepEqual(r.car.odo.map(o => o.d + ':' + o.km), ['2026-03-01:100000', '2026-04-05:100850', '2026-04-08:100900'], 'le compteur du ticket rejoint les relevés');
  assert.equal(R.duplicate(x, r.car), true); assert.throws(() => R.apply(r.car, x, deps), /Déjà enregistrée/);
  assert.equal(R.duplicate(x, { ...c, economics: { entries: [], removed: ['dep-fuel-01'] } }), true, 'une dépense retirée ne revient pas');
});
check('compteur : ajouté dans l’ordre ; même jour autre valeur, ou hors chronologie → refusé, rien de modifié', () => {
  const c = car(), r = R.apply(c, ok(e('odometer', { km: 100500 })), deps);
  assert.deepEqual(r.car.odo.map(o => o.d), ['2026-03-01', '2026-04-05', '2026-04-08']); assert.deepEqual(r.paths, ['odo']);
  assert.throws(() => R.apply(c, ok(e('odometer', { km: 101500 })), deps), /chronologie/, 'plus que le relevé suivant');
  assert.throws(() => R.apply(c, ok(e('odometer', { km: 99000 })), deps), /chronologie/);
  assert.throws(() => R.apply(c, ok(e('odometer', { km: 100800 }, { date: '2026-04-08' })), deps), /existe déjà ce jour-là/);
  assert.equal(R.duplicate(ok(e('odometer', { km: 100900 }, { date: '2026-04-08' })), c), true);
});
check('pressions : contrôle daté et mesuré ; essieu non mesuré ce jour-là jamais redaté ; même jour = complété ; contrôle plus récent déjà saisi → refusé', () => {
  const r = R.apply(car(), ok(e('pressure', { av: 2.4, T: 9.5 })), deps);
  assert.deepEqual(r.car.tire.pchk, { date: '2026-04-05', T: 9.5, av: 2.4, ar: null }, 'l’arrière du 01/03 n’est pas présenté comme mesuré le 05/04');
  assert.match(r.lines.join(' '), /arrière non mesurée ce jour-là : l’ancienne valeur \(2,20 bar du 01\/03\/2026\) n’est pas reconduite/);
  const sameDay = R.apply(r.car, ok(e('pressure', { ar: 2.3 }, { id: 'dep-press-03' })), deps);
  assert.deepEqual(sameDay.car.tire.pchk, { date: '2026-04-05', T: 9.5, av: 2.4, ar: 2.3 }, 'deux saisies du même jour se complètent'); assert.deepEqual(r.paths, ['tire.pchk.date', 'tire.pchk.T', 'tire.pchk.av', 'tire.pchk.ar']);
  assert.throws(() => R.apply(r.car, ok(e('pressure', { av: 2.5 }, { id: 'dep-press-02', date: '2026-04-01' })), deps), /plus récent/);
});
check('profondeur : relevé daté avec le compteur connu ; valeur actuelle mise à jour ; estimation marquée ; relevé ancien = historique seul', () => {
  const r = R.apply(car(), ok(e('tread', { mm: 5.4, ax: 'av' })), deps);
  assert.deepEqual(r.car.tire.treads.at(-1), { d: '2026-04-05', mm: 5.4, km: 100000, ax: 'av' }); assert.equal(r.car.tire.treadAv, 5.4); assert.equal(r.car.tire.treadAr, 6);
  const est = R.apply(car(), ok(e('tread', { mm: 5, ax: 'both' }, { status: 'estimated' })), deps); assert.equal(est.car.tire.treads.at(-1).est, 1); assert.equal(est.car.tire.treadEst, 1);
  const old = R.apply(car(), ok(e('tread', { mm: 6.5, ax: 'av' }, { date: '2026-02-01' })), deps);
  assert.equal(old.car.tire.treadAv, 6, 'valeur actuelle conservée'); assert.deepEqual(old.paths, ['tire.treads']); assert.match(old.lines[0], /historique seulement/);
  const full = car(); full.tire.treads = Array.from({ length: deps.maxTreads }, () => ({ d: '2026-01-01', mm: 7, ax: 'both' }));
  assert.throws(() => R.apply(full, ok(e('tread', { mm: 5, ax: 'av' })), deps), /plein/);
});
check('montage : jeu été rangé, jeu hiver monté avec marque, DOT, date et compteur ; même montage = doublon', () => {
  const r = R.apply(car(), ok(e('tireMount', { type: 'winter', brand: 'Marque B', model: 'Modèle B', dot: '3825', km: 100500 })), deps);
  assert.equal(r.car.tire.type, 'winter'); assert.equal(r.car.tire.brand, 'Marque B'); assert.equal(r.car.tire.dot, '3825'); assert.equal(r.car.tire.mounted, '2026-04-05'); assert.equal(r.car.tire.mountKm, 100500);
  assert.equal(r.car.sets.summer.brand, 'Marque A', 'jeu été conservé'); assert.ok(r.paths.includes('tire') && r.paths.includes('sets') && r.paths.includes('odo'));
  assert.equal(R.duplicate(ok(e('tireMount', { type: 'winter' })), r.car), true);
});
check('pneus démontés : une mesure rangée avec l’ancien jeu reste connue ; une mesure antérieure au montage actuel est refusée', () => {
  const press = ok(e('pressure', { av: 2.4, ar: 2.3 })), tread = ok(e('tread', { mm: 5.4, ax: 'av' }));
  const after = R.apply(R.apply(car(), press, deps).car, tread, deps).car;
  const mounted = R.apply(after, ok(e('tireMount', { type: 'winter' }, { date: '2026-04-06' })), deps).car;
  assert.equal(R.duplicate(press, mounted), true); assert.equal(R.duplicate(tread, mounted), true, 'mesures rangées avec le jeu été');
  assert.throws(() => R.apply(mounted, ok(e('pressure', { av: 2.5 }, { id: 'dep-press-09', date: '2026-04-05' })), deps), /antérieure au montage/);
  assert.throws(() => R.apply(mounted, ok(e('tread', { mm: 5, ax: 'ar' }, { id: 'dep-tread-09', date: '2026-04-05' })), deps), /antérieure au montage/);
});
check('montage du même type (pneus remplacés) : les mesures antérieures ne sont plus attribuées aux pneus montés, l’historique est conservé', () => {
  const worn = car(); worn.tire.tread = worn.tire.treadAv = worn.tire.treadAr = 1.8; worn.tire.treads = [{ d: '2026-03-01', mm: 1.8, km: 100000, ax: 'both' }]; worn.tire.lastRot = 95000;
  const r = R.apply(worn, ok(e('tireMount', { type: 'summer', brand: 'Marque N', dot: '1026', km: 100400 })), deps), t = r.car.tire;
  assert.deepEqual([t.tread, t.treadAv, t.treadAr, t.treadEst], [null, null, null, 0], 'profondeur actuelle à mesurer');
  assert.deepEqual(t.pchk, { date: '', T: null }, 'pression du 01/03 détachée'); assert.equal(t.lastRot, null);
  assert.deepEqual(t.treads, worn.tire.treads, 'aucun relevé effacé');
  assert.deepEqual([t.brand, t.model, t.dot, t.size], ['Marque N', '', '1026', '205/55 R16'], 'autre marque : le modèle de l’ancien pneu n’est pas hérité, la dimension reste');
  assert.match(r.lines.join(' | '), /Pneus montés : été · Marque A → été · Marque N .*Profondeur 1,8 mm : mesurée avant ce montage.*Pressions mesurées le 01\/03\/2026 : antérieures/);
  for (const p of ['tire.tread', 'tire.treadAv', 'tire.treadAr', 'tire.pchk.date', 'tire.lastRot', 'tire.model', 'tire.mounted']) assert.ok(r.paths.includes(p), p);
});
check('montage : date posée sur les pneus déjà mesurés APRÈS cette date → mesures gardées ; jeu saisonnier remonté tel quel → mesures gardées', () => {
  const c = car(); c.tire.mounted = ''; c.tire.treads = [{ d: '2026-03-01', mm: 6, km: 100000, ax: 'both' }];
  const dated = R.apply(c, ok(e('tireMount', { type: 'summer' }, { date: '2026-02-01' })), deps).car.tire;
  assert.deepEqual([dated.treadAv, dated.pchk.av, dated.brand, dated.mounted], [6, 2.2, 'Marque A', '2026-02-01']);
  const winter = R.apply(car(), ok(e('tireMount', { type: 'winter', brand: 'Marque B' })), deps).car;   // le jeu été (6 mm) est rangé
  const back = R.apply(winter, ok(e('tireMount', { type: 'summer' }, { id: 'dep-mount-back', date: '2026-04-09' })), deps).car.tire;
  assert.deepEqual([back.type, back.brand, back.treadAv], ['summer', 'Marque A', 6], 'mêmes pneus remontés : dernière profondeur connue conservée');
  const replaced = R.apply(winter, ok(e('tireMount', { type: 'summer', brand: 'Marque Z' }, { id: 'dep-mount-new', date: '2026-04-09' })), deps).car.tire;
  assert.deepEqual([replaced.brand, replaced.model, replaced.treadAv], ['Marque Z', '', null], 'autres pneus été : rien d’hérité de l’ancien jeu');
});
check('montage plus ancien que le montage enregistré : refusé, quel que soit le type', () => {
  assert.throws(() => R.apply(car(), ok(e('tireMount', { type: 'summer', brand: 'Marque Ancienne' }, { date: '2025-03-01' })), deps), /montage plus récent est déjà enregistré \(01\/04\/2025\)/);
  assert.throws(() => R.apply(car(), ok(e('tireMount', { type: 'winter' }, { date: '2025-03-01' })), deps), /montage plus récent/);
});
check('voiture sans pneus montés : profondeur et pression refusées', () => {
  const none = car(); none.tire = { type: 'none', size: '205/55 R16', pchk: { date: '', T: null } };
  assert.throws(() => R.apply(none, ok(e('tread', { mm: 6, ax: 'both' })), deps), /Aucun pneu monté/);
  assert.throws(() => R.apply(none, ok(e('pressure', { av: 2.3 })), deps), /Aucun pneu monté/);
  assert.equal(R.apply(none, ok(e('tireMount', { type: 'winter', brand: 'Marque B' })), deps).car.tire.type, 'winter');
});
check('une seule chronologie pour tous les kilométrages : plein, compteur, révision et montage se contrôlent entre eux', () => {
  const c = R.apply(car(), ok(e('fuel', { amountCents: 6050, litres: 35.5, km: 100850, fullTank: true })), deps).car;
  assert.throws(() => R.apply(c, ok(e('fuel', { amountCents: 5000, litres: 30, km: 100700, fullTank: true }, { id: 'dep-fuel-02', date: '2026-04-06' })), deps), /contredit le plein du 05\/04\/2026 \(100.850 km\)/);
  assert.throws(() => R.apply(c, ok(e('fuel', { amountCents: 5000, km: 1999999 }, { id: 'dep-fuel-03', date: '2026-04-06' })), deps), /contredit le relevé du compteur du 08\/04\/2026 \(100.900 km\)/);
  assert.throws(() => R.apply(car(), ok(e('odometer', { km: 91000 }, { date: '2025-10-01' })), deps), /contredit la révision du 01\/09\/2025 \(92.000 km\)/);
  const m = car(); m.tire.mountKm = 99000; m.tire.mounted = '2026-02-01';
  assert.throws(() => R.apply(m, ok(e('odometer', { km: 98000 }, { date: '2026-02-15' })), deps), /contredit le montage des pneus du 01\/02\/2026/);
  const sameDay = R.apply(car(), ok(e('fuel', { amountCents: 5000, km: 100950 }, { date: '2026-04-08' })), deps);   // relevé du jour déjà là : 100 900
  assert.deepEqual(sameDay.paths, ['economics.entries']); assert.match(sameDay.lines.join(' '), /relevé du jour déjà enregistré, conservé/);
  assert.equal(R.kmConflict(car(), '2026-04-05', 100500), null); assert.equal(R.kmPoints(car()).length, 3);
});
check('compteur ancien : l’aperçu annonce un ajout à l’historique, pas un compteur qui recule', () => {
  const r = R.apply(car(), ok(e('odometer', { km: 99000 }, { date: '2026-01-15' })), deps);
  assert.match(r.lines[0], /Compteur au 15\/01\/2026 : 99.000 km · relevé ancien ajouté à l’historique, dernier relevé inchangé \(100.900 km le 08\/04\/2026\)/);
});
check('bloc entouré de phrases (message de Claude copié en entier) : seul le bloc est lu, toujours strictement ; deux blocs → refusé', () => {
  const b = block([e('odometer', { km: 100950 })]);
  assert.equal(R.parse('Voici le bloc :\n```json\n' + b + '\n```\nBonne route !', TODAY)[0].error, null);
  assert.equal(R.parse('Voici le bloc : ' + b + ' Bonne route !', TODAY)[0].error, null);
  assert.throws(() => R.parse('```json\n' + b + '\n```\net\n```json\n' + b + '\n```', TODAY), /Plusieurs blocs/);
  assert.throws(() => R.parse('Voici : ```json\n{"format":"rc-depot-v1","source":"claude","entries":[],"x":1}\n```', TODAY), /champ inconnu/);
  assert.ok(one(e('tread', { mm: 1e-7, ax: 'av' })).error, 'une valeur infinitésimale n’est pas 0,0 mm');
});
check('entretien : révision et contrôle technique datés, compteur et dépense ajoutés ; plus récent déjà saisi → refusé', () => {
  const r = R.apply(car(), ok(e('maintenance', { kind: 'revision', km: 100500, amountCents: 18900 })), deps);
  assert.deepEqual({ d: r.car.maint.rev.d, km: r.car.maint.rev.km, every: r.car.maint.rev.everyKm }, { d: '2026-04-05', km: 100500, every: 20000 });
  assert.equal(r.car.economics.entries[0].category, 'maintenance'); assert.ok(r.paths.includes('maint.rev.d') && r.paths.includes('odo') && r.paths.includes('economics.entries'));
  const ct = R.apply(car(), ok(e('maintenance', { kind: 'ct' })), deps); assert.deepEqual(ct.car.maint.ct, { d: '2026-04-05', next: '' });
  assert.throws(() => R.apply(car(), ok(e('maintenance', { kind: 'revision' }, { date: '2025-01-01' })), deps), /plus récente/);
});
check('jamais de trajet ni de journal touché : seules la voiture et ses champs prévus changent', () => {
  const c = { ...car(), journal: { secret: 1 } }, r = R.apply(c, ok(e('odometer', { km: 100500 })), deps);
  assert.deepEqual(r.car.journal, { secret: 1 });
  for (const p of r.paths) assert.match(p, /^(odo|tire(\.|$)|sets|maint\.|economics\.entries)/);
});
console.log(n + '/' + n + ' scénarios OK');
