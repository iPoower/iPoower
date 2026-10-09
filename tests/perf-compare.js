#!/usr/bin/env node
// Deux builds fictifs, même runner/moteur. Date métier fixe ; performance.now reste réelle.
// Aucun appel externe, secret de production, capture ou URL personnelle dans les rapports.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), zlib = require('node:zlib');
const { execFileSync } = require('node:child_process'), { performance } = require('node:perf_hooks');
const pw = require('playwright'), { APP_KEY_TEST } = require('./lib/test-keys');
const AT = Date.parse('2026-10-07T04:00:00Z'), URL_APP = 'https://ipoower.github.io/iPoower/race-control/', NAME = process.env.BROWSER || 'chromium';
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function argumentsOf(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--baseline', '--candidate', '--out'].includes(argv[i]) || !argv[i + 1]) throw new Error('Arguments : --baseline dossier --candidate dossier --out rapport.json');
    args[argv[i].slice(2)] = path.resolve(argv[i + 1]);
  }
  if (!args.baseline || !args.candidate || !args.out || !/\.json$/.test(args.out)) throw new Error('Deux racines et une sortie JSON sont requises');
  return args;
}
function prepare(root) {
  const meta = require(path.join(root, 'tests/ci/workspace')).prepare(), site = path.join(root, '.ci/prepared/w/site');
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const bytes = text => ({ raw: Buffer.byteLength(text), gzip: zlib.gzipSync(text, { level: 9 }).length });
  const js = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  return { root, site, html, build: /window\.TWRC_BUILD="([a-f0-9]+)"/.exec(html)[1],
    sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sizes: { html: bytes(html), embeddedJs: bytes(js), embeddedCss: bytes(css) }, buildMs: meta.buildMs };
}
function fixtures(root) {
  const DateAt = class extends Date { constructor(...a) { super(...(a.length ? a : [AT])); } static now() { return AT; } };
  const ctx = { console, Math, Date: DateAt, Intl, Map, Set, JSON };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root, 'src/engine.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/demo.js'), 'utf8') + '\nthis.demo=makeDemoPayload;this.ens=makeDemoEnsemble;this.nc=makeDemoNowcast;', ctx);
  return ctx;
}
async function profile(browser, build, fixture, device) {
  const mobile = device === 'iphone', context = await browser.newContext({ viewport: mobile ? { width: 414, height: 896 } : { width: 1440, height: 900 },
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}), timezoneId: 'Europe/Paris', locale: 'fr-FR', serviceWorkers: 'block' });
  const counts = {}, responseBytes = {}, errors = []; let rejectedExternal = 0;
  try {
    await context.addInitScript(at => {
      const NativeDate = Date;
      window.Date = class extends NativeDate { constructor(...a) { super(...(a.length ? a : [at])); } static now() { return at; } };
      window.__perfLong = null;
      try { if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        window.__perfLong = []; new PerformanceObserver(list => list.getEntries().forEach(e => window.__perfLong.push(e.duration))).observe({ type: 'longtask', buffered: true });
      } } catch (e) { /* WebKit : indisponible n'est pas zéro */ }
      let watch = 0;
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
        getCurrentPosition(ok, fail) { setTimeout(() => fail && fail({ code: 2, message: 'fixture sans GPS' }), 20); },
        watchPosition() { return ++watch; }, clearWatch() {}
      } });
    }, AT);
    const leaflet = path.dirname(require.resolve('leaflet/package.json'));
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      const reply = (category, body, type = 'application/json') => {
        const data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
        counts[category] = (counts[category] || 0) + 1; responseBytes[category] = (responseBytes[category] || 0) + data.length;
        return route.fulfill({ status: 200, contentType: type, headers: { 'access-control-allow-origin': '*' }, body: data });
      };
      if (/open-meteo\.com$/.test(u.hostname)) {
        const q = u.searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(',');
        const make = i => fixture.demo('froid', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
        if (lats.length > 1) return reply('weather-route', lats.map((_, i) => make(i)));
        const base = make(0);
        if (u.hostname.startsWith('ensemble-')) return reply('ensemble', fixture.ens(base));
        if (q.has('minutely_15')) return reply('nowcast', fixture.nc(base));
        if (u.hostname.startsWith('air-quality-')) return reply('air', {});
        if (q.has('models')) { delete base.hourly.visibility; return reply('arome', base); }
        return reply('forecast', base);
      }
      if (u.hostname === 'public.opendatasoft.com') return reply('vigilance', { records: [] });
      if (u.hostname === 'api.rainviewer.com') return reply('radar', { version: '2.0', host: 'https://tilecache.rainviewer.com', radar: { past: [] } });
      if (u.hostname === 'unpkg.com' && /leaflet\.js$/.test(u.pathname)) return reply('leaflet-js', fs.readFileSync(path.join(leaflet, 'dist/leaflet.js')), 'text/javascript');
      if (u.hostname === 'unpkg.com' && /leaflet\.css$/.test(u.pathname)) return reply('leaflet-css', fs.readFileSync(path.join(leaflet, 'dist/leaflet.css')), 'text/css');
      if (u.origin === new URL(URL_APP).origin) {
        if (/\/race-control\/$/.test(u.pathname)) return reply('document', build.html, 'text/html');
        if (/\/version\.json$/.test(u.pathname)) return reply('version', { build: build.build, at: new Date(AT).toISOString(), run: 1, sha: build.sha });
        if (/\/obs\.json$/.test(u.pathname)) return reply('observations', { updated: new Date(AT).toISOString(), stations: {} });
        if (/\/calendar\.sealed\.json$/.test(u.pathname)) return reply('agenda', fs.readFileSync(path.join(build.root, '.ci/prepared/out/cal.fake.json')));
        const name = path.basename(u.pathname);
        if (['tiredb.json', 'manifest.webmanifest', 'icon-192.png', 'apple-touch-icon.png'].includes(name)) return reply(name, fs.readFileSync(path.join(build.site, name)), name.endsWith('.png') ? 'image/png' : 'application/json');
      }
      rejectedExternal++; return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => { if (!/Fetch API cannot load/.test(String(e.name) + ' ' + e.message)) errors.push(e.name); });
    const ready = () => page.waitForFunction(() => typeof APP_CONTEXT !== 'undefined' && APP_CONTEXT.ready && CX && !busy && !ensBusy, null, { timeout: 60000 });
    const started = performance.now(); await page.goto(URL_APP); await ready(); const initialGenericMs = performance.now() - started;
    const unlockAt = performance.now(); await page.fill('#unlockPw', APP_KEY_TEST);
    await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.click('#unlockForm button[type=submit]')]); await ready();
    const unlockAndReloadMs = performance.now() - unlockAt; await page.waitForTimeout(800);
    const requestsAtReady = { ...counts }, bytesAtReady = { ...responseBytes };
    const metrics = await page.evaluate(() => {
      const summary = values => { const sorted = [...values].sort((a, b) => a - b); return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * .95) - 1)] }; };
      const measure = (fn, batches, repetitions) => {
        for (let i = 0; i < 3; i++) fn();
        const samples = []; for (let i = 0; i < batches; i++) { const start = performance.now(); for (let k = 0; k < repetitions; k++) fn(); samples.push((performance.now() - start) / repetitions); }
        return summary(samples);
      };
      const p0 = performance.now(); for (let i = 0; i < 100000; i++) Math.sqrt(i); if (performance.now() <= p0) throw new Error('Horloge de performance immobile');
      const nav = document.querySelector('#viewSeg'), button = nav.querySelector('[data-v=pneus]'); button.focus();
      const observer = new MutationObserver(() => {}); observer.observe(nav, { childList: true, subtree: true });
      const renderViewMs = measure(renderView, 9, 100), navMutations = observer.takeRecords().filter(x => x.type === 'childList').length; observer.disconnect();
      const navNodePreserved = button === nav.querySelector('[data-v=pneus]'), navFocusPreserved = document.activeElement === button;
      const renderAllMs = measure(renderAll, 9, 3), rebuildMs = measure(rebuild, 9, 3), computeCtxMs = measure(computeCtx, 9, 3);
      return { renderViewMs, renderAllMs, rebuildMs, computeCtxMs, navMutations, navNodePreserved, navFocusPreserved,
        domNodes: document.querySelectorAll('*').length, longTasksMs: window.__perfLong,
        heapBytes: performance.memory ? performance.memory.usedJSHeapSize : null,
        resourceTransferBytes: performance.getEntriesByType('resource').reduce((n, r) => n + (r.transferSize || 0), 0) || null };
    });
    const taps = [];
    await page.evaluate(() => { window.__tapPerf = null; document.addEventListener('click', e => { if (!e.target.closest('[data-act=view]')) return; const start = performance.now(); requestAnimationFrame(() => { window.__tapPerf = performance.now() - start; }); }, true); });
    for (const view of ['meteo', 'pneus', 'tenue', 'analyse', 'pneus']) {
      await page.evaluate(() => { window.__tapPerf = null; }); await page.locator('#viewSeg [data-v=' + view + ']').click();
      await page.waitForFunction(() => window.__tapPerf !== null); taps.push(await page.evaluate(() => window.__tapPerf));
    }
    if (errors.length) throw new Error('Exception applicative pendant le profilage : ' + errors.join(', '));
    return { device, viewport: mobile ? '414x896' : '1440x900', cpuThrottle: 1, physicalDevice: false, initialGenericMs, unlockAndReloadMs,
      ...metrics, tapToAnimationFrameMs: { median: median(taps), samples: taps }, requestsAtReady, fixtureResponseBytesAtReady: bytesAtReady, rejectedExternal, pageErrors: errors.length };
  } finally { await context.close(); }
}
async function main() {
  if (!['chromium', 'webkit'].includes(NAME)) throw new Error('Navigateur attendu : chromium ou webkit');
  const args = argumentsOf(process.argv.slice(2)), baseline = prepare(args.baseline), candidate = prepare(args.candidate), fixture = fixtures(args.baseline);
  const browser = await pw[NAME].launch({ ...(NAME === 'chromium' ? { args: ['--no-sandbox'] } : {}), proxy: { server: 'http://127.0.0.1:9' } });
  const report = { schema: 1, browser: NAME, browserVersion: browser.version(), playwrightVersion: require('playwright/package.json').version,
    measuredAt: new Date().toISOString(), method: 'same-runner, cold-context, synthetic-external-network, business-Date-frozen, real-performance-clock, SW-blocked',
    baseline: { sha: baseline.sha, sizes: baseline.sizes, buildMs: baseline.buildMs, profiles: [] },
    candidate: { sha: candidate.sha, sizes: candidate.sizes, buildMs: candidate.buildMs, profiles: [] } };
  try { for (const device of ['iphone', 'pc']) for (const role of device === 'iphone' ? ['baseline', 'candidate'] : ['candidate', 'baseline']) {
    report[role].profiles.push(await profile(browser, role === 'baseline' ? baseline : candidate, fixture, device));
  } } finally { await browser.close(); }
  fs.mkdirSync(path.dirname(args.out), { recursive: true }); fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  const rows = report.baseline.profiles.map(before => { const after = report.candidate.profiles.find(x => x.device === before.device); return {
    device: before.device, renderViewBeforeMs: +before.renderViewMs.median.toFixed(3), renderViewAfterMs: +after.renderViewMs.median.toFixed(3),
    navMutationsBefore: before.navMutations, navMutationsAfter: after.navMutations, focusBefore: before.navFocusPreserved, focusAfter: after.navFocusPreserved,
    renderAllBeforeMs: +before.renderAllMs.median.toFixed(2), renderAllAfterMs: +after.renderAllMs.median.toFixed(2),
    startupBeforeMs: Math.round(before.initialGenericMs), startupAfterMs: Math.round(after.initialGenericMs)
  }; });
  console.log(JSON.stringify({ browser: NAME, baseline: baseline.sha, candidate: candidate.sha, sizes: { baseline: baseline.sizes, candidate: candidate.sizes }, rows }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '# Profilage ' + NAME + ' — simulation, pas iPhone physique\n\n' +
    '| Profil | renderView avant → après (ms) | Mutations navigation avant → après | Focus conservé après | renderAll avant → après (ms) |\n|---|---:|---:|---|---:|\n' +
    rows.map(r => `| ${r.device} | ${r.renderViewBeforeMs} → ${r.renderViewAfterMs} | ${r.navMutationsBefore} → ${r.navMutationsAfter} | ${r.focusAfter} | ${r.renderAllBeforeMs} → ${r.renderAllAfterMs} |`).join('\n') +
    '\n\nGzip calculé sur build fictif. Réseau simulé : pas de latence fournisseur ni de débit iPhone mesuré. SW réel couvert séparément par la CI complète.\n');
}
main().catch(e => { console.error('Profilage en échec : ' + e.message.replace(/https?:\S+/g, '[URL]')); process.exitCode = 1; });
