// Build et agenda 100 % fictifs produits une fois ; chaque lane reçoit une copie de travail indépendante.
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..'), CI = path.join(ROOT, '.ci'), PREPARED = path.join(CI, 'prepared');
const { APP_KEY_TEST, RC_KEY_TEST } = require('../lib/test-keys');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function files(root, prefix = '') {
  const rows = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) rows.push(...files(root, rel));
    else if (entry.isFile()) rows.push(rel);
    else throw new Error('Lien ou entrée non régulière dans les fixtures : ' + rel);
  }
  return rows;
}
function sourceHash(root = ROOT) {
  const names = [...['src', 'tests', 'tools'].flatMap(dir => files(path.join(root, dir)).map(f => dir + '/' + f)), 'package.json', 'package-lock.json'];
  return digest(names.map(f => f + ':' + digest(fs.readFileSync(path.join(root, f)))).join('\n'));
}
function payload(root) { return Object.fromEntries(['w', 'out'].flatMap(dir => files(path.join(root, dir)).map(f => [dir + '/' + f, digest(fs.readFileSync(path.join(root, dir, f)))]))); }
function validatePrepared(root = PREPARED) {
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'meta.json'), 'utf8'));
  if (meta.schema !== 1 || meta.sourceHash !== sourceHash()) throw new Error('Fixtures d’une autre version de source');
  const actual = payload(root);
  for (const f of ['w/site/index.html', 'w/site/sw.js', 'w/engine.js', 'w/demo.js', 'w/relay.js', 'w/widget.js', 'w/preset.json', 'out/cal.fake.json']) if (!actual[f]) throw new Error('Fixture obligatoire absente : ' + f);
  if (JSON.stringify(actual) !== JSON.stringify(meta.files)) throw new Error('Fixtures modifiées ou incomplètes');
  return meta;
}
function prepare() {
  const start = Date.now(), dirs = ['fake', 'dist', 'enc', 'h', 'prepared/w/site', 'prepared/out'];
  fs.rmSync(CI, { recursive: true, force: true }); dirs.forEach(d => fs.mkdirSync(path.join(CI, d), { recursive: true }));
  const copy = (from, to) => fs.copyFileSync(path.join(ROOT, from), path.join(CI, to));
  copy('tests/fixtures/preset.fake.json', 'fake/preset.json'); copy('tests/fixtures/relay-config.fake.json', 'fake/relay-config.json');
  fs.writeFileSync(path.join(CI, 'fake/.passphrase'), APP_KEY_TEST); fs.writeFileSync(path.join(CI, 'fake/.rc_key'), RC_KEY_TEST);
  const buildStart = Date.now(), build = spawnSync(process.execPath, [path.join(ROOT, 'tools/build.js')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RC_PRIVATE: '.ci/fake', RC_OUT: '.ci/dist', RC_ENCRYPTED: '.ci/enc' } });
  const buildMs = Date.now() - buildStart;
  if (build.status !== 0) {
    // Diagnostic temporaire PR : ici, clés et données entièrement FICTIVES.
    // Ne jamais publier les contenus : uniquement l'identifiant de l'erreur de Node et le chemin source.
    const stderr = String(build.stderr || ''), stdout = String(build.stdout || '');
    const kind = /(ENOENT|EACCES|SyntaxError|ReferenceError|TypeError|RangeError|ERR_[A-Z_]+|code applicatif|Bloc applicatif|configuration)/.exec(stderr);
    const file = /(?:src|tools)\/[a-z/.-]+\.js/.exec(stderr);
    console.error('Diagnostic build fictif :', kind ? kind[0] : 'autre', file ? file[0] : 'sans chemin', 'scanner=' + /problème\(s\)|❌/.test(stdout));
    throw new Error('Build fictif en échec (aucune sortie privée affichée)');
  }
  for (const f of fs.readdirSync(path.join(CI, 'dist'))) copy('.ci/dist/' + f, 'prepared/w/site/' + f);
  for (const f of ['engine.js', 'demo.js', 'relay.js']) copy('src/' + f, 'prepared/w/' + f);
  copy('tests/fixtures/preset.fake.json', 'prepared/w/preset.json');
  const widget = fs.readFileSync(path.join(ROOT, 'src/widget.js'), 'utf8').replace(/const CFG = null;[^\n]*/, 'const CFG = ' + JSON.stringify({ home: { id: 'home', name: 'Maison test', lat: 48.85, lon: 2.35 }, work: { id: 'work', name: 'Travail test', lat: 48.9, lon: 2.25 }, dep: '06:30', durMin: 40, days: [1, 2, 3], cars: [{ short: 'Test A', sporty: 1, tire: { type: 'summer', size: '215/40 R18', tread: null, dot: '1023' }, plan: { on: 0 } }] }) + ';');
  fs.writeFileSync(path.join(PREPARED, 'w/widget.js'), widget);
  for (const f of ['relay.js', 'engine.js', 'demo.js', 'evidence.js']) copy('src/' + f, 'h/' + f);
  for (const f of fs.readdirSync(path.join(ROOT, 'tests/relay-harness'))) copy('tests/relay-harness/' + f, 'h/' + f);
  copy('.ci/dist/relay-config.sealed.json', 'h/relay-config.sealed.json');
  const fixtureStart = Date.now(), relay = spawnSync(process.execPath, ['-r', './mock_tt.js', 'relay.js'], { cwd: path.join(CI, 'h'), encoding: 'utf8', timeout: 180e3, env: { ...process.env, FAKE: '2026-10-02T08:00:00+02:00', SCN: 'doux', GCAL_ICS: 'https://calendar.google.com/test.ics', APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_TEST } });
  if (relay.status !== 0 || !fs.existsSync(path.join(CI, 'h/calendar.sealed.json'))) throw new Error('Harnais fictif du relais en échec');
  copy('.ci/h/calendar.sealed.json', 'prepared/out/cal.fake.json');
  const meta = { schema: 1, sourceHash: sourceHash(), files: payload(PREPARED), buildMs, fixtureMs: Date.now() - fixtureStart, prepareMs: Date.now() - start };
  fs.writeFileSync(path.join(PREPARED, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}
function workspace(key, prepared = PREPARED, parent = path.join(CI, 'work')) {
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error('Nom de workspace invalide');
  const meta = validatePrepared(prepared), work = path.join(parent, key), w = path.join(work, 'w'), out = path.join(work, 'out');
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  fs.cpSync(path.join(prepared, 'w'), w, { recursive: true }); fs.cpSync(path.join(prepared, 'out'), out, { recursive: true });
  fs.writeFileSync(path.join(w, '.passphrase'), APP_KEY_TEST);
  const nm = fs.existsSync(path.join(ROOT, 'node_modules')) ? path.join(ROOT, 'node_modules') : process.env.NODE_MODULES_DIR;
  if (nm) fs.symlinkSync(nm, path.join(w, 'node_modules'), 'dir');
  return { w, out, meta };
}
module.exports = { ROOT, CI, PREPARED, sourceHash, payload, validatePrepared, prepare, workspace };
