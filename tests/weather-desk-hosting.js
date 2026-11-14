// Simulate a future dedicated HTTP origin with Cloudflare-style headers.
// Fixture ONLY. No external deployment, credentials, DNS, hosting API or user data.
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { stage, preflight, FILES, OUT } = require('../tools/weather-desk-hosting');
const root = path.resolve(__dirname, '..');
const mime = { 'index.html': 'text/html; charset=utf-8', 'style.css': 'text/css; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8' };
function server(isGuest) {
  const lines = fs.readFileSync(path.join(OUT, '_headers'), 'utf8').split(/\r?\n/);
  const securityHeaders = {};
  for (const s of lines) {
    const m = s.match(/^ {2}([A-Za-z][A-Za-z-]*):\s*(.+)$/);
    if (m && !['Cache-Control'].includes(m[1])) securityHeaders[m[1]] = m[2];
  }
  const srv = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1/').pathname;
    if (!isGuest && pathname === '/probe') {
      res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><title>fictional sibling</title>');
    }
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!isGuest || !FILES.includes(file) || file === '_headers') {
      res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end('Not found');
    }
    res.writeHead(200, { ...securityHeaders, 'Content-Type': mime[file],
      'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(OUT, file)));
  });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({
    url: 'http://127.0.0.1:' + srv.address().port,
    close: () => new Promise(done => srv.close(done))
  })));
}
async function exercise(browserType) {
  const isolated = await server(true), personal = await server(false);
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const original = await context.newPage();
    await original.goto(personal.url + '/probe');
    await original.evaluate(() => localStorage.setItem('twrc.fictional.canary', 'FICTIONAL_ONLY'));
    const guest = await context.newPage();
    const calls = [];
    guest.on('request', r => calls.push(r.url()));
    const navigation = await guest.goto(isolated.url + '/');
    assert.equal(navigation.status(), 200);
    const csp = navigation.headers()['content-security-policy'];
    assert(csp.includes("default-src 'none'") && csp.includes("connect-src 'self'"));
    assert(csp.includes("frame-ancestors 'none'"));
    assert.equal(navigation.headers()['referrer-policy'], 'no-referrer');
    assert(navigation.headers()['permissions-policy'].includes('geolocation=()'));
    await guest.waitForFunction(() => document.querySelector('#updated').textContent.includes('Aucun fichier public valide'));
    assert.equal(await guest.locator('#status').innerText(), 'DONNÉES INDISPONIBLES');
    assert.equal(await guest.locator('#hours li').count(), 0);
    assert.equal(await guest.evaluate(() => localStorage.getItem('twrc.fictional.canary')), null,
      'isolated origin cannot access sibling canary');
    assert(calls.every(u => u.startsWith(isolated.url + '/')),
      'guest must only fetch public assets from its dedicated host');
    const paths = calls.map(u => new URL(u).pathname);
    assert(['/','/app.js','/public-weather.json','/style.css'].every(p => paths.includes(p)),
      'expected public-only resources');
    assert(paths.every(p => ['/','/app.js','/public-weather.json','/style.css','/favicon.ico'].includes(p)),
      'unexpected public resource');
    const dynamicScriptExecuted = await guest.evaluate(async () => {
      window.__fictionalInjectedScript = false;
      const s = document.createElement('script');
      s.textContent = 'window.__fictionalInjectedScript = true';
      document.body.appendChild(s);
      await Promise.resolve(); return window.__fictionalInjectedScript;
    });
    assert.equal(dynamicScriptExecuted, false, 'CSP must block untrusted inline scripts');
    await context.close();
  } finally { await browser.close(); await isolated.close(); await personal.close(); }
}
(async () => {
  const pack = stage();
  assert.deepEqual(pack.files, ['index.html','app.js','style.css','_headers']);
  preflight();
  const files = fs.readdirSync(OUT);
  assert(!files.some(f => /(json|vault|relay|calendar|session|secret|private|encrypted|sw\.js)/i.test(f)));
  const choice = process.env.BROWSER || 'chromium';
  if (!['webkit','chromium'].includes(choice)) throw new Error('Unsupported browser');
  await exercise(choice === 'webkit' ? webkit : chromium);
  console.log('PASS Weather Desk hosting preflight ' + choice +
    ': static allowlist, missing snapshot fail-closed, CSP, dedicated-origin boundary, no publication.');
})().catch(e => { console.error('FAIL Weather Desk hosting preflight: ' + e.message); process.exitCode = 1; });
