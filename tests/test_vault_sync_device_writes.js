// Constat C (30/10/2026) : l'iPhone n'intégrait pas les modifications du PC plus de 10 min après leur envoi.
// Reproduction SANS modifier session-vault.js : une écriture d'une donnée propre à l'appareil (position GPS,
// cache météo), exclue de la synchronisation, interrompt la lecture et l'écriture de synchro du coffre.
// Attendu en ÉCHEC sur main jusqu'au correctif autorisé ; volontairement non inscrit en CI. Données fictives.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), { webcrypto } = require('node:crypto');
const src = n => fs.readFileSync(path.join(__dirname, '../src/' + n + '.js'), 'utf8');
function fakeStorage() {
  const m = new Map();
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
}
const session = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
// Verrou exclusif fidèle à navigator.locks ; `arm(n, f)` exécute f juste avant la n-ième section critique suivante
// (1 = enregistrement préalable du coffre, 2 = lecture de l'instantané) : une écriture qui arrive dans ce créneau.
const locks = () => { let tail = Promise.resolve(), hook = null, left = 0;
  return { arm(n, f) { left = n; hook = f; }, request(name, options, fn) {
    const task = tail.then(() => { if (hook && --left === 0) { const f = hook; hook = null; f(); } return fn(); }); tail = task.catch(() => {}); return task; } }; };
const { load, business } = require('./lib/control-vault-owner');
// Profil fictif complet, même forme que e2e85 (réglages, journal archivé, contexte).
function profile() {
  const owner = load(), b = business(owner, 3), v = b.values, ctx = JSON.parse(v[owner.J.CONTEXT]);
  ctx.debrief.archive = owner.J.capture(v);
  return { 'twrc.settings.v1': JSON.stringify({ ...b.data.settings, edits: {}, calib: [], journal: {} }), [owner.J.KEY]: JSON.stringify(ctx.debrief.archive), [owner.J.CONTEXT]: JSON.stringify(ctx) };
}
(async () => {
  const ctx = { console, indexedDB: require('./lib/indexeddb.fake')(), setTimeout, clearTimeout, TextEncoder, TextDecoder, atob, btoa, JSON, Proxy, Reflect, Map, Set, Object, Array, Uint8Array, Promise, Error,
    Event: class { constructor(t) { this.type = t; } } };
  vm.createContext(ctx);
  vm.runInContext(src('journal-archive') + '\n' + src('device-storage') + '\n' + src('remember-device') + '\n' + src('session-vault') + ';this.SV=SessionVault;this.RD=RememberDevice;this.J=JournalArchive;', ctx);
  const { SV, RD, J } = ctx, PASS = 'code-fictif-de-test-1234';
  async function vault() {
    const raw = fakeStorage(), L = locks();
    const vs = SV.create({ raw, session: session(), crypto: webcrypto, target: null, sessionKeys: RD.sessions, locks: L });
    await vs.boot();
    await vs.unlock(PASS, profile(), true);
    assert.equal(vs.mode, 'vault'); await vs.flush(); assert.equal(vs.error, null, 'montage : coffre sain');
    await vs.syncSnapshot();   // montage : un instantané sans écriture concurrente doit réussir
    return { vs, L };
  }
const withKm = values => { const st = JSON.parse(values['twrc.settings.v1']); st.cars[0].odo = [...st.cars[0].odo, { d: '2026-10-29', km: 45000 }]; return { ...values, 'twrc.settings.v1': JSON.stringify(st) }; };
  let fail = 0;
  const check = async (name, fn) => { try { await fn(); console.log('✅ ' + name); } catch (e) { fail++; console.log('❌ ' + name + ' · ' + (e && e.message)); } };
  await check('instantané de synchro : une écriture GPS (hors synchro) juste avant la lecture ne l’empêche pas', async () => {
    const { vs, L } = await vault();
    L.arm(2, () => vs.store.setItem('twrc.gps', JSON.stringify({ lat: 1, lon: 2, ts: 2 })));
    const snap = await vs.syncSnapshot();
    assert.ok(snap.values['twrc.settings.v1'], 'instantané obtenu');
  });
  await check('fusion de synchro : une écriture GPS (hors synchro) pendant la fusion ne l’annule pas', async () => {
    const { vs } = await vault();
    const changed = await vs.syncApply(withKm,
      async () => { vs.store.setItem('twrc.cache.home', JSON.stringify({ t: 2 })); });   // météo écrite pendant la copie avant fusion
    assert.equal(changed, true, 'fusion appliquée');
    assert.match(vs.store.getItem('twrc.settings.v1'), /"km":45000/);
  });
  await check('contrôle (doit rester vrai) : une saisie SYNCHRONISÉE pendant la fusion l’annule toujours, rien n’est écrasé', async () => {
    const { vs } = await vault();
    await assert.rejects(vs.syncApply(withKm, async () => {
      const st = JSON.parse(vs.store.getItem('twrc.settings.v1')); st.cars[0].short = 'Saisie locale'; vs.store.setItem('twrc.settings.v1', JSON.stringify(st)); }), e => e.conflict === true);
    assert.match(vs.store.getItem('twrc.settings.v1'), /Saisie locale/); assert.doesNotMatch(vs.store.getItem('twrc.settings.v1'), /"km":45000/);
  });
  console.log(fail ? fail + ' scénario(s) en échec : défaut reproduit' : 'aucun échec');
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exit(2); });
