// Mode Station PC et non-régression iPhone, vrais moteurs Chromium/WebKit, données exclusivement fictives.
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { BR, session, errors, U } = require('./lib/context-session');
let n = 0, stage = '', supplierAt = Date.parse('2026-10-12T08:00:00+02:00'), temp = 12;
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const click = (p, action) => p.locator('[data-act="' + action + '"]').click();
const sample = p => p.evaluate(() => ({ active: WX_STATION.active, mode: WX_STATION.snapshot && WX_STATION.snapshot.mode,
  fresh: WX_STATION.snapshot && WX_STATION.snapshot.fresh, T: WX_STATION.snapshot && WX_STATION.snapshot.current.T,
  expected: CX && wxDesk(wxInput()).current.T, hours: [...document.querySelectorAll('#stationHours [data-hour]')].map(x => x.dataset.hour),
  alerts: WX_STATION.history.alerts.length, events: WX_STATION.history.events.length, system: WX_STATION.system,
  note: (document.getElementById('stationPermission') || {}).textContent, js: window.__csp || [] }));
const wx = (o, kind) => {
  if (kind === 'now') return o;
  const delta = temp - (o.current.temperature_2m || 0);
  o.current.temperature_2m = temp; o.current.apparent_temperature = temp - 2;
  // Le fournisseur simulé date ses valeurs actuelles à l'heure locale de sa réponse.
  o.current.time = new Date(supplierAt + 2 * 3600e3).toISOString().slice(0, 16);
  for (const k of ['temperature_2m', 'apparent_temperature']) if (o.hourly[k]) o.hourly[k] = o.hourly[k].map(x => x == null ? null : x + delta);
  return o;
};
(async () => {
  const browser = await BR.launch(), report = { browser: BR.NAME, scenarios: [], limits: 'Veille et visibilité simulées ; aucun iPhone physique ni Windows réel' };
  try {
    const s = await session(browser, { at: '2026-10-12T08:00:00+02:00', dev: 'pc', wx, remember: true }), p = s.p;
    const before = await p.evaluate(() => ({ settings: JSON.stringify(S), view: UI.view,
      content: document.getElementById('secWx').innerHTML, tabs: [...document.querySelectorAll('#viewSeg [data-act="view"]')].map(x => x.dataset.v),
      rawKeys: Object.keys(window.TWRC_RAW_STORAGE).sort() }));
    const initialCalls = s.S.calls;
    await check('PC · station désactivée à l’ouverture, cinq onglets et accès discret', async () => {
      assert.equal((await sample(p)).active, false); assert.equal(before.tabs.length, 5);
      assert(await p.locator('[data-act="station-open"]').isVisible()); assert.equal(await p.locator('#wxStation').count(), 0);
    });
    await check('PC · ouverture par clic : température, ressenti, 12 heures et sources du moteur commun', async () => {
      await click(p, 'station-open'); const r = await sample(p); assert(r.active); assert.equal(r.T, r.expected); assert.equal(r.hours.length, 13);
      assert.equal(r.mode, 'LIVE'); assert.equal(s.S.calls, initialCalls);
      assert(await p.locator('#stationCurrent').innerText().then(t => /Ressenti/.test(t)));
      assert(await p.locator('#stationConditions').innerText().then(t => /Chaussée estimée/.test(t) && /Visibilité/.test(t)));
      assert(await p.locator('#stationSources').innerText().then(t => /Open-Meteo/.test(t) && /pas des observations/.test(t)));
    });
    await check('PC · quantité de neige du modèle affichée seulement lorsqu’elle existe', async () => {
      const modelBefore = await p.evaluate(() => {
        const m = M[UI.loc], x = m && m.hs[m.nowI]; if (!x) return null;
        const prior = x.snow; x.snow = .4; renderWeatherStation();
        return { prior, label: document.querySelector('#stationConditions').innerText };
      });
      assert(modelBefore && /Neige prévue/.test(modelBefore.label) && /0,4 cm\/h/.test(modelBefore.label));
      await p.evaluate(prior => { M[UI.loc].hs[M[UI.loc].nowI].snow = prior; renderWeatherStation(); }, modelBefore.prior);
    });
    await check('PC · 2560×1440, 1920×1080, 1280×800, 900×700 et petite fenêtre : aucun débordement', async () => {
      for (const [width, height] of [[2560, 1440], [1920, 1080], [1280, 800], [900, 700], [640, 650]]) {
        await p.setViewportSize({ width, height });
        const r = await p.evaluate(() => { const e = document.getElementById('wxStation'), b = e.getBoundingClientRect(); return { sw: e.scrollWidth, cw: e.clientWidth, left: b.left, right: b.right, W: innerWidth }; });
        assert(r.sw <= r.cw + 1 && r.left >= 0 && r.right <= r.W, JSON.stringify(r));
        if (width === 1920) await p.screenshot({ path: path.join(process.env.SP, 'weather-watch-pc-' + BR.NAME + '.png') });
      }
      await p.setViewportSize({ width: 1280, height: 800 });
    });
    await check('PC · fermeture par Échap : vue, contenu et réglages identiques ; focus rendu au bouton', async () => {
      await p.keyboard.press('Escape'); assert.equal(await p.locator('#wxStation').count(), 0);
      const after = await p.evaluate(() => ({ settings: JSON.stringify(S), view: UI.view, content: document.getElementById('secWx').innerHTML,
        focus: document.activeElement.dataset.act, rawKeys: Object.keys(window.TWRC_RAW_STORAGE).sort() }));
      assert.equal(after.settings, before.settings); assert.equal(after.view, before.view); assert.equal(after.content, before.content);
      // WebKit finishes the native dialog focus restoration in a subsequent task.
      // Require actual focus on the original launcher rather than testing a race.
      await p.waitForFunction(() => document.activeElement?.dataset.act === 'station-open', null, { timeout: 2500 });
      assert.deepEqual(after.rawKeys, before.rawKeys);
    });
    await click(p, 'station-open');
    await check('PC · aucun prompt de permission à l’ouverture ; alertes et Windows OFF par défaut', async () => {
      const r = await sample(p); assert.equal(r.system, false); assert(r.note.includes('désactivées'));
      await p.evaluate(() => { window.__requests = 0; window.__notices = [];
        class N { static permission = 'default'; static requestPermission() { window.__requests++; N.permission = 'denied'; return Promise.resolve('denied'); } }
        Object.defineProperty(window, 'Notification', { configurable: true, value: N }); renderWeatherStation(); });
      assert.equal(await p.evaluate(() => __requests), 0);
    });
    await check('PC · permission refusée : pas de répétition du prompt, alertes visuelles toujours accessibles', async () => {
      await click(p, 'station-notifications'); assert.equal(await p.evaluate(() => __requests), 1);
      assert(await p.locator('[data-act="station-notifications"]').isDisabled()); assert((await sample(p)).note.includes('refusée'));
      await click(p, 'station-alerts'); assert((await sample(p)).note.includes('visuelles actives'));
    });
    await check('PC · notifications autorisées uniquement après clic explicite, messages sans lieu ni valeur privée', async () => {
      await p.evaluate(() => { class N { static permission = 'default'; static requestPermission() { window.__requests++; N.permission = 'granted'; return Promise.resolve('granted'); }
        constructor(title, options) { window.__notices.push({ title, ...options }); } close() {} }
        Object.defineProperty(window, 'Notification', { configurable: true, value: N }); renderWeatherStation(); });
      await click(p, 'station-notifications'); assert.equal(await p.evaluate(() => __requests), 2); assert((await sample(p)).system);
      temp = 2; supplierAt += 60000; await p.clock.setSystemTime(supplierAt);
      await p.evaluate(() => refreshAll()); await s.settle(4);
      const r = await sample(p); assert.equal(r.T, r.expected); assert(r.alerts >= 2);
      const notices = await p.evaluate(() => __notices); assert(notices.length >= 2);
      assert(notices.every(x => x.body === 'Un changement météorologique significatif a été détecté. Consulte Race Control.' && !/Maison|Travail|°C|trajet/i.test(x.body)));
    });
    await check('PC · données identiques : déduplication, composants et focus stables, pas de requêtes météo', async () => {
      const calls = s.S.calls, r = await p.evaluate(() => {
        const before = document.querySelector('#stationCurrent').firstElementChild, rows = WX_STATION.history.events.length, alerts = WX_STATION.history.alerts.length, notices = __notices.length;
        const field = document.getElementById('stationCooldown'); field.focus(); const started = performance.now();
        for (let i = 0; i < 40; i++) renderWeatherStation();
        return { stable: before === document.querySelector('#stationCurrent').firstElementChild, events: WX_STATION.history.events.length === rows,
          alerts: WX_STATION.history.alerts.length === alerts, notices: __notices.length === notices, focus: document.activeElement.id, elapsedMs: performance.now() - started };
      });
      assert(r.stable && r.events && r.alerts && r.notices); assert.equal(r.focus, 'stationCooldown'); assert.equal(s.S.calls, calls); report.render40Ms = Math.round(r.elapsedMs);
    });
    await check('PC · mode silencieux conserve le franchissement sous 0 °C sans nouvelle notification Windows', async () => {
      await click(p, 'station-silent'); const notices = await p.evaluate(() => __notices.length);
      temp = -1; supplierAt += 60000; await p.clock.setSystemTime(supplierAt); await p.evaluate(() => refreshAll()); await s.settle(4);
      assert.equal(await p.evaluate(() => __notices.length), notices);
      assert(await p.evaluate(() => WX_STATION.history.alerts.some(x => x.id === 't0')));
    });
    await check('PC · API notifications absente : repli visuel sans exception', async () => {
      await p.evaluate(() => { Object.defineProperty(window, 'Notification', { configurable: true, value: undefined }); renderWeatherStation(); });
      assert(await p.locator('[data-act="station-notifications"]').isDisabled()); assert((await sample(p)).note.includes('API indisponible'));
    });
    await check('PC · mini-fenêtre native sur demande, ou repli explicite ; aucune pop-up imposée', async () => {
      const supported = await p.evaluate(() => 'documentPictureInPicture' in window);
      if (supported) {
        await click(p, 'station-mini');
        await p.waitForFunction(() => !!WX_STATION.pip || /Mini-fenêtre indisponible/.test(WX_STATION.message));
        if (await p.evaluate(() => !!WX_STATION.pip)) {
          const r = await p.evaluate(() => ({ text: WX_STATION.pip.document.body.innerText, title: WX_STATION.pip.document.title }));
          assert(r.text.includes('Revenir à Race Control')); assert(r.title.includes('Mini-cockpit'));
          await p.evaluate(() => WX_STATION.pip.document.querySelector('[data-act="station-return"]').click());
        }
      } else assert(await p.locator('[data-act="station-mini"]').isDisabled());
      report.nativeMiniSupported = supported;
      await p.evaluate(() => { Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { requestWindow: () => Promise.reject(new DOMException('Refus simulé', 'NotAllowedError')) } }); renderWeatherStation(); });
      await click(p, 'station-mini'); assert((await sample(p)).note.includes('Mini-fenêtre indisponible')); assert((await sample(p)).active);
    });
    await check('PC · HTTP 429 conserve le cache, suspend les alertes et respecte la pause fournisseur', async () => {
      await p.route(/https:\/\/[^/]*open-meteo\.com\//, r => r.fulfill({ status: 429, headers: { 'access-control-allow-origin': '*', 'Retry-After': '600' }, contentType: 'application/json', body: JSON.stringify({ error: true, reason: 'minutely quota' }) }));
      await p.evaluate(() => refreshAll()); await s.settle(3);
      const r = await sample(p); assert.equal(r.mode, 'CACHE'); assert.equal(r.fresh, false);
      const limits = await p.evaluate(() => ({ before: WEATHER_REQUESTS.state().until, raw: !!RAW[UI.loc], alerts: WX_STATION.history.alerts.length }));
      assert(limits.before > supplierAt && limits.raw);
      await p.evaluate(() => { autoTick(); renderWeatherStation(); }); assert.equal((await sample(p)).alerts, limits.alerts);
    });
    await check('PC · hors ligne et heure suivante : dernières prévisions conservées, aucun événement observé inventé', async () => {
      await p.evaluate(() => { window.__offline = true; Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !window.__offline }); window.dispatchEvent(new Event('offline')); });
      const old = await sample(p), observed = await p.evaluate(() => WX_STATION.history.events.filter(x => x.kind === 'observation' || x.kind === 'prévision').length), calls = s.S.calls;
      await p.clock.fastForward(70 * 60000); await s.settle(3); const after = await sample(p);
      assert.equal(after.mode, 'HORS LIGNE'); assert.equal(after.fresh, false); assert.notEqual(after.hours[0], old.hours[0]); assert(after.hours.length >= 12);
      assert.equal(s.S.calls, calls); assert.equal(await p.evaluate(() => WX_STATION.history.events.filter(x => x.kind === 'observation' || x.kind === 'prévision').length), observed);
      assert(await p.locator('#stationCurrent').innerText().then(t => /Dernière valeur|Prévision de l’heure en cours.*cache/.test(t)));
    });
    await check('PC · cache de 37 heures : date et expiration visibles, nouvelles alertes désactivées', async () => {
      await p.evaluate(() => { RAW[UI.loc].t = Date.now() - 37 * 3600e3; rebuild(); renderAll(); });
      assert.equal((await sample(p)).mode, 'EXPIRÉ / INDISPONIBLE'); assert.equal((await sample(p)).fresh, false);
      assert(await p.locator('#stationSources').innerText().then(t => /expirées/.test(t)));
    });
    await check('PC · reconnexion : données fraîches, température commune et dates remplacées sans effacer le cache', async () => {
      await p.unroute(/https:\/\/[^/]*open-meteo\.com\//);
      supplierAt = await p.evaluate(() => Date.now()); temp = 14;
      await p.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); }); await s.settle(14);
      const r = await sample(p); assert.equal(r.mode, 'LIVE'); assert.equal(r.T, r.expected); assert(r.fresh);
    });
    await check('PC · onglet masqué : le minuteur existant actualise la station ; retour de veille requalifie puis reprend', async () => {
      await p.evaluate(() => { window.__hidden = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__hidden ? 'hidden' : 'visible' }); });
      const calls = s.S.calls; supplierAt += 6 * 60000;
      await p.clock.fastForward(6 * 60000); await s.settle(8); assert(s.S.calls > calls);
      await p.evaluate(() => { RAW[UI.loc].t = Date.now() - 20 * 60000; window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
      await s.settle(5); assert.equal((await sample(p)).T, (await sample(p)).expected);
    });
    await check('PC · réponse d’un autre onglet : cache plus récent du lieu accepté, réponse ancienne ou mauvaise position rejetée', async () => {
      const r = await p.evaluate(() => {
        const l = curLoc(), old = RAW[UI.loc].t, key = 'twrc.cache.' + UI.loc, same = { ...RAW[UI.loc], t: Math.max(old + 1, Date.now()) };
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(same) }));
        const rejectedUntrusted = RAW[UI.loc].t === old;
        const publish = value => { const text = JSON.stringify(value); lsSet(key, text); window.dispatchEvent(new StorageEvent('storage', { key, newValue: text })); };
        publish({ ...same, lat: l.lat + 1 });
        const rejectedCoords = RAW[UI.loc].t === old;
        publish({ ...same, t: old - 60000 });
        const rejectedOld = RAW[UI.loc].t === old;
        publish(same);
        return { rejectedUntrusted, rejectedCoords, rejectedOld, accepted: RAW[UI.loc].t === same.t };
      }); assert(r.rejectedUntrusted && r.rejectedCoords && r.rejectedOld && r.accepted);
    });
    await check('PC · sélection d’un autre lieu : même contexte que Météo, aucun faux franchissement entre villes', async () => {
      const r = await p.evaluate(() => { APP_CONTEXT.weatherPreview = S.locs[1].id; UI.loc = S.locs[1].id; renderAll(); return { name: WX_STATION.snapshot.name, expected: curLoc().name, T: WX_STATION.snapshot.current.T, main: wxDesk(wxInput()).current.T }; });
      assert.equal(r.name, r.expected); assert.equal(r.T, r.main);
    });
    await check('PC · journal borné et rendu stable après une session prolongée simulée', async () => {
      const r = await p.evaluate(() => { const count = document.getElementById('wxStation').querySelectorAll('*').length;
        for (let i = 0; i < 180; i++) renderWeatherStation();
        return { before: count, after: document.getElementById('wxStation').querySelectorAll('*').length, events: WX_STATION.history.events.length, places: WX_STATION.monitor.size() }; });
      assert.equal(r.before, r.after); assert(r.events <= 60 && r.places <= 8);
    });
    await check('PC · expiration de session : ferme station/mini-fenêtre et garde le coffre chiffré', async () => {
      const prior = await p.evaluate(() => !!TWRC_RAW_STORAGE.getItem(SessionVault.VAULT)); assert(prior);
      await p.clock.fastForward(8 * 86400e3); await s.settle(3);
      assert.equal((await sample(p)).active, false); assert.equal(await p.locator('#wxStation').count(), 0);
      assert(await p.locator('#twrcExpiryOverlay').isVisible()); assert(await p.evaluate(() => !!TWRC_RAW_STORAGE.getItem(SessionVault.VAULT)));
    });
    await s.c.close();
    supplierAt = Date.parse('2026-10-12T08:00:00+02:00'); temp = 12;
    await check('Deux stations · Web Locks déduplique les actualisations simultanées sans nouveau stockage', async () => {
      const a = await session(browser, { at: '2026-10-12T08:00:00+02:00', dev: 'pc', wx, remember: true });
      try {
        // L'autorisation a été créée après le démarrage de la première page.
        // Revenir à T0 simulerait un recul d'horloge : RememberDevice doit alors refuser la session.
        const secondAt = await a.p.evaluate(() => Date.now());
        const q = await a.c.newPage(); await q.clock.install({ time: secondAt + 1000 }); await q.goto(U);
        stage = 'Deux stations · démarrage de la seconde page et horloge du harnais';
        await q.clock.runFor(2500);
        for (let i = 0; i < 20; i++) { await q.clock.runFor(500); await q.waitForTimeout(80); }
        await q.waitForFunction(() => typeof WX_STATION !== 'undefined' && !LOCKED() && !!CX && !busy);
        await q.evaluate(() => { UI.view = 'meteo'; renderAll(); });
        await click(a.p, 'station-open'); await click(q, 'station-open');
        supplierAt = await a.p.evaluate(() => Date.now() + 6 * 60000);
        await a.p.clock.setSystemTime(supplierAt); await q.clock.setSystemTime(supplierAt);
        const pending = []; await a.c.route(/\/race-control\/obs\.json/, r => { pending.push(r); });
        stage = 'Deux stations · prise du verrou de la première page';
        await a.p.evaluate(() => { window.__sharedRun = weatherStationAutoRefresh(); });
        await a.p.waitForFunction(() => busy);
        await q.evaluate(() => weatherStationAutoRefresh()); assert.equal(await q.evaluate(() => WX_STATION.sharedSkips), 1);
        assert.equal(pending.length, 1);
        await pending[0].fulfill({ status: 200, contentType: 'application/json', body: '{"stations":{}}' });
        await a.p.evaluate(() => __sharedRun); await a.settle(5);
        for (let i = 0; i < 5; i++) { await q.clock.runFor(500); await q.waitForTimeout(80); }
        const at = await a.p.evaluate(() => RAW[UI.loc].t), other = await q.evaluate(() => RAW[S.locs[0].id].t);
        assert.equal(other, at); assert((await sample(q)).active);
        // Deux lieux actifs différents ne doivent pas être mis en concurrence :
        // le leader garde un TTL plus long pour ses lieux secondaires.
        stage = 'Deux stations · deux lieux actifs distincts actualisent chacun leur météo';
        await q.evaluate(() => { APP_CONTEXT.weatherPreview = S.locs[1].id; UI.loc = S.locs[1].id; renderAll(); });
        pending.length = 0;
        await a.p.evaluate(() => { window.__sharedRun = weatherStationAutoRefresh(); });
        await a.p.waitForFunction(() => busy);
        await q.evaluate(() => { window.__sharedRun = weatherStationAutoRefresh(); });
        await q.waitForFunction(() => busy);
        assert.equal(pending.length, 2); assert.equal(await q.evaluate(() => WX_STATION.sharedSkips), 1);
        for (const route of pending) await route.fulfill({ status: 200, contentType: 'application/json', body: '{"stations":{}}' });
        await Promise.all([a.p.evaluate(() => __sharedRun), q.evaluate(() => __sharedRun)]);
      } finally { await a.c.close(); }
    });
    supplierAt = Date.parse('2026-10-12T08:00:00+02:00'); temp = 12;
    await check('iPhone 11 Pro Max · UX historique préservée, station masquée, cinq onglets et aucun débordement', async () => {
      const a = await session(browser, { at: '2026-10-12T08:00:00+02:00', dev: 'iphone', wx });
      try {
        assert.equal(await a.p.locator('[data-act="station-open"]').isVisible(), false);
        await a.p.evaluate(() => weatherStationOpen()); assert.equal((await sample(a.p)).active, false);
        assert.equal(await a.p.locator('#viewSeg [data-act="view"]').count(), 5);
        assert(await a.p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
        await a.p.screenshot({ path: path.join(process.env.SP, 'weather-watch-iphone-' + BR.NAME + '.png'), fullPage: true });
        assert.equal(await a.p.evaluate(() => TWRC_RAW_STORAGE.getItem('twrc.key')), null);
      } finally { await a.c.close(); }
    });
    await check('aucune exception JavaScript et politique de sécurité conservée', async () => assert.deepEqual(errors, []));
    report.scenarios = n; fs.writeFileSync(path.join(process.env.SP, 'weather-watch-report-' + BR.NAME + '.json'), JSON.stringify(report, null, 2));
    console.log(`${n}/${n} scénarios OK · erreurs JS : aucune`);
  } catch (error) { console.error('❌ Weather Watch : ' + stage + ' · ' + error.message + '\n' + String(error.stack || '').split('\n').slice(0, 3).join('\n')); process.exitCode = 1; }
  finally { await browser.close(); }
})();
