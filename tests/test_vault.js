// Stockage local sûr (src/vault.js) : import vérifié sans faux succès (audit A02) et verrouillage réel (audit A01).
// Stockage fictif contrôlable (quota, refus d'une clé, échec à la n-ième écriture) ; WebCrypto réel de Node.
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const { webcrypto } = require('node:crypto');
const S = require(path.join(__dirname, '../src/vault.js'));
function store(init = {}, { quota = Infinity, refuse = [], failAt = 0 } = {}) {
  const m = new Map(Object.entries(init)); let writes = 0;
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + String(v).length, 0);
  return {
    m, get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.has(k) ? m.get(k) : null,
    setItem(k, v) {
      writes++;
      if (refuse.includes(k) || (failAt && writes === failAt)) throw Object.assign(new Error('refus'), { name: 'SecurityError' });
      const prev = m.get(k); m.set(k, String(v));
      if (size() > quota) { if (prev == null) m.delete(k); else m.set(k, prev); throw Object.assign(new Error('plein'), { name: 'QuotaExceededError' }); }
    },
    removeItem: k => { m.delete(k); }
  };
}
const OLD = { 'twrc.settings.v1': '{"locs":[{"name":"Maison fictive","lat":48.1}]}', 'twrc.context.v1': '{"debrief":{"entries":[{"key":"j1"}]}}',
  'twrc.cache.home': '{"lat":48.1,"p":1}', 'twrc.gps': '{"lat":48.1}', 'twrc.view': 'meteo' };
const PLAN = () => ({ writes: { 'twrc.settings.v1': '{"locs":[{"name":"Nouvelle maison"}]}', 'twrc.context.v1': '{"debrief":{"entries":[{"key":"j1"},{"key":"j2"}]}}', 'twrc.view': 'pneus' },
  remove: ['twrc.gps', 'twrc.context.v1'], removePrefixes: ['twrc.cache.'] });
