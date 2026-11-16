// Lot A (audit du 15/11/2026, constat F2) · démarrage du coffre en « fail closed ». Données 100 % fictives.
// Invariants :
//  I1 un coffre présent n'est jamais remplacé sans avoir été relu et authentifié avec le code disponible ;
//  I2 coffre illisible ou ouvert par un autre code : aucune écriture, octets du coffre ET copie en clair intacts, code demandé ;
//  I3 une copie en clair qui diffère d'un coffre authentifié n'est jamais détruite : le coffre fait foi, la copie est gardée
//     CHIFFRÉE (twrc.restore.stray.v1), le journal reste visible et complet ;
//  I4 un nettoyage incomplet après un coffre vérifié ne renvoie pas l'app sur des copies en clair partielles ;
//  I5 la copie de récupération restaurée de façon indépendante contient exactement les mêmes valeurs métier.
// Exécution : node tests/test_vault_boot_failclosed.js            (code du dépôt, contre-tests compris)
//             VAULT_SRC=<fichier> node tests/test_vault_boot_failclosed.js   (autre version, sans contre-tests : preuve « avant »)
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), { webcrypto } = require('node:crypto');
const sourcePath = process.env.VAULT_SRC ? path.resolve(process.env.VAULT_SRC) : path.join(__dirname, '../src/session-vault.js');
const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const PASS = 'code-fictif-lot-a-1234', OTHER = 'autre-code-fictif-9876', RECOVER = 'twrc.restore.stray.v1';

function fakeStorage({ refuseRemove = () => false, quota = Infinity } = {}) {
  const m = new Map(), size = () => [...m].reduce((a, [k, v]) => a + k.length + v.length, 0);
  return {
    get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.has(k) ? m.get(k) : null,
    setItem(k, v) { v = String(v); const old = m.get(k) ?? null, next = size() - (old ? k.length + old.length : 0) + k.length + v.length;
      if (next > quota) throw Object.assign(new Error('quota fictif'), { name: 'QuotaExceededError' }); m.set(k, v); },
    removeItem(k) { if (refuseRemove(k)) throw Object.assign(new Error('suppression refusée (fictif)'), { name: 'SecurityError' }); m.delete(k); },
    dump: () => Object.fromEntries(m), set quota(q) { quota = q; }
  };
}
const session = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const fakeLocks = () => { let tail = Promise.resolve(); return { request(name, o, fn) { const t = tail.then(fn); tail = t.catch(() => {}); return t; } }; };
const entry = (key, at) => ({ key, at, how: 'confirmé', name: 'Trajet fictif ' + key, from: 'Lieu A', to: 'Lieu B', feedback: { at: at + 100, conditions: ['wet'], grip: 'normal' } });
const J3 = [entry('fiction-1', 1e12), entry('fiction-2', 1e12 + 1), entry('fiction-3', 1e12 + 2)];
const PROFILE = () => ({
  'twrc.settings.v1': JSON.stringify({ configured: 1, cars: [{ id: 'vehicule-fictif', name: 'Véhicule fictif', odo: [{ d: '2026-11-01', km: 1200 }] }] }),
  'twrc.context.v1': JSON.stringify({ v: 1, debrief: { entries: J3 } }),
  'twrc.tripcancel': JSON.stringify({ e: ['annulation-fictive'] })
});

