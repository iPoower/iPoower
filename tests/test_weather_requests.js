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
  await test('un GPS remplacé libère les deux transports ; son appel en attente ne part jamais', async () => {
    const s = setup(), old = Array.from({ length: 3 }, (_, i) => s.c.get(U + 'old' + i, 12000, 'gps'));
    const result = Promise.allSettled(old); s.c.cancelGroup('gps');
    const current = [s.c.get(U + 'new1', 12000, 'gps'), s.c.get(U + 'new2', 12000, 'gps')];
    await turn(); assert.equal(s.calls.length, 4); assert.equal(s.c.state().active, 2);
    assert.ok(s.calls.slice(0, 2).every(c => c.options.signal.aborted));
    assert.ok((await result).every(r => r.status === 'rejected' && r.reason.cancelled));
    assert.ok(!s.calls.some(c => c.url.includes('old2')));
    s.calls.slice(2).forEach(c => c.resolve(reply())); await Promise.all(current); assert.equal(s.c.state().active, 0);
  });
  await test('oublier le GPS conserve une requête identique aussi demandée par un lieu enregistré', async () => {
    const s = setup(), saved = s.c.get(U + 'shared'), gps = s.c.get(U + 'shared', 12000, 'gps');
    assert.equal(saved, gps); s.c.cancelGroup('gps'); assert.equal(s.calls.length, 1);
    assert.equal(s.calls[0].options.signal.aborted, false); s.calls[0].resolve(reply()); await Promise.all([saved, gps]);
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
    assert.deepEqual(Object.keys(JSON.parse(shared.value)).sort(), ['at', 'failures', 'kind', 'until']); assert.ok(!shared.value.includes('latitude'));
  });
  await test('Retry-After accepte une date HTTP', async () => {
    const s = setup(), p = s.c.get(U + 'date'), rejected = assert.rejects(p, e => e.status === 429);
    const at = s.now() + 180000; s.calls[0].resolve(reply(429, {}, new Date(at).toUTCString())); await rejected;
    assert.equal(s.c.state().until, at);
  });
  await test('quota horaire ou journalier sans en-tête : délai adapté au motif', async () => {
    // test à 10:00 UTC : quota journalier → reprise à minuit UTC + 2 min (14 h 02), plus 24 h
    for (const [reason, delay, kind] of [['Hourly API request limit exceeded', 3600000, 'hour'], ['Daily API request limit exceeded. Please try tomorrow', 14 * 3600000 + 120000, 'day']]) {
      const s = setup(), p = s.c.get(U + kind), rejected = assert.rejects(p, e => e.status === 429);
      s.calls[0].resolve(reply(429, { reason })); await rejected; assert.equal(s.c.state().until, s.now() + delay); assert.equal(s.c.state().kind, kind);
    }
  });
  await test('incident du 7 octobre : quota journalier à 14:44 → reprise à minuit UTC, puis toutes les heures s’il reste épuisé', async () => {
    const s = setup();
    let p = s.c.get(U + 'd1'), rejected = assert.rejects(p, e => e.status === 429);
    s.calls[0].resolve(reply(429, { reason: 'Daily API request limit exceeded. Please try again tomorrow.' })); await rejected;
    assert.equal(new Date(s.c.state().until).toISOString(), '2026-10-06T00:02:00.000Z');
    await s.advance(s.c.state().until - s.now());
    p = s.c.get(U + 'd2'); rejected = assert.rejects(p, e => e.status === 429);
    s.calls[1].resolve(reply(429, { reason: 'Daily API request limit exceeded. Please try again tomorrow.' })); await rejected;
    assert.equal(s.c.state().until, s.now() + 3600000, 'encore épuisé à la reprise : nouvel essai dans 1 h, pas un jour de plus');
    await s.advance(3600000); p = s.c.get(U + 'd3'); s.calls[2].resolve(reply()); await p;
    assert.equal(s.c.state().until, 0); assert.equal(s.c.state().failures, 0);
  });
  await test('pause journalière de 24 h enregistrée par l’ancienne version : ramenée à minuit UTC au chargement', async () => {
    const shared = { value: JSON.stringify({ until: Date.parse('2026-10-06T10:00:00Z'), failures: 1, kind: 'day' }) }, s = setup(shared);
    assert.equal(new Date(s.c.state().until).toISOString(), '2026-10-06T00:02:00.000Z'); assert.equal(JSON.parse(shared.value).until, Date.parse('2026-10-06T00:02:00Z'));
    const h = setup({ value: JSON.stringify({ until: Date.parse('2026-10-05T11:00:00Z'), failures: 1, kind: 'hour' }) });
    assert.equal(h.c.state().until, Date.parse('2026-10-05T11:00:00Z'), 'une pause horaire n’est pas touchée');
  });
  await test('incident du 8 octobre : pause de 24 h héritée, lue après minuit UTC → déjà expirée, la météo repart', async () => {
    // refus le 05/10 à 12:44 UTC sous l'ancienne version (pause jusqu'au 06/10 12:44) ; l'app rouvre le 06/10 à 05:57 UTC
    const shared = { value: JSON.stringify({ until: Date.parse('2026-10-06T12:44:00Z'), failures: 1, kind: 'day' }) }, s = setup(shared);
    await s.advance(Date.parse('2026-10-06T05:57:00Z') - s.now());
    assert(s.c.state().until <= s.now(), 'pause expirée à 00:02 UTC : ' + new Date(s.c.state().until).toISOString());
    assert.equal(JSON.parse(shared.value).until, Date.parse('2026-10-06T00:02:00Z'));
    const p = s.c.get(U + 'matin'); assert.equal(s.calls.length, 1, 'la requête part'); s.calls[0].resolve(reply()); await p;
    assert.equal(s.c.state().failures, 0);
  });
  await test('nouveau refus journalier : moment du refus enregistré, pause jusqu’à la reprise suivante même lue le lendemain', async () => {
    const shared = { value: null }, s = setup(shared), p = s.c.get(U + 'j'), rejected = assert.rejects(p, e => e.status === 429);
    s.calls[0].resolve(reply(429, { reason: 'Daily API request limit exceeded' })); await rejected;
    const saved = JSON.parse(shared.value); assert.equal(saved.at, Date.parse('2026-10-05T10:00:00Z')); assert.equal(saved.until, Date.parse('2026-10-06T00:02:00Z'));
    const t = setup({ value: shared.value }); await t.advance(Date.parse('2026-10-06T06:00:00Z') - t.now()); assert(t.c.state().until <= t.now());
  });
  await test('429 journalier juste avant minuit UTC : pas de reprise immédiate, essai dans 1 h', async () => {
    const s = setup(); await s.advance(Date.parse('2026-10-05T23:55:00Z') - s.now());
    const p = s.c.get(U + 'late'), rejected = assert.rejects(p, e => e.status === 429);
    s.calls[0].resolve(reply(429, { reason: 'Daily API request limit exceeded' })); await rejected;
    assert.equal(s.c.state().until, s.now() + 3600000);
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
  await test('cache mémoire : même URL économisée pendant sa durée, puis réellement renouvelée', async () => {
    const s = setup(), u = U + 'ttl';
    const first = s.c.get(u, 12000, 'shared', 20 * 60e3); s.calls[0].resolve(reply()); await first;
    const initial = s.c.fetchedAt(u);
    await s.advance(5 * 60e3);
    const cached = await s.c.get(u, 12000, 'shared', 20 * 60e3);
    assert.equal(s.calls.length, 1); assert.equal(cached.hourly.time[0], '2026-10-05T12:00');
    assert.equal(s.c.fetchedAt(u), initial, 'l’heure de la source ne doit pas avancer sur un cache');
    await s.advance(15 * 60e3);
    const next = s.c.get(u, 12000, 'shared', 20 * 60e3);
    assert.equal(s.calls.length, 2); s.calls[1].resolve(reply()); await next;
    assert.equal(s.c.fetchedAt(u), s.now());
    assert.deepEqual(Object.keys(JSON.parse(s.shared.value || '{}')), [], 'aucune URL en localStorage');
  });
  await test('cache strict : requête forcée, URL différente et réponse 200 invalide ne sont pas réutilisées', async () => {
    const s = setup(), u = U + 'bad';
    let p = s.c.get(u, 12000, 'shared', 15 * 60e3); s.calls[0].resolve(reply(200, {})); await p;
    p = s.c.get(u, 12000, 'shared', 15 * 60e3); assert.equal(s.calls.length, 2);
    s.calls[1].resolve(reply()); await p;
    p = s.c.get(u, 12000, 'shared', 0); assert.equal(s.calls.length, 3);
    s.calls[2].resolve(reply()); await p;
    p = s.c.get(U + 'other', 12000, 'shared', 15 * 60e3); assert.equal(s.calls.length, 4);
    s.calls[3].resolve(reply()); await p;
  });
  await test('volume : 12 consultations 5 min d’une prévision 30 min = 2 appels HTTP, jamais 12', async () => {
    const s = setup(), u = U + 'volume';
    for (let i = 0; i < 12; i++) {
      const n = s.calls.length;
      const p = s.c.get(u, 12000, 'shared', 30 * 60e3);
      if (s.calls.length > n) s.calls[n].resolve(reply());
      await p; await s.advance(5 * 60e3);
    }
    assert.equal(s.calls.length, 2);
  });
  await test('429 reste bloquant même si une ancienne réponse de la même URL est en cache', async () => {
    const s = setup(), u = U + 'cached';
    let p = s.c.get(u, 12000, 'shared', 30 * 60e3); s.calls[0].resolve(reply()); await p;
    p = s.c.get(U + '429', 12000, 'shared', 0);
    const bad = assert.rejects(p, e => e.status === 429);
    s.calls[1].resolve(reply(429, { reason: 'Daily API request limit exceeded' })); await bad;
    await assert.rejects(s.c.get(u, 12000, 'shared', 30 * 60e3), e => e.status === 429);
    assert.equal(s.calls.length, 2);
  });
  console.log(`${count}/${count} scénarios OK`);
})().catch(e => { console.error(e); process.exitCode = 1; });
