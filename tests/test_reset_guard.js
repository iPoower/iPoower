// Réinitialisation protégée : instantané puis restauration = réglages identiques à l'octet, mot exigé, clé propre
// à l'appareil (jamais sur Drive) et contre-tests permanents (une réinitialisation sans instantané fait échouer).
// Données fictives uniquement (Lieu A, Lieu B, Voiture fictive).
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const src = path.resolve(__dirname, '../src'), read = f => fs.readFileSync(path.join(src, f), 'utf8');
const GUARD = read('app/reset-guard.js'), APP = read('app.js');
const load = source => { const ctx = vm.createContext({ JSON, Number, Array, String, Error }); vm.runInContext(source + ';this.G=RESET_GUARD;', ctx); return ctx.G; };
function store(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => { m.delete(k); }, dump: () => Object.fromEntries(m) };
}
// Texte volontairement non canonique (espaces, ordre, accents, emoji, échappements) : seule une copie à l'octet le conserve.
const SETTINGS = '{"v":1, "locs":[{"id":"home","name":"Lieu A","lat":45.1,"lon":5.7},{"id":"work","name":"Lieu B"}],' +
  '"cars":[{"id":"car1","name":"Voiture fictive é 🚗","tire":{"dot":"1825","tread":2.3}}],"calib":[{"t":"2026-10-07T07:00","loc":"home","Tr":2}],"horizon":24,"x":"\\u00e9"}';
