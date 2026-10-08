// Import d'une sauvegarde : le journal des trajets (ressenti conducteur) du téléphone n'est jamais effacé.
// Incident du 7 octobre 2026 : débrief du matin donné, import d'une sauvegarde V1 (réglages seuls) → le contexte était
// vidé, le trajet du matin redevenait « à débriefer ». Ici : vrai fichier chiffré, vrai import, rechargement, iPhone et PC.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/', BR = require('./lib/browser');
let fail = 0; const rows = [], errors = [];
const check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 400))); if (!ok) fail++; };
const VP = { iphone: { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, pc: { viewport: { width: 1280, height: 800 } } };
// même format que l'app : PBKDF2-SHA256 → AES-256-GCM (étiquette en fin de texte chiffré)
function seal(data) {
  const s = crypto.randomBytes(16), i = crypto.randomBytes(12), it = 600000, k = crypto.pbkdf2Sync(PW, s, it, 32, 'sha256');
  const e = crypto.createCipheriv('aes-256-gcm', k, i), c = Buffer.concat([e.update(JSON.stringify(data)), e.final(), e.getAuthTag()]);
  return Buffer.from(JSON.stringify({ app: 'twrc-backup', v: data.v, kdf: 'PBKDF2-SHA256', it, s: s.toString('base64'), i: i.toString('base64'), c: c.toString('base64') }));
}

async function session(b, dev, T0) {
  const ctx = { console, Math, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } }, Intl, Map, Set, JSON };
  vm.createContext(ctx); vm.runInContext(src + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
  const c = await b.newContext({ ...VP[dev], timezoneId: 'Europe/Paris', locale: 'fr-FR' });
  const p = await c.newPage(); await p.clock.install({ time: T0 });
  p.dialogs = []; p.on('dialog', d => { p.dialogs.push(d.message()); d.accept(); });
  p.on('pageerror', e => errors.push(dev + ' · ' + e.message));
  await p.route('**/*', r => {
    const u = r.request().url(), J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.includes('open-meteo.com')) {
      const q = new URL(u).searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(',');
      const one = i => ctx.mk('doux', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
      if (lats.length > 1) return J(lats.map((_, i) => one(i)));
      const base = one(0); return J(u.includes('ensemble') ? ctx.me(base) : q.get('minutely_15') ? ctx.mn(base) : u.includes('air-quality') ? {} : base);
    }
    if (u.includes('/race-control/obs.json')) return J({ stations: {} });
    if (u.includes('/race-control/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (u.startsWith(U) && !/\.(js|json)$/.test(new URL(u).pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();
  });
  const settle = async (n = 14) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await p.waitForTimeout(80); } };
  const unlock = async () => { if (await p.$('#unlockPw')) { await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); } await settle(); };
  await p.goto(U); await p.clock.runFor(2500); await unlock();
  return { p, c, settle, unlock };
}

