'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto').webcrypto;
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/device-storage.js'), 'utf8');
const ctx = { TextEncoder, TextDecoder, Uint8Array, btoa, atob }; vm.createContext(ctx); vm.runInContext(source + ';this.api=DeviceStorage;', ctx);
const D = ctx.api, json = x => JSON.parse(JSON.stringify(x)), CODE = 'fixture-local-lock-code-only';
function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { map, get length() { return map.size; }, key: i => [...map.keys()][i] || null,
    getItem: k => map.get(k) ?? null, setItem(k, v) { if (this.fail && this.fail(k, v, 'set')) throw new Error('QuotaExceededError'); if (this.silent !== k) map.set(k, String(v)); },
    removeItem(k) { if (this.fail && this.fail(k, null, 'remove')) throw new Error('StorageError'); map.delete(k); } };
}
const old = { 'twrc.settings.v1': 'old settings', 'twrc.context.v1': 'old journal', 'twrc.gps': 'old position', 'other.application': 'keep' };
const plan = () => ({ writes: { 'twrc.settings.v1': 'new settings', 'twrc.context.v1': 'merged journal' }, remove: ['twrc.gps'], removePrefixes: ['twrc.cache.', 'twrc.croute.'] });
let n = 0;
async function check(name, test) { await test(); n++; console.log('✅ ' + name); }
(async () => {
  await check('import validé : réglages, journal et suppressions cohérents, autres applications intactes', () => {
    const s = storage({ ...old, 'twrc.cache.home': 'derived', 'twrc.croute.a': 'route cache' }); D.apply(s, plan());
    assert.equal(s.getItem('twrc.settings.v1'), 'new settings'); assert.equal(s.getItem('twrc.context.v1'), 'merged journal');
    assert.equal(s.getItem('twrc.gps'), null); assert.equal(s.getItem('other.application'), 'keep'); assert.equal(s.getItem(D.PENDING), null);
    assert.equal(s.getItem('twrc.croute.a'), null);
  });
  await check('échec à la deuxième écriture : anciens réglages et journal rétablis', () => {
    const s = storage(old); s.fail = (k, v) => k === 'twrc.context.v1' && v === 'merged journal';
    assert.throws(() => D.apply(s, plan()), /QuotaExceeded/); assert.deepEqual(Object.fromEntries(s.map), old);
  });
  await check('écriture silencieusement ignorée : aucun faux succès', () => {
    const s = storage(old); s.silent = 'twrc.context.v1';
    assert.throws(() => D.apply(s, plan()), /non confirmée/); assert.deepEqual(Object.fromEntries(s.map), old);
  });
  await check('quota sur le journal de récupération : données durables inchangées', () => {
    const s = storage(old); s.fail = k => k === D.PENDING;
    assert.throws(() => D.apply(s, plan()), /QuotaExceeded/); assert.deepEqual(Object.fromEntries(s.map), old);
  });
  await check('retour arrière refusé : récupération conservée, lecture masquée puis restauration au redémarrage', () => {
    const s = storage(old); s.fail = (k, v) => k === 'twrc.context.v1' && v === 'merged journal' || k === 'twrc.settings.v1' && v === 'old settings';
    let failure; try { D.apply(s, plan()); } catch (e) { failure = e; }
    assert.equal(failure.recoveryPending, true); assert.ok(s.getItem(D.PENDING));
    const target = {}; D.bootstrap(target, s); assert.equal(target.TWRC_STORAGE_ERROR, true);
    assert.equal(D.guard(s, () => target.TWRC_STORAGE_ERROR).getItem('twrc.context.v1'), null);
    s.fail = null; D.recover(s); assert.deepEqual(Object.fromEntries(s.map), old);
  });
  await check('interruption après écritures : ancien état récupéré avant utilisation', () => {
    const s = storage({ ...old, 'twrc.settings.v1': 'new settings', [D.PENDING]: JSON.stringify({ v: 1, before: oldWithoutOther() }) });
    D.recover(s); assert.deepEqual(Object.fromEntries(s.map), old);
  });
  await check('journal étranger ou invalide : aucune écriture hors Race Control', () => {
    const s = storage({ ...old, [D.PENDING]: JSON.stringify({ v: 1, before: { 'other.application': 'overwrite' } }) });
    assert.throws(() => D.recover(s)); assert.equal(s.getItem('other.application'), 'keep');
    assert.throws(() => D.apply(storage(old), { ...plan(), writes: { 'other.application': 'bad' } }));
  });
  await check('verrouillage : coffre authentifié, plus de réglages/code/GPS lisibles, journal récupérable', async () => {
    const s = storage({ ...old, 'twrc.key': CODE, 'twrc.plain': 'fictional preset', 'twrc.presetv': 'old-version', 'twrc.cache.home': 'weather' });
    const expected = Object.fromEntries([...s.map].filter(([k]) => k.startsWith('twrc.') && k !== 'twrc.key' && !k.startsWith('twrc.cache.')));
    await D.lock(s, CODE, crypto);
    assert.equal(D.isLocked(s), true); assert.deepEqual([...s.map.keys()].sort(), [D.VAULT, 'other.application'].sort());
    assert.ok(!s.getItem(D.VAULT).includes('old journal')); assert.equal(s.getItem('twrc.key'), null);
    const p = await D.unlockPlan(s, CODE, crypto); assert.deepEqual(json(p.writes), expected);
    D.apply(s, p); assert.equal(D.isLocked(s), false); assert.equal(s.getItem('twrc.context.v1'), 'old journal');
    assert.equal(s.getItem('twrc.presetv'), 'old-version');
  });
  await check('mauvais code : aucun état déchiffré ou modifié', async () => {
    const s = storage(old); await D.lock(s, CODE, crypto); const before = [...s.map];
    await assert.rejects(D.unlockPlan(s, 'another-fixture-code', crypto)); assert.deepEqual([...s.map], before);
  });
  await check('quota avant écriture du coffre : aucune suppression des données', async () => {
    const s = storage(old); s.fail = k => k === D.VAULT;
    await assert.rejects(D.lock(s, CODE, crypto)); assert.deepEqual(Object.fromEntries(s.map), old);
  });
  await check('nettoyage interrompu : coffre conservé, garde fermée, nettoyage repris au démarrage', async () => {
    const s = storage(old); s.fail = (k, v, kind) => k === 'twrc.context.v1' && kind === 'remove';
    await assert.rejects(D.lock(s, CODE, crypto)); assert.equal(D.isLocked(s), true);
    const safe = D.guard(s); assert.equal(safe.getItem('twrc.context.v1'), null); safe.setItem('twrc.gps', 'late response');
    assert.notEqual(s.getItem('twrc.gps'), 'late response');
    s.fail = null; D.bootstrap({}, s); assert.equal(s.getItem('twrc.context.v1'), null);
    D.apply(s, await D.unlockPlan(s, CODE, crypto)); assert.equal(s.getItem('twrc.context.v1'), 'old journal');
  });
  await check('déverrouillage refusé à mi-chemin : coffre et journal conservés', async () => {
    const s = storage(old); await D.lock(s, CODE, crypto); const cipher = s.getItem(D.VAULT), p = await D.unlockPlan(s, CODE, crypto);
    s.fail = k => k === 'twrc.context.v1'; assert.throws(() => D.apply(s, p));
    assert.equal(s.getItem(D.VAULT), cipher); assert.equal(s.getItem('twrc.settings.v1'), null);
    s.fail = null; D.apply(s, await D.unlockPlan(s, CODE, crypto)); assert.equal(s.getItem('twrc.context.v1'), 'old journal');
  });
  await check('gel pendant le chiffrement : réponses tardives empêchées d’écrire', () => {
    const s = storage(old), safe = D.guard(s); D.freeze(true); safe.setItem('twrc.gps', 'late');
    assert.equal(s.getItem('twrc.gps'), 'old position'); assert.equal(safe.getItem('twrc.settings.v1'), null); D.freeze(false);
  });
  await check('coffre déjà invalide : aucun effacement des réglages au démarrage', () => {
    const s = storage({ ...old, [D.VAULT]: 'broken' }), target = {};
    D.bootstrap(target, s); assert.equal(target.TWRC_STORAGE_ERROR, true);
    assert.equal(s.getItem('twrc.settings.v1'), 'old settings'); assert.equal(s.getItem('twrc.context.v1'), 'old journal');
  });
  await check('écriture altérant le coffre : données originales intactes, verrouillage refusé', async () => {
    const s = storage(old), original = s.setItem;
    s.setItem = function(k, v) { return original.call(this, k, k === D.VAULT ? 'broken' : v); };
    await assert.rejects(D.lock(s, CODE, crypto)); assert.deepEqual(Object.fromEntries(s.map), old);
  });
  console.log(`${n}/${n} scénarios OK`);
})().catch(e => { console.error(e); process.exitCode = 1; });
function oldWithoutOther() { return Object.fromEntries(Object.entries(old).filter(([k]) => k.startsWith('twrc.'))); }
