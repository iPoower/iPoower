// Horloge externe du relais (tools/relay-clock) et mesure de fraîcheur (tools/relay-freshness.js) : réseau simulé, aucun secret réel.
// Un monde simulé déterministe : horloge, GitHub Pages (obs.json, délai de propagation) et GitHub Actions (cycle de vie des runs).
const fs = require('fs'), path = require('path'), assert = require('assert');
const { freshness, parisMinute } = require('../tools/relay-freshness.js');
const TOKEN = 'jeton-de-test-uniquement';
(async () => {
  const W = await import(path.join(__dirname, '../tools/relay-clock/clock.mjs'));
  const T0 = Date.parse('2026-10-05T05:00:00Z');
  let count = 0;
  const test = async (name, fn) => { await fn(); count++; console.log('✅ ' + name); };
  const RUNS_RE = /\/actions\/workflows\/(race-control(?:-watchdog)?\.yml)\/runs/;

  // Monde : obs.updated réel, publié sur Pages 60 s après le commit ; un run met 30 s à démarrer et 90 s à finir.
  // Le relais ne rafraîchit obs.json que s'il le trouve dû (≥ 8 min), comme l'étape « Vérifier si une vraie synchronisation est due ».
  function world({ updated = T0 - 20 * 60e3, relayWorks = true, obsMode = 'ok', dispatchStatus = 204, runsStatus = 200, cancelStatus = 202 } = {}) {
    const S = { now: T0, updated, published: [{ at: -Infinity, updated }], runs: [], dispatches: 0, cancels: [], calls: [], logs: [], nextId: 1000 };
    const servedObs = () => { const p = S.published.filter(x => x.at <= S.now).pop(); return p && p.updated; };
    const advance = () => S.runs.forEach(r => {
      if (!r.id) r.id = S.nextId++;
      if (r.stuck && r.status !== 'completed') return;   // run coincé (environnement « waiting ») : ne finit jamais seul
      const age = S.now - r.created;
      if (r.status !== 'completed' && age >= 90e3) {
        r.status = 'completed'; r.conclusion = 'success';
        const startAt = r.created + 30e3;
        if (relayWorks && startAt - S.updated >= 8 * 60e3) { S.updated = r.created + 90e3; S.published.push({ at: r.created + 150e3, updated: S.updated }); }
      } else if (r.status === 'queued' && age >= 30e3) r.status = 'in_progress';
    });
    const fetchImpl = async (url, init = {}) => {
      advance(); S.calls.push({ url, init });
      if (url.startsWith(W.OBS_URL)) {
        if (obsMode === 'down') throw new Error('réseau');
        if (obsMode === 'missing') return { ok: false, status: 404, json: async () => null };
        if (obsMode === 'invalid') return { ok: true, status: 200, json: async () => ({ updated: 'pas une date' }) };
        // contenu réaliste : stations et relais publics, plus des champs que le Worker ne doit jamais journaliser
        return { ok: true, status: 200, json: async () => ({ updated: new Date(servedObs()).toISOString(), stations: { LFAQ: { lat: 49.9715, lon: 2.6976 } }, relay: { cfg: 'ok' }, morning: { sent: 0 } }) };
      }
      const m = RUNS_RE.exec(url);
      if (m && (!init.method || init.method === 'GET')) {
        if (runsStatus !== 200) return { ok: false, status: runsStatus, json: async () => ({}) };
        const list = S.runs.filter(r => r.wf === m[1]).slice().reverse().map(r => ({ id: r.id, status: r.status, conclusion: r.conclusion || null, created_at: new Date(r.created).toISOString(), event: r.event }));
        return { ok: true, status: 200, json: async () => ({ total_count: list.length, workflow_runs: list }) };
      }
      const cm = /\/actions\/runs\/(\d+)\/cancel$/.exec(url);
      if (cm && init.method === 'POST') {
        S.cancels.push(+cm[1]);
        const r = S.runs.find(x => x.id === +cm[1]);
        if (r && cancelStatus >= 200 && cancelStatus < 300) { r.status = 'completed'; r.conclusion = 'cancelled'; }
        return { ok: cancelStatus < 300, status: cancelStatus };
      }
      if (url.endsWith('/dispatches') && init.method === 'POST') {
        S.dispatches++;
        if (dispatchStatus >= 200 && dispatchStatus < 300) S.runs.push({ wf: 'race-control.yml', created: S.now + 2e3, status: 'queued', event: 'workflow_dispatch' });
        return { ok: dispatchStatus < 300, status: dispatchStatus };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const log = (...a) => S.logs.push(a.map(String).join(' '));
    const tick = async () => { const r = await W.tick({ GH_TOKEN: TOKEN }, { fetchImpl, now: S.now, log }); return r; };
    const minutes = async n => { const out = []; for (let i = 0; i < n; i++) { out.push(await tick().catch(e => ({ error: e.message }))); S.now += 60e3; } return out; };
    return { S, tick, minutes, fetchImpl };
  }

  // — décisions de base
  await test('obs frais (< 8 min) : aucun dispatch, aucun appel à GitHub', async () => {
    const w = world({ updated: T0 - 3 * 60e3 }), r = await w.tick();
    assert.equal(r.decision, 'fresh'); assert.equal(w.S.dispatches, 0); assert(!w.S.calls.some(c => c.url.includes('api.github.com')), 'aucun appel GitHub quand tout est frais');
  });
  await test('obs vieux (≥ 8 min) : un seul dispatch de race-control.yml sur main, source=horloge', async () => {
    const w = world({ updated: T0 - 8 * 60e3 }), r = await w.tick();
    assert.equal(r.decision, 'stale'); assert.equal(r.action, 'dispatched'); assert.equal(w.S.dispatches, 1);
    const d = w.S.calls.find(c => c.url.endsWith('/dispatches'));
    assert.equal(d.url, 'https://api.github.com/repos/iPoower/iPoower/actions/workflows/race-control.yml/dispatches');
    assert.equal(d.init.headers.authorization, 'Bearer ' + TOKEN); assert.deepEqual(JSON.parse(d.init.body), { ref: 'main', inputs: { source: 'horloge' } });
  });
  await test('obs absent, invalide ou injoignable : dispatch', async () => {
    for (const obsMode of ['missing', 'invalid', 'down']) {
      const w = world({ obsMode }), r = await w.tick();
      assert.equal(w.S.dispatches, 1, obsMode); assert.equal(r.decision, obsMode === 'invalid' ? 'invalid' : 'unreachable', obsMode);
    }
  });

  // — anti-tempête
  await test('retard : ticks chaque minute jusqu’au retour au frais, un seul dispatch', async () => {
    const w = world({ updated: T0 - 9 * 60e3 }), out = await w.minutes(8);
    assert.equal(w.S.dispatches, 1, 'dispatches : ' + w.S.dispatches);
    assert.equal(out[out.length - 1].decision, 'fresh', 'obs.json frais après le relais');
    assert(out.some(o => o.action === 'skipped' && /en cours|cooldown/.test(o.reason)), 'les ticks suivants sont retenus par la garde');
  });
  await test('3 h sans cron GitHub : le Worker seul maintient obs.json, un dispatch par épisode, jamais deux à moins de 6 min', async () => {
    const w = world({ updated: T0 - 9 * 60e3 }), out = await w.minutes(180), at = [];
    out.forEach((o, i) => { if (o.action === 'dispatched') at.push(i); });
    assert(at.every((m, k) => k === 0 || m - at[k - 1] >= W.COOLDOWN_MIN), 'écarts : ' + at.join(','));
    const staleTicks = out.filter(o => o.decision === 'stale').length, maxAge = Math.max(...out.map(o => o.age || 0));
    assert(maxAge < 13, 'âge maximal observé ' + maxAge.toFixed(1) + ' min'); assert(at.length >= 15 && at.length <= 20, at.length + ' dispatches en 3 h');
    console.log('   ↳ 3 h simulées : ' + at.length + ' dispatches, âge max ' + maxAge.toFixed(1) + ' min, ' + staleTicks + ' ticks « stale » sur 180');
  });
  await test('données revenues fraîches : plus aucun dispatch pendant 7 min', async () => {
    const w = world({ updated: T0 - 9 * 60e3 }); await w.minutes(6); const before = w.S.dispatches;
    w.S.updated = w.S.now; w.S.published.push({ at: w.S.now, updated: w.S.now });
    const out = await w.minutes(7);
    assert.equal(w.S.dispatches, before); assert(out.every(o => o.decision === 'fresh'));
  });
  await test('relais cassé (obs ne se rafraîchit jamais) : au plus un dispatch par période de garde, jamais de tempête', async () => {
    const w = world({ relayWorks: false }), out = await w.minutes(60);
    assert(w.S.dispatches >= 5 && w.S.dispatches <= Math.ceil(60 / W.COOLDOWN_MIN) + 1, 'dispatches en 60 min : ' + w.S.dispatches);
    assert(out.every(o => !o.error), 'aucune erreur');
  });
  await test('run du watchdog GitHub déjà en cours : aucun dispatch supplémentaire', async () => {
    const w = world({ updated: T0 - 12 * 60e3 }); w.S.runs.push({ wf: 'race-control-watchdog.yml', created: T0 - 20e3, status: 'in_progress', event: 'schedule' });
    const r = await w.tick();
    assert.equal(w.S.dispatches, 0); assert.equal(r.action, 'skipped'); assert.match(r.reason, /en cours/);
  });
  await test('run ancien (avant que les données vieillissent) : ignoré par la garde, dispatch', async () => {
    const w = world({ updated: T0 - 12 * 60e3 }); w.S.runs.push({ wf: 'race-control.yml', created: T0 - 6 * 60e3, status: 'completed', conclusion: 'success', event: 'schedule' });
    w.S.runs[0].created = T0 - 5 * 60e3 - (12 - 8) * 60e3 - 60e3;   // créé avant le passage à « dû »
    await w.tick(); assert.equal(w.S.dispatches, 1);
  });

  // — auto-réparation : run bloqué (incident du 7 octobre 2026)
  await test('run bloqué « waiting » depuis 25 min et données dues : annulé, puis relais relancé au tick suivant', async () => {
    const w = world({ updated: T0 - 30 * 60e3 }); w.S.runs.push({ wf: 'race-control-watchdog.yml', created: T0 - 25 * 60e3, status: 'waiting', event: 'push', stuck: true, id: 42 });
    const a = await w.tick(); assert.equal(a.action, 'cancelled'); assert.deepEqual(w.S.cancels, [42]); assert.equal(w.S.dispatches, 0);
    const c = w.S.calls.find(x => x.url.endsWith('/runs/42/cancel'));
    assert.equal(c.url, 'https://api.github.com/repos/iPoower/iPoower/actions/runs/42/cancel'); assert.equal(c.init.headers.authorization, 'Bearer ' + TOKEN);
    w.S.now += 60e3; const b = await w.tick(); assert.equal(b.action, 'dispatched'); assert.equal(w.S.dispatches, 1);
  });
  await test('run actif depuis moins de 20 min : jamais annulé (relais lent ou démarrage tardif)', async () => {
    const w = world({ updated: T0 - 30 * 60e3 }); w.S.runs.push({ wf: 'race-control.yml', created: T0 - 19 * 60e3, status: 'waiting', event: 'push', stuck: true });
    const r = await w.tick(); assert.equal(r.action, 'skipped'); assert.equal(w.S.cancels.length, 0);
  });
  await test('données fraîches : un run bloqué n’est pas touché (aucun appel GitHub)', async () => {
    const w = world({ updated: T0 - 2 * 60e3 }); w.S.runs.push({ wf: 'race-control-watchdog.yml', created: T0 - 90 * 60e3, status: 'waiting', stuck: true });
    await w.tick(); assert.equal(w.S.cancels.length, 0); assert(!w.S.calls.some(c => c.url.includes('api.github.com')));
  });
  await test('rejeu du 7 octobre : watchdog coincé juste après un relais → relais rétabli en moins de 25 min (au lieu de 1 h 36)', async () => {
    const w = world({ updated: T0 - 60e3 }); w.S.runs.push({ wf: 'race-control-watchdog.yml', created: T0, status: 'waiting', event: 'push', stuck: true });
    const out = await w.minutes(120), maxAge = Math.max(...out.map(o => o.age || 0));
    assert.equal(w.S.cancels.length, 1, 'une seule annulation'); assert(maxAge < 25, 'âge maximal ' + maxAge.toFixed(1) + ' min');
    assert(out.every(o => !o.error)); console.log('   ↳ incident rejoué : âge max ' + maxAge.toFixed(1) + ' min, ' + w.S.dispatches + ' dispatches en 2 h');
  });
  await test('annulation refusée par GitHub : erreur propre, sans secret, et aucun dispatch', async () => {
    const w = world({ updated: T0 - 30 * 60e3, cancelStatus: 403 }); w.S.runs.push({ wf: 'race-control-watchdog.yml', created: T0 - 40 * 60e3, status: 'waiting', stuck: true });
    await assert.rejects(w.tick(), e => /HTTP 403/.test(e.message) && !e.message.includes(TOKEN)); assert.equal(w.S.dispatches, 0);
    const o = JSON.parse(w.S.logs[w.S.logs.length - 1]); assert.equal(o.action, 'error'); assert.equal(o.status, 403);
  });

  // — pannes et sécurité
  await test('panne GitHub au dispatch (401/403/404/422/500) : erreur propre, sans secret', async () => {
    for (const status of [401, 403, 404, 422, 500]) {
      const w = world({ updated: T0 - 30 * 60e3, dispatchStatus: status });
      await assert.rejects(w.tick(), e => new RegExp('HTTP ' + status).test(e.message) && !e.message.includes(TOKEN));
    }
  });
  await test('liste des runs indisponible : erreur propre et AUCUN dispatch (pas de tempête à l’aveugle)', async () => {
    const w = world({ updated: T0 - 30 * 60e3, runsStatus: 503 });
    await assert.rejects(w.tick(), /HTTP 503/); assert.equal(w.S.dispatches, 0);
  });
  await test('secret GH_TOKEN absent : erreur explicite, aucun appel réseau', async () => {
    const calls = [], logs = []; await assert.rejects(W.tick({}, { fetchImpl: async u => { calls.push(u); }, now: T0, log: l => logs.push(l) }), /GH_TOKEN/); assert.equal(calls.length, 0);
    // vécu en production : secret placé dans les variables de build → l'exception seule ne disait rien dans Workers Logs
    assert.equal(logs.length, 1, 'une ligne de journal lisible'); const o = JSON.parse(logs[0]);
    assert.equal(o.action, 'error'); assert.match(o.reason, /GH_TOKEN absent/); assert.equal(o.decision, null);
  });
  await test('lecture d’obs.json sans jeton ni cache CDN', async () => {
    const w = world({ updated: T0 - 30 * 60e3 }); await w.tick();
    const read = w.S.calls.find(c => c.url.startsWith(W.OBS_URL));
    assert.equal(read.url, W.OBS_URL + '?t=' + T0); assert(!JSON.stringify(read.init).includes(TOKEN));
  });
  await test('journal : une ligne JSON par tick, sans jeton, URL, coordonnées ni contenu d’obs.json', async () => {
    const w = world({ updated: T0 - 9 * 60e3 }); await w.minutes(12);
    const w2 = world({ updated: T0 - 30 * 60e3, dispatchStatus: 403 }); await w2.minutes(1);
    const all = [...w.S.logs, ...w2.S.logs];
    assert(all.length >= 12, 'au moins un journal par tick');
    for (const l of all) {
      const o = JSON.parse(l);
      assert.deepEqual(Object.keys(o).filter(k => !['t', 'decision', 'age_min', 'action', 'reason', 'status'].includes(k)), [], l);
      assert(!l.includes(TOKEN) && !/https?:|49\.97|2\.69|LFAQ|morning|stations/.test(l), l);
    }
  });

  // — configuration de production
  await test('point d’entrée Cloudflare : worker.mjs n’exporte que default (workerd refuse les exports nommés non gestionnaires)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '../tools/relay-clock/worker.mjs'), 'utf8');
    assert(!/^export\s+(?!default\b)/m.test(src), 'export nommé interdit dans worker.mjs');
    assert.match(fs.readFileSync(path.join(__dirname, '../tools/relay-clock/wrangler.toml'), 'utf8'), /^main = "worker\.mjs"$/m);
  });
  await test('wrangler.toml : cron chaque minute, Workers Logs activés, aucun secret', async () => {
    const t = fs.readFileSync(path.join(__dirname, '../tools/relay-clock/wrangler.toml'), 'utf8');
    assert.match(t, /crons = \["\* \* \* \* \*"\]/); assert.match(t, /\[observability\][^[]*enabled = true/);
    assert(!/GH_TOKEN\s*=|ghp_|github_pat_/.test(t), 'aucun secret dans wrangler.toml');
  });
  await test('workflow : même seuil (8 min), source=horloge soumise au contrôle de fraîcheur, source visible dans le nom du run', async () => {
    const wf = fs.readFileSync(path.join(__dirname, '../.github/workflows/race-control.yml'), 'utf8');
    assert.match(wf, /age>=8/); assert.equal(W.DUE_MIN, 8);
    assert.match(wf, /github\.event\.inputs\.source != 'horloge'/);
    assert.match(wf, /^run-name: .*inputs\.source/m); assert.match(wf, /concurrency:\s*\n\s*group: race-control-relay/);
  });

  // — mesure de fraîcheur
  await test('heure de Paris : semaine et minute locale, été comme hiver', async () => {
    assert.deepEqual(parisMinute(Date.parse('2026-10-05T05:00:00Z')), { weekday: true, min: 7 * 60 });
    assert.deepEqual(parisMinute(Date.parse('2026-12-07T05:00:00Z')), { weekday: true, min: 6 * 60 });
    assert.equal(parisMinute(Date.parse('2026-10-04T05:00:00Z')).weekday, false);
  });
  await test('relais toutes les 10 min : matinée 100 % fraîche ; trou de 3 h détecté', async () => {
    const from = Date.parse('2026-10-05T00:00:00Z'), to = Date.parse('2026-10-05T10:00:00Z');
    const times = []; for (let t = from - 600e3; t < to; t += 600e3) times.push(t);
    const r = freshness(times, from, to); assert.equal(r.p50, 10); assert.equal(r.morningFresh, 1);
    const g = freshness([Date.parse('2026-10-05T03:00:00Z'), Date.parse('2026-10-05T06:00:00Z')], from, to);
    assert.equal(g.max, 180); assert(g.morningFresh < 0.2);
  });
  console.log(count + '/' + count + ' scénarios OK');
})().catch(e => { console.error('❌', e && e.stack || e); process.exit(1); });