(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const T0 = Date.parse('2026-10-07T12:20:00+02:00'), s = await session(b, dev, T0), p = s.p;
      const key = 'work-2026-10-07|aller', at = Date.parse('2026-10-07T07:12:00+02:00');
      // débrief du matin donné sur ce téléphone, trajet clos
      await p.evaluate(({ key, at }) => {
        USER_STORE.state.debrief.entries.unshift({ key, at, how: 'auto', name: 'Aller travail', from: 'home', to: 'work',
          feedback: { at: at + 8 * 60e3, conditions: ['wet'], grip: 'normal' }, deferred: false });
        USER_STORE.state.done[key] = { how: 'auto', at, exp: at + 24 * 3600e3 }; USER_STORE.flush();
      }, { key, at });
      // sauvegarde V1 (réglages seuls), comme celle exportée par une ancienne version de l'app
      const settings = await p.evaluate(() => JSON.parse(JSON.stringify(S)));
      const file = seal({ app: 'twrc', v: 1, at: new Date(T0 - 3600e3).toISOString(), settings, view: 'analyse' });
      await p.evaluate(() => { const d = document.getElementById('settings'); d.open = true; renderSettings(true); });
      if (await p.$('#bkPw')) await p.fill('#bkPw', PW);
      await Promise.all([p.waitForNavigation({ timeout: 60000 }), (async () => { await p.setInputFiles('#bkFile', { name: 'race-control-sauvegarde-v1.json', mimeType: 'application/json', buffer: file }); for (let i = 0; i < 20; i++) { await p.clock.runFor(500); await p.waitForTimeout(100); } })()]);
      await s.unlock();
      check(dev + ' · confirmation : le journal conservé est annoncé avant l’import', p.dialogs.some(m => /Journal des trajets conservé : 1 trajet de ce téléphone gardé/.test(m)), p.dialogs.join(' | '));
      const st = await p.evaluate(key => {
        const e = USER_STORE.state.debrief.entries.find(x => x.key === key);
        return { e: e ? { grip: e.feedback && e.feedback.grip, cond: e.feedback && e.feedback.conditions } : null, done: !!USER_STORE.state.done[key],
          pending: USER_STORE.state.debrief.entries.filter(x => !x.feedback && !x.deferred).map(x => x.key),
          form: !!document.querySelector('#secDebrief .debrief-form'), gps: USER_STORE.state.gps };
      }, key);
      check(dev + ' · après import V1 et rechargement : la réponse du matin est toujours là', !!st.e && st.e.grip === 'normal' && JSON.stringify(st.e.cond) === '["wet"]', JSON.stringify(st));
      check(dev + ' · le trajet du matin reste clos : aucun débrief redemandé', st.done && !st.pending.includes(key) && !st.form, JSON.stringify(st));
      check(dev + ' · l’état propre à l’appareil repart de zéro (aucun GPS restauré)', st.gps == null, JSON.stringify(st.gps));
      // Un refus au milieu de l'import ne peut annoncer une réussite ni mélanger les états.
      // Le rechargement referme ce panneau : le rouvrir par l'interface avant les actions suivantes.
      if (!await p.$eval('#settings', d => d.open)) await p.click('#settings > summary');
      await p.evaluate(() => {
        S.cars[0].name = 'Véhicule local fictif'; markEdit('cars.0.name'); saveSettings(); USER_STORE.flush();
        window.storageBeforeImport = { settings: localStorage.getItem('twrc.settings.v1'), context: localStorage.getItem('twrc.context.v1') };
        window.originalStorageSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function(k, v) {
          if (k === 'twrc.context.v1' && this.getItem(DeviceStorage.PENDING)) throw new DOMException('Test quota', 'QuotaExceededError');
          return window.originalStorageSet.call(this, k, v);
        };
        renderSettings(true);
      });
      const badSettings = { ...settings, cars: settings.cars.map((c, i) => i ? c : { ...c, name: 'Import fictif refusé' }) };
      const failedFile = seal({ app: 'twrc', v: 2, at: new Date(T0).toISOString(), settings: badSettings, durable: { context: { debrief: { entries: [] } } } });
      await p.setInputFiles('#bkFile', { name: 'import-refuse.json', mimeType: 'application/json', buffer: failedFile });
      await s.settle(20);
      const failedImport = await p.evaluate(() => {
        const status = document.getElementById('bkMsg').textContent;
        const out = { status, settingsOk: localStorage.getItem('twrc.settings.v1') === window.storageBeforeImport.settings,
          contextOk: localStorage.getItem('twrc.context.v1') === window.storageBeforeImport.context, pending: localStorage.getItem(DeviceStorage.PENDING) };
        Storage.prototype.setItem = window.originalStorageSet;
        return out;
      });
      check(dev + ' · quota pendant import : échec annoncé sans faux succès', /Import non appliqué/.test(failedImport.status) && !/restaurée/.test(failedImport.status), JSON.stringify(failedImport));
      check(dev + ' · quota pendant import : réglages et journal précédents intacts', failedImport.settingsOk && failedImport.contextOk && !failedImport.pending, JSON.stringify(failedImport));
      // Vrai clic sur Verrouiller : plus aucune copie lisible, puis récupération avec le code fictif.
      await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('[data-act="lock"]')]);
      await s.settle();
      const locked = await p.evaluate(() => ({ locked: LOCKED(), settings: localStorage.getItem('twrc.settings.v1'),
        context: localStorage.getItem('twrc.context.v1'), code: localStorage.getItem('twrc.key'), vault: !!localStorage.getItem(DeviceStorage.VAULT),
        name: S.cars[0].name, body: document.body.innerText }));
      check(dev + ' · verrouillage : réglages, journal et code retirés des copies lisibles', locked.locked && locked.vault && !locked.settings && !locked.context && !locked.code, JSON.stringify({ ...locked, body: undefined }));
      check(dev + ' · verrouillage : véhicule et journal personnels masqués', locked.name !== 'Véhicule local fictif' && !locked.body.includes('Véhicule local fictif'), locked.name);
      await s.unlock();
      const restored = await p.evaluate(key => ({ name: S.cars[0].name,
        grip: USER_STORE.state.debrief.entries.find(e => e.key === key)?.feedback?.grip,
        done: !!USER_STORE.state.done[key], locked: LOCKED(), vault: !!localStorage.getItem(DeviceStorage.VAULT) }), key);
      check(dev + ' · déverrouillage : réglage local et réponse du matin récupérés', restored.name === 'Véhicule local fictif' && restored.grip === 'normal' && restored.done && !restored.locked && !restored.vault, JSON.stringify(restored));
      await s.c.close();
    }
  } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' | '));
  console.log(rows.join('\n')); console.log(`${rows.length - fail}/${rows.length} scénarios OK`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(rows.join('\n')); console.error('❌', e); process.exit(1); });
