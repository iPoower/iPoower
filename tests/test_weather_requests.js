// Vrai gestionnaire, transport et horloge fictifs : aucune requête réseau ni donnée personnelle.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const manager = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/weather-requests.js'), 'utf8') + ';weatherRequestManager;', { URL, AbortController, setTimeout, clearTimeout, Date, Map, JSON });
const U = 'https://api.open-meteo.com/v1/forecast?latitude=48&longitude=2&test=';
const turn = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const reply = (status = 200, body = { hourly: { time: ['2026-10-05T12:00'] } }, retry = null) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => retry }, json: async () => body });
function setup(shared = { value: null }) {
  let at = Date.parse('2026-10-05T10:00:00Z'), id = 0; const timers = new Map(), calls = [];
  const c = manager({ now: () => at, read: () => shared.value, write: v => { shared.value = v; },
    setTimeout: (fn, ms) => { const k = ++id; timers.set(k, { fn, at: at + ms }); return k; }, clearTimeout: k => timers.delete(k),
    fetch: (url, options) => new Promise((resolve, reject) => { calls.push({ url, options, resolve, reject }); options.signal.addEventListener('abort', () => reject(new Error('transport annulé')), { once: true }); }) });
  return { c, calls, shared, now: () => at, advance: async ms => { at += ms; for (const [k, t] of [...timers]) if (t.at <= at) { timers.delete(k); t.fn(); } await turn(); } };
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✅ ' + name); }
(async () => {
  await test('seules les API Open-Meteo sont concernées ; relais et domaine usurpé exclus', async () => {
    const { c } = setup();
    assert.equal(c.owns(U), true); assert.equal(c.owns('https://ensemble-api.open-meteo.com/v1/ensemble'), true);
    assert.equal(c.owns('https://ipoower.github.io/iPoower/race-control/obs.json'), false);
    assert.equal(c.owns('https://open-meteo.com.evil.example/v1/forecast'), false); assert.equal(c.owns('obs.json'), false);
  });
  await test('douze requêtes sont servies avec au plus deux transports simultanés', async () => {
    const { c, calls } = setup(), requests = Array.from({ length: 12 }, (_, i) => c.get(U + i));
    assert.equal(calls.length, 2); assert.equal(c.state().queued, 10);
    let served = 0;
    while (served < 12) { const batch = calls.slice(served); assert.ok(batch.length <= 2); batch.forEach(x => x.resolve(reply())); served += batch.length; await turn(); }
    await Promise.all(requests); assert.equal(c.state().active, 0); assert.equal(c.state().queued, 0);
    assert.ok(calls.every(x => x.options.cache === 'no-store'));
  });
  await test('deux demandes identiques partagent un seul transport', async () => {
    const { c, calls } = setup(), a = c.get(U + 'same'), b = c.get(U + 'same');
    assert.equal(a, b); assert.equal(calls.length, 1); calls[0].resolve(reply()); await Promise.all([a, b]);
  });
  await test('la météo actuelle passe avant les enrichissements encore en attente', async () => {
    const s = setup(), requests = [s.c.get(U + 'active1'), s.c.get(U + 'active2'), s.c.get(U + 'background'), s.c.get(U + 'current&current=temperature_2m')];
    s.calls[0].resolve(reply()); await turn(); assert.ok(s.calls[2].url.includes('current='));
    s.calls[1].resolve(reply()); await turn(); s.calls.slice(2).forEach(x => x.resolve(reply())); await Promise.all(requests);
  });
  await test('HTTP 429 respecte Retry-After et arrête les requêtes encore en file', async () => {
    const { c, calls, now } = setup(), requests = Array.from({ length: 12 }, (_, i) => c.get(U + i));
    const result = Promise.allSettled(requests);
    calls[0].resolve(reply(429, { reason: 'Too many concurrent requests' }, '120')); await turn();
    calls[1].resolve(reply(429, {}, '120')); const rows = await result;
    assert.equal(calls.length, 2); assert.ok(rows.every(r => r.status === 'rejected' && r.reason.status === 429));
    assert.equal(c.state().until, now() + 120000); assert.equal(c.state().queued, 0);
    await assert.rejects(c.get(U + 'again'), e => e.status === 429); assert.equal(calls.length, 2);
  });
  await test('la pause survit au rechargement et est partagée avec un autre onglet', async () => {
    const shared = { value: null }, a = setup(shared), b = setup(shared), p = a.c.get(U + 'limit');
    const rejected = assert.rejects(p, e => e.status === 429); a.calls[0].resolve(reply(429, {}, '120')); await rejected;
    await assert.rejects(b.c.get(U + 'other'), e => e.status === 429); assert.equal(b.calls.length, 0);
    const reloaded = setup(shared); await assert.rejects(reloaded.c.get(U + 'reload'), e => e.status === 429); assert.equal(reloaded.calls.length, 0);
    assert.deepEqual(Object.keys(JSON.parse(shared.value)).sort(), ['failures', 'kind', 'until']); assert.ok(!shared.value.includes('latitude'));
  });
  await test('Retry-After accepte une date HTTP', async () => {
    const s = setup(), p = s.c.get(U + 'date'), rejected = assert.rejects(p, e => e.status === 429);
    const at = s.now() + 180000; s.calls[0].resolve(reply(429, {}, new Date(at).toUTCString())); await rejected;
    assert.equal(s.c.state().until, at);
  });
  await test('quota horaire ou journalier sans en-tête : délai adapté au motif', async () => {
    for (const [reason, delay, kind] of [['Hourly API request limit exceeded', 3600000, 'hour'], ['Daily API request limit exceeded. Please try tomorrow', 86400000, 'day']]) {
      const s = setup(), p = s.c.get(U + kind), rejected = assert.rejects(p, e => e.status === 429);
      s.calls[0].resolve(reply(429, { reason })); await rejected; assert.equal(s.c.state().until, s.now() + delay); assert.equal(s.c.state().kind, kind);
    }
  });
  await test('sans délai explicite : 1 puis 2 minutes ; succès après attente réinitialise le recul', async () => {
    const s = setup();
    for (const [i, delay] of [[0, 60000], [1, 120000]]) {
      const p = s.c.get(U + i), rejected = assert.rejects(p, e => e.status === 429);
      s.calls[i].resolve(reply(429, {})); await rejected; assert.equal(s.c.state().until, s.now() + delay); await s.advance(delay);
    }
    const p = s.c.get(U + 'ok'); s.calls[2].resolve(reply()); await p; assert.equal(s.c.state().until, 0); assert.equal(s.c.state().failures, 0);
  });
  await test('un ancien succès ne supprime pas la pause d’un refus plus récent', async () => {
    const s = setup(), good = s.c.get(U + 'old'), bad = s.c.get(U + 'new'), rejected = assert.rejects(bad, e => e.status === 429);
    s.calls[1].resolve(reply(429, {}, '120')); await rejected; s.calls[0].resolve(reply()); await good;
    assert.equal(s.c.state().until, s.now() + 120000);
  });
  await test('la pause commence avant la lecture d’un corps 429 lent', async () => {
    const s = setup(), p = s.c.get(U + 'slow'); let release;
    const body = new Promise(resolve => { release = resolve; }), rejected = assert.rejects(p, e => e.status === 429);
    s.calls[0].resolve({ ...reply(429), json: () => body }); await turn();
    await assert.rejects(s.c.get(U + 'blocked'), e => e.status === 429); assert.equal(s.calls.length, 1);
    release({ reason: 'Too many concurrent requests' }); await rejected;
  });
  await test('le délai inclut l’attente et libère toutes les promesses lors d’un réseau muet', async () => {
    const s = setup(), requests = Array.from({ length: 8 }, (_, i) => s.c.get(U + i, 1000)), result = Promise.allSettled(requests);
    await s.advance(1000); const rows = await result; assert.ok(rows.every(r => r.status === 'rejected')); assert.equal(s.c.state().active, 0);
    assert.equal(s.c.state().queued, 0); assert.equal(s.calls.length, 2);
    const p = s.c.get(U + 'recover'); s.calls[2].resolve(reply()); await p;
  });
  await test('HTTP 503 n’active pas de pause HTTP 429', async () => {
    const s = setup(), p = s.c.get(U + '503'), rejected = assert.rejects(p, /HTTP 503/);
    s.calls[0].resolve(reply(503)); await rejected; assert.equal(s.c.state().until, 0);
    const good = s.c.get(U + 'recover'); s.calls[1].resolve(reply()); await good;
  });
  await test('stockage indisponible : protection conservée en mémoire', async () => {
    let calls = 0;
    const c = manager({ read: () => { throw new Error('storage'); }, write: () => { throw new Error('storage'); }, fetch: async () => { calls++; return reply(429, {}, '120'); } });
    await assert.rejects(c.get(U + 'first'), e => e.status === 429); await assert.rejects(c.get(U + 'second'), e => e.status === 429); assert.equal(calls, 1);
  });
  console.log(`${count}/${count} scénarios OK`);
})().catch(e => { console.error(e); process.exitCode = 1; });
