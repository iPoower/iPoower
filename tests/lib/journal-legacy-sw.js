'use strict';
// Frontière entre lecteurs avec un VRAI SW et un cache hors ligne.
// Fixture de composant ; aucun essai sur une installation iOS physique.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const read = name => fs.readFileSync(path.join(__dirname, '../../src/' + name + '.js'), 'utf8');
const VAULT = 'twrc.vault.v2', CONTEXT = 'twrc.context.v1', PASS = 'pwa-journal-fiction-only';
const rows = Array.from({ length: 120 }, (_, i) => ({ key: 'pwa-fiction-' + i, at: Date.now() - (i === 0 ? 365 : i === 1 ? 91 : 1) * 86400000 - i,
  how: 'confirmé', from: 'Lieu A', to: 'Lieu B', feedback: { at: Date.now() - 1000, conditions: ['wet'], grip: 'normal' } }));
function seed() {
  const values = { 'twrc.key': PASS, [CONTEXT]: JSON.stringify({ v: 1, debrief: { entries: rows } }) };
  const s = crypto.randomBytes(16), i = crypto.randomBytes(12), key = crypto.pbkdf2Sync(PASS, s, 600000, 32, 'sha256'), n = 1, t = Date.now();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, i), c = Buffer.concat([cipher.update(JSON.stringify({ v: 2, n, t, values })), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ v: 2, n, t, kdf: 'PBKDF2-SHA256', it: 600000, s: s.toString('base64'), i: i.toString('base64'), c: c.toString('base64') });
}
function html(old) {
  const source = old ? require('./legacy-vault-fixture').source : read('journal-archive') + '\n' + read('session-vault');
  return '<!doctype html><meta charset="utf-8"><p id="reader-version">' + (old ? 'prod-124' : 'candidat-v3') + '</p><script>' + source + `
    window.reader = SessionVault.create({ raw: localStorage, session: sessionStorage, crypto, target: window });
    window.readerReady = false; reader.boot().then(() => { window.readerReady = true; });
    addEventListener('storage', e => reader.onStorage(e));
  </script>`;
}
module.exports = async browser => {
  const oldHtml = html(true), candidate = html(false);
  const sw = `addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open('fixture-legacy-reader').then(c => c.add('./'))); });
    addEventListener('activate', e => e.waitUntil(clients.claim()));
    addEventListener('fetch', e => { if (new URL(e.request.url).pathname === '/journal-legacy/') e.respondWith(caches.open('fixture-legacy-reader').then(c => c.match('./')).then(r => r || fetch(e.request))); });`;
  const server = http.createServer((req, res) => {
    const rel = new URL(req.url, 'http://localhost').pathname;
    if (!['/journal-legacy/', '/journal-legacy/candidate.html', '/journal-legacy/sw.js'].includes(rel)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': rel.endsWith('.js') ? 'text/javascript' : 'text/html', 'cache-control': 'no-store' });
    res.end(rel.endsWith('sw.js') ? sw : rel.endsWith('candidate.html') ? candidate : oldHtml);
  });
  let context;
  try {
    const port = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port))), base = 'http://localhost:' + port + '/journal-legacy/';
    context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true });
    const errors = []; context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    await context.addInitScript(({ name, value }) => {
      // newPage passe par about:blank : son origine opaque n’a pas de stockage.
      // Ne pas masquer une erreur sur l’origine localhost réellement testée.
      if (location.protocol !== 'http:') return;
      if (!localStorage.getItem('fixture.legacy.seeded')) { localStorage.setItem('fixture.legacy.seeded', '1'); localStorage.setItem(name, value); }
    }, { name: VAULT, value: seed() });
    const old = await context.newPage(); await old.goto(base); await old.waitForFunction(() => window.readerReady);
    await old.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
    await old.reload(); await old.waitForFunction(() => window.readerReady && !!navigator.serviceWorker.controller);
    await old.evaluate(pass => reader.unlock(pass), PASS);
    const current = await context.newPage(); await current.goto(base + 'candidate.html'); await current.waitForFunction(() => window.readerReady);
    await current.evaluate(async pass => { await reader.unlock(pass); const file = await reader.recoverySnapshot(); await reader.activateJournal(file); }, PASS);
    await current.evaluate(async () => {
      const archive = JournalArchive.read(reader.store.getItem(JournalArchive.KEY));
      archive.records.push(JSON.stringify({ key: 'pwa-apres-activation', at: Date.now(), how: 'confirmé', from: 'Lieu A', to: 'Lieu B' }));
      reader.store.setItem(JournalArchive.KEY, JSON.stringify(archive)); await reader.flush(); if (reader.error) throw new Error(reader.error);
    });
    const before = await current.evaluate(() => localStorage.getItem('twrc.vault.v2')); assert.equal(JSON.parse(before).v, 3);
    assert(await old.evaluate(async () => { reader.store.setItem('twrc.settings.v1', '{"fiction":true}'); await reader.flush(); return !!reader.error; }));
    assert.equal(await old.evaluate(() => localStorage.getItem('twrc.vault.v2')), before);
    await context.setOffline(true);
    const cached = await context.newPage(); await cached.goto(base); await cached.waitForFunction(() => window.readerReady);
    assert.equal(await cached.locator('#reader-version').textContent(), 'prod-124'); assert.equal(await cached.evaluate(() => reader.mode), 'locked');
    assert(await cached.evaluate(async pass => { try { await reader.unlock(pass); return false; } catch (e) { return true; } }, PASS));
    assert.equal(await cached.evaluate(() => localStorage.getItem('twrc.vault.v2')), before);
    await old.close(); await cached.close(); await context.setOffline(false);
    await current.reload(); await current.waitForFunction(() => window.readerReady); await current.evaluate(pass => reader.unlock(pass), PASS);
    const restored = await current.evaluate(() => JournalArchive.read(reader.store.getItem(JournalArchive.KEY)).records.map(r => JSON.parse(r)));
    for (const row of rows) assert(restored.some(r => isDeepStrictEqual(r, row)));
    assert(restored.some(r => r.key === 'pwa-apres-activation')); assert.deepEqual(errors, [], 'erreurs JavaScript réelles de la fixture SW');
    console.log('✅ coffre v3 : ancien onglet réel et ancien lecteur en cache SW hors ligne bloqués ; retour candidat avec 121 sources intactes');
  } finally { if (context) await context.close(); await new Promise(resolve => server.close(resolve)); }
};