const DEFAULTS = JSON.stringify({ v: 1, locs: [{ id: 'home', name: 'Lieu principal' }], cars: [{ id: 'car1', name: 'Voiture 1' }], calib: [], horizon: 12 });
const STAMPS = '{"horizon":1791378023005, "cars.0.tire.dot":1791000000000}';   // non canonique : copie à l'octet exigée
const JOURNAL = { 'twrc.debrief.archive.v1': '{"v":1,"records":["{\\"key\\":\\"trajet-fictif\\"}"]}', 'twrc.context.v1': '{"debrief":{"entries":[{"key":"trajet-fictif"}]}}' };
// Parcours complet tel que l'app l'enchaîne : instantané confirmé → remise à zéro → annulation.
function scenario(G) {
  const s = store({ 'twrc.settings.v1': SETTINGS, 'twrc.editstamps.v1': STAMPS, ...JOURNAL }), journal = JSON.stringify(JOURNAL);
  const snap = G.take(s, 1000);
  assert(G.read(s), 'instantané absent : la réinitialisation doit être refusée');
  assert.equal(G.read(s).settings, SETTINGS, 'instantané différent des réglages');
  s.setItem('twrc.settings.v1', DEFAULTS);                         // la réinitialisation elle-même
  s.setItem('twrc.editstamps.v1', '{"horizon":1}');                // horodatages remplacés entre-temps (adoption Drive)
  assert(snap && snap.at === 1000);
  const back = G.restore(s);
  assert.equal(s.getItem('twrc.editstamps.v1'), STAMPS, 'horodatages d’origine non restaurés à l’octet');
  assert(G.read(s), 'instantané retiré avant la confirmation de l’enregistrement');
  G.release(s, back);
  assert.equal(s.getItem('twrc.settings.v1'), SETTINGS, 'réglages restaurés différents à l’octet');
  assert.equal(Buffer.compare(Buffer.from(s.getItem('twrc.settings.v1')), Buffer.from(SETTINGS)), 0);
  assert.equal(JSON.stringify({ 'twrc.debrief.archive.v1': s.getItem('twrc.debrief.archive.v1'), 'twrc.context.v1': s.getItem('twrc.context.v1') }), journal, 'journal modifié');
  assert.equal(s.getItem(G.KEY), null, 'instantané retiré après restauration');
  return true;
}
let n = 0; const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const G = load(GUARD);
check('instantané puis restauration : réglages identiques à l’octet, journal intact', () => assert.equal(scenario(G), true));
check('mot RÉINITIALISER exigé (casse et accent indifférents), tout autre texte refusé', () => {
  for (const ok of ['RÉINITIALISER', 'réinitialiser', ' REINITIALISER ', 'Réinitialiser']) assert.equal(G.wordOk(ok), true, ok);
  for (const ko of ['', 'oui', 'RÉINITIALISE', 'RÉINITIALISER!', 'REINITIALISER REINITIALISER', null, undefined]) assert.equal(G.wordOk(ko), false, String(ko));
});
check('deux réinitialisations de suite : la première n’est pas écrasée (pile de 3, annulations successives)', () => {
  const s = store({ 'twrc.settings.v1': SETTINGS });
  G.take(s, 1); s.setItem('twrc.settings.v1', DEFAULTS); G.take(s, 2); s.setItem('twrc.settings.v1', DEFAULTS);
  assert.equal(G.list(s).length, 2);
  G.release(s, G.restore(s)); assert.equal(s.getItem('twrc.settings.v1'), DEFAULTS); G.release(s, G.restore(s)); assert.equal(s.getItem('twrc.settings.v1'), SETTINGS);
  assert.equal(G.read(s), null); assert.throws(() => G.restore(s), /Aucun instantané/);
  for (let i = 0; i < 5; i++) G.take(s, 10 + i); assert.equal(G.list(s).length, G.MAX); assert.equal(G.list(s)[0].at, 12);
});
check('appareil sans réglages enregistrés : l’annulation rend l’état exact (clé absente)', () => {
  const s = store(); G.take(s, 5); s.setItem('twrc.settings.v1', DEFAULTS); s.setItem('twrc.editstamps.v1', '{}'); G.restore(s);
  assert.equal(s.getItem('twrc.settings.v1'), null); assert.equal(s.getItem('twrc.editstamps.v1'), null);
});
check('instantané d’une version précédente (sans horodatages) : réglages restaurés, horodatages laissés tels quels', () => {
  const s = store({ 'twrc.settings.v1': DEFAULTS, 'twrc.editstamps.v1': STAMPS, [G.KEY]: JSON.stringify({ v: 1, list: [{ at: 7, settings: SETTINGS }] }) });
  const back = G.restore(s); assert.equal(s.getItem('twrc.settings.v1'), SETTINGS); assert.equal(s.getItem('twrc.editstamps.v1'), STAMPS); G.release(s, back); assert.equal(G.read(s), null);
});
check('release : seul l’instantané restauré est retiré, jamais un autre (pile modifiée entre-temps)', () => {
  const s = store({ 'twrc.settings.v1': SETTINGS }); G.take(s, 1); const back = G.restore(s); G.take(s, 2);
  assert.throws(() => G.release(s, back), /modifié entre-temps/); assert.equal(G.list(s).length, 2);
});
check('horodatages : même clé que la fusion Drive (SyncMerge.STAMPS)', () => {
  const ctx = vm.createContext({}); vm.runInContext(read('sync-merge.js') + ';globalThis.M=SyncMerge;', ctx); assert.equal(G.STAMPS, ctx.M.STAMPS);
});
check('écriture non confirmée (stockage refusé) : erreur, aucune réinitialisation possible', () => {
  const s = store({ 'twrc.settings.v1': SETTINGS }); s.setItem = () => {};
  assert.throws(() => G.take(s, 1), /non confirmé/); assert.equal(s.getItem('twrc.settings.v1'), SETTINGS);
});
check('instantané illisible ou falsifié : ignoré, jamais restauré', () => {
  for (const bad of ['{', '{"v":2,"list":[]}', '{"v":1,"list":[{"at":"x","settings":"{}"}]}', '{"v":1,"list":[{"at":1,"settings":3}]}']) {
    const s = store({ 'twrc.settings.v1': DEFAULTS, [G.KEY]: bad }); assert.equal(G.read(s), null); assert.throws(() => G.restore(s)); assert.equal(s.getItem('twrc.settings.v1'), DEFAULTS);
  }
});
check('clé chiffrée dans le coffre et propre à l’appareil (SyncMerge.device) : jamais envoyée à Drive', () => {
  const sv = read('session-vault.js'), grab = re => sv.match(re)[0];
  const rules = vm.runInNewContext([grab(/const VAULT = [^;]+;/), grab(/const PUBLIC = new Set\([^;]+;/), grab(/const isPublic = [^;]+;/),
    grab(/const isApp = [^;]+;/), grab(/const META = new Set\([^;]+;/), grab(/const secret = [^;]+;/), '({ secret })'].join('\n'));
  const ctx = vm.createContext({}); vm.runInContext(read('sync-merge.js') + ';globalThis.M=SyncMerge;', ctx);
  assert.equal(G.KEY, 'twrc.restore.reset.v1'); assert.equal(rules.secret(G.KEY), true, 'doit être chiffrée dans le coffre'); assert.equal(ctx.M.device(G.KEY), true, 'doit rester sur cet appareil');
});
// Ordre exigé dans l'app : mot vérifié, instantané confirmé, pause Drive posée, coffre écrit, PUIS remise à zéro.
const resetRunOk = app => {
  const body = (app.match(/async function resetRun\(\) \{[\s\S]*?\n\}/) || [''])[0];
  const ready = body.indexOf('if (!resetReady())'), take = body.indexOf('RESET_GUARD.take(APP_STORAGE'), flush = body.indexOf('if (vault) { await vault.flush(); if (vault.error) throw'), apply = body.indexOf('resetApply()'), pause = body.indexOf('APP_STORAGE.setItem(DriveSync.PAUSE, mark)');
  const callers = (app.match(/resetApply\(\)/g) || []).length;   // définition + un seul appel (dans resetRun)
  return ready >= 0 && take > ready && pause > take && flush > pause && apply > flush && callers === 2 && !/confirm\(['"]Réinitialiser/.test(app);
};
check('app : mot vérifié, instantané confirmé, pause Drive posée et coffre écrit avant toute remise à zéro ; plus de case d’accord Drive', () => {
  assert.equal(resetRunOk(APP), true); assert(!/id="resetDrive"|UI\.resetDrive|J’accepte l’envoi/.test(APP), 'case d’accord Drive encore présente');
});
// Choix après réinitialisation : « Remplacer » n'envoie qu'après le mot REMPLACER ; « Récupérer » lève la pause après succès seulement.
const choiceOk = app => {
  const rep = (app.match(/async function syncReplace\(\) \{[\s\S]*?\n\}/) || [''])[0], rec = (app.match(/async function syncRecover\(\) \{[\s\S]*?\n\}/) || [''])[0];
  const word = rep.indexOf('if (!RESET_GUARD.wordOk(UI.replaceWord, RESET_GUARD.REPLACE)) {'), resume = rep.indexOf('await syncResume()'), run = rep.indexOf('DRIVE_UI.sync.run(true)');
  const adopt = rec.indexOf('await DRIVE_UI.sync.adopt(); await syncResume();');
  return word >= 0 && resume > word && run > resume && adopt >= 0 && (app.match(/await syncResume\(\)/g) || []).length === 2;
};
check('app : « Remplacer aussi Drive » exige REMPLACER avant de lever la pause ; « Récupérer » la lève après l’adoption', () => {
  assert.equal(choiceOk(APP), true);
  for (const ok of ['REMPLACER', 'remplacer', ' Remplacer ']) assert.equal(G.wordOk(ok, G.REPLACE), true, ok);
  for (const ko of ['', 'RÉINITIALISER', 'REMPLACE', 'oui']) assert.equal(G.wordOk(ko, G.REPLACE), false, ko);
});
check('app : la commande « Réinitialiser » est dans la zone danger, séparée de « Lancer la démo »', () => {
  const chips = APP.match(/<button class="btn" data-act="demo-sel">[^\n]*/)[0]; assert(!/data-act="reset"/.test(chips), 'reset collé à la démo');
  assert(/class="set-danger" id="resetZone"/.test(APP)); assert(/data-act="reset">Réinitialiser les réglages…/.test(APP));
});
// Contre-tests permanents : chaque mutation doit être rejetée.
const mutations = [
  ['instantané jamais écrit', GUARD, /store\.setItem\(KEY, text\);/, ''],
  ['instantané normalisé (perte de l’octet exact)', GUARD, /settings: store\.getItem\(SETTINGS\),/, 'settings: JSON.stringify(JSON.parse(store.getItem(SETTINGS))),'],
  ['restauration sans réécriture des réglages', GUARD, /    put\(store, SETTINGS, snap\.settings\);/, ''],
  ['nouvel instantané écrasant le précédent', GUARD, /\[\.\.\.list\(store\), snap\]/, '[snap]'],
  ['horodatages absents de l’instantané', GUARD, /, stamps: store\.getItem\(STAMPS\) \}/, ' }'],
  ['horodatages non restaurés', GUARD, /if \(snap\.stamps !== undefined\) put\(store, STAMPS, snap\.stamps\);/, ''],
  ['horodatages remplacés par l’heure de la restauration', GUARD, /if \(snap\.stamps !== undefined\) put\(store, STAMPS, snap\.stamps\);/, "if (snap.stamps !== undefined) put(store, STAMPS, JSON.stringify({ horizon: 9e12 }));"],
  ['instantané retiré par restore (trop tôt)', GUARD, /      throw new Error\('Restauration non confirmée : instantané conservé\.'\);\n    return snap;/, "      throw new Error('Restauration non confirmée : instantané conservé.');\n    write(store, l.slice(0, -1)); return snap;"],
  ['mot non vérifié', GUARD, /const wordOk = \(s, word = WORD\) => bare\(s\) === bare\(word\);/, 'const wordOk = (s, word = WORD) => true;'],
];
let killed = 0;
for (const [name, source, from, to] of mutations) {
  const mutated = source.replace(from, to); assert.notEqual(mutated, source, 'mutation inapplicable : ' + name);
  let failed = false;
  try { const M = load(mutated); scenario(M); const s = store({ 'twrc.settings.v1': SETTINGS }); M.take(s, 1); M.take(s, 2); assert.equal(M.list(s).length, 2); assert.equal(M.wordOk('oui'), false); } catch (e) { failed = true; }
  assert.equal(failed, true, 'contre-test non détecté : ' + name); killed++;
}
const appMutations = [
  ['réinitialisation sans instantané (app)', /RESET_GUARD\.take\(APP_STORAGE, Date\.now\(\)\);/, ''],
  ['remise à zéro avant l’écriture du coffre', /if \(vault\) \{ await vault\.flush\(\);/, 'if (vault) { void 0;'],
  ['retour du simple confirm()', /if \(!resetReady\(\)\) \{/, "if (!confirm('Réinitialiser les réglages ?')) {"],
  ['pause Drive non posée avant la réinitialisation', /APP_STORAGE\.setItem\(DriveSync\.PAUSE, mark\);/, ''],
];
for (const [name, from, to] of appMutations) {
  const mutated = APP.replace(from, to); assert.notEqual(mutated, APP, 'mutation inapplicable : ' + name);
  assert.equal(resetRunOk(mutated), false, 'contre-test non détecté : ' + name); killed++;
}
const choiceMutations = [
  ['Remplacer : envoi sans le mot REMPLACER', /if \(!RESET_GUARD\.wordOk\(UI\.replaceWord, RESET_GUARD\.REPLACE\)\) \{/, 'if (false) {'],
  ['Récupérer : pause levée avant l’adoption', /await DRIVE_UI\.sync\.adopt\(\); await syncResume\(\);/, 'await syncResume(); await DRIVE_UI.sync.adopt();'],
];
for (const [name, from, to] of choiceMutations) {
  const mutated = APP.replace(from, to); assert.notEqual(mutated, APP, 'mutation inapplicable : ' + name);
  assert.equal(choiceOk(mutated), false, 'contre-test non détecté : ' + name); killed++;
}

// « Annuler la réinitialisation » exécuté pour de vrai (fonction de l'app, coffre simulé) : ordre restaurer → écrire →
// vérifier → lever la pause → retirer l'instantané ; échec à chaque écriture : mémoire = écrit, pause et instantané gardés.
const UNDO = (APP.match(/async function resetUndo\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
const PAUSE = 'twrc.sync.paused.v1', RESET_DEFAULTS = DEFAULTS, MARK = '{"v":1,"at":1,"why":"reset"}';
function runUndo(appSource, failAt, times = 1) {
  const ctx = vm.createContext({ JSON, Number, Array, String, Error, Promise, Object });
  vm.runInContext(GUARD + ';this.RESET_GUARD=RESET_GUARD;', ctx);
  const s = store({ 'twrc.settings.v1': SETTINGS, 'twrc.editstamps.v1': STAMPS, ...JOURNAL });
  ctx.RESET_GUARD.take(s, 1000); s.setItem(PAUSE, MARK); s.setItem('twrc.settings.v1', RESET_DEFAULTS); s.setItem('twrc.editstamps.v1', '{"horizon":5}');
  const disk = [s.dump()]; let flushes = 0;
  const vault = { mode: 'vault', error: null, async flush() { flushes++; if (flushes === failAt) { vault.error = 'Enregistrement chiffré non confirmé'; return; } vault.error = null; disk.push(s.dump()); } };
  Object.assign(ctx, { APP_STORAGE: s, window: { TWRC_VAULT: vault }, DriveSync: { PAUSE }, UI: { loc: 'home', bcar: 'car1' }, S: null,
    lsGet: k => s.getItem(k), loadSettings: () => JSON.parse(s.getItem('twrc.settings.v1') || RESET_DEFAULTS), allLocs: () => [{ id: 'home' }],
    rebuild() {}, renderSettings() {}, renderAll() {}, refreshAll() {}, renderResetZone() {} });
  vm.runInContext(appSource + ';this.resetUndo=resetUndo;', ctx);
  let run = ctx.resetUndo(); for (let i = 1; i < times; i++) run = run.then(() => ctx.resetUndo());
  return run.then(() => ({ mem: s.dump(), disk, last: disk[disk.length - 1], msg: ctx.UI.resetMsg, S: ctx.S }));
}
async function undoOk(appSource) {
  const ok = []; const t = (c, why) => { if (!c) throw new Error(why); ok.push(why); };
  // Succès : trois écritures confirmées, dans l'ordre exigé.
  const r = await runUndo(appSource, 0);
  t(r.last['twrc.settings.v1'] === SETTINGS && r.last['twrc.editstamps.v1'] === STAMPS && r.last[PAUSE] === undefined && r.last['twrc.restore.reset.v1'] === undefined, 'succès : réglages et horodatages d’origine écrits, pause levée, instantané retiré');
  t(/annulée/.test(r.msg) && /enregistrés/.test(r.msg), 'succès : message après enregistrement');
  const firstRestored = r.disk.findIndex(d => d['twrc.settings.v1'] === SETTINGS && d['twrc.editstamps.v1'] === STAMPS);
  const firstUnpaused = r.disk.findIndex(d => d[PAUSE] === undefined), firstReleased = r.disk.findIndex(d => d['twrc.restore.reset.v1'] === undefined);
  t(firstRestored > 0 && r.disk[firstRestored][PAUSE] === MARK && r.disk[firstRestored]['twrc.restore.reset.v1'] !== undefined, 'ordre : réglages écrits pendant que la pause et l’instantané existent encore');
  t(firstUnpaused > firstRestored && r.disk[firstUnpaused]['twrc.restore.reset.v1'] !== undefined, 'ordre : pause levée après l’écriture des réglages, instantané encore présent');
  t(firstReleased > firstUnpaused, 'ordre : instantané retiré en dernier');
  // Échec de chaque écriture : rien de faux en mémoire, pause et instantané conformes à l'écrit, erreur visible, aucun succès.
  for (const k of [1, 2, 3]) {
    const f = await runUndo(appSource, k);
    t(JSON.stringify(f.mem) === JSON.stringify(f.last), `échec écriture ${k} : mémoire = état réellement écrit`);
    t(f.mem['twrc.restore.reset.v1'] !== undefined, `échec écriture ${k} : instantané conservé`);
    if (k <= 2) t(f.mem[PAUSE] === MARK, `échec écriture ${k} : pause Drive maintenue`);
    if (k === 1) t(f.mem['twrc.settings.v1'] === RESET_DEFAULTS && /NON enregistrée/.test(f.msg), 'échec écriture 1 : réglages non annoncés comme rétablis');
    t(!/^Réinitialisation annulée/.test(f.msg) && /stockage|enregistr/.test(f.msg), `échec écriture ${k} : erreur visible, aucun message de succès`);
  }
  // Nouvel essai après un échec : l'annulation aboutit (état récupérable).
  for (const k of [1, 2, 3]) {
    const g = await runUndo(appSource, k, 2);
    t(g.last['twrc.settings.v1'] === SETTINGS && g.last['twrc.editstamps.v1'] === STAMPS && g.last[PAUSE] === undefined && g.last['twrc.restore.reset.v1'] === undefined && /^Réinitialisation annulée/.test(g.msg), `échec écriture ${k} puis nouvel essai : annulation aboutie`);
  }
  return ok.length;
}
const undoMutations = [
  ['ordre inversé : pause levée avant la restauration', /  try \{\n    snap = RESET_GUARD\.restore\(APP_STORAGE\);/, '  try {\n    APP_STORAGE.removeItem(DriveSync.PAUSE);\n    snap = RESET_GUARD.restore(APP_STORAGE);'],
  ['flush ignoré (restauration non écrite)', /snap = RESET_GUARD\.restore\(APP_STORAGE\); await saved\(\);/, 'snap = RESET_GUARD.restore(APP_STORAGE);'],
  ['erreur du coffre non vérifiée', /if \(vault\.error\) throw new Error\('vault'\);/, ''],
  ['instantané retiré trop tôt', /snap = RESET_GUARD\.restore\(APP_STORAGE\); await saved\(\);/, 'snap = RESET_GUARD.restore(APP_STORAGE); RESET_GUARD.release(APP_STORAGE, snap); await saved();'],
];
const undoChecks = (async () => {
  assert(UNDO.length > 0, 'resetUndo introuvable');
  const count = await undoOk(UNDO); n++; console.log(`✅ « Annuler la réinitialisation » exécuté : ordre restaurer → écrire → vérifier → pause → instantané ; échecs 1/2/3 sans perte ni faux succès (${count} vérifications)`);
  let k = 0;
  for (const [name, from, to] of undoMutations) {
    const mutated = UNDO.replace(from, to); assert.notEqual(mutated, UNDO, 'mutation inapplicable : ' + name);
    let failed = false; try { await undoOk(mutated); } catch (e) { failed = true; if (process.env.WHY) console.log('   ↳ ' + name + ' : ' + e.message); }
    assert.equal(failed, true, 'contre-test non détecté : ' + name); k++;
  }
  console.log(`✅ ${k}/${undoMutations.length} mutations de l’annulation rejetées (ordre inversé, flush ignoré, erreur ignorée, instantané retiré trop tôt)`);
})();
console.log(`✅ ${killed}/${mutations.length + appMutations.length + choiceMutations.length} mutations rejetées (contre-tests)`);
undoChecks.then(() => console.log(`\n✅ ${n} contrôles de réinitialisation protégée`), e => { console.error('❌ ' + e.message); process.exit(1); });
