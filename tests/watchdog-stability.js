#!/usr/bin/env node
// Réseau, tokens, secrets, observations et publications entièrement fictifs.
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { approvedRun, check, recheckApproved, runCli } = require('../tools/relay-trust');
const { copy, due } = require('../tools/relay-data');
global.fetch = () => { throw new Error('Réseau réel interdit dans cette suite'); };
const SHA = 'a'.repeat(40), OTHER = 'b'.repeat(40), REPO = 'example/race-control';
const ENV = { GITHUB_SHA: SHA, GITHUB_REPOSITORY: REPO, GITHUB_REF: 'refs/heads/main', GH_TOKEN: 'TOKEN_FICTIF' };
const GREEN = { id: 100, head_sha: SHA, head_branch: 'main', event: 'push', path: '.github/workflows/ci.yml',
  head_repository: { full_name: REPO }, status: 'completed', conclusion: 'success' };
const ref = sha => ({ ref: 'refs/heads/main', object: { type: 'commit', sha } });
const runs = list => ({ total_count: list.length, workflow_runs: list });
function api(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer TOKEN_FICTIF');
    assert(options.signal instanceof AbortSignal, 'chaque appel a un délai borné');
    assert(url.startsWith(`https://api.github.com/repos/${REPO}/`));
    assert(responses.length, 'aucun polling ni appel caché');
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (response.http) return { ok: false, status: response.http };
    return { ok: true, json: async () => {
      if (response.badJson) throw new SyntaxError('ERREUR_PRIVEE ' + ENV.GH_TOKEN);
      return response;
    } };
  };
  return { calls, fetchImpl };
}
async function gate(list, tail = SHA) {
  const transport = api([ref(SHA), runs(list), ref(tail)]);
  return { result: await check({ env: ENV, fetchImpl: transport.fetchImpl }), calls: transport.calls };
}
for (const status of ['queued', 'in_progress', 'requested', 'waiting', 'pending']) {
  test(`CI ${status} : pending, sans SHA autorisé ni accès sensible`, async () => {
    const { result, calls } = await gate([{ ...GREEN, status, conclusion: null }]);
    assert.equal(result.state, 'pending'); assert.equal(result.sha, undefined); assert.equal(calls.length, 2);
    assert.equal(approvedRun([result.run], SHA, REPO), null);
  });
}
test('CI complète réussie : approved sur le SHA exact, main vérifié avant et après', async () => {
  const { result, calls } = await gate([GREEN]);
  assert.equal(result.state, 'approved'); assert.equal(result.sha, SHA); assert.equal(result.run.id, GREEN.id);
  assert.equal(calls.length, 3); assert.equal(calls[0], calls[2]);
  assert(calls[1].includes(`head_sha=${SHA}&event=push&per_page=30`));
});
for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', null]) {
  test(`CI terminée ${conclusion} : rejet explicite, jamais de secrets`, async () => {
    const { result } = await gate([{ ...GREEN, conclusion }]);
    assert.equal(result.state, 'rejected'); assert.equal(result.sha, undefined);
    assert.equal(result.reason, conclusion === 'cancelled' ? 'ci_cancelled' : 'ci_failed');
  });
}
test('CI absente : unavailable, aucune autorisation implicite', async () => {
  const { result } = await gate([]);
  assert.deepEqual(result, { state: 'unavailable', reason: 'ci_missing' });
});
test('SHA différent, PR, fork, autre branche/workflow ou dispatch : aucun succès transférable', async () => {
  for (const change of [{ head_sha: OTHER }, { head_branch: 'feature' }, { event: 'pull_request' },
    { event: 'workflow_dispatch' }, { path: '.github/workflows/other.yml' }, { head_repository: { full_name: 'attacker/fork' } }]) {
    const { result } = await gate([{ ...GREEN, ...change }]);
    assert.equal(result.state, 'unavailable'); assert.equal(result.sha, undefined);
  }
});
test('un ancien vert ne masque jamais un run exact plus récent rouge, annulé ou en cours', async () => {
  for (const newer of [{ conclusion: 'failure' }, { conclusion: 'cancelled' }, { status: 'in_progress', conclusion: null }]) {
    const { result } = await gate([{ ...GREEN, id: 101, ...newer }, GREEN].reverse());
    assert.notEqual(result.state, 'approved'); assert.equal(result.sha, undefined);
  }
});
test('main a déjà avancé : refus avant même de lire la CI de l’ancien SHA', async () => {
  const transport = api([ref(OTHER)]);
  const result = await check({ env: ENV, fetchImpl: transport.fetchImpl });
  assert.deepEqual(result, { state: 'rejected', reason: 'sha_changed' }); assert.equal(transport.calls.length, 1);
});
test('nouveau commit pendant la lecture de la CI : aucun output approved', async () => {
  const { result } = await gate([GREEN], OTHER);
  assert.deepEqual(result, { state: 'rejected', reason: 'sha_changed' });
});
test('API temporairement indisponible à chaque phase : refus fermé puis reprise sûre', async () => {
  for (const failure of [{ http: 403 }, { http: 429 }, { http: 503 }, new Error('ERREUR_PRIVEE TOKEN_FICTIF'), { badJson: true }]) {
    for (const before of [[], [ref(SHA)], [ref(SHA), runs([GREEN])]]) {
      const transport = api([...before, failure]);
      const result = await check({ env: ENV, fetchImpl: transport.fetchImpl });
      assert.equal(result.state, 'unavailable'); assert.equal(result.sha, undefined);
    }
  }
  assert.equal((await gate([GREEN])).result.state, 'approved');
});
test('réponses malformées, tronquées ou statuts inconnus : aucune approbation', async () => {
  for (const payload of [null, {}, { total_count: 0 }, { total_count: 31, workflow_runs: [GREEN] },
    { total_count: 2, workflow_runs: [GREEN] }, { total_count: 1, workflow_runs: [null] },
    runs([{ ...GREEN, id: '100' }]), runs([{ ...GREEN, status: 'unknown' }]),
    runs([{ ...GREEN, status: 'in_progress', conclusion: 'success' }]),
    runs([{ ...GREEN, head_repository: { full_name: 5 } }])]) {
    const transport = api([ref(SHA), payload]);
    const result = await check({ env: ENV, fetchImpl: transport.fetchImpl });
    assert.notEqual(result.state, 'approved'); assert.equal(result.sha, undefined);
  }
  for (const payload of [{ ref: 'refs/heads/feature', object: { type: 'commit', sha: SHA } }, ref('bad-sha'),
    { ref: 'refs/heads/main', object: { type: 'tag', sha: SHA } }]) {
    const result = await check({ env: ENV, fetchImpl: api([payload]).fetchImpl });
    assert.equal(result.state, 'unavailable');
  }
});
test('contexte invalide ou branche non main : refus sans aucun appel API', async () => {
  for (const changes of [{ GITHUB_REF: 'refs/heads/feature' }, { GITHUB_SHA: OTHER + '\n' },
    { GITHUB_SHA: 'short' }, { GITHUB_REPOSITORY: 'example/race-control/injected' }, { GH_TOKEN: '' }]) {
    const transport = api([]);
    assert.equal((await check({ env: { ...ENV, ...changes }, fetchImpl: transport.fetchImpl })).state, 'rejected');
    assert.equal(transport.calls.length, 0);
  }
});
test('CLI : pending est différé uniquement sur opt-in ; refus et indisponibilité restent rouges', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-watchdog-cli-'));
  try {
    for (const [list, expected, state] of [[[{ ...GREEN, status: 'in_progress', conclusion: null }], 0, 'pending'],
      [[GREEN], 0, 'approved'], [[{ ...GREEN, conclusion: 'failure' }], 1, 'rejected'],
      [[{ ...GREEN, conclusion: 'cancelled' }], 1, 'rejected'], [[], 1, 'unavailable']]) {
      const output = path.join(dir, 'output'), summary = path.join(dir, 'summary'), logs = [];
      fs.writeFileSync(output, ''); fs.writeFileSync(summary, '');
      const code = await runCli({ argv: ['--defer-pending'], env: { ...ENV, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
        fetchImpl: api([ref(SHA), runs(list), ref(SHA)]).fetchImpl, log: s => logs.push(s) });
      assert.equal(code, expected); assert.equal(fs.readFileSync(output, 'utf8'), `state=${state}\nsha=${state === 'approved' ? SHA : ''}\n`);
      assert(fs.readFileSync(summary, 'utf8').includes(`**${state}**`));
      if (state === 'pending') { assert(logs[0].startsWith('::notice')); assert(!logs[0].includes('::error')); }
      if (code === 1) assert(logs[0].startsWith('::error'));
    }
    const list = [{ ...GREEN, status: 'queued', conclusion: null }];
    assert.equal(await runCli({ argv: [], env: ENV, fetchImpl: api([ref(SHA), runs(list)]).fetchImpl, log: () => {} }), 1, 'mode historique strict conservé');
    const transport = api([]);
    assert.equal(await runCli({ argv: ['--unsafe'], env: ENV, fetchImpl: transport.fetchImpl, log: () => {} }), 1);
    assert.equal(transport.calls.length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('aucun secret applicatif lu ni détail privé affiché, même en erreur API', async () => {
  let secretReads = 0;
  const env = new Proxy(ENV, { get(target, key) {
    if (['APP_KEY', 'RC_KEY', 'GCAL_ICS'].includes(key)) { secretReads++; throw new Error('Secret lu avant autorisation'); }
    return target[key];
  } });
  for (const responses of [[ref(SHA), runs([{ ...GREEN, status: 'in_progress', conclusion: null }])],
    [ref(SHA), runs([GREEN]), ref(SHA)], [ref(SHA), runs([])], [ref(SHA), runs([{ ...GREEN, conclusion: 'failure' }])],
    [new Error('ERREUR_PRIVEE TOKEN_FICTIF')], [ref(OTHER)]]) {
    const logs = [];
    await runCli({ argv: ['--defer-pending'], env, fetchImpl: api(responses).fetchImpl, log: s => logs.push(s) });
    assert(!logs.join('\n').includes('TOKEN_FICTIF')); assert(!logs.join('\n').includes('ERREUR_PRIVEE'));
  }
  assert.equal(secretReads, 0);
});
test('dernier contrôle avant secrets : main et CI revalidés, SHA préalable obligatoire', async () => {
  assert.deepEqual(await recheckApproved({ env: { ...ENV, RELAY_APPROVED_SHA: SHA }, fetchImpl: api([ref(SHA), runs([GREEN]), ref(SHA)]).fetchImpl }), { ok: true });
  for (const sha of [OTHER, undefined, 'main']) {
    const transport = api([]);
    assert.deepEqual(await recheckApproved({ env: { ...ENV, RELAY_APPROVED_SHA: sha }, fetchImpl: transport.fetchImpl }), { ok: false, reason: 'invalid_context' });
    assert.equal(transport.calls.length, 0);
  }
  for (const response of [ref(OTHER), { http: 503 }]) {
    assert.equal((await recheckApproved({ env: { ...ENV, RELAY_APPROVED_SHA: SHA }, fetchImpl: api([response]).fetchImpl })).ok, false);
  }
});
test('relance CI entre les deux barrières : pending/rouge/annulation bloque même avec un SHA précédemment autorisé', async () => {
  for (const newer of [{ status: 'in_progress', conclusion: null }, { conclusion: 'failure' }, { conclusion: 'cancelled' }]) {
    const transport = api([ref(SHA), runs([GREEN, { ...GREEN, id: 101, ...newer }])]);
    const result = await recheckApproved({ env: { ...ENV, RELAY_APPROVED_SHA: SHA }, fetchImpl: transport.fetchImpl });
    assert.equal(result.ok, false);
  }
  const transport = api([ref(SHA), runs([GREEN]), ref(OTHER)]);
  assert.equal((await recheckApproved({ env: { ...ENV, RELAY_APPROVED_SHA: SHA }, fetchImpl: transport.fetchImpl })).ok, false);
});
test('le contrôle final ne produit jamais une nouvelle autorisation CI ; pending y reste un échec', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-watchdog-recheck-'));
  try {
    const output = path.join(dir, 'output'); fs.writeFileSync(output, '');
    const code = await runCli({ argv: ['--recheck-approved'], env: { ...ENV, RELAY_APPROVED_SHA: SHA, GITHUB_OUTPUT: output },
      fetchImpl: api([ref(SHA), runs([GREEN]), ref(SHA)]).fetchImpl, log: () => {} });
    assert.equal(code, 0); assert.equal(fs.readFileSync(output, 'utf8'), '');
    const pending = [{ ...GREEN, status: 'in_progress', conclusion: null }];
    assert.equal(await runCli({ argv: ['--recheck-approved'], env: { ...ENV, RELAY_APPROVED_SHA: SHA, GITHUB_OUTPUT: output },
      fetchImpl: api([ref(SHA), runs(pending)]).fetchImpl, log: () => {} }), 1);
    assert.equal(fs.readFileSync(output, 'utf8'), '');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
function job(source, name) {
  const match = source.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`, 'm'));
  assert(match, `job ${name} présent`); return match[1];
}
function workflowBoundary(source, name) {
  const approval = job(source, 'approved'), privileged = job(source, name);
  assert.match(source, /^concurrency:\n  group: race-control-relay\n  cancel-in-progress: false$/m);
  assert(!/workflow_run:|pull_request_target:|pull_request:/.test(source), 'aucun nouveau déclencheur privilégié');
  assert(!source.includes('continue-on-error:'), 'une erreur de contrôle bloque toutes les étapes suivantes');
  assert.match(approval, /permissions:\n      contents: read\n      actions: read/);
  assert(!/secrets\.|environment:|contents: write/.test(approval), 'job initial sans secrets ni écriture');
  assert.match(approval, /id: trust/); assert.match(approval, /run: node tools\/relay-trust.js --defer-pending/);
  assert.match(approval, /state: \$\{\{ steps.trust.outputs.state \}\}/);
  assert.match(approval, /sha: \$\{\{ steps.trust.outputs.sha \}\}/);
  assert.match(privileged, /^    needs: approved$/m);
  const condition = privileged.match(/^    if: (.+)$/m)?.[1];
  assert.equal(condition, "github.ref == 'refs/heads/main' && needs.approved.outputs.state == 'approved'");
  assert.match(privileged, /ref: \$\{\{ needs.approved.outputs.sha \}\}\n          path: trusted\n          persist-credentials: false/);
  assert.match(privileged, /permissions:\n      contents: write\n      actions: read\n    steps:/, 'seule la lecture Actions est ajoutée pour revalider la CI');
  const steps = privileged.split(/(?=^      - )/m).slice(1);
  const secretSteps = steps.filter(step => /secrets\./.test(step));
  assert.equal(secretSteps.length, 1); const sensitive = secretSteps[0];
  assert.match(sensitive, /if: steps.fresh.outputs.due == '1'/);
  assert.match(sensitive, /run: node trusted\/src\/relay.js/);
  assert.deepEqual([...sensitive.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1]).sort(), ['APP_KEY', 'GCAL_ICS', 'RC_KEY']);
  const secretIndex = steps.indexOf(sensitive), recheck = steps[secretIndex - 1];
  assert.match(recheck, /run: node trusted\/tools\/relay-trust.js --recheck-approved/);
  assert.match(recheck, /RELAY_APPROVED_SHA: \$\{\{ needs.approved.outputs.sha \}\}/);
  assert.match(recheck, /if: steps.fresh.outputs.due == '1'/);
  assert(!/always\(|failure\(|cancelled\(/.test(privileged));
  assert(!/secrets\./.test(source.slice(0, source.indexOf('jobs:'))));
  return { condition, source };
}
const workflows = ['race-control-watchdog.yml', 'race-control.yml'].map((file, i) => ({
  file, name: i === 0 ? 'watchdog' : 'relay', source: fs.readFileSync(path.join(__dirname, '../.github/workflows', file), 'utf8')
}));
test('graphes réels : aucun job sensible hors approved ; SHA immuable, main recontrôlé, secrets bornés', () => {
  for (const { source, name } of workflows) {
    const boundary = workflowBoundary(source, name);
    for (const state of ['pending', 'approved', 'rejected', 'unavailable', '', undefined]) {
      for (const refName of ['refs/heads/main', 'refs/heads/feature']) {
        const allowed = vm.runInNewContext(boundary.condition, { github: { ref: refName }, needs: { approved: { outputs: { state } } } });
        assert.equal(allowed, state === 'approved' && refName === 'refs/heads/main');
      }
    }
  }
});
test('contre-tests des graphes : un retour aux conditions trop larges, secrets précoces ou doublons échoue', () => {
  for (const { source, name } of workflows) {
    for (const mutation of [source.replace(" && needs.approved.outputs.state == 'approved'", ''),
      source.replace('needs: approved', 'needs: []'), source.replace('needs.approved.outputs.sha', 'github.sha'),
      source.replace('run: node trusted/tools/relay-trust.js --recheck-approved', 'run: echo bypass'),
      source.replace('group: race-control-relay', 'group: separate-watchdog'),
      source.replace('cancel-in-progress: false', 'cancel-in-progress: true'),
      source.replace('    steps:', '    env:\n      APP_KEY: ${{ secrets.APP_KEY }}\n    steps:'),
      source.replace('        id: trust', '        continue-on-error: true\n        id: trust')]) {
      assert.throws(() => workflowBoundary(mutation, name));
    }
  }
});
test('reprise différée et déclenchements simultanés : modèle de la file partagée, une seule publication', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-watchdog-queue-'));
  try {
    const pages = path.join(dir, 'pages'), data = path.join(dir, 'data'); fs.mkdirSync(pages); fs.mkdirSync(data);
    const now = Date.parse('2026-10-13T06:20:00Z');
    fs.writeFileSync(path.join(pages, 'obs.json'), JSON.stringify({ updated: '2026-10-13T05:30:00Z', morning: { sent: 1 } }));
    const calendar = '{"sealed":"CALENDRIER_FICTIF_CONSERVE"}'; fs.writeFileSync(path.join(pages, 'calendar.sealed.json'), calendar);
    const initial = fs.readFileSync(path.join(pages, 'obs.json'));
    let publications = 0, secretReads = 0, active = 0, maximumActive = 0, queue = Promise.resolve();
    async function invocation(workflow, ciRuns) {
      active++; maximumActive = Math.max(maximumActive, active);
      try {
        const boundary = workflowBoundary(workflow.source, workflow.name);
        const result = (await gate(ciRuns)).result;
        if (!vm.runInNewContext(boundary.condition, { github: { ref: ENV.GITHUB_REF }, needs: { approved: { outputs: result } } })) return;
        copy(pages, data);
        const threshold = Number(workflow.source.match(/due relay-data (\d+)/)?.[1]);
        if (!due(data, threshold, false, now)) return;
        assert((await recheckApproved({ env: { ...ENV, RELAY_APPROVED_SHA: result.sha }, fetchImpl: api([ref(SHA), runs([GREEN]), ref(SHA)]).fetchImpl })).ok);
        secretReads++;
        const observation = JSON.parse(fs.readFileSync(path.join(data, 'obs.json'))); observation.updated = new Date(now).toISOString();
        fs.writeFileSync(path.join(data, 'obs.json'), JSON.stringify(observation));
        copy(data, pages, true); publications++;
      } finally { active--; }
    }
    const serialized = (workflow, ciRuns) => { const run = queue.then(() => invocation(workflow, ciRuns)); queue = run.catch(() => {}); return run; };
    await Promise.all(workflows.map(workflow => serialized(workflow, [{ ...GREEN, status: 'in_progress', conclusion: null }])));
    assert.equal(publications, 0); assert.equal(secretReads, 0); assert(fs.readFileSync(path.join(pages, 'obs.json')).equals(initial));
    await Promise.all([...workflows, workflows[0]].map(workflow => serialized(workflow, [GREEN])));
    assert.equal(maximumActive, 1); assert.equal(publications, 1); assert.equal(secretReads, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(pages, 'obs.json'))).morning.sent, 1);
    assert.equal(fs.readFileSync(path.join(pages, 'calendar.sealed.json'), 'utf8'), calendar);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('la CI existante exécute réellement cette suite dans relay-smoke, sans changer les gates', () => {
  const ci = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
  assert.match(job(ci, 'relay-smoke'), /run: node --test tests\/watchdog-stability.js/);
  assert.match(job(ci, 'validation'), /needs: \[version, unit, tests, tests-rollback, relay-smoke, confidentialite\]/);
  assert.match(job(ci, 'deploy'), /needs\.relay-smoke\.result == 'success'/);
});
