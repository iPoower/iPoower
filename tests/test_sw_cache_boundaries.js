'use strict';
// Exécute le vrai src/sw.js dans un Worker VM avec réseau et CacheStorage fictifs.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const SOURCE = fs.readFileSync(path.resolve(__dirname, '../src/sw.js'), 'utf8');
const SCOPE = 'https://fixture.invalid/race-control/';
const STATIC = 'twrc-static-v12';
let checks = 0;
async function check(name, work) { await work(); checks++; console.log('✅ ' + name); }

function harness(fetcher = async () => new Response('panne amont', { status: 503, headers: { 'Content-Type': 'text/plain' } })) {
  const listeners = new Map(), stores = new Map(), keyOf = (input, options = {}) => {
    const raw = typeof input === 'string' ? input : input.url ?? input.href;
    const url = new URL(raw, SCOPE); if (options.ignoreSearch) url.search = '';
    return url.href;
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const rows = stores.get(name);
      return {
        async addAll(urls) {
          for (const item of urls) {
            const key = keyOf(item);
            if (key.endsWith('/index.html')) rows.set(key, new Response('<html>FIXTURE RACE SHELL</html>', { headers: { 'Content-Type': 'text/html' } }));
          }
        },
        async match(input, options) { return rows.get(keyOf(input, options))?.clone(); },
        async put(input, response) { rows.set(keyOf(input), response.clone()); },
        async delete(input) { return rows.delete(keyOf(input)); },
        async keys() { return [...rows.keys()].map(url => new Request(url)); },
      };
    },
    async match(input, options) {
      for (const rows of stores.values()) { const hit = rows.get(keyOf(input, options)); if (hit) return hit.clone(); }
      return undefined;
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: { origin: new URL(SCOPE).origin },
    registration: { scope: SCOPE },
    addEventListener(type, fn) { listeners.set(type, fn); },
    skipWaiting() {}, clients: { claim: async () => {} },
  };
  const fetchFake = (input, init) => fetcher(new URL(typeof input === 'string' ? input : input.url), init);
  vm.runInNewContext(SOURCE, { self, caches, URL, Request, Response, Headers, fetch: fetchFake, setTimeout, clearTimeout });
  return {
    async install() { let pending; listeners.get('install')({ waitUntil(p) { pending = p; } }); await pending; },
    async dispatch(pathname, mode = 'navigate') {
      const request = { url: new URL(pathname, SCOPE).href, method: 'GET', mode, headers: new Headers({ Accept: 'text/html,application/xhtml+xml,application/json' }) };
      let responsePromise; const waits = [];
      listeners.get('fetch')({ request, respondWith(p) { responsePromise = p; }, waitUntil(p) { waits.push(p); } });
      if (!responsePromise) return { intercepted: false };
      const response = await responsePromise;
      await Promise.all(waits);
      return { intercepted: true, response };
    },
    async cachedShell() { return (await (await caches.open(STATIC)).match(new URL('index.html', SCOPE)))?.text() ?? null; },
    async seedShell(response) { await (await caches.open(STATIC)).put(new URL('index.html', SCOPE), response); },
    async cachedUrls() { return [...stores.values()].flatMap(rows => [...rows.keys()]); },
  };
}

(async () => {
  await check('les chemins de récupération, config et manifeste ne sont jamais interceptés/cachés', async () => {
    const h = harness(async url => new Response(url.pathname.endsWith('drive-config.json') ? '{"fixture":true}' : '<html>RECOVERY</html>', {
      headers: { 'Content-Type': url.pathname.endsWith('.json') ? 'application/json' : 'text/html', 'Cache-Control': 'no-store' },
    }));
    await h.install();
    const before = await h.cachedShell();
    for (const path of ['recovery', 'recovery.html', 'drive-config.json', 'fixture-manifest.json']) {
      const result = await h.dispatch(path);
      assert.equal(result.intercepted, false, path + ' should pass straight through to network');
    }
    assert.equal(await h.cachedShell(), before, 'sensitive route must not overwrite index.html');
    const cached = await h.cachedUrls();
    for (const route of ['recovery', 'recovery.html', 'drive-config.json', 'fixture-manifest.json'])
      assert.equal(cached.some(url => new URL(url).pathname.endsWith('/' + route)), false, route + ' must not be in CacheStorage');
  });

  await check('seuls root, /index et /index.html utilisent le shell hors ligne', async () => {
    const h = harness(); await h.install();
    for (const path of ['./', 'index', 'index.html']) {
      const result = await h.dispatch(path);
      assert.equal(result.intercepted, true, path);
      assert.match(await result.response.text(), /FIXTURE RACE SHELL/, path);
    }
    for (const path of ['other', 'other.html', 'fixture-manifest.json', 'drive-config.json'])
      assert.equal((await h.dispatch(path)).intercepted, false, path + ' must not receive the shell fallback');
  });

  await check('un autre document HTML reste réseau seul; jamais le shell', async () => {
    const h = harness(); await h.install();
    const result = await h.dispatch('other.html', 'cors');
    assert.equal(result.intercepted, true);
    assert.equal(result.response.status, 503);
    assert.match(await result.response.text(), /panne amont/);
  });

  await check('une réponse JSON 200 à un alias shell ne remplace pas le HTML en cache', async () => {
    const h = harness(async () => new Response('{"fixture":true}', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    await h.install();
    const result = await h.dispatch('index.html');
    assert.match(await result.response.text(), /FIXTURE RACE SHELL/);
    assert.match(await h.cachedShell(), /FIXTURE RACE SHELL/);
  });

  await check('un ancien cache index empoisonné par JSON ne sert plus de shell', async () => {
    const h = harness(); await h.install();
    await h.seedShell(new Response('{"approved":true}', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
    const result = await h.dispatch('index.html');
    assert.equal(result.response.status, 503);
    assert.match(await result.response.text(), /panne amont/);
    assert.match(await h.cachedShell(), /approved/); // laissé en place, mais filtré de toute réponse de shell
  });

  await check('une redirection HTML externe ou vers une autre page ne remplace jamais le shell hors ligne', async () => {
    for (const finalUrl of ['https://outside.invalid/login', SCOPE + 'signin.html']) {
      const h = harness(async () => {
        const response = new Response('<html>PAGE NON AUTORISÉE</html>', { headers: { 'Content-Type': 'text/html' } });
        Object.defineProperty(response, 'url', { value: finalUrl });
        return response;
      });
      await h.install();
      const result = await h.dispatch('index.html');
      assert.equal(result.intercepted, true);
      assert.match(await result.response.text(), /FIXTURE RACE SHELL/, finalUrl + ' must fall back to the known shell');
      assert.match(await h.cachedShell(), /FIXTURE RACE SHELL/, finalUrl + ' must not poison CacheStorage');
    }
  });

  console.log(`${checks}/${checks} scénarios SW OK · CacheStorage et réseau simulés`);
})().catch(error => { console.error(error); process.exitCode = 1; });
