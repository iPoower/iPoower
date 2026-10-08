// Intégration DATEX → OSRM → cockpit, profils PC et iPhone 11 Pro Max, réseau entièrement fictif.
'use strict';
const assert = require('node:assert/strict'), { launch } = require('./lib/browser'), { session } = require('./lib/jarvis-session'), F = require('./lib/road-fixtures');
let n = 0; const check = (label, ok) => { assert(ok, label); n++; console.log('✅ ' + label); };
(async () => {
  const browser = await launch();
  try {
    for (const iphone of [false, true]) {
      const s = await session(browser, { iphone }), { p, c, settle } = s, prefix = iphone ? 'iPhone' : 'PC';
      let mode = 'fresh', requests = [], osrm = [];
      await p.route('**/road-datex.json', r => {
        requests.push(r.request().url());
        if (mode === 'error') return r.fulfill({ status: 503, body: 'unavailable' });
        const feed = F.feed('datex', mode === 'empty' ? { events: [] } : mode === 'stale' ? { publicationTime: new Date(F.NOW - 20 * 60000).toISOString() } : {});
        if (mode === 'xss') feed.events[0].title = '<img src=x onerror="window.__roadXss=1">';
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feed) });
      });
      await p.route('**/router.project-osrm.org/**', r => {
        const url = r.request().url(), query = new URL(url).searchParams, route = JSON.parse(JSON.stringify(F.routeJSON));
        if (query.get('overview') === 'full') osrm.push(url);
        if (query.get('steps') !== 'true') route.routes[0].legs.forEach(leg => { leg.steps = []; });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route) });
      });
      // Départ hors de la fenêtre d'aperçu : le seul calcul OSRM doit venir du clic de départ actif.
      await p.evaluate(() => { CAL = { events: [] }; CALDONE = true; S.work.dep = '17:20'; S.work.ret = '18:30'; S.work.days = [1, 2, 3, 4, 5]; rebuild(); renderAll(); document.querySelector('#settings').open = true; });
      await settle(2); await p.locator('[data-act=locate]').first().click(); await settle(6);
      check(prefix + ' · aucun aperçu OSRM complet avant le départ manuel', osrm.length === 0 && await p.evaluate(() => LIVE.phase === 'idle' && TRIPPREVIEW.key === null));
      await p.locator('#secBrf [data-act=trip-start]').first().click(); await settle(6);
      const text = () => p.locator('#secRoad').innerText();
      const st = await p.evaluate(() => ({ phase: LIVE.phase, route: !!(LIVE.route && LIVE.route.road), fix: FIX && FIX.acc, source: ROAD.manager.snapshot().events.length }));
      check(prefix + ' · un vrai clic démarre le trajet, route OSRM et signalement corrélé', st.phase === 'active' && st.route && st.source === 1);
      check(prefix + ' · trajet actif : unique requête OSRM enrichie ; DATEX sans coordonnées', osrm.length === 1 && new URL(osrm[0]).searchParams.get('steps') === 'true' && requests.length > 0 && requests.every(u => /\/road-datex\.json$/.test(u)));
      let t = await text(); check(prefix + ' · cockpit : axe, distance, ETA OSRM, source, âge et couverture', /Accident signalé/.test(t) && /A1/.test(t) && /devant/.test(t) && /OSRM/.test(t) && /DIR/.test(t) && /partielle/.test(t) && /LIVE/.test(t));
      check(prefix + ' · alerte visuelle nouvelle et sévère, aucune ETA trafic inventée', await p.locator('#secRoad .road-alert').count() === 1 && /trafic non inclus/.test(t) && /Vitesses trafic indisponibles/.test(t));
      const layout = await p.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, height: document.querySelector('#secRoad').getBoundingClientRect().height, target: document.querySelector('#secRoad summary').getBoundingClientRect().height }));
      check(prefix + ' · carte active compacte, aucun débordement et cible tactile 44 px', layout.width <= layout.viewport + 1 && layout.target >= 43 && (!iphone || layout.height < 480));
      const score = await p.evaluate(() => JSON.stringify(CX));
      const force = async () => { await p.evaluate(async () => { const state = ROAD.manager.states.get('datex'); state.triedAt = -Infinity; state.retryAt = 0; await ROAD.manager.refresh(); renderRoad(); }); };
      mode = 'empty'; await force(); t = await text(); check(prefix + ' · 200 vide : absence qualifiée par la source disponible', /Aucun événement correspondant dans cette source disponible/.test(t) && !/Accident signalé/.test(t));
      mode = 'fresh'; await force(); check(prefix + ' · pas de répétition de l’alerte après disparition et retour', await p.locator('#secRoad .road-alert').count() === 0);
      mode = 'error'; await force(); t = await text(); check(prefix + ' · panne fournisseur : cache identifié, jamais LIVE', /Indisponible/.test(t) && !/\bLIVE\b/.test(t.replace(/non LIVE/g, '')) && /non LIVE/.test(t));
      check(prefix + ' · verdicts météo et pneus inchangés pendant les mises à jour trafic', await p.evaluate(() => JSON.stringify(CX)) === score);
      mode = 'stale'; await force(); t = await text(); check(prefix + ' · flux périmé : signalements masqués', /Périmé/.test(t) && !/Accident signalé/.test(t));
      mode = 'xss'; await force(); check(prefix + ' · texte source échappé, aucun handler HTML injecté', await p.locator('#secRoad img').count() === 0 && !await p.evaluate(() => window.__roadXss));
      mode = 'fresh'; await force();
      await p.evaluate(() => { window.__roadOffline = true; Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !window.__roadOffline }); window.dispatchEvent(new Event('offline')); }); await settle(2);
      t = await text(); check(prefix + ' · hors ligne : données datées, pas de LIVE ni alerte', /Hors ligne/.test(t) && !/\bLIVE\b/.test(t.replace(/non LIVE/g, '')) && await p.locator('#secRoad .road-alert').count() === 0);
      await p.evaluate(() => { window.__roadOffline = false; roadSync(); });
      await p.evaluate(({ coords }) => { FIX = { lat: coords[1], lon: coords[0], acc: 18, ts: Date.now() }; roadSync(); }, { coords: F.coordinates[8] });
      check(prefix + ' · événement dépassé retiré du cockpit', !/Accident signalé/.test(await text()));
      await p.evaluate(() => { FIX = { ...FIX, acc: 500, ts: Date.now() }; roadSync(); }); check(prefix + ' · dérive GPS : aucune alerte routière', /imprécise/.test(await text()) && await p.locator('#secRoad .road-alert').count() === 0);
      await p.locator('#f-road-on').selectOption('0'); check(prefix + ' · handler de réglage : fournisseur arrêté, carte masquée', await p.locator('#secRoad').isHidden() && !await p.evaluate(() => ROAD.manager.states.get('datex').provider.enabled));
      await p.locator('#f-road-on').selectOption('1');
      const arrivedKey = await p.evaluate(() => LIVE.key);
      // Le briefing privilégie la confirmation du lieu connu (travail) au bouton d'arrivée générique.
      const arrival = p.locator('#secBrf [data-act=trip-arrived], #secBrf [data-act=place-confirm][data-how=arrival]').first();
      check(prefix + ' · action d’arrivée réellement proposée et visible', await arrival.count() === 1 && await arrival.isVisible());
      await arrival.click();
      check(prefix + ' · handler d’arrivée termine le trajet suivi et les alertes', await p.evaluate(key => LIVE.done[key] === 'arrivé' && ROAD.manager.context === null && ROAD.alert === null, arrivedKey));
      await p.evaluate(() => { liveReset(); S.work.days = []; CAL.events = []; renderAll(); });
      check(prefix + ' · arrivée/annulation/sans trajet : aucun contexte ou événement résiduel', await p.locator('#secRoad').isHidden() && await p.evaluate(() => ROAD.manager.context === null && ROAD.alert === null));
      for (const view of ['meteo', 'tenue', 'analyse', 'pneus']) { const tab = p.locator(`[data-act=view][data-v=${view}][aria-pressed]`); await tab.click(); check(prefix + ' · commande ' + view + ' toujours active', await tab.getAttribute('aria-pressed') === 'true'); }
      check(prefix + ' · pas de débordement, JavaScript ou secret dans le cache trafic', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && !/trip-fictif|"fix"|"route"|"distanceAhead"/.test(localStorage.getItem('twrc.road.datex') || '')) && s.errors.length === 0);
      await c.close();

      // Même premier lancement que le site public : aucun préréglage privé ni code injecté.
      const own = await session(browser, { iphone, locked: true }), q = own.p;
      const roadCalls = [];
      await q.route('**/road-datex.json', r => {
        roadCalls.push(r.request().url());
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(F.feed('datex')) });
      });
      await q.route('**/router.project-osrm.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(F.routeJSON) }));
      await q.evaluate(() => { CAL = { events: [] }; CALDONE = true; S.work.dep = '17:20'; S.work.ret = '18:30'; S.work.days = [1, 2, 3, 4, 5]; rebuild(); renderAll(); });
      await own.settle(2); await q.locator('#secBrf [data-act=trip-start]').first().click(); await own.settle(2);
      check(prefix + ' · premier lancement verrouillé : carte et requêtes DATEX absentes', await q.locator('#secRoad').isHidden() && roadCalls.length === 0);
      await q.locator('[data-act=nocode]').click(); await own.settle(2);
      check(prefix + ' · propres réglages sans GPS : carte qualifiée immédiatement, aucun appel DATEX', await q.locator('#secRoad').isVisible() && /Position précise et trajet OSRM courant requis/.test(await q.locator('#secRoad').innerText()) && roadCalls.length === 0);
      check(prefix + ' · mode sans code : préréglage chiffré toujours verrouillé', await q.evaluate(() => LOCKED() && !lsGet('twrc.plain') && lsGet('twrc.nocode') === '1'));
      await q.locator('[data-act=withcode]').click();
      check(prefix + ' · retour au code : carte masquée immédiatement', await q.locator('#secRoad').isHidden() && await q.evaluate(() => ROAD.manager.context === null && ROAD.alert === null));
      await q.locator('[data-act=nocode]').click(); await q.locator('[data-act=locate]').first().click(); await own.settle(10);
      check(prefix + ' · propres réglages avec GPS fictif : trajet existant corrélé au flux DATEX', roadCalls.length > 0 && /Accident signalé/.test(await q.locator('#secRoad').innerText()) && await q.evaluate(() => !!ROAD.manager.context));
      await q.locator('[data-act=withcode]').click();
      check(prefix + ' · retour au code : contexte et alerte routiers arrêtés immédiatement', await q.locator('#secRoad').isHidden() && await q.evaluate(() => ROAD.manager.context === null && ROAD.alert === null));
      check(prefix + ' · profil public : aucune erreur JavaScript ni déchiffrement', own.errors.length === 0 && await q.evaluate(() => LOCKED() && !lsGet('twrc.plain')));
      await own.c.close();
    }
  } finally { await browser.close(); }
  console.log(`${n}/${n} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.error(e); process.exit(1); });
