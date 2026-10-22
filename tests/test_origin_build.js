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
  check('publication Cloudflare inactive sans variable, après gh-pages vérifié, approbation production', () => {
    const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'), job = wf.split('\n  deploy-cloudflare:\n')[1];
    const head = job.split('    steps:')[0];
    assert(head.includes('needs: [version, deploy]'));
    assert(head.includes("needs.deploy.result == 'success' && needs.deploy.outputs.done == '1' && vars.CLOUDFLARE_RC_PROJECT != ''"));
    assert(head.includes('name: production') && head.includes('contents: read') && !/always\(\)/.test(job));
    assert(job.includes('RC_DATA_BASE: https://ipoower.github.io/iPoower/race-control/'));
    assert((job.match(/wrangler@4\.137\.0/g) || []).length === 3 && !/wrangler(@latest)?\s/.test(job.replace(/wrangler@4\.137\.0/g, '')));
    for (const h of ['cross-origin-opener-policy: same-origin', 'cross-origin-resource-policy: same-origin', "frame-ancestors 'none'", 'permissions-policy: geolocation=(self)', 'set-cookie'])
      assert(job.includes(h), h);
  });
} finally { fs.rmSync(path.join(ROOT, WORK), { recursive: true, force: true }); }
console.log(n + '/' + n + ' scénarios OK · construction pour origine dédiée, aucune publication');
