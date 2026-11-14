// Isolated fictional browser tests. No credentials, personal vault, real location or public API traffic.
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { buildSnapshot, CITIES } = require('../weather-desk-preview/generate');
const DIR = path.resolve(__dirname, '../weather-desk-preview');
const now = Date.now();
const t0 = Math.floor(now / 3600000) * 3600000;
const ts = ms => new Date(ms).toISOString().slice(0, 16);
const metric = value => Array.from({ length: 48 }, () => value);
function upstream() {
  return { current: { time: ts(now), temperature_2m: 7, apparent_temperature: 4, precipitation: .2,
      wind_speed_10m: 14, wind_gusts_10m: 36 },
    hourly: { time: Array.from({ length: 48 }, (_, i) => ts(t0 + i * 3600000)),
      temperature_2m: metric(7), apparent_temperature: metric(4), precipitation: metric(.2),
      precipitation_probability: metric(60), wind_speed_10m: metric(14), wind_gusts_10m: metric(36) } };
}
async function generatorTests() {
  const called = [];
  const fixture = await buildSnapshot(async (url, cfg) => {
    called.push(new URL(url));
    assert.equal(cfg.method, 'GET');
    return { ok: true, json: async () => upstream() };
  }, now);
  assert.deepEqual(Object.keys(fixture.cities), CITIES.map(x => x.id));
  assert.equal(called.length, 4);
  assert(called.every(x => x.origin === 'https://api.open-meteo.com'));
  assert(!/latitude|longitude|twrc|key|relay|calendar|vehicle|home|work/i.test(JSON.stringify(fixture)));
  await assert.rejects(buildSnapshot(async () => ({ ok: false, status: 429 }), now), /rate limited/);
  return fixture;
}
function server(snapshot) {
  const instance = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const m = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };
    if (pathname === '/public-weather.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(snapshot));
    }
    if (pathname === '/probe.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><title>Fictional probe</title>'); }
    if (!m[pathname]) { res.writeHead(404); return res.end('Not found'); }
    const filename = path.join(DIR, m[pathname]);
    res.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript' : pathname.endsWith('.css') ? 'text/css' : 'text/html',
      'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(filename));
  });
  return new Promise(ok => instance.listen(0, '127.0.0.1', () => ok({
    origin: 'http://127.0.0.1:' + instance.address().port,
    close: () => new Promise(done => instance.close(done))
  })));
}
async function browserTests(browserType, snapshot) {
  const site = await server(snapshot), elsewhere = await server(snapshot);
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage(), requests = [], log = [];
    page.on('request', request => requests.push(request.url()));
    page.on('console', event => log.push(event.text()));
    await page.addInitScript(() => {
      const taps = window.__guestTaps = { local: 0, session: 0, idb: 0, gps: 0, sw: 0 };
      try { Object.defineProperty(window, 'localStorage', { configurable: true, get() { taps.local++; return undefined; } }); } catch (_) {}
      try { Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { taps.session++; return undefined; } }); } catch (_) {}
      try { const open = indexedDB.open; indexedDB.open = function () { taps.idb++; throw new Error('blocked fictional IDB'); }; void open; } catch (_) {}
      try { Object.defineProperty(navigator, 'geolocation', { configurable: true, get() { taps.gps++; return undefined; } }); } catch (_) {}
      try { Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get() { taps.sw++; return undefined; } }); } catch (_) {}
    });
    await page.goto(site.origin + '/');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('LIVE'));
    assert.equal(await page.locator('#hours li').count(), 12);
    assert.match(await page.locator('#temp').innerText(), /7,0/);
    await page.selectOption('#city', 'lille');
    assert.match(await page.locator('#updated').innerText(), /Lille/);
    assert.deepEqual(await page.evaluate(() => window.__guestTaps), { local: 0, session: 0, idb: 0, gps: 0, sw: 0 });
    assert(!requests.some(u => !u.startsWith(site.origin + '/')), 'no outbound guest browser HTTP traffic');
    assert(!requests.some(u => /relay|calendar|vault|config|location|profile|secret/i.test(u)), 'no private endpoint');
    assert(!JSON.stringify({ requests, log }).includes('FICTIONAL_VAULT_CANARY'), 'no private content in logs');
    // A cached PUBLIC snapshot stays visible but is correctly reclassified after 429.
    await page.route('**/public-weather.json', route => route.fulfill({ status: 429, body: 'Too many requests' }));
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('CACHE'));
    assert.match(await page.locator('#updated').innerText(), /mise à jour impossible/);
    // Offline, only in-memory dated PUBLIC data is visible; no persistence on a fresh load.
    await page.unroute('**/public-weather.json');
    await context.setOffline(true);
    await page.locator('#refresh').click();
    assert.match(await page.locator('#status').innerText(), /CACHE/);
    await context.setOffline(false);
    await page.route('**/public-weather.json', route => route.abort('failed'));
    await page.reload();
    await page.waitForFunction(() => document.getElementById('status').textContent === 'DONNÉES INDISPONIBLES');
    assert.equal(await page.locator('#hours li').count(), 0);
    await context.close();
    // Same-origin boundary proof, using exclusively fake localStorage on loopback.
    const ctx = await browser.newContext();
    const a = await ctx.newPage();
    await a.goto(site.origin + '/probe.html');
    await a.evaluate(() => localStorage.setItem('twrc.fictional.canary', 'FICTIONAL_VAULT_CANARY'));
    const sibling = await ctx.newPage();
    await sibling.goto(site.origin + '/probe.html');
    assert.equal(await sibling.evaluate(() => localStorage.getItem('twrc.fictional.canary')), 'FICTIONAL_VAULT_CANARY',
      'same-origin sibling can read storage; path is not isolation');
    const other = await ctx.newPage();
    await other.goto(elsewhere.origin + '/probe.html');
    const denied = await other.evaluate(async origin => {
      const frame = document.createElement('iframe'); frame.src = origin + '/probe.html';
      document.body.appendChild(frame); await new Promise(resolve => frame.onload = resolve);
      try { return frame.contentWindow.localStorage.getItem('twrc.fictional.canary'); }
      catch (err) { return err.name; }
    }, site.origin);
    assert.equal(denied, 'SecurityError', 'cross-origin storage denied');
    await ctx.close();
  } finally { await browser.close(); await site.close(); await elsewhere.close(); }
}
(async () => {
  const snapshot = await generatorTests();
  const which = process.env.BROWSER || 'chromium';
  if (!['chromium', 'webkit'].includes(which)) throw new Error('Unsupported browser');
  await browserTests(which === 'chromium' ? chromium : webkit, snapshot);
  console.log('PASS Weather Desk ' + which + ': public data, 429, offline, API and vault guards, same-origin/cross-origin proof.');
})().catch(e => { console.error('FAIL Weather Desk preview: ' + e.message); process.exitCode = 1; });
