// Horloge externe du relais (tools/relay-clock) et mesure de fraîcheur (tools/relay-freshness.js) : réseau simulé, aucun secret réel.
const path = require('path'), assert = require('assert');
const { freshness, parisMinute } = require('../tools/relay-freshness.js');
(async () => {
  const W = await import(path.join(__dirname, '../tools/relay-clock/worker.mjs'));
  const NOW = Date.parse('2026-10-05T05:00:00Z'), TOKEN = 'jeton-de-test-uniquement';
  let count = 0;
  const test = async (name, fn) => { await fn(); count++; console.log('✅ ' + name); };
  // faux réseau : obs.json servi tel quel, l'API GitHub répond `status`
  const net = (obs, status = 204) => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, init });
      if (url.startsWith(W.OBS_URL)) {
        if (obs instanceof Error) throw obs;
        return { ok: obs != null, status: obs != null ? 200 : 404, json: async () => obs };
      }
      return { ok: status < 300, status };
    };
    return { calls, fetchImpl, dispatches: () => calls.filter(c => c.url.includes('/dispatches')) };
  };
  const ago = min => ({ updated: new Date(NOW - min * 60000).toISOString() });

  await test('relais frais (< 8 min) : aucun lancement', async () => {
    const n = net(ago(5)), r = await W.tick({ GH_TOKEN: TOKEN }, { fetchImpl: n.fetchImpl, now: NOW });
    assert.equal(r.dispatch, false); assert.equal(n.dispatches().length, 0);
  });
  await test('relais dû (≥ 8 min) : un lancement de race-control.yml sur main, source horloge', async () => {
    const n = net(ago(8)), r = await W.tick({ GH_TOKEN: TOKEN }, { fetchImpl: n.fetchImpl, now: NOW });
    assert.equal(r.dispatch, true); assert.equal(r.status, 204);
    const [d] = n.dispatches();
    assert.equal(d.url, 'https://api.github.com/repos/iPoower/iPoower/actions/workflows/race-control.yml/dispatches');
    assert.equal(d.init.method, 'POST'); assert.equal(d.init.headers.authorization, 'Bearer ' + TOKEN);
    assert.deepEqual(JSON.parse(d.init.body), { ref: 'main', inputs: { source: 'horloge' } });
  });
  await test('obs.json absent, illisible ou réseau en panne : le relais est quand même lancé', async () => {
    for (const obs of [null, {}, { updated: 'pas une date' }, new Error('réseau')]) {
      const n = net(obs); await W.tick({ GH_TOKEN: TOKEN }, { fetchImpl: n.fetchImpl, now: NOW });
      assert.equal(n.dispatches().length, 1, String(obs && obs.message || JSON.stringify(obs)));
    }
  });
  await test('lecture de obs.json sans cache CDN ni jeton', async () => {
    const n = net(ago(20)); await W.tick({ GH_TOKEN: TOKEN }, { fetchImpl: n.fetchImpl, now: NOW });
    const read = n.calls.find(c => c.url.startsWith(W.OBS_URL));
    assert.equal(read.url, W.OBS_URL + '?t=' + NOW); assert(!JSON.stringify(read.init).includes(TOKEN), 'le jeton ne part que vers api.github.com');
  });
  await test('refus GitHub (jeton expiré, 401/403/404/422) : invocation en échec, visible', async () => {
    for (const status of [401, 403, 404, 422, 500]) {
      const n = net(ago(30), status);
      await assert.rejects(W.tick({ GH_TOKEN: TOKEN }, { fetchImpl: n.fetchImpl, now: NOW }), new RegExp('HTTP ' + status));
    }
  });
  await test('secret GH_TOKEN absent : erreur explicite, aucun appel réseau', async () => {
    const n = net(ago(30));
    await assert.rejects(W.tick({}, { fetchImpl: n.fetchImpl, now: NOW }), /GH_TOKEN/); assert.equal(n.calls.length, 0);
  });
  await test('même seuil que le workflow (8 min)', async () => {
    const wf = require('fs').readFileSync(path.join(__dirname, '../.github/workflows/race-control.yml'), 'utf8');
    assert.match(wf, /age>=8/); assert.equal(W.DUE_MIN, 8);
    assert.match(wf, /github\.event\.inputs\.source != 'horloge'/, 'le workflow doit respecter la fraîcheur pour source=horloge');
  });

  // — mesure de fraîcheur
  await test('heure de Paris : semaine et minute locale, été comme hiver', async () => {
    assert.deepEqual(parisMinute(Date.parse('2026-10-05T05:00:00Z')), { weekday: true, min: 7 * 60 });    // lundi, UTC+2
    assert.deepEqual(parisMinute(Date.parse('2026-12-07T05:00:00Z')), { weekday: true, min: 6 * 60 });    // lundi, UTC+1
    assert.equal(parisMinute(Date.parse('2026-10-04T05:00:00Z')).weekday, false);                         // dimanche
  });
  await test('relais toutes les 10 min : matinée 100 % fraîche', async () => {
    const from = Date.parse('2026-10-05T00:00:00Z'), to = Date.parse('2026-10-05T10:00:00Z');
    const times = []; for (let t = from - 600e3; t < to; t += 600e3) times.push(t);
    const r = freshness(times, from, to);
    assert.equal(r.p50, 10); assert.equal(r.morningMinutes, 270); assert.equal(r.morningFresh, 1);
  });
  await test('trou de 3 h en pleine matinée : détecté', async () => {
    const from = Date.parse('2026-10-05T00:00:00Z'), to = Date.parse('2026-10-05T10:00:00Z');
    const r = freshness([Date.parse('2026-10-05T03:00:00Z'), Date.parse('2026-10-05T06:00:00Z')], from, to);
    assert.equal(r.max, 180); assert(r.morningFresh < 0.2, String(r.morningFresh));
  });
  console.log(count + '/' + count + ' scénarios OK');
})().catch(e => { console.error('❌', e && e.stack || e); process.exit(1); });
