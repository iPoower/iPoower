// Lot S · sauvegarde visible : un libellé par état (badge, panneau, boutons), dernière copie et âge des modifications
// non sauvegardées, aucune synthèse « Données critiques fraîches » tant que Drive n'est pas à jour, persistance du stockage
// demandée une fois et affichée telle que le navigateur la relit. Contre-tests permanents par mutation. Données fictives.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = f => fs.readFileSync(path.resolve(__dirname, '../src', f), 'utf8');
const SRC = { css: read('style.css'), view: read('app/drive-sync-view.js'), persist: read('app/storage-persist.js'), decision: read('decision.js'), diag: read('app/diagnostics.js'), merge: read('sync-merge.js'), app: read('app.js') };
let n = 0; const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const T0 = new Date(2026, 10, 3, 18, 0).getTime();   // 03/11/2026 18:00, heure locale de l'appareil (comme l'app)
const HM = t => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
function loadView(source, { status = null, connected = false, selected = false, hint = null, pending = 0, since = 0, syncedAt = 0, vault = 'vault', online = true, now = T0 } = {}) {
  class D extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const store = new Map(), events = [];
  const ctx = vm.createContext({ Intl, JSON, Math, Number, String, Object, Array, Error, Date: D, Promise,
    navigator: { onLine: online }, document: { getElementById: () => null }, window: { TWRC_VAULT: { mode: vault } },
    lsGet: k => store.has(k) ? store.get(k) : null, lsSet: (k, v) => { store.set(k, v); events.push(k); }, esc: s => String(s), S: null });
  vm.runInContext(source + `;this.api={ state: driveBadgeState, copy: driveCopyText, summary: driveBackupSummary, age: driveAge, when: driveWhen, note: driveNoteWrite,
    change: driveOnChange, vaultChange: driveVaultChange, LABEL: DRIVE_LABEL, KEY: DRIVE_BADGE_KEY, RECONNECT: DRIVE_RECONNECT, B: DRIVE_BADGE, UI: DRIVE_UI };`, ctx);
  const api = ctx.api; Object.assign(api.UI, { config: {}, status, hint, selected, session: { connected } });
  Object.assign(api.B, { pending, pendingSince: since, syncedAt, loaded: true });
  return { api, ctx, store, events };
}
// ---------- Libellés : un par état, partagés par le badge, le panneau et les boutons ----------
function labelsOk(source) {
  const { api } = loadView(source, { hint: { folder: 'f' } });
  const s = api.state(); assert.equal(s.key, 'reconnect'); assert.equal(s.label, 'Reconnexion requise'); assert(s.text.startsWith('Reconnexion requise'));
  const blocked = loadView(source, { connected: true, selected: true, status: { state: 'SYNC_BLOCKED', message: 'reconnexion' } }).api.state();
  assert.equal(blocked.label, s.label, 'deux libellés pour la reconnexion');
  const values = Object.values(api.LABEL); assert.equal(new Set(values).size, values.length, 'deux états partagent un libellé');
  // Panneau : la ligne CLOUD reprend le libellé du badge ; le bouton de reprise a un libellé unique ; plus d'anciens libellés.
  assert(/!connected \? driveBadgeState\(\)\.label/.test(source), 'ligne CLOUD sans le libellé du badge');
  assert(/button\(DRIVE_RECONNECT, async/.test(source), 'bouton de reprise sans le libellé unique');
  assert(!/Prêt à connecter Google Drive|Reprendre la synchronisation Drive|Préparer la reprise Drive|'connexion requise \(/.test(source), 'ancien libellé encore présent');
  assert(/d\.hint \? 'Utiliser un autre compte Google'/.test(source), '« Se connecter à Google » proposé alors qu’une liaison existe');
  return true;
}
check('un libellé par état : « Reconnexion requise » partout (badge, ligne CLOUD), bouton unique « Reconnecter Google Drive »', () => assert.equal(labelsOk(SRC.view), true));
// ---------- Dernière copie et âge des modifications non sauvegardées ----------
function copyOk(source) {
  const synced = T0 - 5 * 60e3, { api } = loadView(source, { hint: { folder: 'f' }, pending: 1, since: T0 - 14 * 60e3, syncedAt: synced });
  const s = api.state();
  assert.equal(s.text, 'Reconnexion requise · copie ' + HM(synced) + ' · 1 modif · 14 min', 'badge (forme courte, une ligne) : ' + s.text);
  assert(s.hint.includes('dernière copie ' + HM(synced) + ' · 1 modif non sauvegardée depuis 14 min'), 'info-bulle et lecteur d’écran sans la phrase complète : ' + s.hint);
  assert.equal(loadView(source, { hint: { folder: 'f' } }).api.copy(), 'aucune copie Drive vérifiée sur cet appareil');
  assert.equal(api.when(T0 - 24 * 3600e3), 'hier 18:00'); assert.equal(api.when(T0 - 3 * 24 * 3600e3), '31/10 18:00');
  for (const [ms, txt] of [[0, 'moins de 1 min'], [59e3, 'moins de 1 min'], [60e3, '1 min'], [59 * 60e3, '59 min'], [60 * 60e3, '1 h 00'], [125 * 60e3, '2 h 05'], [48 * 3600e3, '2 j']]) assert.equal(api.age(ms), txt, 'âge ' + ms);
  return true;
}
check('badge : « copie 17:55 · 1 modif · 14 min » sur une ligne ; info-bulle « dernière copie 17:55 · 1 modif non sauvegardée depuis 14 min » ; « hier 18:00 », « 31/10 18:00 »', () => assert.equal(copyOk(SRC.view), true));
// ---------- Mémoire propre à l'appareil, persistée, sans boucle de synchronisation ----------
function memoryOk(source, mergeSource) {
  const v = loadView(source, { connected: true, selected: true, status: { state: 'PENDING', message: 'en attente' } });
  v.api.B.loaded = false; v.api.B.sig = {};
  v.api.note({ key: 'twrc.settings.v1' }); assert.equal(v.api.B.pending, 1); assert.equal(v.api.B.pendingSince, T0);
  const saved = JSON.parse(v.store.get(v.api.KEY)); assert.equal(saved.pending, 1); assert.equal(saved.pendingSince, T0);
  const renders = []; v.ctx.renderDriveSync = () => renders.push(1); v.ctx.renderDriveBadge = () => {};
  v.api.change({ state: 'SYNCED', message: 'synchronisé' });
  const after = JSON.parse(v.store.get(v.api.KEY)); assert.equal(after.pending, 0); assert.equal(after.lastOkAt, T0); assert.equal(v.api.B.pending, 0);
  const mctx = vm.createContext({}); vm.runInContext(mergeSource + ';this.M=SyncMerge;', mctx);
  assert.equal(mctx.M.device(v.api.KEY), true, 'mémoire du badge envoyée à Drive (clé non propre à l’appareil)');
  let soon = 0; v.ctx.driveSoon = () => { soon++; }; v.api.vaultChange({ key: v.api.KEY }); assert.equal(soon, 0, 'mémoire du badge relance une synchronisation');
  v.api.vaultChange({ key: 'twrc.settings.v1' }); assert.equal(soon, 1);
  // Rechargement : la mémoire est relue.
  const r = loadView(source, { hint: { folder: 'f' } }); r.api.B.loaded = false; r.store.set(r.api.KEY, JSON.stringify({ v: 1, lastOkAt: T0 - 60e3, pending: 2, pendingSince: T0 - 30 * 60e3 }));
  assert(r.api.state().hint.includes('dernière copie ' + HM(T0 - 60e3) + ' · 2 modifs non sauvegardées depuis 30 min'), r.api.state().hint);
  return true;
}
check('mémoire du badge : propre à l’appareil (jamais sur Drive), relue après rechargement, sans relancer de synchronisation', () => assert.equal(memoryOk(SRC.view, SRC.merge), true));
// ---------- Synthèse : jamais « Données critiques fraîches » tant que Drive n'est pas à jour ----------
function decisionOk(source, viewSource) {
  const ctx = vm.createContext({ Math, Number, String, Object, Array, JSON }); vm.runInContext(source + ';this.D=Decision;', ctx);
  const fresh = { weather: { available: true, ageMin: 2, mode: 'live' }, online: true, contextKnown: true, storageDurable: true };
  const base = ctx.D.confidence(fresh); assert.equal(base.reason, 'Données critiques fraîches');
  const cutText = 'Sauvegarde Drive · Reconnexion requise · dernière copie 17:55';
  const cut = ctx.D.confidence({ ...fresh, backup: { ok: false, text: cutText } });
  assert.notEqual(cut.reason, 'Données critiques fraîches'); assert.equal(cut.reason, cutText); assert.equal(cut.backup, cutText);
  assert.equal(cut.level, base.level, 'la sauvegarde ne doit pas modifier la fiabilité météo et pneus');
  assert.equal(ctx.D.confidence({ ...fresh, backup: { ok: true, text: 'x' } }).reason, 'Données critiques fraîches');
  for (const key of ['reconnect', 'off', 'offline', 'action', 'waiting']) {
    const opts = { reconnect: { hint: { folder: 'f' } }, off: {}, offline: { connected: true, selected: true, online: false }, action: { connected: true, selected: true, status: { state: 'CONFLICT', message: 'conflit' } }, waiting: { connected: true, selected: true, status: { state: 'SYNC_BLOCKED', message: 'en attente' } } }[key];
    const sum = loadView(viewSource, opts).api.summary(); assert.equal(sum.ok, false, key + ' annoncé comme sauvegardé'); assert(/^Sauvegarde Drive · /.test(sum.text));
  }
  assert.equal(loadView(viewSource, { connected: true, selected: true, status: { state: 'SYNCED', message: 'synchronisé' }, syncedAt: T0 }).api.summary().ok, true);
  return true;
}
check('synthèse : Drive coupé, désactivé, hors ligne, en conflit ou en attente ⇒ jamais « Données critiques fraîches », coupure nommée, fiabilité météo inchangée', () => assert.equal(decisionOk(SRC.decision, SRC.view), true));
check('app : la synthèse reçoit l’état de la sauvegarde ; Diagnostic l’affiche', () => {
  assert(/storageDurable: USER_STORE\.durability\(\)\.status === 'durable', backup: driveBackupSummary\(\)/.test(SRC.app));
  assert(/DECISION_LAST\.confidence\.backup/.test(SRC.diag));
});
// ---------- Persistance du stockage ----------
async function persistOk(source, diagSource) {
  const run = async (persisted, grant, api = true) => {
    const calls = { persist: 0, persisted: 0 }, listeners = [];
    const st = { persisted: async () => { calls.persisted++; return persisted.v; }, persist: async () => { calls.persist++; persisted.v = grant; return grant; } };
    const ctx = vm.createContext({ Promise, Date, navigator: api ? { storage: st } : {}, window: { addEventListener: (k, f) => listeners.push([k, f]) } });
    vm.runInContext(source + ';this.P=STORAGE_PERSIST;this.t=storagePersistText;', ctx);
    const fire = async () => { for (const [k, f] of listeners) if (k === 'twrc-vault-change') f({ key: 'twrc.settings.v1' }); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };
    await new Promise(r => setTimeout(r, 0)); const before = calls.persist;
    await fire(); await fire(); await fire();
    return { calls, before, text: ctx.t(), P: ctx.P };
  };
  const refused = await run({ v: false }, false);
  assert.equal(refused.before, 0, 'persist() demandé au chargement, avant toute écriture'); assert.equal(refused.calls.persist, 1, 'persist() non demandé une seule fois : ' + refused.calls.persist);
  assert.equal(refused.text, 'persistant : non (demande refusée par le navigateur)');
  const granted = await run({ v: false }, true); assert.equal(granted.calls.persist, 1); assert.equal(granted.text, 'persistant : oui');
  const already = await run({ v: true }, true); assert.equal(already.calls.persist, 0, 'persist() redemandé alors que déjà accordé'); assert.equal(already.text, 'persistant : oui');
  const none = await run({ v: false }, false, false); assert.equal(none.text, 'persistant : inconnu');
  const row = (diagSource.match(/\['Stockage local',[^\n]+/) || [''])[0];
  assert(row && !/DURABLE/.test(row) && /storagePersistText\(\)/.test(row) && /relu après écriture/.test(row), 'Diagnostic : « DURABLE » ou persistance absente');
  return true;
}
const mutationsSync = [
  ['libellé de reconnexion différent dans le panneau', 'view', /!connected \? driveBadgeState\(\)\.label \+/, "!connected ? 'connexion requise' +", labelsOk],
  ['ancien bouton « Reprendre la synchronisation Drive »', 'view', /button\(DRIVE_RECONNECT, async/, "button('Reprendre la synchronisation Drive', async", labelsOk],
  ['dernière copie absente du badge', 'view', /text: DRIVE_LABEL\[key\] \+ \(withCopy \? ' · ' \+ driveCopyShort\(\) : ''\)/, 'text: DRIVE_LABEL[key]', copyOk],
  ['phrase complète absente de l’info-bulle', 'view', /hint: hint \+ \(withCopy \? ' État : ' \+ copy \+ '\.' : ''\)/, 'hint: hint', copyOk],
  ['retour à la ligne dans le bandeau', 'css', /text-overflow: ellipsis; white-space: nowrap;/, 'text-overflow: ellipsis;', s => { assert(/text-overflow: ellipsis; white-space: nowrap;/.test(s), 'badge sur plusieurs lignes'); return true; }],
  ['âge des modifications absent', 'view', / depuis ' \+ driveAge\(Date\.now\(\) - \(B\.pendingSince \|\| Date\.now\(\)\)\)/, "'", copyOk],
  ['mémoire du badge envoyée à Drive', 'view', /const DRIVE_BADGE_KEY = 'twrc\.sync\.badge\.v1';/, "const DRIVE_BADGE_KEY = 'twrc.badge.v1';", s => memoryOk(s, SRC.merge)],
  ['mémoire du badge relance la synchronisation', 'view', /if \(e && e\.key === DRIVE_BADGE_KEY\) return; /, '', s => memoryOk(s, SRC.merge)],
  ['« À jour » non mémorisé', 'view', /DRIVE_BADGE\.syncedAt = Date\.now\(\); driveBadgeSave\(had\);/, 'DRIVE_BADGE.syncedAt = Date.now();', s => memoryOk(s, SRC.merge)],
  ['synthèse rassurante malgré la coupure', 'decision', /reason: reasons\[0\] \|\| backup \|\| 'Données critiques fraîches'/, "reason: reasons[0] || 'Données critiques fraîches'", s => decisionOk(s, SRC.view)],
  ['Drive coupé compté comme sauvegardé', 'view', /ok: s\.key === 'synced' \|\| s\.key === 'sending'/, "ok: s.key !== 'action'", s => decisionOk(SRC.decision, s)],
];
const mutationsAsync = [
  ['persist() jamais demandé', 'persist', /window\.addEventListener\('twrc-vault-change', storagePersistAsk\); /, ''],
  ['persist() demandé à chaque écriture', 'persist', /if \(STORAGE_PERSIST\.asked\) return;\n/, ''],
  ['persist() demandé au chargement', 'persist', /storagePersistRefresh\(\); \} catch/, 'storagePersistAsk(); } catch'],
  ['« oui » sans relecture du navigateur', 'persist', /STORAGE_PERSIST\.persisted = v === true; return/, 'STORAGE_PERSIST.persisted = true; return'],
  ['Diagnostic : retour de « DURABLE »', 'diag', /relu après écriture : \$\{/, 'DURABLE : ${'],
];
(async () => {
  assert.equal(await persistOk(SRC.persist, SRC.diag), true); n++; console.log('✅ storage.persist() demandé à la première écriture du coffre, une seule fois, jamais si déjà accordé ; Diagnostic « persistant : oui/non/inconnu », plus de « DURABLE »');
  let killed = 0;
  for (const [name, file, from, to, fn] of mutationsSync) {
    const mutated = SRC[file].replace(from, to); assert.notEqual(mutated, SRC[file], 'mutation inapplicable : ' + name);
    let failed = false; try { fn(mutated); } catch (e) { failed = true; if (process.env.WHY) console.log('   ↳ ' + name + ' : ' + e.message.slice(0, 140)); }
    assert.equal(failed, true, 'contre-test non détecté : ' + name); killed++;
  }
  for (const [name, file, from, to] of mutationsAsync) {
    const mutated = SRC[file].replace(from, to); assert.notEqual(mutated, SRC[file], 'mutation inapplicable : ' + name);
    let failed = false; try { await persistOk(file === 'persist' ? mutated : SRC.persist, file === 'diag' ? mutated : SRC.diag); } catch (e) { failed = true; if (process.env.WHY) console.log('   ↳ ' + name + ' : ' + e.message.slice(0, 140)); }
    assert.equal(failed, true, 'contre-test non détecté : ' + name); killed++;
  }
  console.log(`✅ ${killed}/${mutationsSync.length + mutationsAsync.length} mutations rejetées (contre-tests)`);
  console.log(`\n✅ ${n} contrôles de sauvegarde visible`);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
