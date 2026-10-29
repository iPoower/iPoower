'use strict';
// Vrai SW, serveur local fictif, coupure TCP réelle. Ne certifie pas le domaine publié.
const http = require('node:http');
const fs = require('node:fs');
const { chromium, webkit } = require('playwright');
const worker = fs.readFileSync('src/sw.js');
async function run(engine, launcher, redirect) {
  const sockets = new Set(); let closed = false;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://fixture.invalid').pathname;
    if (pathname === '/index.html' && redirect) { res.writeHead(308, { Location: '/' }); res.end(); return; }
    if (pathname === '/' || pathname === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><title>fixture</title><p id="fixture">TEST fictif</p>'); return; }
    if (pathname === '/sw.js') { res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' }); res.end(worker); return; }
    if (pathname === '/network-probe') { res.writeHead(200); res.end('network'); return; }
    res.writeHead(200, { 'Content-Type': pathname.endsWith('.json') || pathname.endsWith('.webmanifest') ? 'application/json' : 'application/octet-stream' }); res.end('{}');
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser, context;
  try {
    browser = await launcher.launch({ headless: true }); context = await browser.newContext(); const page = await context.newPage();
    await page.goto(origin + '/'); await page.locator('#fixture').waitFor();
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      localStorage.setItem('fortress.fixture', 'fictif');
    });
    const cache = await page.evaluate(async () => { const r = await (await caches.open('twrc-static-v12')).match('./index.html'); return r && { url: r.url, redirected: r.redirected }; });
    if (!cache || cache.redirected || cache.url !== origin + '/') throw new Error('Shell de précache absent ou redirigé : ' + JSON.stringify(cache));
    for (const s of sockets) s.destroy(); await new Promise(resolve => server.close(resolve)); closed = true;
    let reachable = false; try { await fetch(origin + '/network-probe', { signal: AbortSignal.timeout(3000) }); reachable = true; } catch {} if (reachable) throw new Error('Serveur encore accessible');
    for (let i = 0; i < 2; i++) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      if (!(await page.locator('#fixture').isVisible())) throw new Error('Shell indisponible hors ligne');
      if ((await page.evaluate(() => localStorage.getItem('fortress.fixture'))) !== 'fictif') throw new Error('Sentinelle non conservée');
    }
    await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!(await page.locator('#fixture').isVisible())) throw new Error('Alias hors ligne indisponible');
    return { engine, redirect, offlineReloads: 2, cache, state: 'CONFIRME' };
  } finally {
    if (context) await context.close(); if (browser) await browser.close();
    if (!closed) { for (const s of sockets) s.destroy(); await new Promise(resolve => server.close(resolve)); }
  }
}
(async () => {
  const result = { scope: 'Vrai SW Race Control et fixture HTTP locale ; aucun Drive, donnée personnelle ou iPhone physique', cases: [], failures: [] };
  for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) for (const redirect of [false, true]) {
    try { result.cases.push(await run(engine, launcher, redirect)); } catch (e) { result.failures.push({ engine, redirect, reason: e.message }); }
  }
  fs.writeFileSync('fortress-redirect-offline-browser.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
