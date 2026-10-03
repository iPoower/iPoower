// Plan de tenue dans la vraie page : météo, lieux, agenda, horloge et réseau entièrement fictifs.
// La CI exécute le même fichier sous Chromium et WebKit, sans accès au site ni à l'agenda réel.
const fs = require('fs'), vm = require('vm');
const T0 = Date.parse('2026-10-03T06:00:00+02:00'), RD = Date;
class FD extends RD { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } }
const ctx = { console, Date: FD, Math, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;', ctx);
const html = fs.readFileSync('site/index.html', 'utf8'), PW = fs.readFileSync('.passphrase', 'utf8').trim();
const U = 'https://ipoower.github.io/iPoower/race-control/';
const rows = [], errors = []; let failures = 0, requests = 0;
const check = (name, ok) => { rows.push((ok ? '✅ ' : '❌ ') + name); if (!ok) failures++; };
(async () => {
  const b = await require('./lib/browser').launch();
  try {
    const c = await b.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris', colorScheme: 'dark' });
    const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.clock.install({ time: T0 });
    await p.route('**/*', r => {
      requests++; const u = r.request().url(), J = v => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
      if (u.includes('air-quality-api')) return J(ctx.ma(ctx.mk('doux', { lat: 48.85, lon: 2.35 }, 'Europe/Paris', 0)));
      if (u.includes('open-meteo.com')) {
        const q = new URL(u).searchParams, latitudes = (q.get('latitude') || '48.85').split(','), longitudes = (q.get('longitude') || '2.35').split(',');
        const models = latitudes.map((lat, i) => ctx.mk('doux', { lat: +lat, lon: +longitudes[i] }, 'Europe/Paris', 0));
        if (u.includes('ensemble')) return J(ctx.me(models[0])); if (q.get('minutely_15')) return J(ctx.mn(models[0]));
        return J(models.length > 1 ? models : models[0]);
      }
      if (u.includes('/obs.json')) return J({ stations: {} });
      if (u.includes('/tiredb.json')) return J(JSON.parse(fs.readFileSync('site/tiredb.json', 'utf8')));
      if (u.includes('/calendar.sealed.json')) return r.fulfill({ status: 404, body: '' });
      if (u.includes('/sw.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '//' });
      if (u === U) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
      return r.abort();
    });
    const settle = async () => { for (let k = 0; k < 6; k++) { await p.clock.runFor(500); await p.waitForTimeout(70); } };
    await p.goto(U); await settle(); await p.fill('#unlockPw', PW);
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); await settle();
    await p.click('[data-act=view][data-v=tenue]'); await settle();
    await p.evaluate(() => {
      window.setOutfitFixture = scenario => {
        DEMO.on = false; M = {}; [RAW, CALM, LEGM, MIDM, MIDP].forEach(o => Object.keys(o).forEach(k => delete o[k]));
        S.work.days = []; S.configured = 1; UI.loc = S.locs[0].id; UI.outfitDay = 0; UI.outfitOccasion = 'outing'; CAL = null; CALDONE = true;
        const places = [...S.locs, ...S.customs], date = nowIn('Europe/Paris').slice(0, 10), home = S.locs[0], work = S.locs[1], other = S.customs[0];
        for (const l of places) {
          const payload = makeDemoPayload('doux', l, 'Europe/Paris', 0), m = makeModel(payload, 'live', l);
          m.hs.forEach(x => {
            const hour = x.hh; let T = 18;
            if (scenario === 'cold-mild' || scenario === 'several') T = hour < 12 || scenario === 'several' && hour >= 18 ? 5 : 21;
            if (scenario === 'rain-stops') T = hour < 12 ? 18 : 24;
            if (scenario === 'evening' && l.id === other.id) T = 8;
            if (scenario === 'places' && l.id === work.id) T = 11;
            if (scenario === 'places' && l.id === other.id) T = 24;
            if (scenario === 'snow' || scenario === 'freezing') T = -2;
            const wet = scenario === 'return-rain' && l.id === home.id && hour >= 17 || scenario === 'rain-stops' && hour < 12;
            Object.assign(x, { T, Tapp: T, pp: wet ? 90 : 0, P: wet ? 1 : 0, snow: scenario === 'snow' ? 1 : 0,
              code: scenario === 'snow' ? 73 : scenario === 'freezing' ? 66 : wet ? 61 : 0,
              wind: scenario === 'wind' ? 42 : 8, gust: scenario === 'wind' ? 65 : 12, uv: 0 });
            if (scenario === 'partial') Object.assign(x, { Tapp: null, pp: null, P: null, snow: null, code: null, gust: null });
            if (scenario === 'no-temperature') Object.assign(x, { T: null, Tapp: null });
          });
          if (scenario === 'missing-hour') m.hs = m.hs.filter(x => x.t !== date + 'T12:00');
          const current = m.hs.find(x => x.t === nowIn('Europe/Paris').slice(0, 13) + ':00');
          m.cur = { ...m.cur, ...(current || {}), time: nowIn('Europe/Paris') };
          RAW[l.id] = { p: payload, mode: 'live', t: Date.now() - (scenario === 'stale' ? 120 * 60000 : 0) }; M[l.id] = m;
          if (scenario === 'stale') Object.assign(m.cur, { T: -40, Tapp: -45 });
        }
        const event = (l, start, end, title) => ({ ...l, t: title, s: date + 'T' + start, e: date + 'T' + end });
        if (scenario === 'return-rain') Object.assign(S.work, { from: home.id, to: work.id, dep: '07:00', ret: '17:00', durMin: 40, days: [6] });
        if (scenario === 'evening') CAL = { events: [event(other, '20:00', '22:00', 'Événement du soir fictif')] };
        if (scenario === 'places') CAL = { events: [event(work, '09:15', '11:45', 'Rendez-vous du matin fictif'), event(other, '14:00', '16:00', 'Sortie fictive')] };
        if (scenario === 'unknown-event') CAL = { events: [event({ lat: null, lon: null, loc: '' }, '12:00', '13:00', 'Événement sans lieu fictif')] };
        if (scenario === 'cached-event') CAL = { updated: new Date().toISOString(), events: [event({ lat: 48.75, lon: 2.55, label: 'Ville fictive de l’agenda' }, '11:00', '12:00', 'Rendez-vous météo à charger')] };
        if (scenario === 'missing-all') M = {};
        renderTenue();
      };
    });
    const fixture = name => p.evaluate(name => window.setOutfitFixture(name), name);
    const text = () => p.locator('#secTenue').innerText();
    const period = time => p.locator('.outfit-period').filter({ has: p.locator(`time[datetime$="T${time}"]`) });
    const status = () => p.locator('.outfit-status').innerText();
    await fixture('cold-mild');
    check('matin froid puis doux : une base de quatre pièces et une seule adaptation', await p.locator('.outfit-piece').count() === 4 && await status() === '1 adaptation nécessaire');
    check('le manteau est porté puis retiré, sans trois tenues différentes', /Manteau/.test(await period('06:00').innerText()) && /Enlever : Manteau/.test(await period('12:00').innerText()) && await p.locator('.outfit-carry [data-outfit-piece=outer]').count() === 1);
    check('la timeline affiche lieu, air, ressenti, précipitations, vent, rafales et couches', await p.locator('.outfit-period').evaluateAll(a => a.every(x => ['Air', 'Ressenti', 'Vent', 'Rafales', 'Couche recommandée'].every(k => x.textContent.includes(k)))));
    await fixture('stable');
    check('journée stable : tenue valable et aucune pièce supplémentaire obligatoire', await status() === 'Tenue valable toute la journée' && /Aucune pièce supplémentaire/.test(await p.locator('.outfit-carry').innerText()));
    await fixture('return-rain');
    check('pluie seulement au retour : emporter la protection le matin', /Emporter : Trench/.test(await period('06:00').innerText()));
    check('protection ajoutée au retour, météo propre aux deux lieux du trajet', /Retour habituel/.test(await period('17:00').innerText()) && /Ajouter : Trench/.test(await period('17:00').innerText()) && /Maison test/.test(await period('17:00').innerText()) && /Travail test/.test(await period('17:00').innerText()));
    check('une seule protection et une adaptation pour la pluie du retour', await p.locator('.outfit-carry [data-outfit-piece=outer]').count() === 1 && await status() === '1 adaptation nécessaire');
    await fixture('rain-stops');
    check('pluie qui cesse : retrait et transition explicitement affichés', /Enlever : Trench/.test(await period('12:00').innerText()) && /non prévue/.test(await period('12:00').innerText()));
    await fixture('evening');
    check('événement du soir plus froid : timeline prolongée après 20 h', /Événement du soir fictif/.test(await text()) && /22:00/.test(await text()) && /8,0 °C/.test(await period('20:00').innerText()));
    check('pièce du soir à emporter dès le départ, ajout au bon créneau', /À emporter dès le départ pour 20:00/.test(await p.locator('.outfit-carry').innerText()) && /Ajouter/.test(await period('20:00').innerText()));
    await fixture('places');
    check('plusieurs lieux et horaires précis : chaque prévision garde son lieu', /11,0 °C/.test(await period('09:15').innerText()) && /24,0 °C/.test(await period('14:00').innerText()));
    check('plusieurs lieux conservent une seule tenue de base', await p.locator('.outfit-piece').count() === 4 && await p.locator('.outfit-base-title').count() === 1);
    await fixture('several');
    check('froid, douceur, froid : indicateur plusieurs adaptations', await status() === 'plusieurs adaptations');
    await fixture('wind');
    check('vent fort : protection coupe-vent avec capuche, sans parapluie supplémentaire', /vent fort, capuche/.test(await text()) && /imperméable léger avec capuche/.test(await p.locator('.outfit-carry').innerText()) && !/Parapluie à emporter/.test(await text()));
    for (const name of ['snow', 'freezing']) {
      await fixture(name);
      check(name === 'snow' ? 'neige : quantité et semelles crantées' : 'pluie verglaçante : alerte explicite et semelles crantées', /crantée/.test(await text()) && (name === 'snow' ? /1,0 cm\/h/.test(await text()) : /Pluie verglaçante/.test(await text())));
    }
    await fixture('partial');
    check('données partielles : températures disponibles, pluie et rafales inconnues', /Données partielles/.test(await text()) && /Pluie\/neige inconnue/.test(await text()) && await p.locator('.outfit-status').getAttribute('data-confirmed') === 'false');
    await fixture('missing-hour');
    check('heure manquante conservée avec couches à confirmer', /Météo manquante/.test(await period('12:00').innerText()) && /Couches à confirmer/.test(await period('12:00').innerText()));
    await fixture('stale');
    check('stale data : ancienne météo signalée sans observation périmée injectée', /Données anciennes/.test(await text()) && /à confirmer/.test(await status()) && !/-45/.test(await text()));
    await fixture('unknown-event');
    check('événement sans localisation : timeline explicite sans météo empruntée', /Lieu non précisé/.test(await period('12:00').innerText()) && /Météo manquante/.test(await period('12:00').innerText()) && /Événement sans localisation/.test(await text()));
    await fixture('cached-event');
    check('ville de l’agenda sans météo : ne pas emprunter la prévision du domicile', /Météo manquante/.test(await period('11:00').innerText()));
    await p.evaluate(() => calModel(CAL.events[0]));
    check('météo d’événement reçue par le flux existant : timeline actualisée automatiquement', /Ville fictive de l’agenda/.test(await period('11:00').innerText()) && !/Météo manquante/.test(await period('11:00').innerText()));
    await fixture('stable');
    check('aucun agenda : plan météo du lieu choisi avec explication', /Aucun agenda disponible/.test(await text()) && await p.locator('.outfit-period').count() > 0);
    const n = requests;
    await p.click('[data-act=outfit-day][data-v="1"]'); await p.click('[data-act=outfit-occasion][data-v=office]');
    check('aujourd’hui et demain réutilisent les données sans nouvel appel externe', requests === n && /04\/10/.test(await text()) && /Cravate/.test(await text()));
    await p.click('[data-act=outfit-day][data-v="0"]');
    check('retour à aujourd’hui avec la même navigation', /03\/10/.test(await text()) && await p.locator('#viewSeg button').evaluateAll(a => a.map(x => x.dataset.v).join(',') === 'pneus,meteo,tenue'));
    await fixture('no-temperature');
    check('température entièrement absente : aucun vêtement prétendument calculé', await p.locator('.outfit-piece').count() === 0 && /Adaptations non calculables/.test(await text()));
    await fixture('missing-all');
    check('météo entièrement absente : timeline et bouton de récupération présents', /Météo insuffisante/.test(await text()) && await p.locator('#secTenue [data-act=refresh]').isVisible() && await p.locator('.outfit-period').count() > 0);
    await fixture('places');
    await p.evaluate(() => { S.customs[0].name = 'LieuAvecUnNomTrèsLongPourVérifierLaMiseEnPageSansDébordementSurPetitÉcran'; renderTenue(); });
    for (const width of [320, 414, 1280]) {
      await p.setViewportSize({ width, height: 896 });
      check('responsive sans débordement, timeline complète à ' + width + ' px', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && await p.locator('.outfit-period').count() >= 3);
      check('cibles tactiles ≥44 × 44 px à ' + width + ' px', await p.locator('#viewSeg button, .outfit-controls button, .outfit-evolution summary').evaluateAll(a => a.every(x => { const r = x.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })));
    }
    await p.setViewportSize({ width: 414, height: 896 }); await fixture('cold-mild');
    if (process.env.RC_OUTFIT_PLAN_SHOT) await p.locator('#secTenue').screenshot({ path: process.env.RC_OUTFIT_PLAN_SHOT });
    await fixture('stable'); await p.click('[data-act=view][data-v=meteo]');
    check('aucune régression Météo : données météo visibles et Tenue masquée', await p.locator('#secCur').isVisible() && !(await p.locator('#secTenue').isVisible()));
    await p.click('[data-act=view][data-v=pneus]');
    check('aucune régression Pneus : voitures et cockpit restent disponibles', await p.locator('#secCars').isVisible() && !(await p.locator('#secTenue').isVisible()));
    check('aucune erreur JavaScript', errors.length === 0);
    console.log(rows.join('\n')); console.log('errors', JSON.stringify(errors)); console.log((rows.length - failures) + '/' + rows.length + ' scénarios OK');
    process.exitCode = failures ? 1 : 0;
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
