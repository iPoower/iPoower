'use strict';
// Étape « Publier uniquement les événements publics » du workflow DATEX exécutée telle quelle
// contre un dépôt Git local (aucun accès à GitHub ni à la production, jeton fictif).
// Refus serveur simulés comme ceux des runs du 04/11 et du 09/11 ; sleep remplacé par un relevé.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/road-datex.yml'), 'utf8');

function publishScript(text) {
  const step = text.split(/\n(?=      - )/).find(s => /name: Publier uniquement les événements publics/.test(s));
  assert(step, 'étape de publication présente');
  const lines = step.split('\n'), start = lines.findIndex(l => /^        run: \|\s*$/.test(l));
  assert(start > 0, 'bloc run présent');
  return lines.slice(start + 1).map(l => l.replace(/^ {10}/, '')).join('\n');
}

const git = (cwd, ...args) => cp.execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let n = 0;
function scenario(name, { reject = 0, change = true, extraFile = false, onFirstSleep = null, script = publishScript(workflow) }, check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'datex-publish-'));
  try {
    const remote = path.join(dir, 'remote.git'), seed = path.join(dir, 'seed'), pages = path.join(dir, 'pages'), bin = path.join(dir, 'bin');
    git(dir, 'init', '-q', '--bare', '-b', 'gh-pages', remote);
    git(dir, 'init', '-q', '-b', 'gh-pages', seed);
    git(seed, 'config', 'user.name', 'fictif'); git(seed, 'config', 'user.email', 'fictif@example.invalid');
    fs.mkdirSync(path.join(seed, 'race-control'));
    fs.writeFileSync(path.join(seed, 'race-control/road-datex.json'), '{"cursor":1}');
    fs.writeFileSync(path.join(seed, 'race-control/obs.json'), '{"relay":1}');
    git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'initial'); git(seed, 'remote', 'add', 'origin', remote); git(seed, 'push', '-q', 'origin', 'gh-pages');
    // Refus serveur : les `reject` premiers push sont rejetés comme sur GitHub le 09/11.
    const counter = path.join(dir, 'count');
    fs.writeFileSync(path.join(remote, 'hooks/pre-receive'), `#!/bin/sh\nc=$(cat "${counter}" 2>/dev/null || echo 0)\necho $((c + 1)) > "${counter}"\nif [ "$c" -lt ${reject} ]; then echo "fatal error in commit_refs_rules" >&2; exit 1; fi\nexit 0\n`, { mode: 0o755 });
    git(dir, 'clone', '-q', '-b', 'gh-pages', remote, pages);
    if (change) fs.writeFileSync(path.join(pages, 'race-control/road-datex.json'), '{"cursor":2}');
    if (extraFile) fs.writeFileSync(path.join(pages, 'race-control/obs.json'), '{"relay":"altéré"}');
    // `sleep` relevé (aucune attente réelle) ; au premier appel, un relais concurrent peut publier.
    fs.mkdirSync(bin); const sleeps = path.join(dir, 'sleeps');
    fs.writeFileSync(path.join(bin, 'sleep'), `#!/bin/sh\necho "$1" >> "${sleeps}"\n${onFirstSleep ? `[ "$(wc -l < "${sleeps}")" -eq 1 ] && (${onFirstSleep(seed)})\n` : ''}exit 0\n`, { mode: 0o755 });
    const run = cp.spawnSync('bash', ['-e', '-c', script], { cwd: pages, encoding: 'utf8',
      env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, GH_TOKEN: 'jeton-fictif', HOME: dir, GIT_TERMINAL_PROMPT: '0' } });
    const pauses = fs.existsSync(sleeps) ? fs.readFileSync(sleeps, 'utf8').trim().split('\n').map(Number) : [];
    const published = f => cp.execFileSync('git', ['show', 'gh-pages:race-control/' + f], { cwd: remote, encoding: 'utf8' }).trim();
    check({ status: run.status, out: run.stdout + run.stderr, pauses, published });
    n++; console.log('✅ ' + name);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const relayCommit = seed => `cd "${seed}" && git pull -q origin gh-pages && echo '{"relay":2}' > race-control/obs.json && git commit -qam relais && git push -q origin gh-pages`;
const newerDatex = seed => `cd "${seed}" && git pull -q origin gh-pages && echo '{"cursor":3}' > race-control/road-datex.json && git commit -qam datex-plus-recent && git push -q origin gh-pages`;

scenario('refus passager x2 : essais espacés 5 puis 10 s, publication réussie', { reject: 2 }, r => {
  assert.equal(r.status, 0, r.out); assert.deepEqual(r.pauses, [5, 10]); assert.equal(r.published('road-datex.json'), '{"cursor":2}');
});
scenario('refus persistant : 4 pauses (5, 10, 20, 40 s), échec visible, publication précédente intacte', { reject: 99 }, r => {
  assert.notEqual(r.status, 0); assert.deepEqual(r.pauses, [5, 10, 20, 40]);
  assert.match(r.out, /::error title=DATEX non publié::/); assert.equal(r.published('road-datex.json'), '{"cursor":1}');
});
scenario('relais concurrent pendant la pause : rebase, les deux publications conservées', { reject: 1, onFirstSleep: relayCommit }, r => {
  assert.equal(r.status, 0, r.out); assert.equal(r.published('road-datex.json'), '{"cursor":2}'); assert.equal(r.published('obs.json'), '{"relay":2}');
});
scenario('DATEX plus récent déjà publié : conflit, échec, jamais d’écrasement par l’exécution plus ancienne', { reject: 1, onFirstSleep: newerDatex }, r => {
  assert.notEqual(r.status, 0); assert.equal(r.published('road-datex.json'), '{"cursor":3}');
});
scenario('aucun changement : aucun commit ni push', { change: false }, r => {
  assert.equal(r.status, 0, r.out); assert.deepEqual(r.pauses, []); assert.equal(r.published('road-datex.json'), '{"cursor":1}');
});
scenario('autre fichier modifié localement : seul road-datex.json est publié, le flux météo reste intact', { extraFile: true }, r => {
  assert.equal(r.status, 0, r.out); assert.equal(r.published('road-datex.json'), '{"cursor":2}'); assert.equal(r.published('obs.json'), '{"relay":1}');
});
// Contre-épreuves : l'ancienne boucle (5 essais sans pause) et une boucle masquant l'échec sont détectées.
const old = publishScript(workflow).replace(/\n# Refus passagers[\s\S]*?exit 1\s*$/, '\nfor i in 1 2 3 4 5; do\n  git push -q && exit 0\n  git -c core.hooksPath=/dev/null pull -q --rebase || exit 1\ndone\nexit 1\n');
assert.notEqual(old, publishScript(workflow), 'contre-épreuve construite');
assert.throws(() => scenario('mutation sans pause', { reject: 2, script: old }, r => { assert.equal(r.status, 0, r.out); assert.deepEqual(r.pauses, [5, 10]); }));
const masked = publishScript(workflow).replace(/exit 1\s*$/, 'exit 0\n');
assert.throws(() => scenario('mutation faux succès', { reject: 99, script: masked }, r => { assert.notEqual(r.status, 0); }));
assert(!/continue-on-error/.test(workflow), 'aucun continue-on-error');
console.log(`${n}/6 scénarios de publication DATEX OK · 2 mutations rejetées`);
