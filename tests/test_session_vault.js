// Sécurité V1 : coffre de session. Migration sans perte, reprise après interruption, stockage plein/refusé, mauvais code,
// verrouillage, coffre v1, multi-onglets, intégrité, aucune donnée sensible au repos. Données fictives uniquement.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), { webcrypto } = require('node:crypto');
const sourcePath = path.join(__dirname, '../src/session-vault.js');
// Storage minimal conforme (ordre d'insertion, quota optionnel, refus ciblé, événements « storage » entre onglets)
function fakeStorage({ quota = Infinity, refuse = () => false } = {}) {
  const m = new Map(), peers = new Set();
  const size = () => [...m].reduce((a, [k, v]) => a + k.length + v.length, 0);
  const s = {
    get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.has(k) ? m.get(k) : null,
    setItem(k, v) { v = String(v); if (refuse(k)) throw Object.assign(new Error('refus'), { name: 'SecurityError' });
      const old = m.get(k) ?? null, next = size() - (old ? k.length + old.length : 0) + k.length + v.length;
      if (next > quota) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); m.set(k, v); peers.forEach(f => f({ key: k, oldValue: old, newValue: v })); },
    removeItem(k) { const old = m.get(k) ?? null; m.delete(k); if (old != null) peers.forEach(f => f({ key: k, oldValue: old, newValue: null })); },
    dump: () => Object.fromEntries(m), peers, set quota(q) { quota = q; }
  };
  return s;
}
const session = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), dump: () => Object.fromEntries(m) }; };
async function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, atob, btoa, JSON, Proxy, Reflect, Map, Set, Object, Array, Uint8Array, Promise, Error, Event: class { constructor(t) { this.type = t; } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/device-storage.js'), 'utf8') + '\n' + source + ';this.SV=SessionVault;this.DS=DeviceStorage;', ctx);
  const { SV, DS } = ctx, crypto = webcrypto, PASS = 'code-fictif-de-test-1234';
  let count = 0;
  const test = async (name, fn) => { try { await fn(); } catch (error) { error.scenario = name; throw error; } count++; if (!options.quiet) console.log('✅ ' + name); };
  const tick = () => new Promise(r => setTimeout(r, 5));
  // profil fictif représentatif de l'ancien schéma (réglages, contexte, journal, voiture, GPS, caches, préférences publiques)
  const LEGACY = () => ({
    'twrc.key': PASS, 'twrc.plain': JSON.stringify({ locs: [{ id: 'home', name: 'Maison fictive', lat: 45.1234, lon: 4.5678 }] }), 'twrc.plain.v': 'v-test',
    'twrc.settings.v1': JSON.stringify({ locs: [{ id: 'home', name: 'Maison fictive', lat: 45.1234, lon: 4.5678 }], cars: [{ name: 'Voiture fictive', tire: { dot: '1825', tread: 2.3 } }] }),
    'twrc.context.v1': JSON.stringify({ debrief: { entries: [{ key: 'trajet-fictif', feedback: { grip: 'normal' } }] } }),
    'twrc.gps': JSON.stringify({ lat: 45.1234, lon: 4.5678, ts: 1 }), 'twrc.cache.home': JSON.stringify({ p: { hourly: { time: ['x'] } }, lat: 45.1234 }),
    'twrc.view': 'pneus', 'twrc.weather.limit.v1': JSON.stringify({ until: 1 }), 'autre.app': 'intacte'
  });
  const SENSITIVE = ['Maison fictive', '45.1234', PASS, 'Voiture fictive', 'trajet-fictif'];
  const leaks = raw => Object.entries(raw.dump()).filter(([k, v]) => k !== SV.VAULT && SENSITIVE.some(x => v.includes(x) || k.includes(x))).map(([k]) => k);
  const fill = (raw, o) => Object.entries(o).forEach(([k, v]) => raw.setItem(k, v));
  const make = (raw, ses = session()) => ({ vs: SV.create({ raw, session: ses, crypto, target: null }), ses });

  await test('migration d’un ancien profil en clair : coffre vérifié, données identiques, plus aucune copie lisible', async () => {
    const raw = fakeStorage(), L = LEGACY(); fill(raw, L); const { vs, ses } = make(raw);
    assert.equal(await vs.boot(), 'vault'); assert.equal(vs.migrated, true);
    for (const [k, v] of Object.entries(L)) if (SV.secret(k)) assert.equal(vs.store.getItem(k), v, k);
    assert.deepEqual(leaks(raw), []); assert.equal(raw.getItem('twrc.key'), null); assert.equal(raw.getItem('twrc.plain'), null); assert.equal(raw.getItem('twrc.settings.v1'), null);
    assert.equal(raw.getItem('twrc.view'), 'pneus', 'préférence publique conservée'); assert.equal(raw.getItem('autre.app'), 'intacte', 'clé d’une autre application intacte');
    assert(SV.validVault(JSON.parse(raw.getItem(SV.VAULT)))); assert(ses.getItem(SV.SESSION), 'clé de session de l’onglet');
    for (const x of SENSITIVE) assert(!raw.getItem(SV.VAULT).includes(x), 'coffre opaque : ' + x);
  });
  await test('réouverture (nouvel onglet) : verrouillé ; mauvais code refusé sans rien modifier ; bon code → données identiques', async () => {
    const raw = fakeStorage(), L = LEGACY(); fill(raw, L); await make(raw).vs.boot();
    const before = JSON.stringify(raw.dump()), { vs } = make(raw);
    assert.equal(await vs.boot(), 'locked'); assert.equal(vs.store.getItem('twrc.settings.v1'), null); assert.equal(vs.locked(), true);
    await assert.rejects(() => vs.unlock('mauvais-code'), e => e.name === 'OperationError'); assert.equal(JSON.stringify(raw.dump()), before, 'rien modifié');
    assert.equal(await vs.unlock(PASS), true); assert.equal(vs.mode, 'vault');
    for (const [k, v] of Object.entries(L)) if (SV.secret(k)) assert.equal(vs.store.getItem(k), v, k);
    assert.deepEqual(leaks(raw), []);
  });
  await test('rechargement du même onglet : déverrouillé sans code (clé de session), écritures rechiffrées et relues', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const ses = session(); const a = make(raw, ses).vs; await a.boot();
    const iv0 = JSON.parse(raw.getItem(SV.VAULT)).i;
    a.store.setItem('twrc.context.v1', JSON.stringify({ debrief: { entries: [{ key: 'nouveau-fictif' }] } })); await tick(); await a.flush(); assert.equal(a.error, null);
    const iv1 = JSON.parse(raw.getItem(SV.VAULT)).i; assert.notEqual(iv1, iv0, 'IV neuf à chaque écriture'); assert.notEqual(iv1, Buffer.alloc(12).toString('base64'));
    const b = make(raw, ses).vs; assert.equal(await b.boot(), 'vault'); assert.match(b.store.getItem('twrc.context.v1'), /nouveau-fictif/);
    assert(!JSON.stringify(raw.dump()).includes('nouveau-fictif'));
  });
  await test('Verrouiller : clé de session effacée, signal aux autres onglets, coffre conservé, déverrouillage identique', async () => {
    const raw = fakeStorage(), L = LEGACY(); fill(raw, L); const ses = session(); const a = make(raw, ses).vs; await a.boot();
    await a.lock(); assert.equal(ses.getItem(SV.SESSION), null); assert(raw.getItem(SV.LOCK_SIGNAL)); assert(raw.getItem(SV.VAULT)); assert.equal(a.locked(), true);
    const b = make(raw, ses).vs; assert.equal(await b.boot(), 'locked'); await b.unlock(PASS); assert.equal(b.store.getItem('twrc.settings.v1'), L['twrc.settings.v1']);
  });
  await test('migration interrompue après l’écriture du coffre : reprise, revérification contre les données en clair, puis nettoyage', async () => {
    const raw = fakeStorage(), L = LEGACY(); fill(raw, L);
    // simulation : coffre écrit par une première tentative, puis Safari fermé avant le nettoyage
    const first = make(raw).vs; await first.boot(); const vault = raw.getItem(SV.VAULT);
    fill(raw, L); raw.setItem(SV.VAULT, vault);
    const { vs } = make(raw); assert.equal(await vs.boot(), 'vault'); assert.deepEqual(leaks(raw), []);
    for (const [k, v] of Object.entries(L)) if (SV.secret(k)) assert.equal(vs.store.getItem(k), v, k);
  });
  await test('migration interrompue avec données en clair plus récentes que le coffre : les données en clair font foi', async () => {
    const raw = fakeStorage(), L = LEGACY(); fill(raw, L); await make(raw).vs.boot(); const vault = raw.getItem(SV.VAULT);
    fill(raw, { ...L, 'twrc.context.v1': JSON.stringify({ debrief: { entries: [{ key: 'plus-recent-fictif' }] } }) }); raw.setItem(SV.VAULT, vault);
    const { vs } = make(raw); await vs.boot(); assert.match(vs.store.getItem('twrc.context.v1'), /plus-recent-fictif/); assert.deepEqual(leaks(raw), []);
  });
  await test('stockage refusé pendant la migration : rien n’est supprimé, l’app continue sur l’ancien stockage avec un avertissement', async () => {
    const raw = fakeStorage({ refuse: k => k === 'twrc.vault.v2' }), L = LEGACY(); fill(raw, L); const before = JSON.stringify(raw.dump());
    const { vs } = make(raw); assert.equal(await vs.boot(), 'plain'); assert.match(vs.warn, /données restent intactes/); assert.equal(JSON.stringify(raw.dump()), before);
  });
  await test('stockage plein pendant la migration : caches recalculables sacrifiés, données durables intactes et chiffrées', async () => {
    const L = LEGACY(); L['twrc.cache.home'] = JSON.stringify({ p: 'x'.repeat(30000), lat: 45.1234 });
    const probe = fakeStorage(); fill(probe, L); const plainSize = JSON.stringify(probe.dump()).length;
    const raw = fakeStorage({ quota: plainSize + 4000 }); fill(raw, L);
    const { vs } = make(raw); assert.equal(await vs.boot(), 'vault');
    assert.equal(vs.store.getItem('twrc.settings.v1'), L['twrc.settings.v1']); assert.equal(vs.store.getItem('twrc.context.v1'), L['twrc.context.v1']);
    assert.equal(vs.store.getItem('twrc.cache.home'), null, 'cache recalculable abandonné'); assert.deepEqual(leaks(raw), []);
  });
  await test('stockage trop plein même sans caches : arrêt sans perte, ancien stockage intact', async () => {
    const L = LEGACY(), probe = fakeStorage(); fill(probe, L); const raw = fakeStorage({ quota: JSON.stringify(probe.dump()).length + 50 }); fill(raw, L);
    const before = JSON.stringify(raw.dump()); const { vs } = make(raw); assert.equal(await vs.boot(), 'plain');
    const after = raw.dump(); for (const [k, v] of Object.entries(JSON.parse(before))) if (!k.startsWith('twrc.cache.')) assert.equal(after[k], v, k);
  });
  await test('écriture chiffrée impossible en cours de session : modification gardée en mémoire, erreur visible, coffre précédent intact', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const { vs } = make(raw); await vs.boot(); const vault = raw.getItem(SV.VAULT);
    raw.quota = raw.getItem(SV.VAULT).length + 300;   // plus de place pour une version plus grosse
    vs.store.setItem('twrc.context.v1', 'y'.repeat(5000)); await tick(); await vs.flush();
    assert.match(vs.error, /restent en mémoire/); assert.equal(vs.store.getItem('twrc.context.v1'), 'y'.repeat(5000)); assert.equal(raw.getItem(SV.VAULT), vault);
  });
  await test('coffre v1 (ancien « Verrouiller ») : le code le convertit en coffre v2 sans perte, puis le v1 est retiré', async () => {
    const raw = fakeStorage(), L = LEGACY(); delete L['twrc.key']; fill(raw, L); await DS.lock(raw, PASS, crypto);
    assert(raw.getItem(DS.VAULT)); const { vs } = make(raw); assert.equal(await vs.boot(), 'locked');
    await vs.unlock(PASS); assert.equal(raw.getItem(DS.VAULT), null); assert(raw.getItem(SV.VAULT));
    assert.equal(vs.store.getItem('twrc.context.v1'), L['twrc.context.v1']); assert.deepEqual(leaks(raw), []);
  });
  await test('copies lisibles égarées (ancienne version ailleurs) : absorbées si absentes du coffre, puis retirées', async () => {
    const raw = fakeStorage(), L = LEGACY(); fill(raw, L); const ses = session(); await make(raw, ses).vs.boot();
    raw.setItem('twrc.tripcancel', JSON.stringify({ e: ['fictif'] })); raw.setItem('twrc.settings.v1', '{"perime":1}');
    const { vs } = make(raw, ses); await vs.boot(); await vs.flush();
    assert.match(vs.store.getItem('twrc.tripcancel'), /fictif/); assert.equal(vs.store.getItem('twrc.settings.v1'), L['twrc.settings.v1'], 'le coffre prime sur une copie périmée');
    assert.equal(raw.getItem('twrc.tripcancel'), null); assert.equal(raw.getItem('twrc.settings.v1'), null);
    const again = make(raw, ses).vs; await again.boot(); assert.match(again.store.getItem('twrc.tripcancel') || '', /fictif/, 'copie absorbée réellement chiffrée avant retrait');
  });
  await test('intégrité : coffre altéré → verrouillé, rien d’effacé ; clé de session étrangère refusée', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const ses = session(); await make(raw, ses).vs.boot();
    const v = JSON.parse(raw.getItem(SV.VAULT)); const c = Buffer.from(v.c, 'base64'); c[5] ^= 1; v.c = c.toString('base64'); raw.setItem(SV.VAULT, JSON.stringify(v));
    const tampered = raw.getItem(SV.VAULT); const { vs } = make(raw, ses); assert.equal(await vs.boot(), 'locked'); assert.equal(raw.getItem(SV.VAULT), tampered);
    const raw2 = fakeStorage(); fill(raw2, LEGACY()); await make(raw2).vs.boot(); const forged = session(); forged.setItem(SV.SESSION, JSON.stringify({ v: 2, s: JSON.parse(raw2.getItem(SV.VAULT)).s, k: Buffer.alloc(32).toString('base64') }));
    assert.equal(await make(raw2, forged).vs.boot(), 'locked');
  });
  await test('deux onglets : écritures concurrentes fusionnées, aucune perte ; verrou d’un onglet → l’autre se verrouille', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const sa = session(); const A = make(raw, sa).vs; await A.boot();
    const sb = session(); sb.setItem(SV.SESSION, sa.getItem(SV.SESSION)); const B = make(raw, sb).vs; await B.boot();
    const notes = []; raw.peers.add(e => { B.onStorage(e, k => notes.push(k)); A.onStorage(e, () => {}); });
    A.store.setItem('twrc.tripcancel', 'A'); await tick(); await A.flush(); await tick();
    B.store.setItem('twrc.returnhome.v1', 'B'); await tick(); await B.flush(); await tick(); await A.flush(); await tick();
    assert.equal(B.store.getItem('twrc.tripcancel'), 'A'); assert.equal(A.store.getItem('twrc.returnhome.v1'), 'B'); assert(notes.includes('twrc.tripcancel'));
    const C = make(raw, sa).vs; await C.boot(); assert.equal(C.store.getItem('twrc.tripcancel'), 'A'); assert.equal(C.store.getItem('twrc.returnhome.v1'), 'B');
    const r = await B.onStorage({ key: SV.LOCK_SIGNAL, newValue: '1' }); assert.equal(r, 'locked'); assert.equal(sb.getItem(SV.SESSION), null);
  });
  await test('écriture tardive d’une page qui se ferme : reconnue plus ancienne, l’état plus récent est réaffirmé sur le disque', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const ses = session(); const A = make(raw, ses).vs; await A.boot();
    A.store.setItem('twrc.gps', 'ancien-nom-fictif'); await tick(); await A.flush(); const late = raw.getItem(SV.VAULT);   // écriture de l'ancienne page
    const B = make(raw, ses).vs; await B.boot(); B.store.setItem('twrc.gps', 'nom-corrige-fictif'); await tick(); await B.flush();
    raw.setItem(SV.VAULT, late);   // l'écriture « en vol » de l'ancienne page atterrit après coup
    assert.equal(await B.onStorage({ key: SV.VAULT, newValue: late }), 'stale'); await tick(); await B.flush();
    assert.equal(B.store.getItem('twrc.gps'), 'nom-corrige-fictif');
    const C = make(raw, ses).vs; await C.boot(); assert.equal(C.store.getItem('twrc.gps'), 'nom-corrige-fictif', 'disque réaffirmé');
    const h = JSON.parse(raw.getItem(SV.VAULT)); h.n = 9999; raw.setItem(SV.VAULT, JSON.stringify(h));   // en-tête falsifié
    assert.equal(await make(raw, ses).vs.boot(), 'locked', 'en-tête modifié refusé (contrôle d’intégrité)');
  });
  await test('façade localStorage : énumération, accès par clé, journal d’import uniquement en mémoire', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const { vs } = make(raw); await vs.boot(); const st = vs.store;
    assert(Object.keys(st).includes('twrc.settings.v1')); assert(Object.keys(st).includes('twrc.view')); assert.equal(st['twrc.gps'], LEGACY()['twrc.gps']); assert('twrc.context.v1' in st);
    st.setItem('twrc.restore.pending.v1', JSON.stringify({ v: 1, before: { 'twrc.settings.v1': 'Maison fictive' } }));
    assert(st.getItem('twrc.restore.pending.v1')); assert.equal(raw.getItem('twrc.restore.pending.v1'), null, 'journal jamais en clair sur le disque');
    await DS.apply(st, { writes: { 'twrc.tripcancel': 'importé' }, remove: [], removePrefixes: [] }); assert.equal(st.getItem('twrc.tripcancel'), 'importé');
  });
  await test('premier déverrouillage sans données (appareil neuf) puis réglages saisis : chiffrés dès l’écriture', async () => {
    const raw = fakeStorage(); const { vs } = make(raw); assert.equal(await vs.boot(), 'plain');
    await vs.unlock(PASS, { 'twrc.plain': '{"locs":[]}', 'twrc.plain.v': 'v1' }); vs.store.setItem('twrc.settings.v1', JSON.stringify({ name: 'Maison fictive' })); await tick(); await vs.flush();
    assert.deepEqual(leaks(raw), []); assert.equal(vs.store.getItem('twrc.key'), PASS, 'code disponible en mémoire pour l’agenda et les sauvegardes');
  });
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) (async () => {
  const original = fs.readFileSync(sourcePath, 'utf8'), count = await runTests(original);
  const mutations = [
    { name: 'nettoyage des copies lisibles avant vérification', from: "await useKey(rawKey, salt);\n            await writeWithRoom(snap, salt);", to: "await useKey(rawKey, salt);\n            dropPlain(raw, Object.keys(snap)); await writeWithRoom(snap, salt);" },
    { name: 'code conservé en clair sur le disque', from: "Object.assign(vals, extra || {}, { 'twrc.key': pass });", to: "Object.assign(vals, extra || {}, { 'twrc.key': pass }); raw.setItem('twrc.key', pass);" },
    { name: 'IV réutilisé', from: "const iv = crypto.getRandomValues(new Uint8Array(12)), text", to: "const iv = new Uint8Array(12), text" },
    { name: 'journal d’import écrit en clair', from: "if (k === PENDING) { vol.set(k, v); return; }", to: "if (k === PENDING) { raw.setItem(k, v); vol.set(k, v); return; }" },
    { name: 'fusion multi-onglets ignorée', from: "if (e.key !== VAULT || st.mode !== 'vault' || !e.newValue) return null;", to: "return null;" },
    { name: 'écriture tardive acceptée telle quelle', from: "if (!newer(order(data), { n: st.n, t: st.t })) {", to: "if (false) {" },
    { name: 'en-tête d’ordre non authentifié', from: "(vault.n != null && (data.n !== vault.n || data.t !== vault.t)) || ", to: "" },
    { name: 'caches durables sacrifiés (journal compris)', from: "const lean = Object.fromEntries(Object.entries(vals).filter(([k]) => !CACHE(k)));", to: "const lean = {};" }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    let rejection; try { await runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rejection = e; }
    assert(rejection && rejection.scenario, 'La mutation doit être rejetée : ' + m.name + (rejection ? ' · ' + rejection.message : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
})().catch(e => { console.error(e); process.exit(1); });
