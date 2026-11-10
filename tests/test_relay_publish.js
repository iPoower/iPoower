'use strict';
// Étape « Publier seulement les sorties JSON » du relais météo et de son watchdog, exécutée telle quelle
// (frontière tools/relay-data.js comprise) contre un dépôt Git local : aucun accès à GitHub ni à la
// production, jeton fictif, données fictives. Refus serveur simulés ; sleep remplacé par un relevé.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const WORKFLOWS = [['race-control.yml', 'relais météo'], ['race-control-watchdog.yml', 'watchdog']];
const read = file => fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8');

function publishScript(text) {
  const step = text.split(/\n(?=      - )/).find(s => /name: Publier seulement les sorties JSON/.test(s));
  assert(step, 'étape de publication présente');
  const lines = step.split('\n'), start = lines.findIndex(l => /^        run: \|\s*$/.test(l));
  assert(start > 0, 'bloc run présent');
  return lines.slice(start + 1).map(l => l.replace(/^ {10}/, '')).join('\n');
}

const git = (cwd, ...args) => cp.execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const OBS1 = '{"updated":"2026-01-01T00:00:00Z","n":1}', OBS2 = '{"updated":"2026-01-01T00:10:00Z","n":2}';
let n = 0;
function scenario(name, script, { reject = 0, obs = OBS2, calendar = null, alterDatex = false, onFirstSleep = null }, check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-publish-'));
  try {
    const remote = path.join(dir, 'remote.git'), seed = path.join(dir, 'seed'), work = path.join(dir, 'work'), pages = path.join(work, 'pages'), bin = path.join(dir, 'bin');
    git(dir, 'init', '-q', '--bare', '-b', 'gh-pages', remote);
    git(dir, 'init', '-q', '-b', 'gh-pages', seed);
    git(seed, 'config', 'user.name', 'fictif'); git(seed, 'config', 'user.email', 'fictif@example.invalid');
    fs.mkdirSync(path.join(seed, 'race-control'));
    fs.writeFileSync(path.join(seed, 'race-control/obs.json'), OBS1);
    fs.writeFileSync(path.join(seed, 'race-control/road-datex.json'), '{"cursor":1}');
    git(seed, 'add', '.'); git(seed, 'commit', '-q', '-m', 'initial'); git(seed, 'remote', 'add', 'origin', remote); git(seed, 'push', '-q', 'origin', 'gh-pages');
    // Refus serveur : les `reject` premiers push sont rejetés, comme GitHub l'a fait sur DATEX le 09/11.
    const counter = path.join(dir, 'count');
    fs.writeFileSync(path.join(remote, 'hooks/pre-receive'), `#!/bin/sh\nc=$(cat "${counter}" 2>/dev/null || echo 0)\necho $((c + 1)) > "${counter}"\nif [ "$c" -lt ${reject} ]; then echo "fatal error in commit_refs_rules" >&2; exit 1; fi\nexit 0\n`, { mode: 0o755 });
    // Disposition du runner : trusted/ (source approuvée), relay-data/ (sorties du relais), pages/ (gh-pages).
    fs.mkdirSync(path.join(work, 'trusted/tools'), { recursive: true }); fs.mkdirSync(path.join(work, 'relay-data'));
    fs.copyFileSync(path.join(root, 'tools/relay-data.js'), path.join(work, 'trusted/tools/relay-data.js'));
    if (obs) fs.writeFileSync(path.join(work, 'relay-data/obs.json'), obs);
    if (calendar) fs.writeFileSync(path.join(work, 'relay-data/calendar.sealed.json'), calendar);
    git(dir, 'clone', '-q', '-b', 'gh-pages', remote, pages);
    if (alterDatex) fs.writeFileSync(path.join(pages, 'race-control/road-datex.json'), '{"cursor":"altéré"}');
    const before = git(remote, 'rev-parse', 'gh-pages');
    // `sleep` relevé (aucune attente réelle) ; au premier appel, un autre workflow peut publier.
    fs.mkdirSync(bin); const sleeps = path.join(dir, 'sleeps');
    fs.writeFileSync(path.join(bin, 'sleep'), `#!/bin/sh\necho "$1" >> "${sleeps}"\n${onFirstSleep ? `[ "$(wc -l < "${sleeps}")" -eq 1 ] && (${onFirstSleep(seed)})\n` : ''}exit 0\n`, { mode: 0o755 });
    const run = cp.spawnSync('bash', ['-e', '-c', script], { cwd: work, encoding: 'utf8',
      env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, GH_TOKEN: 'jeton-fictif', HOME: dir, GIT_TERMINAL_PROMPT: '0' } });
    const pauses = fs.existsSync(sleeps) ? fs.readFileSync(sleeps, 'utf8').trim().split('\n').map(Number) : [];
    const published = f => cp.execFileSync('git', ['show', 'gh-pages:race-control/' + f], { cwd: remote, encoding: 'utf8' }).trim();
    const files = () => git(remote, 'ls-tree', '-r', '--name-only', 'gh-pages').split('\n').sort();
    check({ status: run.status, out: run.stdout + run.stderr, pauses, published, files, moved: git(remote, 'rev-parse', 'gh-pages') !== before,
      pushes: fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0 });
    n++; console.log('✅ ' + name);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const datexCommit = seed => `cd "${seed}" && git pull -q origin gh-pages && echo '{"cursor":2}' > race-control/road-datex.json && git commit -qam datex && git push -q origin gh-pages`;
const newerObs = seed => `cd "${seed}" && git pull -q origin gh-pages && echo '{"updated":"2026-01-01T00:20:00Z","n":3}' > race-control/obs.json && git commit -qam relais-plus-recent && git push -q origin gh-pages`;
const scripts = WORKFLOWS.map(([file]) => publishScript(read(file)));

WORKFLOWS.forEach(([file, label], k) => {
  const script = scripts[k], t = s => `${label} · ${s}`;
  scenario(t('refus passager x2 : essais espacés 5 puis 10 s, publication réussie'), script, { reject: 2 }, r => {
    assert.equal(r.status, 0, r.out); assert.deepEqual(r.pauses, [5, 10]); assert.equal(r.pushes, 3); assert.equal(r.published('obs.json'), OBS2);
  });
  scenario(t('refus persistant : 4 pauses (5, 10, 20, 40 s), 5 essais, échec visible, publication précédente intacte'), script, { reject: 99 }, r => {
    assert.notEqual(r.status, 0); assert.deepEqual(r.pauses, [5, 10, 20, 40]); assert.equal(r.pushes, 5);
    assert.match(r.out, /::error title=Relais non publié::/); assert.equal(r.moved, false); assert.equal(r.published('obs.json'), OBS1);
  });
  scenario(t('DATEX publié pendant la pause : rebase, les deux publications conservées'), script, { reject: 1, onFirstSleep: datexCommit }, r => {
    assert.equal(r.status, 0, r.out); assert.equal(r.published('obs.json'), OBS2); assert.equal(r.published('road-datex.json'), '{"cursor":2}');
  });
  scenario(t('observations plus récentes déjà publiées : conflit, échec, jamais d’écrasement par l’exécution plus ancienne'), script, { reject: 1, onFirstSleep: newerObs }, r => {
    assert.notEqual(r.status, 0); assert.equal(JSON.parse(r.published('obs.json')).n, 3);
  });
  scenario(t('aucun changement : aucun commit ni push'), script, { obs: OBS1 }, r => {
    assert.equal(r.status, 0, r.out); assert.deepEqual(r.pauses, []); assert.equal(r.pushes, 0); assert.equal(r.moved, false);
  });
  scenario(t('liste blanche : seuls obs.json et calendar.sealed.json sont publiés, le flux DATEX reste intact'), script, { calendar: '{"sealed":"fictif"}', alterDatex: true }, r => {
    assert.equal(r.status, 0, r.out); assert.equal(r.published('obs.json'), OBS2); assert.equal(r.published('calendar.sealed.json'), '{"sealed":"fictif"}');
    assert.equal(r.published('road-datex.json'), '{"cursor":1}');
    assert.deepEqual(r.files(), ['race-control/calendar.sealed.json', 'race-control/obs.json', 'race-control/road-datex.json']);
  });
  scenario(t('observations absentes : frontière refusée, échec avant tout commit'), script, { obs: null }, r => {
    assert.notEqual(r.status, 0); assert.match(r.out, /::error::Frontière des données refusée/); assert.equal(r.pushes, 0); assert.equal(r.moved, false);
  });
  // Contre-épreuves : l'ancienne boucle (5 essais sans pause) et une boucle masquant l'échec sont détectées.
  const old = script.replace(/\n# Refus passagers[\s\S]*?exit 1\s*$/, '\nfor i in 1 2 3 4 5; do\n  git push -q && exit 0\n  git -c core.hooksPath=/dev/null pull -q --rebase || exit 1\ndone\nexit 1\n');
  assert.notEqual(old, script, 'contre-épreuve construite');
  assert.throws(() => scenario(t('mutation sans pause'), old, { reject: 2 }, r => { assert.equal(r.status, 0, r.out); assert.deepEqual(r.pauses, [5, 10]); }));
  const masked = script.replace(/exit 1\s*$/, 'exit 0\n');
  assert.notEqual(masked, script, 'contre-épreuve construite');
  assert.throws(() => scenario(t('mutation faux succès'), masked, { reject: 99 }, r => { assert.notEqual(r.status, 0); }));
  assert(!/continue-on-error/.test(read(file)), 'aucun continue-on-error dans ' + file);
});
// Les deux étapes ne diffèrent que par l'identité du commit : une correction ne peut pas en oublier une.
assert.equal(scripts[1].replaceAll('race-control-watchdog', 'race-control-relay').replace('Relais watchdog ', 'Relais relay '), scripts[0], 'étapes de publication du relais et du watchdog identiques hors identité');
assert.equal(n, 14);
console.log(`${n}/14 scénarios de publication du relais OK (7 par workflow) · 4 mutations rejetées`);
