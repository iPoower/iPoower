// Le vrai script et le vrai interpréteur jq, face à une API gh fictive : aucune modification GitHub.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
const script = path.resolve(__dirname, '../tools/github/protect-branches.sh');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twrc-protection-test-'));
const mock = `#!/usr/bin/env node
const fs = require('node:fs'), { spawnSync } = require('node:child_process');
const args = process.argv.slice(2), file = process.env.TWRC_PROTECTION_TEST_STATE, state = JSON.parse(fs.readFileSync(file, 'utf8'));
if (args.shift() !== 'api') process.exit(2);
let method = 'GET'; if (args[0] === '-X') { args.shift(); method = args.shift(); }
const endpoint = args.shift(), jqAt = args.indexOf('--jq'), query = jqAt < 0 ? null : args[jqAt + 1];
state.calls.push({ method, endpoint }); let value;
const main = 'repos/example/test/branches/main/protection', pages = 'repos/example/test/rulesets';
if (endpoint === 'repos/example/test') value = { permissions: { admin: state.admin } };
else if (endpoint === main && method === 'PUT') {
  const body = JSON.parse(fs.readFileSync(0, 'utf8'));
  state.protection = { ...body, ...Object.fromEntries(['enforce_admins', 'allow_force_pushes', 'allow_deletions', 'required_linear_history', 'required_conversation_resolution'].map(k => [k, { enabled: body[k] }])) };
  value = state.protection;
} else if (endpoint === main) {
  value = structuredClone(state.protection);
  if (state.mode === 'missing-check') value.required_status_checks.contexts = ['unit', 'validation'];
  if (state.mode === 'open-conversation') value.required_conversation_resolution.enabled = false;
} else if ((endpoint === pages || endpoint === pages + '/123') && method !== 'GET') {
  if (state.mode === 'pages-api-failure') { fs.writeFileSync(file, JSON.stringify(state)); process.exit(1); }
  state.ruleset = { ...JSON.parse(fs.readFileSync(0, 'utf8')), id: 123 }; value = state.ruleset;
} else if (endpoint === pages) value = state.ruleset ? [{ id: 123, name: state.ruleset.name }] : [];
else if (endpoint === pages + '/123') {
  value = structuredClone(state.ruleset);
  if (state.mode === 'excluded-pages') value.conditions.ref_name.exclude = ['refs/heads/gh-pages'];
  if (state.mode === 'blocked-publish') value.rules.push({ type: 'pull_request' });
  if (state.mode === 'bypass') value.bypass_actors.push({ actor_id: 42 });
} else process.exit(2);
fs.writeFileSync(file, JSON.stringify(state));
if (query) { const out = spawnSync('jq', ['-r', query], { input: JSON.stringify(value), encoding: 'utf8' }); process.stdout.write(out.stdout || ''); process.stderr.write(out.stderr || ''); process.exit(out.status || 0); }
process.stdout.write(JSON.stringify(value) + '\\n');
`;
fs.writeFileSync(path.join(root, 'gh'), mock, { mode: 0o755 });
let n = 0;
function run(mode = '', previous = null, admin = true) {
  const file = path.join(root, 'state.json'); fs.writeFileSync(file, JSON.stringify(previous || { admin, mode, calls: [], ruleset: null }));
  const result = spawnSync('bash', [script, 'example/test'], { encoding: 'utf8', env: { ...process.env, PATH: root + path.delimiter + process.env.PATH, TWRC_PROTECTION_TEST_STATE: file } });
  return { ...result, state: JSON.parse(fs.readFileSync(file, 'utf8')) };
}
function test(name, fn) { fn(); n++; console.log('✅ ' + name); }
try {
  test('sans administration : refus avant toute écriture', () => {
    const r = run('', null, false); assert.notEqual(r.status, 0); assert.match(r.stderr, /accès administrateur/);
    assert(r.state.calls.every(x => x.method === 'GET')); assert.equal(r.state.protection, undefined);
  });
  test('configuration complète : main exige PR et trois checks ; Pages conserve ses écritures normales', () => {
    const r = run(); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.state.protection.required_status_checks, { strict: true, contexts: ['unit', 'validation', 'scan'] });
    assert.equal(r.state.protection.required_pull_request_reviews.required_approving_review_count, 0);
    assert.deepEqual(r.state.ruleset.rules.map(x => x.type).sort(), ['deletion', 'non_fast_forward']);
    assert.equal(r.state.ruleset.enforcement, 'active'); assert.match(r.stdout, /OK : main/);
    const next = run('', r.state); assert.equal(next.status, 0, next.stderr);
    assert.equal(next.state.calls.filter(x => x.method === 'POST').length, 1);
    assert.equal(next.state.calls.filter(x => x.endpoint.endsWith('/rulesets/123') && x.method === 'PUT').length, 1);
  });
  for (const mode of ['missing-check', 'open-conversation', 'excluded-pages', 'blocked-publish', 'bypass']) {
    test('lecture réellement active : configuration incorrecte refusée (' + mode + ')', () => {
      const r = run(mode); assert.notEqual(r.status, 0); assert.doesNotMatch(r.stdout, /OK : main/); assert.match(r.stderr, /insuffisamment protégée/);
    });
  }
  test('échec API Pages : aucun faux succès sur une activation partielle', () => {
    const r = run('pages-api-failure'); assert.notEqual(r.status, 0); assert.doesNotMatch(r.stdout, /OK : main/);
    assert(r.state.protection); assert.equal(r.state.ruleset, null);
  });
  console.log(n + '/' + n + ' scénarios OK');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
