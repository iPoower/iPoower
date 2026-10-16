'use strict';
// Deux VRAIS onglets partagent un coffre chiffré et navigator.locks. Tout le
// réseau et les profils sont fictifs ; aucun accès au site de production.
const fs = require('node:fs'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { session, U, errors } = require('./context-session');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), T = Date.parse('2026-10-16T12:00:00Z');
const CONTEXT = 'twrc.context.v1', VAULT = 'twrc.vault.v2';
const rows = Array.from({ length: 120 }, (_, i) => ({ key: 'preservation-' + i, how: 'confirmé', name: 'Trajet fictif ' + i, from: 'Lieu A', to: 'Lieu B',
  at: T - (i === 0 ? 365 : i === 1 ? 91 : 1) * 86400000 - i * 1000,
  feedback: { at: T - 1000, conditions: ['wet'], grip: 'normal' },
  start: { key: 'preservation-' + i, at: T - (i === 0 ? 365 : i === 1 ? 91 : 1) * 86400000 - i * 1000 - 60000,
    car: 'Véhicule fictif', prediction: { known: true, conditions: ['wet'], fetchedAt: T - (i === 0 ? 365 : i === 1 ? 91 : 1) * 86400000 - i * 1000 - 120000 } } }));
const opaque = { key: 'opaque-fiction', futureField: 'source non affichable conservée' };
const sources = [...rows, { ...rows[2], start: null, feedback: { at: T - 500, conditions: ['fog'], grip: 'slip' } }, opaque];
function legacyVault(settings) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), n = 1, t = T;
  const key = crypto.pbkdf2Sync(PW, salt, 600000, 32, 'sha256');
  const values = { 'twrc.key': PW, 'twrc.settings.v1': JSON.stringify(settings), [CONTEXT]: JSON.stringify({ v: 1, debrief: { entries: sources } }) };
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv), bytes = Buffer.concat([cipher.update(JSON.stringify({ v: 2, n, t, values })), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ v: 2, n, t, kdf: 'PBKDF2-SHA256', it: 600000, s: salt.toString('base64'), i: iv.toString('base64'), c: bytes.toString('base64') });
}
async function settingsPanel(p) { await p.evaluate(() => { document.getElementById('settings').open = true; renderSettings(true); }); }
async function wait(p, n = 6) { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await p.waitForTimeout(80); } }
async function opened(p) {
  await wait(p);
  if (await p.locator('#unlockPw').count()) {
    await p.fill('#unlockPw', PW);
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
    await wait(p);
  }
  await p.waitForFunction(() => typeof USER_STORE !== 'undefined' && !!USER_STORE.state);
}
const canonicalRows = p => p.evaluate(() => ({
  entries: USER_STORE.state.debrief.entries,
  archive: JSON.parse(localStorage.getItem(JournalArchive.KEY) || 'null'),
  version: JSON.parse(window.TWRC_RAW_STORAGE.getItem(SessionVault.VAULT)).v
}));
module.exports = async function run(b) {
  let n = 0; const check = async (name, fn) => { await fn(); n++; console.log('✅ navigateurs conservation : ' + name); };
  // Les réglages proviennent exclusivement du preset.fake.json du build CI.
  const probe = await session(b, { at: T, dev: 'iphone' });
  const settings = await probe.p.evaluate(() => JSON.parse(JSON.stringify(S))); await probe.c.close();
  await check('profil sans coffre : journal en lecture seule, export chiffré puis activation après sélection du fichier', async () => {
    const html = fs.readFileSync('site/index.html', 'utf8');
    const version = JSON.parse(/window\.TWRC_SEALED_V=("[^"]+")/.exec(html)[1]);
    const plain = await session(b, { at: T, dev: 'iphone', unlock: false, seed: {
      'twrc.plain': JSON.stringify(settings), 'twrc.plain.v': version,
      [CONTEXT]: JSON.stringify({ v: 1, debrief: { entries: sources } })
    } });
    try {
      assert.equal(await plain.p.evaluate(() => TWRC_VAULT.mode), 'plain');
      const before = await plain.p.evaluate(() => TWRC_RAW_STORAGE.getItem(JournalArchive.CONTEXT));
      await settingsPanel(plain.p); await plain.p.fill('#bkPw', PW);
      const [file] = await Promise.all([plain.p.waitForEvent('download'), plain.p.click('[data-act=bk-export]')]);
      const bytes = fs.readFileSync(await file.path());
      assert.equal(await plain.p.evaluate(() => TWRC_RAW_STORAGE.getItem(JournalArchive.CONTEXT)), before);
      assert(!bytes.toString().includes('Lieu A')); assert(!bytes.toString().includes(PW));
      await Promise.all([plain.p.waitForNavigation({ timeout: 60000 }), (async () => {
        await plain.p.setInputFiles('#journalCopy', { name: 'profil-sans-code.json', mimeType: 'application/json', buffer: bytes }); await wait(plain.p, 16);
      })()]); await opened(plain.p);
      const restored = await canonicalRows(plain.p); assert.equal(restored.version, 3); assert.equal(restored.entries.length, 120);
      assert(await plain.p.evaluate(input => input.every(r => JSON.parse(localStorage.getItem(JournalArchive.KEY)).records.includes(JournalArchive.encode(r))), sources));
    } finally { await plain.c.close(); }
  });
  const seed = { [VAULT]: legacyVault(settings) };
  const s = await session(b, { at: T, dev: 'iphone', seed }), p = s.p;
  p.on('dialog', d => d.accept());
  try {
    await check('ancien profil : 120 trajets affichables, 91/365 jours ; aucune migration implicite', async () => {
      const state = await p.evaluate(() => ({ count: USER_STORE.state.debrief.entries.length, needs: TWRC_VAULT.journalNeedsRecovery,
        v: JSON.parse(TWRC_RAW_STORAGE.getItem(SessionVault.VAULT)).v, source: JSON.parse(TWRC_RAW_STORAGE.getItem(SessionVault.VAULT)).c }));
      assert.equal(state.count, 120); assert(state.needs); assert.equal(state.v, 2);
      await p.evaluate(() => { window.beforeMigration = TWRC_RAW_STORAGE.getItem(SessionVault.VAULT); });
      await settingsPanel(p);
    });
    const [download] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=bk-export]')]);
    const copy = fs.readFileSync(await download.path());
    await check('fichier externe chiffré ; sélection incorrecte refusée sans écriture', async () => {
      assert(!copy.toString().includes('Lieu A')); assert(!copy.toString().includes(PW));
      await p.setInputFiles('#journalCopy', { name: 'mauvaise-copie.json', mimeType: 'application/json', buffer: Buffer.concat([copy, Buffer.from(' ')]) });
      await wait(p);
      assert.match(await p.locator('#bkMsg').textContent(), /Activation refusée/);
      assert(await p.evaluate(() => TWRC_RAW_STORAGE.getItem(SessionVault.VAULT) === beforeMigration));
    });
    await check('quota pendant activation : copie et coffre source intacts', async () => {
      await p.evaluate(() => {
        window.storageSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function(k, v) { if (k === SessionVault.VAULT) throw new DOMException('Quota fictif', 'QuotaExceededError'); return storageSet.call(this, k, v); };
      });
      await p.setInputFiles('#journalCopy', { name: 'copie-verifiee.json', mimeType: 'application/json', buffer: copy }); await wait(p);
      assert.match(await p.locator('#bkMsg').textContent(), /Activation refusée/);
      assert(await p.evaluate(() => TWRC_RAW_STORAGE.getItem(SessionVault.VAULT) === beforeMigration));
      await p.evaluate(() => { Storage.prototype.setItem = storageSet; });
    });
    await check('activation après réouverture exacte ; ancien lecteur bloqué ; sources intégrales conservées', async () => {
      await Promise.all([p.waitForNavigation({ timeout: 60000 }), (async () => {
        await p.setInputFiles('#journalCopy', { name: 'copie-verifiee.json', mimeType: 'application/json', buffer: copy }); await wait(p, 12);
      })()]); await opened(p);
      const state = await canonicalRows(p); assert.equal(state.entries.length, 120); assert.equal(state.version, 3);
      const intact = await p.evaluate(input => input.every(r => JSON.parse(localStorage.getItem(JournalArchive.KEY)).records.includes(JournalArchive.encode(r))), sources);
      assert(intact, 'comparaison aux sources avant projection');
      assert(await p.evaluate(() => !TWRC_VAULT.journalNeedsRecovery));
    });
    const q = await s.c.newPage(); await q.clock.install({ time: T }); q.on('dialog', d => d.accept());
    await q.goto(U); await opened(q);
    // Retarder réellement les notifications entre les deux pages : le verrou
    // et la fusion sur disque doivent suffire, sans timing favorable des events.
    for (const page of [p, q]) await page.evaluate(() => {
      window.addEventListener('storage', e => e.stopImmediatePropagation(), true);
    });
    await check('deux vrais onglets : ajouts distincts et deux réponses au même trajet, notifications bloquées', async () => {
      await Promise.all([p, q].map((page, i) => page.evaluate(async i => {
        USER_STORE.transaction(state => {
          state.debrief = Debrief.close(state.debrief, { key: 'vrai-onglet-' + i, how: 'confirmé' });
          state.debrief = Debrief.reply(state.debrief, 'preservation-2', { conditions: i ? ['ice'] : ['rain'], grip: i ? 'reduced' : 'normal' });
        });
        await TWRC_VAULT.flush(); if (TWRC_VAULT.error || TWRC_VAULT.pendingWrites) throw new Error('Écriture non confirmée');
      }, i)));
      await q.close(); await p.reload(); await opened(p);
      const state = await canonicalRows(p); assert.equal(state.entries.length, 122);
      const replies = new Set(state.archive.records.map(r => JSON.parse(r)).filter(r => r && r.key === 'preservation-2' && r.feedback).map(r => JSON.stringify(r.feedback)));
      assert.equal(replies.size, 4);
      assert(await p.evaluate(input => input.every(r => JSON.parse(localStorage.getItem(JournalArchive.KEY)).records.includes(JournalArchive.encode(r))), sources));
    });
    await check('quota : ajout non confirmé, alerte et coffre précédent inchangé ; rechargement exhaustif', async () => {
      const before = await p.evaluate(() => TWRC_RAW_STORAGE.getItem(SessionVault.VAULT));
      await p.evaluate(async () => {
        window.storageSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function(k, v) { if (k === SessionVault.VAULT) throw new DOMException('Quota fictif', 'QuotaExceededError'); return storageSet.call(this, k, v); };
        USER_STORE.transaction(state => { state.debrief = Debrief.close(state.debrief, { key: 'ajout-refuse', how: 'auto' }); });
        await TWRC_VAULT.flush();
      });
      assert(await p.evaluate(() => !!TWRC_VAULT.error));
      assert.equal(await p.evaluate(() => TWRC_RAW_STORAGE.getItem(SessionVault.VAULT)), before);
      // Aucun succès n'a été annoncé : simuler la disparition de cette page.
      const replacement = await s.c.newPage(); await replacement.clock.install({ time: T });
      await replacement.goto(U); await opened(replacement);
      assert.equal((await canonicalRows(replacement)).entries.length, 122); await replacement.close();
      await p.evaluate(() => { Storage.prototype.setItem = storageSet; });
      await p.reload(); await opened(p); // l'ajout refusé n'est pas confirmé après fermeture
    });
    await check('interruption pendant WebCrypto : aucun commit partiel, toutes les sources durables après réouverture', async () => {
      const crash = await s.c.newPage(); await crash.clock.install({ time: T }); await crash.goto(U); await opened(crash);
      const before = await p.evaluate(() => TWRC_RAW_STORAGE.getItem(SessionVault.VAULT));
      await crash.evaluate(() => {
        crypto.subtle.encrypt = () => new Promise(() => {});
        USER_STORE.transaction(state => { state.debrief = Debrief.close(state.debrief, { key: 'interruption-avant-commit', how: 'auto' }); });
      });
      await crash.close();
      assert.equal(await p.evaluate(() => TWRC_RAW_STORAGE.getItem(SessionVault.VAULT)), before);
      await p.reload(); await opened(p); assert.equal((await canonicalRows(p)).entries.length, 122);
    });
    let exported, expected;
    await check('export complet : fichier opaque et projection limitée à 60 sans troncature de l’archive', async () => {
      await settingsPanel(p);
      const [file] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=bk-export]')]);
      exported = fs.readFileSync(await file.path()); expected = await canonicalRows(p);
      assert(!exported.toString().includes('Lieu A')); assert(!exported.toString().includes(PW));
      await p.evaluate(() => renderDebrief()); assert.equal(await p.locator('#secDebrief .debrief-entry').count(), 60);
    });
    await check('fichier récupéré sur un nouveau profil : import vérifié, rechargement, journal et versions identiques', async () => {
      const target = await session(b, { at: T, dev: 'iphone' }); target.p.on('dialog', d => d.accept());
      try {
        await settingsPanel(target.p); await target.p.fill('#bkPw', PW);
        await Promise.all([target.p.waitForNavigation({ timeout: 60000 }), (async () => {
          await target.p.setInputFiles('#bkFile', { name: 'copie-complete.json', mimeType: 'application/json', buffer: exported }); await wait(target.p, 20);
        })()]); await opened(target.p);
        const restored = await canonicalRows(target.p);
        assert.deepEqual(restored.entries, expected.entries);
        assert(expected.archive.records.every(r => restored.archive.records.includes(r)));
        assert.equal(restored.archive.records.length, expected.archive.records.length);
      } finally { await target.c.close(); }
    });
    assert.equal(errors.length, 0, 'erreurs JavaScript réelles');
  } finally { await s.c.close(); }
  console.log(`${n}/${n} scénarios OK`);
};
