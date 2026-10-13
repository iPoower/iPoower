// Forteresse III R2 : vrai WebCrypto, stockages et verrous simulés, fixtures
// exclusivement fictives. Aucun navigateur utilisateur, secret ou réseau.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..'), PASS = 'cle-fictive-import-uniquement';
const ctx = { TextEncoder, TextDecoder, Uint8Array, atob, btoa, URL, setTimeout, clearTimeout, console, JSON, Proxy, Reflect, Map, Set, Object, Array, Promise, Error };
vm.createContext(ctx);
vm.runInContext(['device-storage', 'session-vault', 'config-import'].map(f => fs.readFileSync(path.join(root, 'src', f + '.js'), 'utf8')).join('\n') + ';this.CI=ConfigImport;this.SV=SessionVault;', ctx);
const baselineSource = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8').match(/^const BASE = \{[\s\S]*?^\};/m)[0];
vm.runInContext(baselineSource + ';this.BASELINE=BASE;', ctx);
const { CI, SV } = ctx;
const fixture = () => JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/preset.fake.json'), 'utf8'));
const encoded = cfg => Buffer.from(JSON.stringify(cfg)).toString('base64url');
const copy = x => JSON.parse(JSON.stringify(x));
const memory = () => {
  const values = new Map(); let deny = false;
  return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem: k => values.get(k) ?? null, setItem(k, v) { if (deny && k === SV.VAULT) throw Object.assign(new Error('refus fictif'), { name: 'QuotaExceededError' }); values.set(k, String(v)); },
    removeItem: k => values.delete(k), dump: () => Object.fromEntries(values), refuse: x => { deny = x; } };
};
const locks = () => {
  let tail = Promise.resolve(), active = 0, peak = 0;
  return { request(name, options, fn) { assert.equal(name, SV.VAULT); assert.equal(options.mode, 'exclusive');
    const task = tail.then(async () => { peak = Math.max(peak, ++active); try { return await fn(); } finally { active--; } }); tail = task.catch(() => {}); return task; }, get peak() { return peak; } };
};
const target = (fragment, fail = false) => {
  let url = new URL('https://race-control-fixture.invalid/app/?keep=a%2Bb&x=1' + fragment);
  const history = { state: { keep: 'intact' }, calls: [], replaceState(state, title, next) { if (fail) throw new Error('history refusée');
    assert.deepEqual(state, history.state); history.calls.push(next); url = new URL(next, url); } };
  return { get location() { return url; }, history };
};
const durable = () => ({
  'twrc.context.v1': JSON.stringify({ v: 1, debrief: { entries: [{ key: 'retour-fictif', feedback: { grip: 'normal' } }] } }),
  'twrc.reports.v1': JSON.stringify([{ at: 100, kind: 'wet', note: 'observation fictive' }]),
  'twrc.shadow.v1': JSON.stringify([{ observed: 'dry', at: 120 }]),
  'twrc.tyretherm.v1': JSON.stringify({ carA: { T: 12, at: '2026-10-13T07:00' } }),
  'twrc.tripcancel': JSON.stringify({ 'work-2026-10-13': { at: 100, exp: 200 } })
});
async function make({ raw = memory(), shared = locks(), extra = durable(), crypto = webcrypto, now = () => Date.now() } = {}) {
  raw.setItem('autre.app', 'conservée');
  const ses = memory(), vs = SV.create({ raw, session: ses, crypto, target: null, locks: shared, now });
  await vs.boot(); await vs.unlock(PASS, extra);
  return { raw, ses, vs, shared, crypto, now };
}
const stored = vs => Object.fromEntries(Array.from({ length: vs.store.length }, (_, i) => vs.store.key(i)).map(k => [k, vs.store.getItem(k)]));
const link = cfg => '#' + 'cfg=' + encoded(cfg);
const prepared = (cfg, extra = '') => { const t = target(link(cfg) + extra), cf = CI.create(t); assert.equal(cf.capture(), true); return { t, cf }; };
let n = 0, stage = '';
const test = async (name, fn) => { stage = name; await fn(); n++; console.log('✅ ' + name); };
(async () => {
  await test('installation neuve : validation, chiffrement relu et identifiant SHA-256 sans code dérivé', async () => {
    const a = await make(), cfg = fixture(), before = stored(a.vs), { t, cf } = prepared(cfg);
    assert.equal(t.location.hash, ''); assert.equal(t.location.search, '?keep=a%2Bb&x=1');
    assert.equal((await cf.process(a.vs)).state, 'applied');
    const s = JSON.parse(a.vs.store.getItem(CI.SETTINGS)); assert.equal(s.cars[0].name, cfg.cars[0].name); assert.equal(s.configured, 1);
    const id = a.vs.store.getItem(CI.IDENTIFIER); assert.match(id, /^sha256:[0-9a-f]{64}$/);
    assert.notEqual(id, createHash('sha256').update(PASS).digest('hex')); assert.equal(id, await CI.identifier(cfg, webcrypto));
    for (const [k, v] of Object.entries(before)) assert.equal(a.vs.store.getItem(k), v, k);
    const disk = JSON.stringify(a.raw.dump()); assert(!disk.includes(cfg.cars[0].name)); assert(!disk.includes(encoded(cfg))); assert(!disk.includes(PASS));
    assert.equal(a.raw.getItem(CI.IDENTIFIER), null); assert.equal(a.raw.getItem(CI.SETTINGS), null); assert.equal(a.raw.getItem('autre.app'), 'conservée');
  });
  await test('lien répété après une saisie : les choix locaux ne sont jamais réappliqués depuis le lien', async () => {
    const a = await make(), cfg = fixture(); await prepared(cfg).cf.process(a.vs);
    const s = JSON.parse(a.vs.store.getItem(CI.SETTINGS)); s.cars[0].plan.date = '2026-12-20'; s.cars[0].tire.dot = '2025';
    a.vs.store.setItem(CI.SETTINGS, JSON.stringify(s)); await a.vs.flush(); const before = stored(a.vs), disk = copy(a.raw.dump());
    assert.equal((await prepared(cfg).cf.process(a.vs)).state, 'duplicate'); assert.deepEqual(stored(a.vs), before); assert.deepEqual(a.raw.dump(), disk);
  });
  await test('configuration différente sur appareil configuré : refus, tous les réglages et historiques intacts', async () => {
    const cfg = fixture(); cfg.configured = 1; cfg.cars[0].odo = [{ d: '2026-10-12', km: 12000 }];
    cfg.cars[0].sets = { winter: { brand: 'Marque fictive', model: 'Hiver fictif', size: '215/40 R18', dot: '1225', tread: 7.1 } };
    cfg.cars[0].tire.treadAv = 3.2; cfg.cars[0].tire.treadAr = 4.5; cfg.cars[0].tire.pchk = { date: '2026-10-12', T: 12 };
    cfg.journal = { '2026-10-12': { T: 6, Tr: 5, ice: 1, vis: 10000, lv: { carA: 0, carB: 2 } } };
    const a = await make({ extra: { ...durable(), [CI.SETTINGS]: JSON.stringify(cfg) } }), before = stored(a.vs), disk = copy(a.raw.dump());
    const next = fixture(); next.cars[0].name = 'Autre véhicule fictif';
    assert.equal((await prepared(next).cf.process(a.vs)).state, 'configured'); assert.deepEqual(stored(a.vs), before); assert.deepEqual(a.raw.dump(), disk);
  });
  await test('ancien identifiant Base64 : migration de la seule métadonnée, sans perdre les choix locaux', async () => {
    const cfg = fixture(), changed = { ...copy(cfg), configured: 1 }; changed.cars[0].name = 'Saisie conservée';
    const a = await make({ extra: { ...durable(), [CI.SETTINGS]: JSON.stringify(changed), [CI.IDENTIFIER]: encoded(cfg) } });
    const before = stored(a.vs); assert.equal((await prepared(cfg).cf.process(a.vs)).state, 'duplicate');
    assert.match(a.vs.store.getItem(CI.IDENTIFIER), CI.ID); assert.equal(a.vs.store.getItem(CI.SETTINGS), before[CI.SETTINGS]);
    for (const [k, v] of Object.entries(before)) if (k !== CI.IDENTIFIER) assert.equal(a.vs.store.getItem(k), v, k);
  });
  await test('ancien identifiant illisible : seule la copie inutile est retirée, configuration conservée', async () => {
    const cfg = { ...fixture(), configured: 1 }, a = await make({ extra: { ...durable(), [CI.SETTINGS]: JSON.stringify(cfg), [CI.IDENTIFIER]: 'ancienne-valeur-invalide' } });
    const before = stored(a.vs), cf = CI.create(target('#secSeason')); assert.equal(cf.capture(), false);
    assert.equal((await cf.process(a.vs)).state, 'none'); assert.equal(a.vs.store.getItem(CI.IDENTIFIER), null);
    for (const [k, v] of Object.entries(before)) if (k !== CI.IDENTIFIER) assert.equal(a.vs.store.getItem(k), v, k);
  });
  await test('copie brute héritée : suppression vérifiée sans modifier coffre, réglages, journal ou autre app', async () => {
    const a = await make(); a.raw.setItem(CI.IDENTIFIER, encoded(fixture())); const before = a.raw.dump();
    assert.equal(CI.removePlainIdentifier(a.raw), true); delete before[CI.IDENTIFIER]; assert.deepEqual(a.raw.dump(), before);
  });
  await test('suppression de la métadonnée brute refusée : aucun import ne peut annoncer un succès', async () => {
    const a = await make(), disk = copy(a.raw.dump()), { cf } = prepared(fixture());
    const denied = { getItem: () => encoded(fixture()), removeItem: () => { throw new Error('refus fictif'); } };
    assert.equal(cf.cleanup(denied), false); assert.equal((await cf.process(a.vs)).state, 'unavailable'); assert.deepEqual(a.raw.dump(), disk);
    assert.equal(cf.pending, false); assert.equal(a.vs.store.getItem(CI.SETTINGS), null);
  });
  await test('encodages anciens URL-safe, Base64 classique et percent-encoded : même empreinte', async () => {
    const cfg = fixture(), classic = Buffer.from(JSON.stringify(cfg)).toString('base64');
    const ids = [];
    for (const raw of [classic, encoded(cfg), encodeURIComponent(classic)]) {
      const a = await make(), t = target('#' + 'cfg=' + raw), cf = CI.create(t); cf.capture();
      assert.equal((await cf.process(a.vs)).state, 'applied'); assert.equal(t.location.hash, ''); ids.push(a.vs.store.getItem(CI.IDENTIFIER));
    }
    assert.equal(new Set(ids).size, 1);
  });
  await test('paramètres de recherche, état history et fragments légitimes conservés sans navigation', async () => {
    const { t } = prepared(fixture(), '&section=secSeason&view=analyse');
    assert.equal(t.location.hash, '#section=secSeason&view=analyse'); assert.equal(t.location.pathname, '/app/');
    assert.equal(t.location.search, '?keep=a%2Bb&x=1'); assert.deepEqual(t.history.state, { keep: 'intact' }); assert.equal(t.history.calls.length, 1);
    const other = target('#secSeason'), cf = CI.create(other); assert.equal(cf.capture(), false); assert.equal(other.history.calls.length, 0);
  });
  await test('liens malformés, doublons, UTF-8 invalide, taille et JSON profond : URL retirée avant toute écriture', async () => {
    const a = await make(), disk = copy(a.raw.dump()), values = stored(a.vs);
    const huge = 'A'.repeat(CI.MAX_ENCODED + 4), deep = '{"x":'.repeat(20) + '0' + '}'.repeat(20);
    const cases = ['%', '%%%bad', Buffer.from('not-json').toString('base64url'), Buffer.from([0xc3, 0x28]).toString('base64'), huge, Buffer.from(deep).toString('base64url')];
    for (const raw of cases) { const t = target('#' + 'cfg=' + raw + '&view=analyse'), cf = CI.create(t); cf.capture();
      assert.equal(t.location.hash, '#view=analyse'); assert.equal((await cf.process(a.vs)).state, 'invalid'); assert.deepEqual(a.raw.dump(), disk); assert.deepEqual(stored(a.vs), values); }
    const t = target(link(fixture()) + '&' + 'cfg=' + encoded(fixture())), cf = CI.create(t); cf.capture(); assert.equal((await cf.process(a.vs)).state, 'invalid'); assert.equal(t.location.hash, '');
  });
  await test('structure hostile, champs inconnus, coordonnées/types invalides : refus complet, sans pollution de prototype', async () => {
    const list = [];
    const mutate = fn => { const cfg = fixture(); fn(cfg); list.push(cfg); };
    mutate(c => { c.locs[0].lat = 91; }); mutate(c => { c.locs[0].lon = '2.35'; }); mutate(c => { c.locs[0].lat = null; });
    mutate(c => { c.cars = 'véhicules'; }); mutate(c => { c.cars[0].tire = []; }); mutate(c => { c.work.dep = '99:99'; });
    mutate(c => { c.cars[0].plan.date = '2026-02-31'; }); mutate(c => { c.work.to = 'absent'; }); mutate(c => { c.cars[1].id = c.cars[0].id; });
    mutate(c => { c.APP_KEY = 'cle-fictive-interdite'; }); mutate(c => { c.cars[0].tire.futureField = 1; });
    mutate(c => { c.edits = { 'cars.0.__proto__.injected': 1 }; });
    const proto = JSON.parse(JSON.stringify(fixture()).slice(0, -1) + ',"__proto__":{"injected":true}}'); list.push(proto);
    const a = await make(), before = stored(a.vs), disk = a.raw.dump();
    for (const cfg of list) { const { cf } = prepared(cfg); assert.equal((await cf.process(a.vs)).state, 'invalid'); assert.deepEqual(stored(a.vs), before); assert.deepEqual(a.raw.dump(), disk); }
    assert.equal({}.injected, undefined);
  });
  await test('verrouillé : aucun accès au stockage protégé et aucune importation avant authentification', async () => {
    const a = await make(); await a.vs.lock(); const disk = copy(a.raw.dump()), cf = prepared(fixture()).cf;
    assert.equal((await cf.process(a.vs)).state, 'locked'); assert.equal(cf.pending, true); assert.deepEqual(a.raw.dump(), disk); assert.equal(a.vs.store.getItem(CI.SETTINGS), null);
    await assert.rejects(() => a.vs.unlock('mauvaise-cle-fictive')); assert.deepEqual(a.raw.dump(), disk);
    await a.vs.unlock(PASS); assert.equal((await cf.process(a.vs)).state, 'applied'); assert.equal(cf.pending, false);
  });
  await test('expiration pendant le calcul : import refusé, ancienne enveloppe et toutes les données conservées', async () => {
    let clock = 1000, expire = false; const crypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
      get(o, k) { if (k === 'digest') return async (...args) => { const r = await o.digest(...args); if (expire) clock += 8 * 864e5; return r; }; return typeof o[k] === 'function' ? o[k].bind(o) : o[k]; } }) };
    const a = await make({ crypto, now: () => clock }), disk = copy(a.raw.dump()), cf = prepared(fixture()).cf; expire = true;
    assert.equal((await cf.process(a.vs)).state, 'unavailable'); assert.deepEqual(a.raw.dump(), disk); assert.equal(a.vs.expired(), true);
  });
  await test('interruption crypto avant commit : aucun réglage partiel, reprise possible avec un nouveau lien', async () => {
    let fail = false; const crypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
      get(o, k) { if (k === 'encrypt') return (...args) => fail ? Promise.reject(new Error('interruption fictive')) : o.encrypt(...args); return typeof o[k] === 'function' ? o[k].bind(o) : o[k]; } }) };
    const a = await make({ crypto }), values = stored(a.vs), disk = copy(a.raw.dump()); fail = true;
    assert.equal((await prepared(fixture()).cf.process(a.vs)).state, 'unavailable'); assert.deepEqual(a.raw.dump(), disk); assert.deepEqual(stored(a.vs), values);
    fail = false; assert.equal((await prepared(fixture()).cf.process(a.vs)).state, 'applied');
  });
  await test('quota pendant import : aucun commit mémoire anticipé, valeurs durables et cache inchangés', async () => {
    const a = await make(); a.raw.setItem('twrc.cache.fixture', 'cache-fictif-conserve');
    const values = stored(a.vs), disk = copy(a.raw.dump()); a.raw.refuse(true);
    assert.equal((await prepared(fixture()).cf.process(a.vs)).state, 'unavailable'); assert.deepEqual(a.raw.dump(), disk); assert.deepEqual(stored(a.vs), values);
    a.raw.refuse(false); assert.equal((await prepared(fixture()).cf.process(a.vs)).state, 'applied');
  });
  await test('deux onglets simultanés : un seul import, verrou partagé, aucune perte des autres valeurs', async () => {
    const a = await make(), b = await make({ raw: a.raw, shared: a.shared, extra: {} }), other = fixture(); other.cars[0].name = 'Deuxième lien fictif';
    const results = await Promise.all([prepared(fixture()).cf.process(a.vs), prepared(other).cf.process(b.vs)]);
    assert.deepEqual(results.map(x => x.state).sort(), ['applied', 'configured']); assert.equal(a.shared.peak, 1);
    const verify = await make({ raw: a.raw, shared: a.shared, extra: {} });
    assert.equal(JSON.parse(verify.vs.store.getItem(CI.SETTINGS)).cars[0].name, fixture().cars[0].name);
    for (const [k, v] of Object.entries(durable())) assert.equal(verify.vs.store.getItem(k), v, k);
  });
  await test('rechargement et réouverture : mêmes paramètres, historiques et identifiant ; aucun lien privé restauré', async () => {
    const a = await make(), { t, cf } = prepared(fixture()); await cf.process(a.vs); const before = stored(a.vs);
    const b = await make({ raw: a.raw, shared: a.shared, extra: {} }), reopen = CI.create(target(t.location.hash)); reopen.capture(); await reopen.process(b.vs);
    assert.deepEqual(stored(b.vs), before); assert.equal(reopen.pending, false); assert.equal(reopen.status.state, 'none');
  });
  await test('fermeture avant déverrouillage : lien retiré, rien de privé persisté et aucun import implicite à la réouverture', async () => {
    const a = await make(); await a.vs.lock(); const disk = copy(a.raw.dump()), { t, cf } = prepared(fixture()); await cf.process(a.vs);
    const reopen = CI.create(target(t.location.hash)); assert.equal(reopen.capture(), false); await a.vs.unlock(PASS); await reopen.process(a.vs);
    assert.equal(a.vs.store.getItem(CI.SETTINGS), null); assert.equal(a.vs.store.getItem(CI.IDENTIFIER), null); assert.equal(disk[SV.VAULT] != null, true);
  });
  await test('échec de nettoyage URL : aucune autorisation ni persistance, diagnostic sans contenu', async () => {
    const a = await make(), disk = a.raw.dump(), t = target(link(fixture()), true), cf = CI.create(t); cf.capture();
    assert.equal((await cf.process(a.vs)).state, 'url'); assert.equal(cf.pending, false); assert.deepEqual(a.raw.dump(), disk);
    assert(!CI.message(cf.status).includes(fixture().locs[0].name)); assert(!JSON.stringify(cf.status).includes(encoded(fixture())));
  });
  await test('capture plus récente pendant SHA-256 : ancien import annulé avant écriture', async () => {
    let intercept = null; const crypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
      get(o, k) { if (k === 'digest') return async (...args) => { const result = await o.digest(...args); if (intercept) { const f = intercept; intercept = null; f(); } return result; }; return typeof o[k] === 'function' ? o[k].bind(o) : o[k]; } }) };
    const a = await make({ crypto }), t = target(link(fixture())), cf = CI.create(t); cf.capture();
    intercept = () => { t.location.hash = '#' + 'cfg=%invalid'; cf.capture(); };
    assert.equal((await cf.process(a.vs)).state, 'invalid'); assert.equal(a.vs.store.getItem(CI.SETTINGS), null); assert.equal(t.location.hash, '');
  });
  await test('matins génériques déjà enregistrés : conserver le journal lors de la première configuration', async () => {
    const cfg = fixture(), baseline = copy(ctx.BASELINE), prior = { ...copy(baseline), journal: { '2026-10-12': { T: 4, Tr: 3, ice: 1, vis: 10000, lv: {} } } };
    const a = await make({ extra: { ...durable(), [CI.SETTINGS]: JSON.stringify(prior) } });
    assert.equal((await prepared(cfg).cf.process(a.vs, baseline)).state, 'applied'); assert.deepEqual(JSON.parse(a.vs.store.getItem(CI.SETTINGS)).journal, prior.journal);
    prior.cars[0].odo = [{ d: '2026-10-12', km: 100 }]; const b = await make({ extra: { ...durable(), [CI.SETTINGS]: JSON.stringify(prior) } }), before = stored(b.vs);
    assert.equal((await prepared(cfg).cf.process(b.vs, baseline)).state, 'configured'); assert.deepEqual(stored(b.vs), before);
    delete prior.cars[0].odo; prior.locs[0].lat = 40;
    const c = await make({ extra: { ...durable(), [CI.SETTINGS]: JSON.stringify(prior) } }), untouched = stored(c.vs);
    assert.equal((await prepared(cfg).cf.process(c.vs, baseline)).state, 'configured'); assert.deepEqual(stored(c.vs), untouched);
  });
  console.log(n + '/' + n + ' scénarios OK');
})().catch(e => { console.error('❌ ' + stage + ' · ' + e.name + ': ' + e.message.split('\n')[0]); process.exit(1); });
