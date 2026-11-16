// Lot A (audit du 15/11/2026, constat F2) · démarrage du coffre en « fail closed » dans le vrai build. Profil et code FICTIFS.
// Invariant : si l'ouverture du coffre échoue (ici : verrou inter-onglets refusé par le navigateur), l'application ne démarre PAS
// sur le stockage brut à côté du coffre ; un message explique la situation et propose un parcours non destructif (recharger,
// télécharger la copie brute chiffrée). Le stockage brut reste identique à l'octet ; une fois le défaut levé, le code rouvre tout.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
const AT = '2026-11-16T08:00:00+01:00';
let checks = 0; const ok = (label, cond, detail) => { assert(cond, label + (detail ? ' · ' + String(detail).slice(0, 300) : '')); checks++; console.log('✅ ' + label); };
const dump = p => p.evaluate(() => { const r = window.TWRC_RAW_STORAGE || window.localStorage, o = {}; for (let i = 0; i < r.length; i++) { const k = r.key(i); o[k] = r.getItem(k); } return o; });
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      // 1. Profil fictif chiffré, créé par le vrai parcours (déverrouillage avec le code de test).
      const a = await session(b, { at: AT, dev, unlock: true });
      const before = await dump(a.p); await a.c.close();
      ok(dev + ' · profil fictif chiffré présent', typeof before['twrc.vault.v2'] === 'string' && before['twrc.vault.v2'].length > 100);
      const secretsBefore = Object.keys(before).filter(k => k.startsWith('twrc.') && !['twrc.vault.v2', 'twrc.lock.signal', 'twrc.view'].includes(k) && !/^twrc\.(reload\.|weather\.limit|tripmap|nocode|presetv|outfit)/.test(k));
      // 2. Même profil, verrou refusé par le navigateur au démarrage suivant.
      const s = await session(b, { at: AT, dev, unlock: false, seed: before });
      await s.c.addInitScript(() => { Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: () => Promise.reject(new DOMException('refus fictif', 'SecurityError')) } }); });
      await s.p.reload(); await s.p.clock.runFor(2500); await s.p.waitForTimeout(400);
      const state = await s.p.evaluate(() => ({ started: !document.getElementById('twrc-app'), halt: (document.getElementById('twrc-boot-halt') || {}).innerText || '',
        buttons: [...document.querySelectorAll('#twrc-boot-halt button')].map(x => x.textContent) }));
      ok(dev + ' · application non démarrée sur le stockage brut', state.started === false, JSON.stringify(state));
      ok(dev + ' · message clair et parcours non destructif', /coffre/i.test(state.halt) && /rien n’a été modifié/i.test(state.halt) && state.buttons.length === 2, JSON.stringify(state));
      const after = await dump(s.p); delete after['e2e.seeded']; const ref = { ...before }; delete ref['e2e.seeded'];
      ok(dev + ' · stockage brut identique à l’octet (coffre, signal, préférences)', JSON.stringify(after) === JSON.stringify(ref), Object.keys(after).filter(k => after[k] !== ref[k]).join(', '));
      const secretsAfter = Object.keys(after).filter(k => k.startsWith('twrc.') && !['twrc.vault.v2', 'twrc.lock.signal', 'twrc.view'].includes(k) && !/^twrc\.(reload\.|weather\.limit|tripmap|nocode|presetv|outfit)/.test(k));
      ok(dev + ' · aucune donnée personnelle écrite en clair', JSON.stringify(secretsAfter) === JSON.stringify(secretsBefore), secretsAfter.join(', '));
      // Copie brute téléchargée = octets exacts du coffre (copie de récupération lisible avec le code).
      const [dl] = await Promise.all([s.p.waitForEvent('download'), s.p.click('#twrc-boot-halt button[data-halt="copie"]')]);
      const bytes = await new Promise((res, rej) => { const st = []; dl.createReadStream().then(r => { r.on('data', d => st.push(d)); r.on('end', () => res(Buffer.concat(st).toString('utf8'))); r.on('error', rej); }, rej); });
      ok(dev + ' · copie brute téléchargée identique au coffre', bytes === before['twrc.vault.v2'] && /\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
      await s.c.close();
      // 3. Défaut levé : le même profil se rouvre avec le code, rien n'a été perdu.
      const r = await session(b, { at: AT, dev, unlock: true, seed: before });
      const back = await r.p.evaluate(() => ({ mode: window.TWRC_VAULT && window.TWRC_VAULT.mode, configured: typeof S === 'object' && !!S.configured, settings: (localStorage.getItem('twrc.settings.v1') || '').length }));
      ok(dev + ' · défaut levé : coffre rouvert avec le code, profil intact', back.mode === 'vault' && back.configured && back.settings > 20, JSON.stringify(back));
      await r.c.close();
    }
    assert.deepEqual(errors.filter(e => !/refus fictif|SecurityError/.test(e)), [], 'aucune erreur JavaScript inattendue');
    console.log(`\n${checks}/${checks} contrôles OK · erreurs JS : aucune`);
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
