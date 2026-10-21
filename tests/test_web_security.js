'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm'), assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..'), { LEAFLET, ASSETS, copy } = require('../tools/web-assets');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const built = path.join(ROOT, '.ci/dist'), html = fs.readFileSync(path.join(built, 'index.html'), 'utf8');
test('CSP assemblée : uniquement empreintes de scripts, aucune origine/CDN ou eval autorisés', () => {
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1], scripts = /script-src ([^;]+)/.exec(policy)[1];
  assert(!/https?:|'self'|'unsafe-inline'|'unsafe-eval'|unpkg/.test(scripts)); assert(scripts.includes("'" + LEAFLET.js + "'"));
  assert(policy.includes("script-src-attr 'none'")); assert(policy.includes("object-src 'none'")); assert(policy.includes("base-uri 'none'"));
  assert(html.includes('<meta name="referrer" content="no-referrer">'));
  assert(html.includes("js.src = 'vendor/leaflet/leaflet.js'"));
});
test('en-têtes dédiés prêts : frame-ancestors/nosniff/Referrer/Permissions ; aucune annonce sur GitHub Pages', () => {
  const headers = fs.readFileSync(path.join(built, '_headers'), 'utf8');
  for (const text of ["frame-ancestors 'none'", 'X-Frame-Options: DENY', 'X-Content-Type-Options: nosniff', 'Referrer-Policy: no-referrer', 'Permissions-Policy: geolocation=(self)', 'Cross-Origin-Opener-Policy: same-origin', 'Cross-Origin-Resource-Policy: same-origin']) assert(headers.includes(text));
  assert(headers.split('\n').every(line => line.length <= 2000), 'limite de ligne Cloudflare Pages');
  for (const name of ASSETS) assert(fs.existsSync(path.join(built, 'vendor/leaflet', name)));
});
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-web-assets-'));
try {
  test('bibliothèque modifiée ou lien symbolique : build refusé avant copie', () => {
    fs.mkdirSync(path.join(temp, 'src/vendor'), { recursive: true }); fs.cpSync(path.join(ROOT, 'src/vendor/leaflet'), path.join(temp, 'src/vendor/leaflet'), { recursive: true });
    const script = path.join(temp, 'src/vendor/leaflet/leaflet.js'), original = fs.readFileSync(script);
    fs.appendFileSync(script, ';window.hostile=true;'); assert.throws(() => copy(temp, 'dist'), /Intégrité/); assert(!fs.existsSync(path.join(temp, 'dist')));
    fs.writeFileSync(script, original); fs.unlinkSync(script); fs.symlinkSync(path.join(ROOT, 'src/vendor/leaflet/leaflet.js'), script);
    assert.throws(() => copy(temp, 'dist'), /Intégrité/);
  });
  test('déploiement : liens et données de relais dans le build refusés, aucune écriture partielle', () => {
    const source = path.join(temp, 'dist-safe'), destination = path.join(temp, 'pages/race-control');
    fs.cpSync(built, source, { recursive: true }); fs.cpSync(built, destination, { recursive: true });
    const old = fs.readFileSync(path.join(destination, 'index.html')), victim = path.join(temp, 'victim.txt'); fs.writeFileSync(victim, 'victime intacte');
    fs.unlinkSync(path.join(destination, 'vendor/leaflet/leaflet.js')); fs.symlinkSync(victim, path.join(destination, 'vendor/leaflet/leaflet.js'));
    const run = () => spawnSync(process.execPath, [path.join(ROOT, 'tools/deploy-copy.js'), source, destination], { encoding: 'utf8' });
    assert.equal(run().status, 1); assert.equal(fs.readFileSync(victim, 'utf8'), 'victime intacte'); assert(fs.readFileSync(path.join(destination, 'index.html')).equals(old));
    fs.unlinkSync(path.join(destination, 'vendor/leaflet/leaflet.js')); fs.copyFileSync(path.join(source, 'vendor/leaflet/leaflet.js'), path.join(destination, 'vendor/leaflet/leaflet.js'));
    fs.writeFileSync(path.join(source, 'obs.json'), '{"stations":{}}'); assert.equal(run().status, 1); assert(fs.readFileSync(path.join(destination, 'index.html')).equals(old));
    fs.unlinkSync(path.join(source, 'obs.json')); fs.writeFileSync(path.join(destination, 'obs.json'), '{"stations":{"fixture":"conservée"}}');
    fs.writeFileSync(path.join(destination, 'calendar.sealed.json'), '{"cipher":"opaque-fictif"}');
    assert.equal(run().status, 0); assert.equal(fs.readFileSync(path.join(destination, 'calendar.sealed.json'), 'utf8'), '{"cipher":"opaque-fictif"}');
    assert.equal(fs.readFileSync(path.join(destination, 'obs.json'), 'utf8'), '{"stations":{"fixture":"conservée"}}');
  });
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
test('Service Worker : bibliothèque préchargée et requêtes des autres dossiers hors portée', () => {
  const handlers = {}, context = { URL, Request, Response, Headers, Date, setTimeout, self: { location: { origin: 'https://fixture.invalid' }, registration: { scope: 'https://fixture.invalid/race-control/' }, addEventListener(type, fn) { handlers[type] = fn; } } };
  const source = fs.readFileSync(path.join(ROOT, 'src/sw.js'), 'utf8');
  for (const name of ASSETS) assert(source.includes('./vendor/leaflet/' + name));
  vm.runInNewContext(source, context);
  for (const url of ['https://fixture.invalid/Reconversion-Control/data.json', 'https://external.invalid/race-control/obs.json']) {
    let intercepted = false; handlers.fetch({ request: new Request(url), respondWith() { intercepted = true; } }); assert.equal(intercepted, false);
  }
});
console.log(`✅ ${n} contrôles de protection web au vert`);
