'use strict';
// Read-only HTTP + disposable browser profiles. No OAuth, no user data or deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { createHash } = require('node:crypto');
const { chromium, webkit } = require('playwright');
const APPS = [
  { name: 'RC', origin: 'https://rc-drive-test-ipoower.pages.dev', source: '7e5cd990f7f736ab77220bb2b35fad643407e672', anchor: 'ea1fe1399127a48e26a358c1bf9710503457fc40756c7e9e8a393ad5fefedd87', count: 24 },
  { name: 'CV', origin: 'https://cv-drive-test-ipoower.pages.dev', source: '51031e8d1a4b69565bc36830f6ef8efbfd986ca3', anchor: 'd862fe70e3760134c50bff7b9b2681ec29c4d335e51aa71185f5f36cd1e540a8', count: 16 }
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const timeout = ms => AbortSignal.timeout(ms);
async function read(origin, name) {
  let url = new URL('/' + name, origin);
  for (let i = 0; i < 5; i++) {
    const response = await fetch(url, { redirect: 'manual', signal: timeout(25000), headers: { 'Cache-Control': 'no-cache' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = new URL(response.headers.get('location'), url);
      assert.equal(next.origin, origin, 'Cross-origin redirect refused');
      url = next; continue;
    }
    assert.equal(response.status, 200, name + ': HTTP ' + response.status);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 5 * 1024 * 1024) throw new Error('HTTP size limit');
      chunks.push(chunk);
    }
    return { bytes: Buffer.concat(chunks), headers: Object.fromEntries(response.headers), finalUrl: url.href };
  }
  throw new Error('Redirect limit');
}
function headersCheck(headers) {
  assert.match(headers['content-security-policy'] || '', /frame-ancestors 'none'/);
  const scripts = /(?:^|;)\s*script-src\s+([^;]+)/.exec(headers['content-security-policy'] || '');
  assert.ok(scripts && !/'unsafe-inline'|'unsafe-eval'/.test(scripts[1]));
  assert.match(headers['strict-transport-security'] || '', /max-age=31536000/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.match(headers['permissions-policy'] || '', /geolocation=\(\)/);
  assert.match(headers['permissions-policy'] || '', /camera=\(\)/);
  assert.ok(headers['referrer-policy']);
}
async function verifyHttp(app) {
  const manifestResult = await read(app.origin, 'fixture-manifest.json');
  const observed = JSON.parse(manifestResult.bytes);
  assert.equal(sha(manifestResult.bytes), app.anchor,
    app.name + ': candidate not served; observed ' + observed.sourceSha);
  assert.equal(observed.sourceSha, app.source);
  assert.equal(observed.fixtureOnly, true);
  assert.equal(observed.environment, 'isolated-test');
  assert.equal(observed.raceOrigin, APPS[0].origin);
  assert.equal(observed.vaultOrigin, APPS[1].origin);
  assert.equal(Object.keys(observed.files).length, app.count);
  const files = [];
  for (const [name, digest] of Object.entries(observed.files)) {
    assert.match(name, /^[A-Za-z0-9_./-]+$/);
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'));
    assert.match(digest, /^[a-f0-9]{64}$/);
    if (['_headers', '_redirects'].includes(name)) continue;
    const result = await read(app.origin, name);
    assert.equal(sha(result.bytes), digest, 'File digest: ' + name);
    files.push({ name, sha256: digest, size: result.bytes.length, finalUrl: result.finalUrl });
  }
  const home = await read(app.origin, ''); headersCheck(home.headers);
  assert.match(home.bytes.toString(), /TEST — DONNÉES FICTIVES UNIQUEMENT/);
  assert.match(home.headers['cache-control'] || '', /no-cache|max-age=0|must-revalidate/);
  const sw = await read(app.origin, 'sw.js');
  assert.match(sw.headers['cache-control'] || '', /no-cache/);
  const config = await read(app.origin, 'drive-config.json');
  assert.match(config.headers['cache-control'] || '', /no-store/);
  const publicConfig = JSON.parse(config.bytes);
  assert.equal(publicConfig.raceOrigin, APPS[0].origin);
  assert.equal(publicConfig.vaultOrigin, APPS[1].origin);
  const version = JSON.parse((await read(app.origin, 'version.json')).bytes);
  assert.equal(version.sha, app.source);
  const recovery = await read(APPS[0].origin, 'recovery');
  assert.match(recovery.bytes.toString(), /recovery-known-revision/);
  assert.equal(sha(recovery.bytes), (app.name === 'RC' ? observed : JSON.parse((await read(APPS[0].origin, 'fixture-manifest.json')).bytes)).files['recovery.html']);
  return { sourceSha: version.sha, manifestSha256: app.anchor, files, homeHeaders: home.headers, swHeaders: sw.headers, configHeaders: config.headers, recovery: { finalUrl: recovery.finalUrl, sha256: sha(recovery.bytes) } };
}
async function makeProxy(origin, selfTest = false) {
  const expected = new URL(origin); const sockets = new Set();
  let active = true, forwarded = 0, refused = 0;
  const server = http.createServer((req, res) => {
    if (!active) { refused++; res.writeHead(503); res.end('fixture network disconnected'); return; }
    if (selfTest && req.url === origin + '/') {
      forwarded++; res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end('<h1 id="proxy-fixture">Disposable proxy fixture</h1>'); return;
    }
    res.writeHead(403); res.end('Outside test allowlist');
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); });
  server.on('connect', (req, client, head) => {
    if (!active || selfTest || req.url !== expected.hostname + ':443') { refused++; client.end('HTTP/1.1 503 Service Unavailable\r\n\r\n'); return; }
    const upstream = net.connect(443, expected.hostname);
    sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
    upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy());
    upstream.once('connect', () => {
      forwarded++; client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream); upstream.pipe(client);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    address: 'http://127.0.0.1:' + server.address().port,
    cut() { active = false; for (const socket of sockets) socket.destroy(); },
    stats: () => ({ active, forwarded, refused }),
    async close() { active = false; for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
  };
}
async function selfTest(engine, launcher) {
  const origin = 'http://fortress-proxy-selftest.invalid';
  const proxy = await makeProxy(origin, true);
  let browser;
  try {
    browser = await launcher.launch({ headless: true, proxy: { server: proxy.address } });
    const page = await browser.newPage();
    await page.goto(origin + '/'); await page.locator('#proxy-fixture').waitFor();
    assert.ok(proxy.stats().forwarded > 0);
    proxy.cut(); let status;
    try { status = (await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }))?.status(); } catch { status = 'failed'; }
    assert.notEqual(status, 200, 'Proxy cut did not affect native browser traffic');
    return { engine, browserVersion: browser.version(), state: 'CONFIRME', statusAfterCut: status, proxy: proxy.stats(), scope: 'Synthetic proxy self-test only; no application or published candidate certified' };
  } finally { if (browser) await browser.close(); await proxy.close(); }
}
async function browserProof(app, engine, launcher) {
  const proxy = await makeProxy(app.origin);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-fixture-'));
  const options = { headless: true, proxy: { server: proxy.address }, serviceWorkers: 'allow', viewport: { width: 414, height: 896 }, hasTouch: true };
  let context; const sentinel = 'synthetic-' + app.name + '-' + engine;
  try {
    context = await launcher.launchPersistentContext(profile, options);
    let page = context.pages()[0] || await context.newPage();
    const response = await page.goto(app.origin + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    assert.equal(response.status(), 200);
    await page.locator('#drive-test-notice').waitFor({ timeout: 15000 });
    if (app.name === 'CV') await page.locator('#hero-title').waitFor({ timeout: 15000 });
    await page.evaluate(async value => {
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('SW installation timeout')), 30000))]);
      if (!navigator.serviceWorker.controller) await Promise.race([new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })), new Promise((_, reject) => setTimeout(() => reject(new Error('SW control timeout')), 15000))]);
      localStorage.setItem('fortress.synthetic.probe', value);
    }, sentinel);
    const browserManifest = await page.evaluate(async () => {
      const r = await fetch('/fixture-manifest.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('Browser manifest HTTP');
      const bytes = await r.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      return { digest, source: JSON.parse(new TextDecoder().decode(bytes)).sourceSha };
    });
    assert.equal(browserManifest.digest, app.anchor, 'Browser loaded an unanchored release');
    assert.equal(browserManifest.source, app.source);
    const before = await page.evaluate(async () => ({ controller: navigator.serviceWorker.controller.scriptURL, caches: (await Promise.all((await caches.keys()).map(async key => ({ key, urls: (await (await caches.open(key)).keys()).map(r => r.url) })))) }));
    assert.ok(before.caches.some(c => c.urls.some(u => new URL(u).pathname === '/index.html')));
    // No setOffline: tear down all proxy sockets and reject new native connections.
    proxy.cut();
    const probe = await page.evaluate(() => fetch('/fixture-manifest.json?fortress-network-probe', { cache: 'no-store' }).then(r => r.status).catch(() => 'failed'));
    assert.notEqual(probe, 200, 'Network-only probe still reachable');
    for (let i = 0; i < 2; i++) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.locator('#drive-test-notice').waitFor({ timeout: 8000 });
      if (app.name === 'CV') await page.locator('#hero-title').waitFor({ timeout: 8000 });
      assert.equal(await page.evaluate(() => localStorage.getItem('fortress.synthetic.probe')), sentinel);
    }
    const browserVersion = context.browser().version();
    await context.close(); context = null;
    context = await launcher.launchPersistentContext(profile, options);
    page = context.pages()[0] || await context.newPage();
    await page.goto(app.origin + '/', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.locator('#drive-test-notice').waitFor({ timeout: 8000 });
    if (app.name === 'CV') await page.locator('#hero-title').waitFor({ timeout: 8000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('fortress.synthetic.probe')), sentinel);
    let recoveryReturnedShell = false;
    try { await page.goto(app.origin + '/recovery', { waitUntil: 'domcontentloaded', timeout: 12000 }); recoveryReturnedShell = await page.locator('#drive-test-notice').count() > 0; } catch {}
    assert.equal(recoveryReturnedShell, false, 'Recovery navigation fell back to home');
    return { app: app.name, engine, browserVersion, state: 'CONFIRME', sourceSha: app.source, networkOnlyProbeAfterCut: probe, offlineReloads: 2, fullBrowserRestart: true, syntheticLocalStoragePreserved: true, activeWorker: before.controller, caches: before.caches, proxy: proxy.stats(), scope: 'Published candidate, native unavailable network, mobile viewport; no physical iPhone, business restoration, OAuth or quota measurement' };
  } finally {
    if (context) await context.close(); await proxy.close();
    // Remove only this newly-created, disposable test profile.
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
async function main() {
  const selfOnly = process.argv.includes('--self-test');
  const report = { createdAt: new Date().toISOString(), playwright: require('playwright/package.json').version, mode: selfOnly ? 'synthetic-proxy-self-test' : 'published-candidate-acceptance', http: [], browsers: [], failures: [] };
  const engines = process.env.FORTRESS_ENGINE === 'chromium' ? [['chromium', chromium]] : [['chromium', chromium], ['webkit', webkit]];
  async function attempt(label, work, target) { try { target.push(await work()); } catch (error) { report.failures.push({ label, state: 'ECHEC', reason: error.message }); } }
  if (selfOnly) for (const [name, launcher] of engines) await attempt(name, () => selfTest(name, launcher), report.browsers);
  else {
    for (const app of APPS) await attempt(app.name + ' HTTP', () => verifyHttp(app), report.http);
    if (!report.failures.length) for (const app of APPS) for (const [name, launcher] of engines) await attempt(app.name + ' ' + name, () => browserProof(app, name, launcher), report.browsers);
  }
  report.state = report.failures.length ? 'ECHEC' : 'CONFIRME';
  fs.writeFileSync(selfOnly ? 'fortress-proxy-selftest.json' : 'fortress-candidate-proof.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode: report.mode, state: report.state, http: report.http.length, browsers: report.browsers.length, failures: report.failures }, null, 2));
  process.exitCode = report.failures.length ? 1 : 0;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
