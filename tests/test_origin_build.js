'use strict';
// Origine dédiée : le build reçoit RC_DATA_BASE, l'annonce au SW et à la CSP, et ne change rien sans elle.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..'), WORK = '.ci-origin-build';
const build = (out, base) => spawnSync(process.execPath, [path.join(ROOT, 'tools/build.js')], { cwd: ROOT, encoding: 'utf8',
  env: { PATH: process.env.PATH, RC_OUT: WORK + '/' + out, ...(base !== undefined ? { RC_DATA_BASE: base } : {}) } });
const read = (out, f) => fs.readFileSync(path.join(ROOT, WORK, out, f), 'utf8');
let n = 0; const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const BASE = 'https://data.example.test/race-control/', SRC = fs.readFileSync(path.join(ROOT, 'src/sw.js'), 'utf8');
try {
  fs.rmSync(path.join(ROOT, WORK), { recursive: true, force: true });
  assert.equal(build('legacy').status, 0); assert.equal(build('dedicated', BASE).status, 0);
  check('hébergement historique : SW strictement identique à la source, aucune origine de données', () => {
    assert.equal(read('legacy', 'sw.js'), SRC);
    assert(read('legacy', 'index.html').includes('window.TWRC_DATA_BASE=""'));
  });
  check('origine dédiée : base injectée une seule fois dans le SW, sinon identique', () => {
    const sw = read('dedicated', 'sw.js');
    assert.equal(sw.split('const DATA_BASE = ' + JSON.stringify(BASE) + ';').length, 2);
    assert.equal(sw.replace('const DATA_BASE = ' + JSON.stringify(BASE) + ';', "const DATA_BASE = '';"), SRC);
  });
  check('CSP : seule l’origine de données ajoutée à connect-src, ligne d’en-tête < 2000 caractères', () => {
    const headers = read('dedicated', '_headers'), csp = headers.split('\n').find(l => l.includes('Content-Security-Policy:'));
    assert(csp.length < 2000, 'longueur ' + csp.length);
    assert(/connect-src [^;]*https:\/\/data\.example\.test/.test(csp));
    assert(!/connect-src [^;]*https:\/\/data\.example\.test/.test(read('legacy', '_headers')));
    for (const h of ["frame-ancestors 'none'", 'X-Frame-Options: DENY', 'X-Content-Type-Options: nosniff', 'Cross-Origin-Opener-Policy: same-origin',
      'Cross-Origin-Resource-Policy: same-origin', 'Permissions-Policy: geolocation=(self)', 'Strict-Transport-Security:', 'Referrer-Policy: no-referrer'])
      assert(headers.includes(h), h);
  });
  check('base de données refusée si non HTTPS, sans « / » final ou avec requête', () => {
    for (const bad of ['http://data.example.test/rc/', 'https://data.example.test/rc', 'https://data.example.test/rc/?x=1'])
      assert.notEqual(build('bad', bad).status, 0, bad);
  });
  check('publication Cloudflare séparée de ci.yml : jamais de blocage du relais, application déjà servie par gh-pages', () => {
    const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/cloudflare.yml'), 'utf8');
    // Le relais n'accepte que ci.yml : aucune étape Cloudflare ne doit pouvoir y faire échouer une CI.
    assert(!/cloudflare|wrangler/i.test(ci), 'ci.yml sans publication Cloudflare');
    assert(fs.readFileSync(path.join(ROOT, 'tools/relay-trust.js'), 'utf8').includes("r.path === '.github/workflows/ci.yml'"));
    assert(wf.includes("workflows: ['Race Control · tests']") && /^name: Race Control · tests$/m.test(ci));
    for (const c of ["vars.CLOUDFLARE_RC_PROJECT != ''", "github.event.workflow_run.conclusion == 'success'", "github.event.workflow_run.event == 'push'",
      "github.event.workflow_run.head_branch == 'main'", 'github.event.workflow_run.head_repository.full_name == github.repository']) assert(wf.includes(c), c);
    assert(wf.includes('name: production') && /^permissions:\n  contents: read$/m.test(wf) && !/always\(\)|workflow_dispatch|pull_request/.test(wf));
    // gh-pages ne republie que si le build change : on compare l'identité de build, pas le commit (#218 jamais publié sinon).
    assert(!wf.includes('[ "$sha" != "$SRC_SHA" ]') && wf.includes('[ "$build" != "$LIVE_BUILD" ]'), 'seule l’application servie par gh-pages est republiée');
    assert(wf.includes('sha: process.env.LIVE_SHA') && wf.includes('[ "$served" = "$LIVE_SHA" ]'), 'même commit déclaré et relu que gh-pages');
    for (const step of ['Projet en envoi direct', 'Envoi direct vers Cloudflare Pages', 'Octets servis'])
      assert(new RegExp('- name: ' + step + '[^\\n]*\\n        if: steps\\.build\\.outputs\\.go == \'1\'').test(wf), step);
    assert(wf.includes('p="$f"; [ "$f" = index.html ] && p=""'), 'index.html relu à son adresse réelle');
    assert(wf.includes('RC_DATA_BASE: https://ipoower.github.io/iPoower/race-control/'));
    assert((wf.match(/wrangler@4\.137\.0/g) || []).length === 3 && !/wrangler(@latest)?\s/.test(wf.replace(/wrangler@4\.137\.0/g, '')));
    for (const h of ['cross-origin-opener-policy: same-origin', 'cross-origin-resource-policy: same-origin', "frame-ancestors 'none'", 'permissions-policy: geolocation=(self)', 'set-cookie'])
      assert(wf.includes(h), h);
  });
  check('lecture de version.json gh-pages : valide → numéro, commit, build ; illisible → rien à republier', () => {
    const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/cloudflare.yml'), 'utf8');
    const body = wf.split('        id: live\n        run: |\n')[1].split('\n      - ')[0].replace(/^ {10}/gm, '');
    const dir = path.join(ROOT, WORK, 'live'), run = json => {
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'pages/race-control'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'pages/race-control/version.json'), json); fs.writeFileSync(path.join(dir, 'out'), '');
      const r = spawnSync('bash', ['-e', '-c', body], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_OUTPUT: path.join(dir, 'out') } });
      assert.equal(r.status, 0, r.stderr);
      return Object.fromEntries(fs.readFileSync(path.join(dir, 'out'), 'utf8').trim().split('\n').map(l => l.split('=')));
    };
    const sha = 'a'.repeat(40);
    assert.deepEqual(run(JSON.stringify({ run: 157, sha, at: '2026-10-22T03:51:51.867Z', build: '50988798eb7c' })), { run: '157', sha, build: '50988798eb7c', go: '1' });
    for (const bad of ['', '{', JSON.stringify({ run: 0, sha, build: '50988798eb7c' }), JSON.stringify({ run: 1, sha: 'abc', build: '50988798eb7c' }),
      JSON.stringify({ run: 1, sha, build: 'x' }), JSON.stringify({ run: 1, sha: sha + '\ngo=1', build: '50988798eb7c' })])
      assert.deepEqual(run(bad), { go: '0' }, bad);
  });
} finally { fs.rmSync(path.join(ROOT, WORK), { recursive: true, force: true }); }
console.log(n + '/' + n + ' scénarios OK · construction pour origine dédiée, aucune publication');
