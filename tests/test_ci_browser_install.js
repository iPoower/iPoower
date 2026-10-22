'use strict';
// Le vrai script d'installation, face à un npx et un apt-get fictifs : l'incident du 22/10 rejoué
// (essai 1 tué par timeout, apt-get orphelin qui garde le verrou, essais suivants refusés).
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..'), script = path.join(ROOT, 'tools/ci-browser-install.sh');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'twrc-browser-install-')), bin = path.join(dir, 'bin'), state = path.join(dir, 'state');
fs.mkdirSync(bin); fs.mkdirSync(state);
// apt-get fictif (#!/bin/bash direct : via env, le processus s’appellerait « bash ») : un processus nommé apt-get qui « télécharge » quelques secondes, comme l'orphelin réel.
fs.writeFileSync(path.join(bin, 'apt-get'), '#!/bin/bash\necho $$ > "$STATE/apt.pid"\nsleep "${APT_S:-3}"\n', { mode: 0o755 });
// npx fictif : premier appel bloqué (lance apt-get hors de son groupe, comme sudo, puis attend, tué par timeout) ; ensuite, verrou pris → code 100.
fs.writeFileSync(path.join(bin, 'npx'), `#!/usr/bin/env bash
n=$(( $(cat "$STATE/count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STATE/count"; echo "$*" >> "$STATE/args"
if [ "$MODE" = stuck ] && [ "$n" = 1 ]; then setsid apt-get >/dev/null 2>&1 & exec sleep 30 >/dev/null 2>&1; fi
if pgrep -x -r R,S,D,T apt-get >/dev/null; then echo "E: Could not get lock /var/lib/dpkg/lock-frontend" >&2; exit 100; fi
exit 0
`, { mode: 0o755 });
const run = (browser, env = {}) => {
  for (const f of fs.readdirSync(state)) fs.rmSync(path.join(state, f));
  const r = spawnSync('bash', [script, browser], { encoding: 'utf8', timeout: 60000,
    env: { PATH: bin + ':' + process.env.PATH, STATE: state, CI_INSTALL_ATTEMPT_S: '1', CI_INSTALL_POLL_S: '1', CI_INSTALL_PAUSE_S: '0', ...env } });
  const read = f => { try { return fs.readFileSync(path.join(state, f), 'utf8'); } catch { return ''; } };
  return { status: r.status, out: r.stdout + r.stderr, calls: +read('count') || 0, args: read('args').trim().split('\n').filter(Boolean), pid: +read('apt.pid') || 0 };
};
const settle = pid => { if (pid) try { process.kill(pid); } catch {} spawnSync('sleep', ['0.3']); };
let n = 0; const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
try {
  check('installation directe : un seul appel, navigateur et dépendances demandés', () => {
    const r = run('webkit', { MODE: 'ok' });
    assert.equal(r.status, 0, r.out); assert.equal(r.calls, 1); assert.deepEqual(r.args, ['playwright install --with-deps webkit']);
  });
  check('apt-get orphelin après timeout : verrou attendu, essai 2 réussi (incident du 22/10)', () => {
    const r = run('webkit', { MODE: 'stuck', APT_S: '3', CI_INSTALL_LOCK_WAIT_S: '20' });
    settle(r.pid);
    assert.equal(r.status, 0, r.out); assert.equal(r.calls, 2, r.out);
    assert.match(r.out, /essai 1\/3/); assert.doesNotMatch(r.out, /Could not get lock/);
  });
  check('contre-test : sans attente du verrou, les essais 2 et 3 échouent en quelques secondes', () => {
    const r = run('chromium', { MODE: 'stuck', APT_S: '8', CI_INSTALL_LOCK_WAIT_S: '0' });
    settle(r.pid);
    assert.equal(r.status, 1, r.out); assert.equal(r.calls, 3);
    assert.equal((r.out.match(/Could not get lock/g) || []).length, 2); assert.match(r.out, /installation impossible après 3 essais/);
  });
  check('attente bornée : apt-get toujours actif signalé, échec explicite sans boucle infinie', () => {
    const r = run('webkit', { MODE: 'stuck', APT_S: '10', CI_INSTALL_LOCK_WAIT_S: '1' });
    settle(r.pid);
    assert.equal(r.status, 1, r.out); assert.equal(r.calls, 3); assert.match(r.out, /apt toujours actif après 1 s/);
  });
  check('navigateur inconnu ou injecté : refusé avant tout appel', () => {
    for (const b of ['', 'firefox', 'webkit; rm -rf /', '--with-deps']) {
      const r = run(b, { MODE: 'ok' });
      assert.equal(r.status, 2, b); assert.equal(r.calls, 0, b);
    }
  });
  check('CI, QA Weather Watch et profilage passent tous par ce script', () => {
    for (const f of ['ci.yml', 'weather-watch-qa.yml', 'performance.yml']) {
      const wf = fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8');
      assert(!/playwright install/.test(wf), f + ' : installation directe restante');
      assert(wf.includes('bash tools/ci-browser-install.sh ${{ matrix.browser }}'), f);
    }
    const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    assert.equal((ci.match(/bash tools\/ci-browser-install\.sh/g) || []).length, 2, 'tests et tests-rollback');
  });
  check('les délais des étapes et jobs couvrent les essais, les attentes et les tests', () => {
    const scriptText = fs.readFileSync(script, 'utf8');
    const seconds = name => Number(scriptText.match(new RegExp(name + ':-(\\d+)\\}'))[1]);
    const budget = 3 * seconds('CI_INSTALL_ATTEMPT_S') + 2 * seconds('CI_INSTALL_LOCK_WAIT_S') + 3 * seconds('CI_INSTALL_PAUSE_S');
    for (const [f, jobs] of [['ci.yml', ['tests', 'tests-rollback']], ['weather-watch-qa.yml', ['station-browser']], ['performance.yml', ['profile']]]) {
      const wf = fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8');
      for (const job of jobs) {
        const start = wf.indexOf('  ' + job + ':\n'); assert(start >= 0, f + ': ' + job);
        const rest = wf.slice(start + job.length + 4), next = rest.search(/^  [\w-]+:\s*$/m);
        const block = next < 0 ? rest : rest.slice(0, next);
        const nav = block.indexOf('      - name: Navigateur'); assert(nav >= 0, f + ': navigateur');
        const end = block.indexOf('\n      - ', nav + 1), step = end < 0 ? block.slice(nav) : block.slice(nav, end);
        const stepMinutes = Number(step.match(/timeout-minutes: (\d+)/)[1]);
        const jobMinutes = Number(block.match(/^    timeout-minutes: (\d+)/m)[1]);
        assert(stepMinutes * 60 >= budget, f + ': étape trop courte pour ' + budget + ' s');
        assert(jobMinutes >= stepMinutes + 5, f + ': aucune marge pour les tests');
      }
    }
  });
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log(n + '/' + n + ' scénarios OK · installation du navigateur CI, npx et apt-get fictifs');
