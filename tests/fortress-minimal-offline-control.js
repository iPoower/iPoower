'use strict';
// Fixture locale indépendante de l'application : SW répondant avec du HTML littéral.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const moduleName = process.env.FORTRESS_PLAYWRIGHT_MODULE || 'playwright';
const playwright = require(moduleName);
async function run(engine) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fortress-literal-worker-'));
  const sockets = new Set();
  const literal = '<!doctype html><h1 id="literal-control">SW fixture without application</h1>';
  const worker = [
    "self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));",
    "self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));",
    "self.addEventListener('fetch', e => { if(e.request.mode === 'navigate') e.respondWith(new Response(" + JSON.stringify(literal) + ", {headers:{'Content-Type':'text/html'}})); });",
  ].join('\n');
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', req.url === '/sw.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/sw.js' ? worker : '<!doctype html><h1 id="origin-online">Fixture origin online</h1>');
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let context;
  const results = [];
  const options = { headless: true, serviceWorkers: 'allow' };
  async function stopOrigin() {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
  try {
    context = await playwright[engine].launchPersistentContext(profile, options);
    let page = context.pages()[0] || await context.newPage();
    await page.goto(origin, { timeout: 15000 });
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    await page.reload({ timeout: 15000 });
    await page.locator('#literal-control').waitFor({ timeout: 5000 });
    await context.close(); context = null;
    await stopOrigin();
    for (const browserOffline of [false, true]) {
      let version = null;
      try {
        context = await playwright[engine].launchPersistentContext(profile, { ...options, offline: browserOffline });
        version = context.browser().version();
        page = context.pages()[0] || await context.newPage();
        const response = await page.goto(origin + '/probe-without-origin', { timeout: 15000, waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200);
        await page.locator('#literal-control').waitFor({ timeout: 5000 });
        const online = await page.evaluate(() => navigator.onLine);
        if (browserOffline) assert.equal(online, false);
        results.push({ engine, browserVersion: version, browserOfflineEmulated: browserOffline, originListening: server.listening, responseStatus: response.status(), navigatorOnline: online, literalWorkerResponseVisible: true, state: 'CONFIRME' });
      } catch (error) {
        results.push({ engine, browserVersion: version, browserOfflineEmulated: browserOffline, originListening: server.listening, literalWorkerResponseVisible: false, state: 'ECHEC', reason: error.message });
      } finally { if (context) await context.close(); context = null; }
    }
    return results;
  } finally {
    if (context) await context.close();
    await stopOrigin();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
(async () => {
  const out = { scope: 'Synthetic loopback literal SW control; no CV, RC, CacheStorage, business data, physical iPhone or Google', createdAt: new Date().toISOString(), playwright: require(moduleName + '/package.json').version, cases: [], failures: [] };
  for (const engine of ['chromium', 'webkit']) {
    try { out.cases.push(...await run(engine)); } catch (error) { out.failures.push({ engine, reason: error.message }); }
  }
  out.state = out.failures.length || out.cases.length !== 4 || out.cases.some(c => c.state === 'ECHEC') ? 'ECHEC' : 'CONFIRME';
  fs.writeFileSync('fortress-minimal-offline-control.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  if (out.state === 'ECHEC') process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
