// Plan de tenue dans l'application construite : mémoires météo/agenda fictives,
// horloge contrôlée et réseau fermé, Chromium et WebKit via tests/lib/browser.
// Les assertions portent sur les conseils visibles, jamais sur le calcul du moteur.
const fs = require('fs'), vm = require('vm');
const T0 = Date.parse('2026-10-03T08:00:00+02:00'), RD = Date;
class FD extends RD { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } }
const ctx = { console, Date: FD, Math, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;', ctx);
const html = fs.readFileSync('site/index.html', 'utf8'), PW = fs.readFileSync('.passphrase', 'utf8').trim();
const U = 'https://ipoower.github.io/iPoower/race-control/';
const rows = [], errors = [], requests = []; let failures = 0;
const check = (name, ok) => { rows.push((ok ? '✅ ' : '❌ ') + name); if (!ok) failures++; };
const PRIVATE = 'PRIVE_TENUE_FICTIF_31B', DAY = '2026-10-03';
const home = { id: 'home', name: 'Maison test', lat: 48.85, lon: 2.35 };
const work = { id: 'work', name: 'Travail test', lat: 48.9, lon: 2.25 };
const gps = { id: 'gps', name: 'Ma position test', lat: 49.4, lon: 2.8, accuracy: 8 };
const venue = { label: 'Salle test', loc: 'Salle test', lat: 49.02, lon: 2.52 };
const event = (start, end, extra = {}) => ({ t: PRIVATE, s: DAY + 'T' + start, e: DAY + 'T' + end, allDay: false, legs: [], ...extra });

(async () => {
  const b = await require('./lib/browser').launch();
  try {
    const c = await b.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris', colorScheme: 'dark' });
    await c.addInitScript(() => {
      window.__tenueWrites = [];
      for (const name of ['setItem', 'removeItem']) {
        const original = Storage.prototype[name];
        // le coffre chiffré (sécurité V1) n'écrit que du texte chiffré : les écritures réelles sont observées sur localStorage plus bas
        Storage.prototype[name] = function(...args) { if (String(args[0]) !== 'twrc.vault.v2') window.__tenueWrites.push({ method: name, key: String(args[0]), value: args[1] == null ? '' : String(args[1]) }); return original.apply(this, args); };
      }
    });
    const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.clock.install({ time: T0 });
    await p.route('**/*', r => {
      const req = r.request(), u = req.url(); requests.push({ url: u, method: req.method(), body: req.postData() || '' });
      const J = v => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(v) });
      if (u.includes('air-quality-api')) return J(ctx.ma(ctx.mk('doux', home, 'Europe/Paris', 0)));
      if (u.includes('open-meteo.com')) {
        const q = new URL(u).searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(',');
        const base = i => ctx.mk('doux', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
        if (lats.length > 1) return J(lats.map((_, i) => base(i)));
        const one = base(0); if (u.includes('ensemble')) return J(ctx.me(one)); if (q.get('minutely_15')) return J(ctx.mn(one)); return J(one);
      }
      if (u.includes('/obs.json')) return J({ stations: {} });
      if (u.includes('/tiredb.json')) return J(JSON.parse(fs.readFileSync('site/tiredb.json', 'utf8')));
      // L'agenda chargé au démarrage est vide. Chaque scénario fournit ensuite une
      // mémoire CAL/CALM fictive, comme après déchiffrement et récupération météo.
      if (u.includes('/calendar.sealed.json')) return J({});
      if (u.includes('/sw.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '//' });
      if (u === U) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
      return r.abort();
    });
    const settle = async () => { for (let k = 0; k < 6; k++) { await p.clock.runFor(500); await p.waitForTimeout(70); } };
    const txt = async selector => { const node = p.locator(selector || '#secTenue'); return await node.count() ? node.innerText() : ''; };
    const timeline = () => p.locator('.outfit-timeline .outfit-moment').evaluateAll(a => a.map(x => ({ start: x.dataset.start, end: (x.querySelector('time').innerText.split('–')[1] || '').trim(), kind: x.dataset.kind, text: x.innerText })));
    // On remplit uniquement les mémoires déjà utilisées par l'app. Aucun appel
    // à buildTenueDay/dayplan dans les assertions, ni météo/agenda réellement lus.
    const renderReads = [];
    const scenario = async opt => {
    await p.evaluate(o => {
      DEMO.on = false; GPS = o.gps || null; S.locs = o.locs; S.customs = []; S.gpsAuto = 0;
      S.work = { from: 'home', to: 'work', dep: '08:00', ret: '18:00', durMin: 30, days: [1, 2, 3, 4, 5], ...(o.work || {}) };
      S.calDirect = o.direct || {}; UI.loc = o.loc || 'home'; UI.view = 'tenue'; UI.outfitDay = 0; UI.outfitOccasion = 'outing';
      M = {}; for (const k of Object.keys(RAW)) delete RAW[k];
      for (const k of Object.keys(CALM)) delete CALM[k];
      const create = (loc, changes, mode) => {
        const payload = makeDemoPayload('doux', loc, 'Europe/Paris', 0), model = makeModel(payload, mode || 'live', loc);
        for (const h of model.hs) {
          Object.assign(h, { T: 22, Tapp: 22, pp: 0, P: 0, snow: 0, code: 0, gust: 10, wind: 5, uv: 0 });
          for (const patch of changes || []) if (h.hh >= patch.from && h.hh < patch.to && (!patch.day || h.date === patch.day)) Object.assign(h, patch.values);
        }
        const current = model.hs.find(h => h.t.slice(0, 13) === model.nowStr.slice(0, 13));
        if (current && model.cur) Object.assign(model.cur, current, { time: model.cur.time });
        return { payload, model };
      };
      for (const loc of o.noWeather ? [] : [...(o.gps ? [o.gps] : []), ...o.locs]) {
        const v = create(loc, o.weather && o.weather[loc.id], o.modes && o.modes[loc.id]);
        M[loc.id] = v.model; RAW[loc.id] = { p: v.payload, mode: v.model.mode, t: Date.now() - (o.ages && o.ages[loc.id] || 0) };
      }
      CAL = o.events ? { events: o.events } : null; CALDONE = true;
      for (const item of o.eventWeather || []) {
        const id = 'cal' + item.loc.lat.toFixed(2) + '_' + item.loc.lon.toFixed(2);
        const v = create({ ...item.loc, id, name: item.loc.label || item.loc.loc }, item.changes, item.mode);
        CALM[id] = { t: Date.now() - (item.age || 0), m: v.model };
      }
      // Injection de météo/planning : préparer la projection commune sans
      // persister les points fictifs. Le rendu Tenue reste une lecture seule.
      appRefreshContext({ persist: false });
    }, { locs: [home, work], ...opt });
    await p.waitForTimeout(50);
    const before = requests.length, writes = await p.evaluate(() => window.__tenueWrites.length);
    await p.evaluate(() => renderTenue()); await p.waitForTimeout(30);
    renderReads.push({ requests: requests.length - before, writes: await p.evaluate(n => window.__tenueWrites.length - n, writes) });
    };
    const patch = (from, to, values) => ({ from, to, values, day: DAY });
    await p.goto(U); await settle(); await p.fill('#unlockPw', PW);
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); await settle();
    // données en mémoire derrière localStorage (coffre de session) : observer chaque écriture de l'app à ce niveau
    await p.evaluate(() => { const ls = window.localStorage; if (ls instanceof Storage) return;
      for (const name of ['setItem', 'removeItem']) { const o = ls[name]; ls[name] = (...args) => { window.__tenueWrites.push({ method: name, key: String(args[0]), value: args[1] == null ? '' : String(args[1]) }); return o.apply(ls, args); }; } });
    await p.click('[data-act=view][data-v=tenue]'); await settle();
    let networkAt = requests.length;
    const writesAt = await p.evaluate(() => window.__tenueWrites.length);

    await scenario({ weather: { home: [patch(8, 12, { T: 5, Tapp: 5 })] } });
    check('matin froid : tenue de base avec manteau et maille', /manteau/i.test(await txt('.outfit-base')) && /maille/i.test(await txt('.outfit-base')));
    check('après-midi doux : une adaptation retire une couche', /retir|enlèv|allég/i.test(await txt('.outfit-actions')));
    check('carte détaillée cohérente avec la base froide', /manteau/i.test(await txt('.outfit-base')) && /manteau/i.test(await txt('.outfit-pieces')));
    check('hypothèse extérieur et lieux chauffés expliquée', /chauffés/i.test(await txt()) && /extérieur/i.test(await txt()));

    await scenario({ weather: { home: [patch(8, 12, { T: 10, Tapp: 10 })] } });
    check('base N3 : la carte nomme la maille chaude dans la pièce principale', /N3/.test(await txt('.outfit-base')) && /maille chaude/i.test(await txt('.outfit-piece:nth-child(2) h4')) && /maille fine/i.test(await txt('.outfit-piece:nth-child(2) h4')));
    check('base N3 : titre et couche extérieure décrivent le même kit', /Fraîcheur.*mailles amovibles/i.test(await txt('.outfit-verdict h3')) && /veste légère/i.test(await txt('.outfit-piece:nth-child(1) h4')) && !/manteau/i.test(await txt('.outfit-piece:nth-child(1)')));

    await scenario({ weather: { home: [patch(13, 14, { T: 5, Tapp: 5 })] } });
    check('une heure fraîche isolée ne crée pas de changement de confort', !/maille|manteau|ajout|enfil/i.test(await txt('.outfit-actions')));

    await scenario({ work: { days: [6] }, weather: { work: [patch(18, 19, { pp: 90, P: 2, code: 63 })] } });
    check('retour pluvieux de 30 min : protection à emporter', /imperméable|pluie|parapluie/i.test(await txt('.outfit-carry')));
    check('retour pluvieux de 30 min : action à 18 h malgré la règle des 2 h', /18:00/.test(await txt('.outfit-actions')) && /pluie|imperméable|parapluie/i.test(await txt('.outfit-actions')));
    await scenario({ work: { days: [6] }, weather: { work: [patch(18, 19, { T: -1, Tapp: -2, pp: 95, P: 0.5, code: 67 })] } });
    check('pluie verglaçante de 30 min : avertissement et action conservés', /verglaç|gliss/i.test(await txt()) && /18:00/.test(await txt('.outfit-actions')));
    check('pluie verglaçante : chaussures adaptées visibles', /crantée|adhéren/i.test(await txt('.outfit-pieces')));
    for (const danger of [
      { label: 'neige', weather: { code: 71, snow: 0.3 }, text: /neige/i },
      { label: 'orage', weather: { code: 95 }, text: /orage/i },
      { label: 'vent fort', weather: { gust: 60 }, text: /vent fort|coupe.vent/i }
    ]) {
      await scenario({ work: { days: [6] }, weather: { work: [patch(18, 19, danger.weather)] } });
      check(danger.label + ' au retour de 30 min : action immédiate conservée', /18:00/.test(await txt('.outfit-actions')) && danger.text.test(await txt('.outfit-actions')));
      if (danger.label === 'vent fort') check('vent fort : le détail de la carte affiche le coupe-vent du plan', /coupe.vent/i.test(await txt('.outfit-carry')) && /coupe.vent/i.test(await txt('.outfit-piece:nth-child(1) h4')));
    }

    await scenario({ events: [event('18:00', '20:00', venue)], eventWeather: [{ loc: venue, changes: [patch(18, 21, { T: 2, Tapp: 2 })] }] });
    check('rendez-vous du soir froid : manteau à emporter et adaptation du soir', /manteau/i.test(await txt('.outfit-carry')) && /18:00/.test(await txt('.outfit-actions')));
    check('la carte détaille le même kit amovible, y compris le manteau du soir', /manteau/i.test(await txt('.outfit-base')) && /manteau/i.test(await txt('.outfit-pieces')) && /chemise/i.test(await txt('.outfit-base')) && /chemise/i.test(await txt('.outfit-pieces')));

    await scenario({ work: { days: [6], ret: '18:00' }, weather: { home: [patch(8, 21, { T: -5, Tapp: -5 })], work: [patch(8, 21, { T: 22, Tapp: 22 })] }, events: [event('15:00', '16:00', venue)], eventWeather: [{ loc: venue }] });
    const moments = await timeline(), noon = moments.find(x => x.start && x.start.slice(11, 16) <= '12:00' && x.end > '12:00');
    check('trou dans l’agenda à midi : continuité du travail', !!noon && /Travail test/.test(noon.text) && !/Maison test/.test(noon.text));
    check('la météo du travail douce est utilisée dans le trou', !!noon && /22(?:,0)?\s*°/.test(noon.text) && !/−5|-5/.test(noon.text));
    check('plusieurs lieux réellement connus sont présents dans la timeline', /Travail test/.test(await txt('.outfit-timeline')) && /Salle test/.test(await txt('.outfit-timeline')));

    await scenario({ work: { days: [6] }, weather: { home: [patch(8, 23, { T: -5, Tapp: -5 })], work: [patch(8, 23, { T: 22, Tapp: 22 })] }, events: [event('08:15', '09:00', { mode: 'trajet', loc: '', lat: null, lon: null })] });
    const overlap = await timeline(), atHour = hour => overlap.find(x => x.start.slice(11, 16) <= hour && x.end > hour);
    check('événement inconnu chevauchant le trajet : sa météo reste non calculée', overlap.some(x => x.kind === 'event' && x.start.slice(11, 16) === '08:15' && /Lieu inconnu.*météo locale non calculée/is.test(x.text) && !/Ressenti/i.test(x.text)));
    check('arrivée travail masquée par un lieu inconnu : continuité à 9 h et midi', ['09:00', '12:00'].every(hour => { const row = atHour(hour); return row && row.kind === 'work' && /Travail test/.test(row.text) && /22(?:,0)?\s*°/.test(row.text) && !/Maison test|−5|-5/.test(row.text); }));
    check('arrivée travail masquée : retour connu de 18 h conservé', overlap.some(x => x.kind === 'trip' && x.start.slice(11, 16) === '18:00' && /Travail test.*Maison test/is.test(x.text)) && atHour('19:00') && /Maison test/.test(atHour('19:00').text));

    await scenario({ gps, loc: 'gps', weather: { home: [patch(8, 23, { T: -5, Tapp: -5 })], gps: [patch(8, 23, { T: 22, Tapp: 22 })] } });
    const gpsMoments = await timeline();
    check('Ma position sans programme : sa météo et son lieu sont conservés', /Ma position test/i.test(await txt('#secTenue h2')) && gpsMoments.length > 0 && gpsMoments.every(x => /Ma position test/.test(x.text) && /22(?:,0)?\s*°/.test(x.text) && !/Maison test|−5|-5/.test(x.text)));
    check('Ma position sans programme : base légère issue du GPS', /N1/.test(await txt('.outfit-base')) && !/manteau/i.test(await txt('.outfit-piece:nth-child(1) h4')));

    const unsafeTitle = PRIVATE + ' <img id="tenue-title-injection" src="x" onerror="window.__titleRan=1">';
    await scenario({ weather: { home: [patch(15, 16, { T: -5, Tapp: -5 })] }, events: [event('15:00', '16:00', { t: unsafeTitle, mode: 'trajet', loc: '', lat: null, lon: null })] });
    const unknown = (await timeline()).filter(x => /Lieu inconnu/i.test(x.text));
    check('événement sans localisation : météo locale explicitement non calculée', unknown.length > 0 && unknown.every(x => /météo locale non calculée/i.test(x.text)));
    check('événement inconnu : aucune adaptation météo inventée', unknown.length > 0 && unknown.every(x => !/retir|enfil|imperméable|manteau|ressenti|22(?:,0)?\s*°/i.test(x.text)));
    await scenario({ weather: { work: [patch(15, 17, { T: 5, Tapp: 5 })] }, events: [event('15:00', '16:00', { loc: 'Travail test', lat: null, lon: null })] });
    check('localisation sans coordonnées mais reconnue : météo du travail', (await timeline()).some(x => x.kind === 'event' && /Travail test/.test(x.text) && /5(?:,0)?\s*°/.test(x.text) && !/Lieu inconnu/.test(x.text)));
    await scenario({ events: [event('15:00', '16:00', { ...venue, t: unsafeTitle })], eventWeather: [{ loc: venue }] });
    check('le titre de rendez-vous reste du texte sans injection HTML', await p.locator('#tenue-title-injection').count() === 0 && !(await p.evaluate(() => window.__titleRan)) && (await txt('.outfit-timeline')).includes('<img'));

    await scenario({ events: [event('18:00', '20:00', venue)] });
    const unavailable = (await timeline()).filter(x => /Salle test/.test(x.text));
    check('lieu connu sans modèle : météo indisponible sans repli sur le domicile', unavailable.length > 0 && unavailable.every(x => /météo locale non calculée|météo indisponible/i.test(x.text) && !/22(?:,0)?\s*°|manteau/i.test(x.text)));
    check('chaque rendu Tenue lit le contexte sans appel météo, agenda ni écriture', renderReads.every(x => x.requests === 0 && x.writes === 0));
    // Une récupération déjà prévue par l'agenda termine : son vrai callback
    // doit actualiser aussi la vue Tenue, qui ne lance pas sa propre récupération.
    networkAt = requests.length;
    await p.evaluate(e => calModel(e), event('18:00', '20:00', venue)); await settle();
    check('réception de la météo agenda : le plan se met à jour immédiatement', (await timeline()).some(x => x.kind === 'event' && /Salle test/.test(x.text) && /Ressenti \d/.test(x.text) && !/météo locale non calculée/i.test(x.text)));
    check('seule la récupération existante de l’agenda est appelée', requests.length === networkAt + 1 && requests[networkAt].url.includes('open-meteo.com'));
    networkAt = requests.length;

    await scenario({ weather: { home: [patch(8, 21, { Tapp: null, pp: null, gust: null })] } });
    check('données partielles : limites et repli sur température de l’air visibles', /Données partielles/i.test(await txt()) && /Ressenti \/ air|température de l.air|ressenti indisponible/i.test(await txt()) && await p.locator('.outfit-piece').count() === 4);
    await scenario({ modes: { home: 'cache' }, ages: { home: 2 * 3600e3 } });
    check('météo ancienne : plan explicitement à confirmer', /Données anciennes/i.test(await txt()) && /confirmer/i.test(await txt()));
    await scenario({ events: [event('18:00', '20:00', venue)], eventWeather: [{ loc: venue, age: 2 * 3600e3 }] });
    check('météo ancienne au rendez-vous : l’incertitude reste visible', /anciennes|confirmer/i.test(await txt('.outfit-timeline')));
    await scenario({ noWeather: true });
    check('aucune météo disponible : état vide sans tenue ni timeline inventées', /Météo insuffisante/i.test(await txt()) && await p.locator('.outfit-piece, .outfit-moment').count() === 0);

    await scenario({ events: [event('18:00', '20:00', { ...venue, t: PRIVATE + ' ' + 'Rendezvous'.repeat(70) })], eventWeather: [{ loc: venue }] });
    for (const width of [320, 414, 1280]) {
      await p.setViewportSize({ width, height: 896 });
      check('plan de tenue sans débordement à ' + width + ' px', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const undersized = await p.locator('[data-act=view][data-v=tenue], #secTenue button, #secTenue a, #secTenue summary, #secTenue input, #secTenue select').evaluateAll(a => a.filter(x => x.getClientRects().length).map(x => ({ label: x.innerText, action: x.dataset.act, height: x.getBoundingClientRect().height, width: x.getBoundingClientRect().width })).filter(x => x.height < 44 || x.width < 44));
      check('toutes les commandes Tenue atteignent 44 px à ' + width + ' px', undersized.length === 0);
      if (undersized.length) console.log('Commandes sous 44 px à ' + width + ' px : ' + JSON.stringify(undersized));
    }
    await p.setViewportSize({ width: 414, height: 896 });
    // Les callbacks globaux de la météo peuvent écrire le journal et les
    // tendances pendant les fixtures. Isoler les commandes Tenue après cela.
    const controlsAt = await p.evaluate(() => window.__tenueWrites.length);
    await p.click('[data-act=outfit-day][data-v="1"]');
    check('Demain sélectionne une journée locale distincte', /04\/10/.test(await txt()) && /demain/i.test(await txt()));
    await p.click('[data-act=outfit-occasion][data-v=office]');
    check('Bureau conserve le plan et ajoute le conseil cravate', /Cravate/.test(await txt()) && await p.locator('.outfit-dayplan').count() === 1);
    await p.click('[data-act=outfit-occasion][data-v=walk]');
    check('Promenade conserve le plan et les chaussures de marche', /semelle gomme|marcher longtemps/.test(await txt()) && await p.locator('.outfit-dayplan').count() === 1);
    await p.click('[data-act=outfit-day][data-v="0"]');
    check('rendus et réglages Tenue sans nouvelle requête météo ou agenda', requests.length === networkAt);
    const writes = await p.evaluate(n => window.__tenueWrites.slice(n), writesAt);
    const controlWrites = await p.evaluate(n => window.__tenueWrites.slice(n), controlsAt);
    const contextKeys = /^(?:twrc\.(?:context\.v1|debrief\.v1|gps|place\.v1|tripstart\.v1|tripend\.v1|returnhome\.v1|tripdone))$/;
    const decisionKey = 'twrc.decision.latest.v1';
    check('aucun stockage du plan, des événements ou des tracés ; commandes Tenue limitées aux préférences et synthèse locale sûre',
      controlWrites.every(x => ['twrc.outfit.occasion', 'twrc.view', decisionKey].includes(x.key) || contextKeys.test(x.key)) &&
      !JSON.stringify(writes).includes(PRIVATE) &&
      !writes.some(x => /\"(?:moments|timeline|events)\"/.test(x.value)) &&
      !writes.some(x => (contextKeys.test(x.key) || x.key === decisionKey) && /\"(?:route|pts|g|history|lat|lon|title|address)\"\s*:/.test(x.value)));
    check('aucun titre d’agenda transmis ou publié', !JSON.stringify(requests).includes(PRIVATE) && requests.every(x => ['GET', 'HEAD'].includes(x.method)));
    await scenario({});
    await p.click('[data-act=view][data-v=meteo]');
    check('Météo reste utilisable après le plan de tenue', await p.locator('#secCur').isVisible() && !(await p.locator('#secTenue').isVisible()));
    await p.click('[data-act=view][data-v=pneus]');
    check('Pneus reste utilisable après le plan de tenue', await p.locator('#secCars').isVisible() && await p.locator('#secCars .car').count() > 0 && !(await p.locator('#secTenue').isVisible()));
    check('aucune erreur JavaScript dans tous les scénarios', errors.length === 0);
    console.log(rows.join('\n')); console.log('errors', JSON.stringify(errors)); console.log((rows.length - failures) + '/' + rows.length + ' scénarios OK');
    process.exitCode = failures ? 1 : 0;
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