const snap = s => JSON.stringify([...s.m].sort());
const canon = s => JSON.stringify([...s.m].filter(([k]) => !k.startsWith('twrc.cache.')).sort());
let n = 0; const test = async (name, fn) => { await fn(); n++; console.log('✅ ' + name); };
(async () => {
  // ---------- A02 : import ----------
  await test('A02 · import normal : retraits et écritures vérifiés, succès', async () => {
    const s = store(OLD), r = S.apply(PLAN(), s);
    assert.equal(r.ok, true); assert.equal(s.getItem('twrc.view'), 'pneus'); assert.equal(s.getItem('twrc.gps'), null); assert.equal(s.getItem('twrc.cache.home'), null);
    assert.match(s.getItem('twrc.context.v1'), /j2/);
  });
  await test('A02 · écriture du contexte refusée (cas de l’audit) : échec annoncé, ancien état intégralement rétabli', async () => {
    const s = store(OLD, { refuse: ['twrc.context.v1'] }), before = snap(s), r = S.apply(PLAN(), s);
    assert.equal(r.ok, false); assert.equal(r.rolledBack, true); assert.equal(snap(s), before, 'réglages, contexte, GPS et caches comme avant');
  });
  await test('A02 · échec sur la deuxième écriture : aucun mélange anciens/nouveaux réglages', async () => {
    const s = store(OLD, { failAt: 2 }), before = snap(s), r = S.apply(PLAN(), s);
    assert.equal(r.ok, false); assert.equal(snap(s), before);
  });
  await test('A02 · quota dépassé : erreur « quota », rien n’est modifié', async () => {
    const big = { ...PLAN(), writes: { ...PLAN().writes, 'twrc.settings.v1': 'x'.repeat(5000) } };
    const s = store(OLD, { quota: 1200 }), before = snap(s), r = S.apply(big, s);
    assert.equal(r.ok, false); assert.equal(r.error, 'quota'); assert.equal(snap(s), before);
  });
  await test('A02 · stockage qui altère une écriture (relecture différente) : échec, et retour incomplet signalé honnêtement', async () => {
    const s = store(OLD), set = s.setItem.bind(s); s.setItem = (k, v) => set(k, k === 'twrc.settings.v1' ? String(v).slice(0, 5) : v);
    const r = S.apply(PLAN(), s);
    assert.equal(r.ok, false); assert.equal(r.error, 'verify');
    assert.equal(r.rolledBack, false, 'la clé altérée ne peut pas être rétablie : jamais annoncé comme « rien n’a été modifié »'); assert.deepEqual(r.failed, ['twrc.settings.v1']);
    assert.equal(s.getItem('twrc.context.v1'), OLD['twrc.context.v1']); assert.equal(s.getItem('twrc.gps'), OLD['twrc.gps']);
  });

  // ---------- A01 : verrouillage ----------
  const PERSO = { ...OLD, 'twrc.place.v1': '{"conf":{"placeId":"home"}}', 'twrc.croute.x': '{"g":[[48.1,2.2]]}', 'twrc.tyretherm.v1': '{"car1":{"T":20}}',
    'twrc.debrief.v1': '{"entries":[1]}', 'twrc.cfghash': 'eyJsb2NzIjpbXX0', 'twrc.plain': '{"locs":[{"name":"Maison fictive"}]}', 'twrc.plain.v': 'abc',
    'twrc.key': 'code-fictif-1234', 'twrc.weather.limit.v1': '{"until":0}', 'autre.app': 'intact' };
  const fast = { iterations: 1000 };
  await test('A01 · verrouiller : plus aucune donnée personnelle en clair, ni code ; technique et autres apps intactes', async () => {
    const s = store(PERSO), r = await S.lock(s, 'code-fictif-1234', webcrypto, fast);
    assert.equal(r.ok, true);
    const clear = [...s.m].filter(([k]) => k !== S.VAULT).map(([k, v]) => k + '=' + v).join('\n');
    assert(!/Maison fictive|48\.1|code-fictif|placeId|j1|car1/.test(clear), clear);
    for (const k of ['twrc.settings.v1', 'twrc.context.v1', 'twrc.cache.home', 'twrc.gps', 'twrc.croute.x', 'twrc.cfghash', 'twrc.plain', 'twrc.key']) assert.equal(s.getItem(k), null, k);
    assert.equal(s.getItem('twrc.weather.limit.v1'), '{"until":0}'); assert.equal(s.getItem('twrc.view'), 'meteo'); assert.equal(s.getItem('autre.app'), 'intact');
    assert(!/Maison fictive|48\.1/.test(s.getItem(S.VAULT)), 'coffre chiffré');
  });
  await test('A01 · déverrouiller avec le même code : tout revient à l’identique, données génériques du mode verrouillé remplacées', async () => {
    const s = store(PERSO); await S.lock(s, 'code-fictif-1234', webcrypto, fast);
    s.setItem('twrc.settings.v1', '{"locs":[{"name":"Paris"}]}'); s.setItem('twrc.cache.paris', '{"lat":48.85}');   // pendant le verrouillage
    const r = await S.unlock(s, 'code-fictif-1234', webcrypto);
    assert.equal(r.ok, true); assert.equal(s.getItem(S.VAULT), null); assert.equal(s.getItem('twrc.cache.paris'), null);
    for (const k of Object.keys(PERSO).filter(k => !S.UNLOCKED.includes(k))) assert.equal(s.getItem(k), PERSO[k], k);
  });
  await test('A01 · mauvais code : coffre intact, rien de restauré', async () => {
    const s = store(PERSO); await S.lock(s, 'code-fictif-1234', webcrypto, fast); const v = s.getItem(S.VAULT);
    const r = await S.unlock(s, 'autre-code', webcrypto); assert.equal(r.ok, false); assert.equal(r.error, 'code'); assert.equal(s.getItem(S.VAULT), v); assert.equal(s.getItem('twrc.settings.v1'), null);
  });
  await test('A01 · stockage plein au verrouillage : verrouillage annulé, aucune donnée effacée', async () => {
    const used = Object.entries(PERSO).reduce((n, [k, v]) => n + k.length + v.length, 0), s = store(PERSO, { quota: used + 100 }), before = snap(s), r = await S.lock(s, 'code-fictif-1234', webcrypto, fast);
    assert.equal(r.ok, false); assert.equal(r.error, 'quota'); assert.equal(snap(s), before);
  });
  await test('A01 · sans code enregistré : refus explicite, rien n’est effacé', async () => {
    const s = store(PERSO), before = snap(s), r = await S.lock(s, '', webcrypto, fast); assert.equal(r.error, 'nocode'); assert.equal(snap(s), before);
  });
  await test('A01 · stockage plein au déverrouillage : coffre conservé, état verrouillé inchangé', async () => {
    const s = store(PERSO); await S.lock(s, 'code-fictif-1234', webcrypto, fast);
    const vault = s.getItem(S.VAULT), q = store(Object.fromEntries(s.m), { quota: [...s.m].reduce((n, [k, v]) => n + k.length + v.length, 0) + 50 });
    const r = await S.unlock(q, 'code-fictif-1234', webcrypto); assert.equal(r.ok, false); assert.equal(q.getItem(S.VAULT), vault); assert.equal(q.getItem('twrc.settings.v1'), null);
  });
  await test('A01 · coffre restant d’un verrouillage interrompu : fusionné, rien n’est perdu', async () => {
    const s = store(PERSO); await S.lock(s, 'code-fictif-1234', webcrypto, fast);
    s.setItem('twrc.settings.v1', '{"v":"nouveau"}'); s.setItem('twrc.key', 'code-fictif-1234');
    const r = await S.lock(s, 'code-fictif-1234', webcrypto, fast); assert.equal(r.ok, true);
    await S.unlock(s, 'code-fictif-1234', webcrypto); assert.equal(s.getItem('twrc.settings.v1'), '{"v":"nouveau"}'); assert.equal(s.getItem('twrc.context.v1'), PERSO['twrc.context.v1']);
  });
  await test('intégration : build et application utilisent SafeStore (plus d’écriture d’import non vérifiée)', async () => {
    const fs = require('node:fs'), build = fs.readFileSync(path.join(__dirname, '../tools/build.js'), 'utf8'), app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
    assert(build.includes("r('src/vault.js')")); assert(app.includes('SafeStore.apply(plan, localStorage)')); assert(app.includes('SafeStore.lock(localStorage'));
    assert(app.includes('SafeStore.unlock(localStorage')); assert(!app.includes('function backupApplyPlan'));
  });
  console.log(n + '/' + n + ' scénarios OK');
})().catch(e => { console.error('❌', e); process.exit(1); });
