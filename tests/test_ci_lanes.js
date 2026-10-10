// Contre-tests du runner : une omission, un doublon, une erreur ou des fixtures périmées ne peuvent produire du vert.
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { SUITE } = require('./ci/suites'), { select, shards } = require('./ci/plan'), { verdict } = require('./ci/verdict'), { verifyReports, verifyGates } = require('./ci/reports');
const { sourceHash, payload, validatePrepared, workspace } = require('./ci/workspace');
let n = 0; const check = (label, fn) => { fn(); n++; console.log('✅ ' + label); };
const historical = [["dayplan-countertests.js",false],["e2e17.js",false],["e2e18.js",false],["e2e24.js",false],["e2e25.js",false],["e2e26.js",false],["e2e27.js",false],["e2e28.js",false],["e2e29.js",false],["e2e30.js",false],["e2e31.js",false],["e2e32.js",false],["e2e33.js",false],["e2e34.js",false],["e2e35.js",false],["e2e36.js",false],["e2e37-sw.js",true],["e2e37.js",false],["e2e38-resume.js",false],["e2e39-layout.js",false],["e2e40-network.js",false],["e2e41-sw-coldstart.js",true],["e2e42-meteo.js",false],["e2e43-analyse.js",false],["e2e44-place.js",false],["e2e45-evidence.js",false],["e2e46-tyrelink.js",false],["e2e47-autorefresh.js",false],["e2e48-tripstart.js",false],["engine-countertests.js",false],["test_calendar_ids.js",false],["test_dayplan.js",false],["test_engine.js",false],["test_engine_verdicts.js",false],["test_evidence.js",false],["test_examples.js",false],["test_gps_requests.js",false],["test_placectx.js",false],["test_relay_clock.js",false],["test_settings_work.js",false],["test_tripcancel.js",false],["test_tyrelab.js",false],["test_tyrestate.js",false],["test_wardrobe.js",false],["test_weather_requests.js",false],["test_widget.js",false],["test_wxdesk.js",false]];
const hash = sourceHash(), copy = value => JSON.parse(JSON.stringify(value));
const roles = [{ lane: 'unit', browser: 'chromium', index: 1, total: 1 }, ...['chromium', 'webkit'].flatMap(browser => [1, 2, 3].map(index => ({ lane: 'browser', browser, index, total: 3 })))];
const reports = roles.map(role => ({ schema: 1, selection: 'full', sourceHash: hash, ...role, durationMs: 100, results: select(role).map(s => ({ file: s[0], ok: true, ms: 1 })) }));
check('toutes les suites historiques et leurs navigateurs restent dans le registre', () => { assert.equal(SUITE.length, 91); assert.equal(new Set(SUITE.map(s => s[0])).size, 91); assert.deepEqual(SUITE.filter(s => !['test_wear_consistency.js', 'e2e69-wear.js', 'test_calendar_origin.js', 'e2e68-calendar-origin.js', 'test_branch_protection.js', 'e2e67-controls-safety.js', 'e2e65-cockpit.js', 'test_no_plain_secrets.js', 'e2e64-security.js', 'test_session_vault.js', 'e2e63-generic-profile.js', 'test_profile_check.js', 'test_montagne.js', 'e2e62-montagne.js', 'e2e61-rain-signal.js', 'e2e60-lock.js', 'test_device_storage.js', 'e2e59-trip-tab.js', 'test_geosearch.js', 'e2e59-brief-gum.js', 'test_decision.js', 'e2e58-import-journal.js', 'test_backup.js', 'test_reliability.js', 'e2e57-place-compact.js', 'test_calib.js', 'test_debrief.js', 'debrief-countertests.js', 'e2e56-debrief.js', 'test_day_context.js', 'e2e55-day-context.js', 'test_app_source.js', 'test_ci_lanes.js', 'test_geolocation.js', 'e2e49-interactions.js', 'e2e50-geolocation.js', 'test_road_intelligence.js', 'test_road_providers.js', 'test_road_datex.js', 'e2e51-road.js', 'e2e52-road-sw.js', 'test_userctx.js', 'e2e53-global-context.js', 'e2e54-context-sw.js'].includes(s[0])).map(s => [s[0], s[3] === 'chromium']).sort((a, b) => a[0].localeCompare(b[0])), historical.slice().sort((a, b) => a[0].localeCompare(b[0]))); });
check('chaque E2E applicable appartient exactement à un shard', () => { for (const browser of ['chromium', 'webkit']) { const wanted = select({ lane: 'browser', browser }).map(s => s[0]).sort(), actual = shards(browser).flatMap(s => s.suites.map(t => t[0])).sort(); assert.deepEqual(actual, wanted); assert.equal(new Set(actual).size, actual.length); } });
check('la couverture complète converge vers le verdict', () => assert.equal(verifyReports(reports).count, 136));
check('shard manquant refusé', () => assert.throws(() => verifyReports(reports.slice(1)), /manquant/));
check('shard dupliqué refusé', () => assert.throws(() => verifyReports([...reports, reports[0]]), /dupliqué/));
check('suite absente refusée', () => { const r = copy(reports); r[1].results.pop(); assert.throws(() => verifyReports(r), /incomplète/); });
check('suite dupliquée refusée', () => { const r = copy(reports); r[1].results.push(r[1].results[0]); assert.throws(() => verifyReports(r), /dupliquée/); });
check('suite en erreur refusée', () => { const r = copy(reports); r[1].results[0].ok = false; assert.throws(() => verifyReports(r), /échec/); });
check('sélection ciblée exclue du verdict complet', () => { const r = copy(reports); r[1].selection = 'targeted'; assert.throws(() => verifyReports(r), /ciblée/); });
check('rapports issus de commits différents refusés', () => { const r = copy(reports); r[1].sourceHash = '0'.repeat(64); assert.throws(() => verifyReports(r), /différentes/); });
check('rapport cohérent mais périmé refusé', () => assert.throws(() => verifyReports(reports, 3, '0'.repeat(64)), /autre version/));
check('une erreur même avec code zéro reste bloquante', () => { for (const out of ['❌ scénario', 'Error: arrêt', 'TimeoutError: délai', '2/3 scénarios OK', 'errors ["x"]', 'erreurs JS : exception', 'réglages perdus 1']) assert.notEqual(verdict(0, out), null); assert.equal(verdict(0, '3/3 scénarios OK · erreurs JS : aucune'), null); assert.notEqual(verdict(1, ''), null); });
check('sélection et navigateur invalides refusés', () => { assert.throws(() => select({ browser: 'unknown' })); assert.throws(() => select({ lane: 'browser', index: 4, total: 3 })); assert.throws(() => select({ files: ['missing.js'] })); });
const needs = { version: { result: 'success' }, 'relay-smoke': { result: 'success' }, confidentialite: { result: 'skipped' }, unit: { result: 'success' }, tests: { result: 'success' }, 'tests-rollback': { result: 'skipped' } };
check('aucun saut inattendu autorisé en validation normale', () => { verifyGates(needs, false, false); const bad = copy(needs); bad.tests.result = 'skipped'; assert.throws(() => verifyGates(bad, false, false)); assert.throws(() => verifyGates(needs, false, true)); });
check('rollback ancien : contrôles historiques et sécurité requis', () => { const old = copy(needs); old.unit.result = old.tests.result = 'skipped'; old['tests-rollback'].result = old.confidentialite.result = 'success'; verifyGates(old, true, true); old['tests-rollback'].result = 'failure'; assert.throws(() => verifyGates(old, true, true)); });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-ci-isolation-')), prep = path.join(temp, 'prepared');
try {
  const names = ['w/site/index.html', 'w/site/sw.js', 'w/engine.js', 'w/demo.js', 'w/relay.js', 'w/widget.js', 'w/preset.json', 'out/cal.fake.json'];
  for (const f of names) { const p = path.join(prep, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'fixture CI fictive'); }
  const save = () => fs.writeFileSync(path.join(prep, 'meta.json'), JSON.stringify({ schema: 1, sourceHash: hash, files: payload(prep) })); save();
  check('workspaces séparés : mutation locale sans effet sur un autre shard', () => { const a = workspace('one', prep, temp), b = workspace('two', prep, temp); fs.writeFileSync(path.join(a.w, 'site/index.html'), 'modifié'); assert.equal(fs.readFileSync(path.join(b.w, 'site/index.html'), 'utf8'), 'fixture CI fictive'); assert.equal(fs.readFileSync(path.join(prep, 'w/site/index.html'), 'utf8'), 'fixture CI fictive'); });
  check('fixture corrompue refusée avant le lancement des tests', () => { fs.writeFileSync(path.join(prep, 'out/cal.fake.json'), 'corrompu'); assert.throws(() => validatePrepared(prep), /modifiées/); save(); });
  check('lien dans un artifact refusé', () => { fs.symlinkSync(path.join(prep, 'w/engine.js'), path.join(prep, 'w/linked.js')); assert.throws(() => validatePrepared(prep), /non régulière/); fs.unlinkSync(path.join(prep, 'w/linked.js')); });
  check('fixture d’une autre version refusée', () => { const meta = JSON.parse(fs.readFileSync(path.join(prep, 'meta.json'))); meta.sourceHash = '0'.repeat(64); fs.writeFileSync(path.join(prep, 'meta.json'), JSON.stringify(meta)); assert.throws(() => validatePrepared(prep), /autre version/); });
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
// Exécuter la vraie fin de l'étape de publication avec un Git fictif : aucun dépôt ni réseau.
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
const publishBlock = workflow.split('      - name: Publier sur gh-pages\n')[1].split('      - name: Étiquette de version')[0];
const publishScript = publishBlock.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
const publishTail = publishScript.slice(publishScript.indexOf('git config user.name'));
assert(publishScript.includes('git config user.name'), 'étape de publication introuvable');
const deployTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-deploy-push-'));
let caseNo = 0;
try {
  const bin = path.join(deployTemp, 'bin'); fs.mkdirSync(bin);
  const fakeGit = [
    "'use strict';",
    "const fs = require('node:fs');",
    "const stateFile = process.env.RC_DEPLOY_TEST_STATE, state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));",
    "const args = process.argv.slice(2); state.calls.push(args);",
    "const cmd = args[0]; if (cmd === 'push') state.pushes++;",
    "fs.writeFileSync(stateFile, JSON.stringify(state));",
    "process.exit(cmd === 'diff' ? (state.noChanges ? 0 : 1) : cmd === 'push' ? (state.pushes <= state.failPushes ? 1 : 0) : cmd === 'pull' && state.rebaseFail || cmd === 'commit' && state.commitFail ? 1 : 0);"
  ].join('\n');
  fs.writeFileSync(path.join(bin, 'git'), '#!' + process.execPath + '\n' + fakeGit + '\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  const runPublish = (options = {}) => {
    const dir = path.join(deployTemp, String(++caseNo)); fs.mkdirSync(dir);
    const stateFile = path.join(dir, 'state.json'), output = path.join(dir, 'output');
    fs.writeFileSync(stateFile, JSON.stringify({ calls: [], pushes: 0, failPushes: 0, ...options }));
    const run = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', publishTail], {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, MSG: 'publication fictive', GITHUB_OUTPUT: output, RC_DEPLOY_TEST_STATE: stateFile }
    });
    assert(!run.error, String(run.error));
    return { ...JSON.parse(fs.readFileSync(stateFile, 'utf8')), status: run.status, stdout: run.stdout, output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '' };
  };
  check('publication : succès réel du premier push autorise done=1', () => {
    const r = runPublish(); assert.equal(r.status, 0); assert.equal(r.pushes, 1); assert.equal(r.output, 'done=1\n');
  });
  check('publication : deux collisions puis succès, sans réécriture forcée', () => {
    const r = runPublish({ failPushes: 2 }); assert.equal(r.status, 0); assert.equal(r.pushes, 3);
    assert.equal(r.calls.filter(a => a[0] === 'pull').length, 2); assert.equal(r.output, 'done=1\n');
    assert(r.calls.filter(a => a[0] === 'pull').every(a => a.includes('--rebase')));
    assert(!r.calls.some(a => a.includes('--force') || a.includes('-f') || a[0] === 'reset'));
  });
  check('publication : le cinquième push peut encore réussir', () => {
    const r = runPublish({ failPushes: 4 }); assert.equal(r.status, 0); assert.equal(r.pushes, 5); assert.equal(r.output, 'done=1\n');
  });
  check('publication : cinq pushes refusés bloquent tout faux succès', () => {
    const r = runPublish({ failPushes: 5 }); assert.notEqual(r.status, 0); assert.equal(r.pushes, 5);
    assert(!r.output.includes('done=1'));
  });
  check('publication : échec du rebase conservé comme erreur', () => {
    const r = runPublish({ failPushes: 1, rebaseFail: true }); assert.notEqual(r.status, 0);
    assert.equal(r.pushes, 1); assert(!r.output.includes('done=1'));
  });
  check('publication : commit refusé, aucune tentative de push', () => {
    const r = runPublish({ commitFail: true }); assert.notEqual(r.status, 0); assert.equal(r.pushes, 0); assert(!r.output.includes('done=1'));
  });
  check('publication : contenu identique, aucun commit ni push', () => {
    const r = runPublish({ noChanges: true }); assert.equal(r.status, 0); assert.equal(r.pushes, 0); assert.equal(r.output, 'done=0\n');
    assert(!r.calls.some(a => a[0] === 'commit'));
  });
} finally { fs.rmSync(deployTemp, { recursive: true, force: true }); }

console.log(`${n}/${n} scénarios OK`);