async function runTests(source, { quiet = false, keepGoing = false } = {}) {
  const indexedDB = require('./lib/indexeddb.fake')();
  const ctx = { console, indexedDB, setTimeout, clearTimeout, TextEncoder, TextDecoder, atob, btoa, JSON, Proxy, Reflect, Map, Set, Object, Array, Uint8Array, Promise, Error, Event: class { constructor(t) { this.type = t; } } };
  vm.createContext(ctx);
  vm.runInContext(read('journal-archive.js') + '\n' + read('device-storage.js') + '\n' + read('remember-device.js') + '\n' + source + ';this.SV=SessionVault;this.J=JournalArchive;this.RD=RememberDevice;', ctx);
  const { SV, J } = ctx, crypto = webcrypto;
  let count = 0;
  const failures = [];
  // Mode rapport (VAULT_SRC) : chaque scénario est joué, même après un échec, pour la preuve « avant ».
  const test = async (name, fn) => { try { await fn(); } catch (e) { e.scenario = name; if (!keepGoing) throw e; failures.push(name); console.log('❌ ' + name + ' · ' + String(e.message).split('\n')[0].slice(0, 160)); return; } count++; if (!quiet) console.log('✅ ' + name); };
  const make = (raw, ses = session(), extra = {}) => SV.create({ raw, session: ses, crypto, target: null, sessionKeys: ctx.RD.sessions, locks: fakeLocks(), ...extra });
  const fill = (raw, o) => Object.entries(o).forEach(([k, v]) => raw.setItem(k, v));
  // Sources du journal d'un ensemble de valeurs, comptées par identifiant (jamais un every() sur un tableau vide).
  const keysOf = values => [...new Set(J.capture(values).records.map(r => JSON.parse(r)).filter(e => e && e.key).map(e => e.key))].sort();
  const storeValues = vs => { const o = {}; for (let i = 0; i < vs.store.length; i++) { const k = vs.store.key(i); if (SV.secret(k)) o[k] = vs.store.getItem(k); } return o; };
  const recoverBook = values => { assert.equal(typeof values[RECOVER], 'string', 'copie écartée absente du coffre'); const b = JSON.parse(values[RECOVER]); assert.equal(b.v, 1); assert(Array.isArray(b.items) && b.items.length > 0, 'carnet de récupération vide'); return b; };
  const plainKeys = raw => Object.keys(raw.dump()).filter(k => SV.secret(k)).sort();
  // Coffre v2 fictif créé par le chemin réel (migration d'un profil en clair), code PASS.
  async function vaultV2(raw = fakeStorage()) { fill(raw, { ...PROFILE(), 'twrc.key': PASS }); const vs = make(raw); assert.equal(await vs.boot(), 'vault'); assert.deepEqual(plainKeys(raw), []); return { raw, vs }; }
  async function vaultV3() {
    const { raw, vs } = await vaultV2(); const copy = await vs.recoverySnapshot(); await vs.activateJournal(copy, PASS);
    assert.equal(JSON.parse(raw.getItem(SV.VAULT)).v, 3, 'coffre v3 fictif'); return { raw, vs };
  }
  async function independentRestore(raw, expected) {
    // I5 : copie de récupération = octets du coffre ; relue par un lecteur neuf, comparée valeur par valeur.
    const values = await SV.readRecovery(raw.getItem(SV.VAULT), PASS, crypto);
    const keys = Object.keys(expected).filter(k => SV.secret(k)).sort();
    assert(keys.length >= 4, 'comparaison exhaustive sur un ensemble non vide');
    assert.deepEqual(Object.keys(values).filter(k => k !== 'twrc.key').sort(), keys.filter(k => k !== 'twrc.key'));
    for (const k of keys) assert.equal(values[k], expected[k], 'valeur restaurée différente : ' + k);
    return values;
  }

  await test('I3 · coffre v2 (3 trajets) + ancienne copie en clair du même code avec journal vide : le journal reste visible, la copie est gardée chiffrée', async () => {
    const { raw } = await vaultV2();
    fill(raw, { 'twrc.key': PASS, 'twrc.context.v1': JSON.stringify({ v: 1, debrief: { entries: [] } }), 'twrc.settings.v1': JSON.stringify({ configured: 1, cars: [] }) });
    const vs = make(raw); assert.equal(await vs.boot(), 'vault');
    const vals = storeValues(vs);
    assert.deepEqual(keysOf(vals), ['fiction-1', 'fiction-2', 'fiction-3'], 'journal du coffre visible et complet');
    assert.match(vals['twrc.settings.v1'], /Véhicule fictif/, 'réglages du coffre retenus');
    const book = recoverBook(vals); assert.equal(book.items.length, 1);
    assert.equal(book.items[0].values['twrc.settings.v1'], JSON.stringify({ configured: 1, cars: [] }), 'copie en clair conservée à l’identique');
    assert.equal(book.items[0].values['twrc.key'], undefined, 'le code n’est pas recopié');
    assert.deepEqual(plainKeys(raw), [], 'plus aucune copie lisible'); assert.match(vs.warn || '', /conservée chiffrée/);
    await independentRestore(raw, vals);
  });
  await test('I2 · ancienne copie en clair d’un AUTRE code : aucune écriture, coffre et copie intacts à l’octet, code demandé', async () => {
    const { raw } = await vaultV2();
    const plain = { 'twrc.key': OTHER, 'twrc.settings.v1': JSON.stringify({ configured: 1, cars: [{ id: 'autre-fictif' }] }) };
    fill(raw, plain); const before = JSON.stringify(raw.dump());
    const vs = make(raw); assert.equal(await vs.boot(), 'locked'); assert.equal(JSON.stringify(raw.dump()), before, 'stockage brut inchangé');
    assert.match(vs.warn || '', /rien n’a été remplacé/);
    await vs.unlock(PASS); const vals = storeValues(vs);
    assert.deepEqual(keysOf(vals), ['fiction-1', 'fiction-2', 'fiction-3']);
    assert.equal(recoverBook(vals).items[0].values['twrc.settings.v1'], plain['twrc.settings.v1'], 'copie de l’autre code conservée chiffrée');
    assert.deepEqual(plainKeys(raw), []);
    await independentRestore(raw, vals);
  });
  await test('I2 · coffre illisible (version future) + copie en clair : aucune écriture, rien d’effacé, verrouillé', async () => {
    const { raw } = await vaultV2(); const v = JSON.parse(raw.getItem(SV.VAULT)); v.v = 9; raw.setItem(SV.VAULT, JSON.stringify(v));
    fill(raw, { ...PROFILE(), 'twrc.key': PASS }); const before = JSON.stringify(raw.dump());
    const vs = make(raw); assert.equal(await vs.boot(), 'locked'); assert.equal(JSON.stringify(raw.dump()), before); assert.match(vs.warn || '', /illisible/);
    await assert.rejects(vs.unlock(PASS), /illisible/); assert.equal(JSON.stringify(raw.dump()), before, 'refus du code sans écriture');
  });
  await test('I2 · coffre altéré (texte chiffré modifié) + copie en clair du même code : aucune écriture', async () => {
    const { raw } = await vaultV2(); const v = JSON.parse(raw.getItem(SV.VAULT)); const c = Buffer.from(v.c, 'base64'); c[7] ^= 1; v.c = c.toString('base64'); raw.setItem(SV.VAULT, JSON.stringify(v));
    fill(raw, { 'twrc.key': PASS, 'twrc.context.v1': JSON.stringify({ v: 1, debrief: { entries: [] } }) }); const before = JSON.stringify(raw.dump());
    const vs = make(raw); assert.equal(await vs.boot(), 'locked'); assert.equal(JSON.stringify(raw.dump()), before);
  });
  await test('I3 · coffre v3 + copie en clair du même code avec archive vide : archive jamais réduite, journal visible', async () => {
    const { raw } = await vaultV3();
    fill(raw, { 'twrc.key': PASS, [J.KEY]: JSON.stringify({ v: 1, records: [] }), 'twrc.context.v1': JSON.stringify({ v: 1, debrief: { entries: [] } }) });
    const vs = make(raw); assert.equal(await vs.boot(), 'vault'); const vals = storeValues(vs);
    assert.deepEqual(keysOf({ [J.KEY]: vals[J.KEY] }), ['fiction-1', 'fiction-2', 'fiction-3'], 'archive exhaustive conservée');
    assert.deepEqual(keysOf(vals), ['fiction-1', 'fiction-2', 'fiction-3']);
    assert.equal(JSON.parse(raw.getItem(SV.VAULT)).v, 3); recoverBook(vals);
    await independentRestore(raw, vals);
  });
  await test('I4 · migration d’un profil en clair, suppression refusée sur une clé pendant le nettoyage : le coffre vérifié fait foi', async () => {
    const raw = fakeStorage({ refuseRemove: k => k === 'twrc.settings.v1' });
    fill(raw, PROFILE()); raw.setItem('twrc.key', PASS);   // le code en dernier : son retrait doit passer quand même en premier
    const vs = make(raw); assert.equal(await vs.boot(), 'vault', 'jamais renvoyé sur des copies en clair partielles');
    assert.match(vs.warn || '', /copies lisibles/); assert.equal(raw.getItem('twrc.key'), null, 'code en clair retiré en premier');
    const vals = storeValues(vs); assert.deepEqual(keysOf(vals), ['fiction-1', 'fiction-2', 'fiction-3']);
    // l'utilisateur continue : sa modification va au coffre ; la copie périmée restante ne la remplace pas au démarrage suivant
    vs.store.setItem('twrc.settings.v1', JSON.stringify({ configured: 1, cars: [], apres: 'modification fictive' })); await vs.flush(); assert.equal(vs.error, null);
    const ses = session(); const next = make(raw, ses); assert.equal(await next.boot(), 'locked'); await next.unlock(PASS);
    const after = storeValues(next); assert.match(after['twrc.settings.v1'], /modification fictive/, 'la modification récente fait foi');
    assert.equal(recoverBook(after).items[0].values['twrc.settings.v1'], PROFILE()['twrc.settings.v1'], 'copie restante gardée chiffrée');
    assert.deepEqual(keysOf(after), ['fiction-1', 'fiction-2', 'fiction-3']);
  });
  await test('I3 · réunion impossible (stockage plein) : coffre inchangé à l’octet, copie en clair NON supprimée, avertissement', async () => {
    const { raw } = await vaultV2(); const newer = JSON.stringify({ v: 1, debrief: { entries: [entry('en-clair-fictif', 2e12)] } });
    fill(raw, { 'twrc.key': PASS, 'twrc.context.v1': newer }); const vault = raw.getItem(SV.VAULT);
    raw.quota = Object.entries(raw.dump()).reduce((a, [k, v]) => a + k.length + v.length, 0) - 1;
    const vs = make(raw); assert.equal(await vs.boot(), 'vault'); assert.match(vs.warn || '', /conservée telle quelle/);
    assert.equal(raw.getItem(SV.VAULT), vault, 'coffre inchangé'); assert.equal(raw.getItem('twrc.context.v1'), newer, 'copie en clair intacte');
    assert.equal(raw.getItem('twrc.key'), PASS, 'rien retiré');
    assert.deepEqual(keysOf(storeValues(vs)), ['fiction-1', 'fiction-2', 'fiction-3'], 'le coffre authentifié reste utilisable');
    raw.quota = Infinity; const again = make(raw); assert.equal(await again.boot(), 'vault');
    assert.equal(recoverBook(storeValues(again)).items[0].values['twrc.context.v1'], newer, 'place retrouvée : copie gardée chiffrée'); assert.deepEqual(plainKeys(raw), []);
  });
  await test('non-régression · migration ordinaire d’un profil en clair : coffre vérifié, plus aucune copie lisible, aucune entrée de récupération', async () => {
    const raw = fakeStorage(); fill(raw, { ...PROFILE(), 'twrc.key': PASS }); const vs = make(raw); assert.equal(await vs.boot(), 'vault');
    const vals = storeValues(vs); for (const [k, v] of Object.entries(PROFILE())) assert.equal(vals[k], v, k);
    assert.equal(vals[RECOVER], undefined); assert.deepEqual(plainKeys(raw), []); assert.equal(vs.warn, null);
  });
  await test('non-régression · migration interrompue après écriture du coffre (copies identiques) : nettoyage terminé sans réécriture', async () => {
    const raw = fakeStorage(); fill(raw, { ...PROFILE(), 'twrc.key': PASS }); await make(raw).boot(); const vault = raw.getItem(SV.VAULT);
    fill(raw, { ...PROFILE(), 'twrc.key': PASS }); const vs = make(raw); assert.equal(await vs.boot(), 'vault');
    assert.equal(raw.getItem(SV.VAULT), vault, 'aucune réécriture'); assert.deepEqual(plainKeys(raw), []); assert.equal(storeValues(vs)[RECOVER], undefined);
  });
  await test('non-régression · stockage plein au déverrouillage avec une copie égarée : coffre intact à l’octet, copie en clair non retirée', async () => {
    const { raw } = await vaultV2(); fill(raw, { 'twrc.tripcancel': JSON.stringify({ e: ['egaree-fictive'] }) });
    const vault = raw.getItem(SV.VAULT); raw.quota = Object.entries(raw.dump()).reduce((a, [k, v]) => a + k.length + v.length, 0) - 1;   // même une réécriture de taille égale est refusée
    const vs = make(raw); assert.equal(await vs.boot(), 'locked'); await assert.rejects(vs.unlock(PASS));
    assert.equal(raw.getItem(SV.VAULT), vault); assert.match(raw.getItem('twrc.tripcancel'), /egaree-fictive/);
  });
  await test('non-régression · IndexedDB défaillant à la reprise d’une session mémorisée : verrouillé, coffre intact à l’octet', async () => {
    const { raw } = await vaultV2(); const vault = raw.getItem(SV.VAULT);
    const remembered = { resume: async () => { throw new Error('IndexedDB indisponible (fictif)'); }, clear: async () => {}, save: async () => {} };
    const vs = make(raw, session(), { remembered, sessionKeys: null }); assert.equal(await vs.boot(), 'locked'); assert.equal(raw.getItem(SV.VAULT), vault);
  });
  await test('deux onglets démarrent ensemble sur une copie d’un autre code : aucun des deux n’écrit', async () => {
    const { raw } = await vaultV2(); fill(raw, { 'twrc.key': OTHER, 'twrc.settings.v1': '{"onglet":1}' }); const before = JSON.stringify(raw.dump());
    const locks = fakeLocks(), a = make(raw, session(), { locks }), b = make(raw, session(), { locks });
    assert.deepEqual(await Promise.all([a.boot(), b.boot()]), ['locked', 'locked']); assert.equal(JSON.stringify(raw.dump()), before);
  });
  await test('idempotence · la même copie égarée réapparue deux fois : une seule entrée de récupération', async () => {
    const { raw } = await vaultV2(); const ses = session();
    for (let i = 0; i < 2; i++) { raw.setItem('twrc.tripcancel', JSON.stringify({ e: ['egaree-fictive'] })); const vs = make(raw, ses); if (await vs.boot() === 'locked') await vs.unlock(PASS); }
    const vs = make(raw, ses); if (await vs.boot() === 'locked') await vs.unlock(PASS);
    const book = recoverBook(storeValues(vs)); assert.equal(book.items.length, 1); assert.equal(book.items[0].values['twrc.tripcancel'], JSON.stringify({ e: ['egaree-fictive'] }));
  });
  if (failures.length) { const e = new Error(failures.length + ' scénario(s) en échec'); e.scenario = failures[0]; throw e; }
  return count;
}
module.exports = { runTests };
if (require.main === module) (async () => {
  const original = fs.readFileSync(sourcePath, 'utf8'), count = await runTests(original, { keepGoing: !!process.env.VAULT_SRC });
  if (process.env.VAULT_SRC) { console.log(`${count}/${count} scénarios OK (source : ${process.env.VAULT_SRC})`); return; }
  const mutations = [
    { name: 'copie en clair remplaçant le coffre authentifié (comportement d’avant le lot A)', from: 'let vals = mergeStray(data.values, snap, now());', to: 'let vals = { ...snap };' },
    { name: 'coffre illisible ou d’un autre code réécrit (fail open)', from: 'if (!data) {\n              if (rawKey) rawKey.fill(0);', to: 'if (false) {\n              if (rawKey) rawKey.fill(0);' },
    { name: 'copie écartée détruite au lieu d’être gardée chiffrée', from: "return preserve(values, stray, 'copie en clair', at);", to: 'return values;' },
    { name: 'nettoyage incomplet renvoyant l’app sur les copies en clair', from: 'try { dropPlain(raw, names); } catch (e) { /* vérifié ci-dessous */ }', to: 'dropPlain(raw, names);' },
    { name: 'copie en clair supprimée alors que la réunion a échoué', from: 'if (!stored && opened) {', to: 'if (false) {' },
    { name: 'code en clair retiré après les autres copies', from: "const names = Object.keys(snap).sort((a, b) => (b === 'twrc.key') - (a === 'twrc.key'));", to: 'const names = Object.keys(snap);' }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    let rejection; try { await runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rejection = e; }
    assert(rejection && rejection.scenario, 'La mutation doit être rejetée : ' + m.name + (rejection ? ' · ' + rejection.message : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
})().catch(e => { console.error('❌ ' + (e.scenario || '') + ' · ' + e.message); process.exit(1); });
