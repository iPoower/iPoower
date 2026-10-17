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
// Même contrat que navigator.locks : l'exclusion porte sur TOUS les onglets, pas sur une seule instance du coffre.
const fakeLocks = () => {
  let tail = Promise.resolve();
  return { request(name, options, fn) { assert.equal(name, 'twrc.vault.v2'); assert.equal(options.mode, 'exclusive');
    const task = tail.then(fn); tail = task.catch(() => {}); return task; } };
};
async function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const indexedDB = require('./lib/indexeddb.fake')();
  const ctx = { console, indexedDB, setTimeout, clearTimeout, TextEncoder, TextDecoder, atob, btoa, JSON, Proxy, Reflect, Map, Set, Object, Array, Uint8Array, Promise, Error, Event: class { constructor(t) { this.type = t; } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/journal-archive.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../src/device-storage.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../src/remember-device.js'), 'utf8') + '\n' + source + ';this.SV=SessionVault;this.DS=DeviceStorage;this.RD=RememberDevice;', ctx);
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
  const locks = fakeLocks();
  const make = (raw, ses = session(), extra = {}) => ({ vs: SV.create({ raw, session: ses, crypto, target: null, sessionKeys: ctx.RD.sessions, locks, ...extra }), ses });
  await test('démarrage sans coffre ni migration : ne dépend pas du verrou et ne retarde pas les événements de reprise', async () => {
    const raw = fakeStorage(); raw.setItem('twrc.view', 'pneus');
    const A = make(raw, session(), { locks: { request() { throw new Error('Un démarrage sans écriture ne doit pas prendre le verrou.'); } } }).vs;
    assert.equal(await A.boot(), 'plain'); assert.equal(raw.getItem('twrc.view'), 'pneus'); assert.equal(raw.getItem(SV.VAULT), null);
  });

  await test('toute sauvegarde durable passe réellement par Web Locks, sans faux succès', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY());
    let requests = 0;
    const counted = { request(name, opts, fn) { requests++; return locks.request(name, opts, fn); } };
    const A = make(raw, session(), { locks: counted }).vs;
    await A.boot(); const afterBoot = requests;
    A.store.setItem('twrc.tripcancel', 'sauvegarde-protegee');
    await A.flush();
    assert.equal(A.error, null);
    assert(requests > afterBoot, 'aucune sauvegarde durable ne doit contourner le verrou global');
    const B = make(raw).vs; await B.boot(); await B.unlock(PASS);
    assert.equal(B.store.getItem('twrc.tripcancel'), 'sauvegarde-protegee');
  });
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
    // La persistance ordinaire reste possible en v2 ; les nouveaux débriefs
    // nécessitent désormais l'activation explicite de leur archive.
    a.store.setItem('twrc.tripcancel', 'nouveau-fictif'); await tick(); await a.flush(); assert.equal(a.error, null);
    assert.equal(JSON.parse(raw.getItem(SV.VAULT)).v, 2, 'aucune activation v3 au rechargement');
    const iv1 = JSON.parse(raw.getItem(SV.VAULT)).i; assert.notEqual(iv1, iv0, 'IV neuf à chaque écriture'); assert.notEqual(iv1, Buffer.alloc(12).toString('base64'));
    const b = make(raw, ses).vs; assert.equal(await b.boot(), 'vault'); assert.equal(b.store.getItem('twrc.tripcancel'), 'nouveau-fictif');
    assert(!JSON.stringify(raw.dump()).includes('nouveau-fictif'));
  });
  await test('Verrouiller : clé de session effacée, signal aux autres onglets, coffre conservé, déverrouillage identique', async () => {
    const raw = fakeStorage(), L = LEGACY(); fill(raw, L); const ses = session(); const a = make(raw, ses).vs; await a.boot();
    await a.lock(); assert.equal(ses.getItem(SV.SESSION), null); assert(raw.getItem(SV.LOCK_SIGNAL)); assert(raw.getItem(SV.VAULT)); assert.equal(a.locked(), true);
    const b = make(raw, ses).vs; assert.equal(await b.boot(), 'locked'); await b.unlock(PASS); assert.equal(b.store.getItem('twrc.settings.v1'), L['twrc.settings.v1']);
  });
  await test('onglet en veille sans notification de verrou : sa clé ancienne ne rouvre pas la session au rechargement', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const sa = session(), A = make(raw, sa).vs; await A.boot(); const before = raw.getItem(SV.VAULT);
    raw.setItem(SV.LOCK_SIGNAL, 'verrou-pendant-la-veille'); // aucun événement reçu dans l'ancien onglet
    const B = make(raw, sa).vs; assert.equal(await B.boot(), 'locked'); assert.equal(sa.getItem(SV.SESSION), null); assert.equal(raw.getItem(SV.VAULT), before);
    await B.unlock(PASS); assert.equal(B.mode, 'vault');
  });
  await test('signal de verrou déjà suivi d’un bon code : une notification retardée ne reverrouille pas la nouvelle session', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const sa = session(), A = make(raw, sa).vs; await A.boot();
    await A.lock(); const old = raw.getItem(SV.LOCK_SIGNAL); await A.unlock(PASS);
    assert.equal(await A.onStorage({ key: SV.LOCK_SIGNAL, newValue: old }), null); assert.equal(A.mode, 'vault'); assert(sa.getItem(SV.SESSION));
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
  await test('stockage plein au déverrouillage : le coffre précédent reste intact même si le nouvel essai échoue', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); await make(raw).vs.boot(); const before = raw.getItem(SV.VAULT);
    const B = make(raw).vs; await B.boot(); raw.quota = before.length + 300;
    await assert.rejects(() => B.unlock(PASS, { 'twrc.context.v1': 'z'.repeat(10000) }), e => e.name === 'QuotaExceededError');
    assert.equal(raw.getItem(SV.VAULT), before, 'aucun effacement du coffre pour tenter de libérer de la place');
    raw.quota = Infinity; await B.unlock(PASS); assert.equal(B.store.getItem('twrc.context.v1'), LEGACY()['twrc.context.v1']);
  });
  await test('mauvais code dans une session ouverte : sa clé valide reste utilisable pour sauvegarder', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const sa = session(), A = make(raw, sa).vs; await A.boot();
    await assert.rejects(() => A.unlock('mauvais-code'), e => e.name === 'OperationError');
    A.store.setItem('twrc.tripcancel', 'session-preservee'); await A.flush(); assert.equal(A.error, null);
    const B = make(raw, sa).vs; await B.boot(); assert.equal(B.store.getItem('twrc.tripcancel'), 'session-preservee');
  });
  await test('nouveau déverrouillage pendant une sauvegarde locale : les modifications en attente sont conservées', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const sa = session(), A = make(raw, sa).vs; await A.boot();
    A.store.setItem('twrc.tripcancel', 'avant-deverrouillage'); await A.unlock(PASS, { 'twrc.plain.v': 'nouvelle-version' }); await A.flush();
    const B = make(raw, sa).vs; await B.boot(); assert.equal(B.store.getItem('twrc.tripcancel'), 'avant-deverrouillage'); assert.equal(B.store.getItem('twrc.plain.v'), 'nouvelle-version');
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
    raw.setItem(SV.LOCK_SIGNAL, '1'); const r = await B.onStorage({ key: SV.LOCK_SIGNAL, newValue: '1' }); assert.equal(r, 'locked'); assert.equal(sb.getItem(SV.SESSION), null);
  });
  await test('deux pages indépendantes, notifications retardées : sauvegardes réellement simultanées sans perte', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const sa = session(), A = make(raw, sa).vs; await A.boot();
    // Un autre contexte JS ne peut pas partager une file Promise privée avec le premier.
    const other = { ...ctx }; vm.createContext(other); vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/journal-archive.js'), 'utf8') + source + ';this.SV=SessionVault;', other);
    const sb = session(); sb.setItem(SV.SESSION, sa.getItem(SV.SESSION));
    const B = other.SV.create({ raw, session: sb, crypto, target: null, sessionKeys: ctx.RD.sessions, locks }); await B.boot();
    const delayed = []; raw.peers.add(e => delayed.push(e));
    A.store.setItem('twrc.tripcancel', 'A-simultane'); B.store.setItem('twrc.returnhome.v1', 'B-simultane');
    await Promise.all([A.flush(), B.flush()]);
    const C = make(raw, sa).vs; await C.boot();
    assert.equal(C.store.getItem('twrc.tripcancel'), 'A-simultane'); assert.equal(C.store.getItem('twrc.returnhome.v1'), 'B-simultane');
    assert.equal(A.error, null); assert.equal(B.error, null);
    for (const e of delayed.splice(0).reverse()) { await A.onStorage(e); await B.onStorage(e); }
    await Promise.all([A.flush(), B.flush()]);
    const D = make(raw, sa).vs; await D.boot();
    assert.equal(D.store.getItem('twrc.tripcancel'), 'A-simultane'); assert.equal(D.store.getItem('twrc.returnhome.v1'), 'B-simultane');
  });
  await test('suppression dans un onglet et modification ailleurs : aucune résurrection par une ancienne notification', async () => {
    const raw = fakeStorage(); fill(raw, { ...LEGACY(), 'twrc.tripcancel': 'a-supprimer' }); const sa = session(), A = make(raw, sa).vs; await A.boot();
    const sb = session(); sb.setItem(SV.SESSION, sa.getItem(SV.SESSION)); const B = make(raw, sb).vs; await B.boot();
    const old = raw.getItem(SV.VAULT);
    A.store.removeItem('twrc.tripcancel'); B.store.setItem('twrc.returnhome.v1', 'a-conserver'); await Promise.all([A.flush(), B.flush()]);
    await A.onStorage({ key: SV.VAULT, newValue: old }); await B.onStorage({ key: SV.VAULT, newValue: old }); await Promise.all([A.flush(), B.flush()]);
    const C = make(raw, sa).vs; await C.boot(); assert.equal(C.store.getItem('twrc.tripcancel'), null); assert.equal(C.store.getItem('twrc.returnhome.v1'), 'a-conserver');
  });
  await test('même clé modifiée pendant le chiffrement : la seconde valeur reste à sauvegarder', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const sa = session(); let pause = false, begin, release;
    const started = new Promise(r => { begin = r; }), held = new Promise(r => { release = r; });
    const slow = { getRandomValues: bytes => crypto.getRandomValues(bytes), subtle: new Proxy(crypto.subtle, { get(t, k) {
      if (k === 'encrypt') return async (...args) => { if (pause) { pause = false; begin(); await held; } return t.encrypt(...args); };
      return typeof t[k] === 'function' ? t[k].bind(t) : t[k]; } }) };
    const A = make(raw, sa, { crypto: slow }).vs; await A.boot(); pause = true;
    A.store.setItem('twrc.tripcancel', 'premiere'); const writing = A.flush(); await started;
    A.store.setItem('twrc.tripcancel', 'seconde'); release(); await writing; await A.flush();
    const B = make(raw, sa).vs; await B.boot(); assert.equal(B.store.getItem('twrc.tripcancel'), 'seconde'); assert.equal(A.error, null);
  });
  await test('WebKit/conflit externe pendant le chiffrement : relire sous verrou puis fusionner sans perte', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY());
    const sa = session(), A0 = make(raw, sa).vs; await A0.boot();
    const first = raw.getItem(SV.VAULT);
    const sb = session(); sb.setItem(SV.SESSION, sa.getItem(SV.SESSION));
    const B = make(raw, sb).vs; await B.boot();
    B.store.setItem('twrc.returnhome.v1', 'autre-fenetre');
    await B.flush(); assert.equal(B.error, null);
    const concurrent = raw.getItem(SV.VAULT); assert.notEqual(concurrent, first);
    raw.setItem(SV.VAULT, first); // écriture externe authentifiée, retardée jusqu'à l'instant de chiffrement de A
    let pause = true, begin, release;
    const started = new Promise(resolve => { begin = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    const slow = { getRandomValues: bytes => webcrypto.getRandomValues(bytes), subtle: new Proxy(webcrypto.subtle, { get(t, k) {
      if (k === 'encrypt') return async (...args) => {
        if (pause) { pause = false; begin(); await held; }
        return t.encrypt(...args);
      };
      return typeof t[k] === 'function' ? t[k].bind(t) : t[k];
    } }) };
    const A = make(raw, sa, { crypto: slow }).vs; await A.boot();
    A.store.setItem('twrc.tripcancel', 'fenetre-principale'); const writing = A.flush();
    await started;
    raw.setItem(SV.VAULT, concurrent); // un ancien écrivain ne respecte pas Web Locks
    release(); await writing;
    assert.equal(A.error, null, 'un conflit transitoire authentifié se résout automatiquement');
    const C = make(raw, sa).vs; await C.boot();
    assert.equal(C.store.getItem('twrc.tripcancel'), 'fenetre-principale');
    assert.equal(C.store.getItem('twrc.returnhome.v1'), 'autre-fenetre');
    assert.deepEqual(leaks(raw), [], 'aucune copie lisible persistante');
  });
  await test('verrouillage distant pendant le chiffrement : aucune écriture ni session ressuscitée', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const sa = session(); let pause = false, begin, release;
    const started = new Promise(r => { begin = r; }), held = new Promise(r => { release = r; });
    const slow = { getRandomValues: bytes => crypto.getRandomValues(bytes), subtle: new Proxy(crypto.subtle, { get(t, k) {
      if (k === 'encrypt') return async (...args) => { if (pause) { pause = false; begin(); await held; } return t.encrypt(...args); };
      return typeof t[k] === 'function' ? t[k].bind(t) : t[k]; } }) };
    const A = make(raw, sa, { crypto: slow }).vs; await A.boot(); const before = raw.getItem(SV.VAULT); pause = true;
    A.store.setItem('twrc.tripcancel', 'en-vol'); const writing = A.flush(); await started;
    raw.setItem(SV.LOCK_SIGNAL, 'verrou-distant'); await A.onStorage({ key: SV.LOCK_SIGNAL, newValue: 'verrou-distant' });
    release(); await writing; await A.flush();
    assert.equal(A.mode, 'locked'); assert.equal(sa.getItem(SV.SESSION), null); assert.equal(raw.getItem(SV.VAULT), before); assert.equal(A.store.getItem('twrc.tripcancel'), null);
  });
  await test('notification de verrou retardée : une sauvegarde en attente consulte aussi le signal sur disque', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const sa = session(), A = make(raw, sa).vs; await A.boot(); const before = raw.getItem(SV.VAULT);
    raw.setItem(SV.LOCK_SIGNAL, 'autre-onglet-verrouille');
    assert.throws(() => A.store.setItem('twrc.tripcancel', 'ne-pas-ecrire'), e => e.expired === true, 'refus dès l’accès, même sans événement storage');
    await A.flush();
    assert.equal(A.mode, 'locked'); assert.equal(sa.getItem(SV.SESSION), null); assert.equal(raw.getItem(SV.VAULT), before);
  });
  await test('absence de verrou inter-onglets : modifications gardées en mémoire, jamais de réussite trompeuse', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const sa = session(); await make(raw, sa).vs.boot();
    const A = make(raw, sa, { locks: null }).vs; await A.boot(); const before = raw.getItem(SV.VAULT);
    A.store.setItem('twrc.tripcancel', 'non-enregistre'); await A.flush(); assert.match(A.error, /restent en mémoire/);
    assert.equal(A.store.getItem('twrc.tripcancel'), 'non-enregistre'); assert.equal(raw.getItem(SV.VAULT), before);
  });
  await test('échec puis nouvel essai : la modification locale fusionne aussi celle enregistrée ailleurs', async () => {
    let denied = false; const raw = fakeStorage({ refuse: k => denied && k === SV.VAULT }); fill(raw, LEGACY());
    const sa = session(), A = make(raw, sa).vs; await A.boot(); const sb = session(); sb.setItem(SV.SESSION, sa.getItem(SV.SESSION)); const B = make(raw, sb).vs; await B.boot();
    denied = true; A.store.setItem('twrc.tripcancel', 'a-reessayer'); await A.flush(); assert.match(A.error, /restent en mémoire/);
    denied = false; B.store.setItem('twrc.returnhome.v1', 'ecrit-ailleurs'); await B.flush(); await A.flush();
    const C = make(raw, sa).vs; await C.boot(); assert.equal(C.store.getItem('twrc.tripcancel'), 'a-reessayer'); assert.equal(C.store.getItem('twrc.returnhome.v1'), 'ecrit-ailleurs'); assert.equal(A.error, null);
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
  await test('session 7 jours : réouverture d’un autre onglet, expiration ferme et révocation immédiate', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY());
    const remembered = {
      item: null,
      async save(rawKey, salt, signal) { this.item = { rawKey: new Uint8Array(rawKey), salt: Buffer.from(salt).toString('base64'), signal, expiresAt: Date.now() + 7 * 864e5 }; },
      async resume(salt, signal) { return this.item && this.item.salt === salt && this.item.signal === signal ? { ...this.item, rawKey: new Uint8Array(this.item.rawKey) } : null; },
      async clear() { this.item = null; }
    };
    const A = make(raw, session(), { remembered }).vs; await A.boot(); await A.lock();
    await A.unlock(PASS, {}, true);
    assert(remembered.item, 'autorisation persistante choisie explicitement');
    const B = make(raw, session(), { remembered }).vs;
    assert.equal(await B.boot(), 'vault', 'nouvel onglet sans sessionStorage');
    assert.equal(B.store.getItem('twrc.settings.v1'), LEGACY()['twrc.settings.v1']);
    remembered.item.expiresAt = Date.now() - 1;
    const expired = make(raw, session(), { remembered }).vs;
    assert.equal(await expired.boot(), 'locked', 'date dépassée : code redemandé');
    await B.lock();
    assert.equal(remembered.item, null, 'bouton Verrouiller révoque le souvenir');
    assert.equal(await make(raw, session(), { remembered }).vs.boot(), 'locked');
    await expired.unlock(PASS, {}, false);
    assert.equal(remembered.item, null, 'case non cochée : aucune persistance');
  });
  await test('expiration dans un onglet ouvert : plus aucune lecture/écriture ; relogin récupère le coffre', async () => {
    let current = Date.now();
    const raw = fakeStorage(), ses = session(); fill(raw, LEGACY());
    const { vs: A } = make(raw, ses, { now: () => current }); await A.boot();
    const safe = raw.getItem(SV.VAULT);
    const deadline = A.expiresAt;
    current += 6 * 864e5;
    assert.equal(A.expired(), false, 'sixième jour : session encore valide');
    const { vs: B } = make(raw, ses, { now: () => current });
    assert.equal(await B.boot(), 'vault'); assert.equal(B.expiresAt, deadline, 'rechargement sans prolongation');
    current = deadline + 1;
    assert.equal(B.expired(), true); assert.equal(B.mode, 'expired'); assert.equal(B.locked(), true);
    assert.equal(B.store.getItem('twrc.settings.v1'), null);
    assert.deepEqual(Object.keys(B.store), []);
    assert.throws(() => B.store.setItem('twrc.settings.v1', 'donnée interdite'), /Session expirée/);
    assert.throws(() => B.store.removeItem('twrc.settings.v1'), /Session expirée/);
    assert.throws(() => B.store.clear(), /Session expirée/);
    assert.equal(ses.getItem(SV.SESSION), null, 'clé session détruite au délai');
    assert.equal(raw.getItem(SV.VAULT), safe, 'coffre au repos intact');
    await B.unlock(PASS, {}, false);
    assert.equal(B.store.getItem('twrc.settings.v1'), LEGACY()['twrc.settings.v1']);
  });
  await test('échec de sauvegarde exactement à expiration : accès refusé, mémoire préservée et restauration après code', async () => {
    let refuseWrite = false, current = Date.now();
    const raw = fakeStorage({ refuse: k => refuseWrite && k === SV.VAULT }), ses = session();
    fill(raw, LEGACY());
    const { vs } = make(raw, ses, { now: () => current });
    await vs.boot();
    const sealedBefore = raw.getItem(SV.VAULT);
    const draft = JSON.stringify({ entries: ['nouvelle-note-durable-test'] });
    refuseWrite = true;
    vs.store.setItem('twrc.context.v1', draft);
    await tick(); await vs.flush();
    assert(vs.error, 'stockage indisponible signalé');
    assert.equal(raw.getItem(SV.VAULT), sealedBefore, 'copie chiffrée précédente intacte');
    current = vs.expiresAt + 1;
    assert.equal(vs.expired(), true);
    assert.equal(vs.pendingRecovery, true);
    assert.equal(vs.store.getItem('twrc.context.v1'), null, 'les données en mémoire ne restent pas accessibles');
    assert.throws(() => vs.store.setItem('twrc.context.v1', 'interdit'), /Session expirée/);
    await assert.rejects(() => vs.lock(), /Modifications non enregistrées/, 'ne jamais jeter les données non sauvegardées');
    await assert.rejects(() => vs.unlock('mauvais-code'), e => e.name === 'OperationError');
    assert.equal(vs.pendingRecovery, true, 'mauvais code : brouillon intact');
    await assert.rejects(() => vs.unlock(PASS), /refus|enregistrement|quota/i);
    assert.equal(vs.pendingRecovery, true, 'quota : brouillon intact');
    refuseWrite = false;
    await vs.unlock(PASS, {}, false);
    assert.equal(vs.mode, 'vault');
    assert.equal(vs.pendingRecovery, false);
    assert.equal(vs.store.getItem('twrc.context.v1'), draft);
    const another = make(raw).vs;
    assert.equal(await another.boot(), 'locked');
    await another.unlock(PASS);
    assert.equal(another.store.getItem('twrc.context.v1'), draft, 'brouillon réellement scellé et relu');
    assert(!raw.getItem(SV.VAULT).includes('nouvelle-note-durable-test'), 'aucune copie lisible');
  });
  await test('sessionStorage Base64 corrompu : verrouillage propre et coffre inchangé', async () => {
    const raw = fakeStorage(), ses = session(); fill(raw, LEGACY());
    await make(raw, ses).vs.boot();
    const before = raw.getItem(SV.VAULT), entry = JSON.parse(ses.getItem(SV.SESSION));
    entry.c = '%%%%not-base64%%%%'; ses.setItem(SV.SESSION, JSON.stringify(entry));
    let resumeCalls = 0, clearCalls = 0;
    const remembered = { async resume() { resumeCalls++; return { rawKey: new Uint8Array(32), expiresAt: Date.now() + 1000 }; },
      async clear() { clearCalls++; } };
    const B = make(raw, ses, { remembered }).vs;
    assert.equal(await B.boot(), 'locked');
    assert.equal(B.locked(), true);
    assert.equal(ses.getItem(SV.SESSION), null);
    assert.equal(resumeCalls, 0, 'le jeton persistant ne doit pas contourner une session corrompue');
    assert.equal(clearCalls, 1, 'autorisation persistante révoquée');
    assert.equal(B.store.getItem('twrc.settings.v1'), null);
    assert.equal(raw.getItem(SV.VAULT), before);
    await B.unlock(PASS);
    assert.equal(B.store.getItem('twrc.settings.v1'), LEGACY()['twrc.settings.v1']);
  });
  await test('sessionStorage : aucune clé brute, clé IndexedDB réellement non extractible, rechargement intact', async () => {
    const raw = fakeStorage(), ses = session(); fill(raw, LEGACY()); await make(raw, ses).vs.boot();
    const descriptor = JSON.parse(ses.getItem(SV.SESSION));
    assert.equal(descriptor.v, 4); assert.equal(descriptor.k, undefined); assert.equal(Buffer.from(descriptor.c, 'base64').length, 48);
    const item = indexedDB.records.get('tab:' + descriptor.id);
    assert(item && item.key); assert.equal(item.key.extractable, false); assert.equal(item.key.algorithm.length, 256);
    await assert.rejects(() => crypto.subtle.exportKey('raw', item.key), e => e.name === 'InvalidAccessException' || e.name === 'InvalidAccessError');
    const reopened = make(raw, ses).vs; assert.equal(await reopened.boot(), 'vault'); assert.equal(reopened.store.getItem('twrc.settings.v1'), LEGACY()['twrc.settings.v1']);
  });
  await test('ancienne session v3 : reprise authentifiée en v4 sans changer le coffre ni prolonger le délai', async () => {
    const raw = fakeStorage(), ses = session(); fill(raw, LEGACY()); await make(raw, ses).vs.boot();
    const before = raw.getItem(SV.VAULT), descriptor = JSON.parse(ses.getItem(SV.SESSION)), salt = Buffer.from(descriptor.s, 'base64');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(PASS), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, material, 256);
    ses.setItem(SV.SESSION, JSON.stringify({ v: 3, s: descriptor.s, k: Buffer.from(bits).toString('base64'), l: descriptor.l, a: descriptor.a, e: descriptor.e }));
    const resumed = make(raw, ses).vs; assert.equal(await resumed.boot(), 'vault');
    const converted = JSON.parse(ses.getItem(SV.SESSION)); assert.equal(converted.v, 4); assert.equal(converted.k, undefined); assert.equal(converted.e, descriptor.e);
    assert.equal(raw.getItem(SV.VAULT), before); assert.equal(resumed.store.getItem('twrc.settings.v1'), LEGACY()['twrc.settings.v1']);
  });
  await test('métadonnées/session chiffrée altérées : refus, aucun repli sur le souvenir, coffre conservé', async () => {
    for (const field of ['id', 's', 'l', 'a', 'e', 'i', 'c']) {
      const raw = fakeStorage(), ses = session(); fill(raw, LEGACY()); await make(raw, ses).vs.boot(); const before = raw.getItem(SV.VAULT);
      const d = JSON.parse(ses.getItem(SV.SESSION));
      if (field === 'a') { d.a++; d.e++; } else if (field === 'e') { d.a--; d.e--; }
      else if (field === 'l') d.l = 'signal-hostile'; else if (field === 'id') d.id = '0'.repeat(32);
      else d[field] = Buffer.alloc(field === 's' ? 16 : field === 'i' ? 12 : 48, 1).toString('base64');
      ses.setItem(SV.SESSION, JSON.stringify(d)); let fallback = 0;
      const vs = make(raw, ses, { remembered: { async resume() { fallback++; }, async clear() {} } }).vs;
      assert.equal(await vs.boot(), 'locked', field); assert.equal(fallback, 0); assert.equal(raw.getItem(SV.VAULT), before);
    }
  });
  await test('IndexedDB indisponible/saturé : page utilisable, aucun repli en clé brute, code au prochain chargement', async () => {
    const raw = fakeStorage(), ses = session(); fill(raw, LEGACY());
    const denied = { async save() { throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); }, async resume() { return null; }, async clear() {} };
    const A = make(raw, ses, { sessionKeys: denied }).vs; assert.equal(await A.boot(), 'vault'); assert.equal(ses.getItem(SV.SESSION), null); assert.match(A.warn, /code sera redemandé/);
    A.store.setItem('twrc.tripcancel', 'modification-conservée'); await A.flush(); assert.equal(A.error, null);
    const B = make(raw, ses).vs; assert.equal(await B.boot(), 'locked'); await B.unlock(PASS); assert.equal(B.store.getItem('twrc.tripcancel'), 'modification-conservée');
  });
  await test('révocation après veille : accès bloqué même sans événement storage ni timer', async () => {
    const raw = fakeStorage(), ses = session(); fill(raw, LEGACY()); const A = make(raw, ses).vs; await A.boot(); const before = raw.getItem(SV.VAULT);
    raw.setItem(SV.LOCK_SIGNAL, 'signal-nouveau-pendant-la-veille');
    assert.equal(A.store.getItem('twrc.settings.v1'), null); assert.equal(A.locked(), true); assert.equal(ses.getItem(SV.SESSION), null); assert.equal(raw.getItem(SV.VAULT), before);
  });
  await test('verrouillage manuel : toutes les clés de sessions persistées sont révoquées', async () => {
    const raw = fakeStorage(); fill(raw, LEGACY()); const A = make(raw).vs; await A.boot(); const B = make(raw).vs; await B.boot(); await B.unlock(PASS);
    assert([...indexedDB.records.keys()].some(k => k.startsWith('tab:')));
    await A.lock(); assert.equal([...indexedDB.records.keys()].filter(k => k.startsWith('tab:')).length, 0);
  });
  await test('preuve de transfert fictif du coffre : toutes les valeurs durables, pneus et historique identiques', async () => {
    const origin = fakeStorage(), L = LEGACY();
    const settings = JSON.parse(L['twrc.settings.v1']); settings.cars[0].plan = { type: 'winter', model: 'Pneu fictif', size: '215/40 R18', on: 0 };
    L['twrc.settings.v1'] = JSON.stringify(settings); fill(origin, L); await make(origin).vs.boot();
    const destination = fakeStorage(); destination.setItem(SV.VAULT, origin.getItem(SV.VAULT));
    const restored = make(destination).vs; assert.equal(await restored.boot(), 'locked'); await restored.unlock(PASS);
    for (const [key, value] of Object.entries(L)) if (SV.secret(key)) assert.equal(restored.store.getItem(key), value, key);
    assert.deepEqual(leaks(destination), []); assert(origin.getItem(SV.VAULT), 'origine conservée pour retour arrière');
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
    { name: 'caches durables sacrifiés (journal compris)', from: "const lean = Object.fromEntries(Object.entries(vals).filter(([k]) => !CACHE(k)));", to: "const lean = {};" },
    { name: 'verrou global ignoré', from: "return locks.request(VAULT, { mode: 'exclusive' }, fn);", to: "return fn();" },
    { name: 'snapshot local écrase les clés distantes', from: "snap = { ...base };", to: "snap = values();" },
    { name: 'signal de verrou sur disque ignoré', from: "if (st.mode === 'vault' && raw.getItem(LOCK_SIGNAL) !== st.lockSignal) forget();", to: "if (false) forget();", alsoFrom: "if (st.mode === 'vault' && raw.getItem(LOCK_SIGNAL) !== st.lockSignal) { forget(); return true; }", alsoTo: "if (false) { forget(); return true; }" },
    { name: 'coffre précédent effacé au nouvel essai', from: "const lean = Object.fromEntries(Object.entries(vals).filter(([k]) => !CACHE(k)));", to: "const lean = Object.fromEntries(Object.entries(vals).filter(([k]) => !CACHE(k))); raw.removeItem(VAULT);" },
    { name: 'mauvais code remplace la clé active', from: "const key = await importKey(rawKey, crypto), data = await open(vault, key, crypto);", to: "const key = st.key = await importKey(rawKey, crypto), data = await open(vault, key, crypto);" },
    { name: 'déverrouillage ignore les sauvegardes en attente', from: "while (st.mode === 'vault' && st.mem.dirty.size) await savePending();\n      return unlockInside(pass, extra, keepWeek);", to: "return unlockInside(pass, extra, keepWeek);" },
    { name: 'clé ancienne réutilisée après un verrouillage manqué', from: "(ses.l ?? null) === signal", to: "true" },
    { name: 'notification de verrou périmée acceptée', from: "if (st.mode === 'vault' && raw.getItem(LOCK_SIGNAL) === st.lockSignal) return null;", to: "" },
    { name: 'démarrage sans coffre retardé par un verrou', from: "if (!readVault(raw) && !raw.getItem('twrc.key') && !raw.getItem(V1))", to: "if (false)" }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    if (m.alsoFrom) assert(original.includes(m.alsoFrom), 'Deuxième garde introuvable : ' + m.name);
    const mutated = original.replace(m.from, m.to);
    let rejection; try { await runTests(m.alsoFrom ? mutated.replace(m.alsoFrom, m.alsoTo) : mutated, { quiet: true }); } catch (e) { rejection = e; }
    assert(rejection && rejection.scenario, 'La mutation doit être rejetée : ' + m.name + (rejection ? ' · ' + rejection.message : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
})().catch(e => { console.error(e); process.exit(1); });
