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
const JOURNAL = { 'twrc.debrief.archive.v1': '{"v":1,"records":["{\\"key\\":\\"trajet-fictif\\"}"]}', 'twrc.context.v1': '{"debrief":{"entries":[{"key":"trajet-fictif"}]}}' };
// Parcours complet tel que l'app l'enchaîne : instantané confirmé → remise à zéro → annulation.
function scenario(G) {
  const s = store({ 'twrc.settings.v1': SETTINGS, ...JOURNAL }), journal = JSON.stringify(JOURNAL);
  const snap = G.take(s, 1000);
  assert(G.read(s), 'instantané absent : la réinitialisation doit être refusée');
  assert.equal(G.read(s).settings, SETTINGS, 'instantané différent des réglages');
  s.setItem('twrc.settings.v1', DEFAULTS);                         // la réinitialisation elle-même
  assert(snap && snap.at === 1000);
  G.restore(s);
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
  G.restore(s); assert.equal(s.getItem('twrc.settings.v1'), DEFAULTS); G.restore(s); assert.equal(s.getItem('twrc.settings.v1'), SETTINGS);
  assert.equal(G.read(s), null); assert.throws(() => G.restore(s), /Aucun instantané/);
  for (let i = 0; i < 5; i++) G.take(s, 10 + i); assert.equal(G.list(s).length, G.MAX); assert.equal(G.list(s)[0].at, 12);
});
check('appareil sans réglages enregistrés : l’annulation rend l’état exact (clé absente)', () => {
  const s = store(); G.take(s, 5); s.setItem('twrc.settings.v1', DEFAULTS); G.restore(s); assert.equal(s.getItem('twrc.settings.v1'), null);
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
  ['instantané normalisé (perte de l’octet exact)', GUARD, /settings: store\.getItem\(SETTINGS\) \}/, 'settings: JSON.stringify(JSON.parse(store.getItem(SETTINGS))) }'],
  ['restauration sans réécriture des réglages', GUARD, /else store\.setItem\(SETTINGS, snap\.settings\);/, ''],
  ['nouvel instantané écrasant le précédent', GUARD, /\[\.\.\.list\(store\), snap\]/, '[snap]'],
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
console.log(`✅ ${killed}/${mutations.length + appMutations.length + choiceMutations.length} mutations rejetées (contre-tests)`);
console.log(`\n✅ ${n} contrôles de réinitialisation protégée`);
