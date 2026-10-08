// Audit A05 dans le vrai navigateur : une destination en Haute-Savoie trouvée par IGN/BAN garde son département jusqu'à la
// vigilance Loi Montagne du briefing, après rechargement, et la même adresse ajoutée en Réglages donne la même vigilance.
// Lieux publics fictifs (Annecy, adresse inventée), voitures et domicile fictifs, iPhone et PC.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
let n = 0, stage = ''; const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const tap = (p, dev, sel) => dev === 'iphone' ? p.locator(sel).first().tap() : p.locator(sel).first().click();
const BAN = { features: [{ properties: { label: '1 Place Fictive 74000 Annecy', context: '74, Haute-Savoie, Auvergne-Rhône-Alpes', city: 'Annecy', citycode: '74010', postcode: '74000', type: 'housenumber' }, geometry: { coordinates: [6.1294, 45.8992] } }] };
async function setup(s, dev) {
  const p = s.p;
  await p.route('https://data.geopf.fr/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BAN) }));
  await p.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await p.route('https://geocoding-api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[]}' }));
  await p.route('https://router.project-osrm.org/**', r => {
    const m = /driving\/([^;]+);([^?]+)/.exec(r.request().url()), a = m[1].split(',').map(Number), b = m[2].split(',').map(Number), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ routes: [{ distance: 38100, duration: 2520, geometry: { coordinates: [a, mid, b] }, legs: [{ annotation: { duration: [1260, 1260] } }] }] }) });
  });
  await p.evaluate(async () => {
    S.locs = [{ id: 'home', name: 'Maison test', lat: 45.95, lon: 6.05 }, { id: 'work', name: 'Travail test', lat: 45.92, lon: 6.0 }]; S.customs = [];
    S.work = { from: 'home', to: 'work', dep: '07:00', ret: '18:00', days: [1, 2, 3, 4, 5], durMin: 30 };
    S.cars[0].name = 'Citadine test'; S.cars[0].short = 'Citadine'; Object.assign(S.cars[0].tire, { type: 'summer', size: '215/40 R18 89Y', brand: 'Michelin', model: 'Pilot Sport 4S', tread: 6 });
    USER_STORE.state.dayContext = { activeCarId: S.cars[0].id }; CAL = { events: [] }; saveSettings(); USER_STORE.flush(); await refreshAll(); renderAll();
  });
  await tap(p, dev, '#placeBar [data-act=place-confirm][data-place=work]');
  await tap(p, dev, '#viewSeg [data-act=view][data-v=trajet]'); await s.settle(3);
}
const briefText = p => p.evaluate(() => (document.getElementById('secBrf') || {}).textContent || '');
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-11-03T15:00:00+01:00', dev }), p = s.p; await setup(s, dev);
      await p.fill('#tripDestQ', '1 Place Fictive, 74000 Annecy'); await tap(p, dev, '#secTrip [data-act=trip-dest-search]');
      await p.waitForFunction(() => document.querySelectorAll('#secTrip [data-act=trip-dest-pick]').length > 0, null, { timeout: 10000 });
      await tap(p, dev, '#secTrip [data-act=trip-dest-pick]');
      await p.locator('#secTrip input[name=tripWhen][value=later]').check(); await p.fill('#tripTime', '17:15');
      await tap(p, dev, '#secTrip [data-act=trip-plan]');
      await p.waitForFunction(() => USER_STORE.state.dayContext.nextDestination?.source === 'manual', null, { timeout: 10000 });
      await check(dev + ' · point manuel enregistré avec département, commune et code postal séparés', async () => {
        const d = await p.evaluate(() => { const x = JSON.parse(localStorage.getItem(USER_STORE.key)).dayContext.nextDestination.destinationPoint; return [x.deptCode, x.dept, x.city, x.cityCode, x.postcode]; });
        assert.deepEqual(d, ['74', 'Haute-Savoie', 'Annecy', '74010', '74000']);
      });
      await p.reload(); await s.settle(10);
      await check(dev + ' · après rechargement : vigilance Loi Montagne au briefing, sourcée, sans affirmer d’obligation pour la commune', async () => {
        await tap(p, dev, '#viewSeg [data-act=view][data-v=pneus]');
        await p.waitForFunction(() => /LOI MONTAGNE/.test((document.getElementById('secBrf') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
        for (let i = 0; i < 20 && !/LOI MONTAGNE/.test(await briefText(p)); i++) await s.settle(1);
        const t = await briefText(p);
        assert.match(t, /LOI MONTAGNE · VIGILANCE/, t.slice(0, 600)); assert.match(t, /Arrivée · .*Haute-Savoie \(74\) : département où certaines communes imposent les équipements hiver/);
        assert.match(t, /seulement dans les communes fixées par arrêté préfectoral/); assert.match(t, /Citadine en pneus .* : prévois chaînes ou chaussettes/);
        assert.match(t, /décret n° 2020-1264/); assert.match(t, /celle de 2026-2027 reste à confirmer/);
        const links = await p.$$eval('#secBrf [data-k=mont] a', a => a.map(x => [x.href, x.target, x.rel]));
        assert(links.some(([h, tg, r]) => /securite-routiere\.gouv\.fr/.test(h) && tg === '_blank' && /noopener/.test(r)), JSON.stringify(links));
      });
      await check(dev + ' · même adresse ajoutée en Réglages : mêmes métadonnées et même vigilance que le trajet manuel', async () => {
        await p.evaluate(() => { const d = document.getElementById('settings'); d.open = true; renderSettings(true); document.querySelectorAll('#settings details').forEach(x => { x.open = true; }); });
        // la recherche passe par des minuteries (délai réseau, file de requêtes) : l'horloge simulée doit avancer pendant l'attente
        // (sinon WebKit attend indéfiniment) ; un rafraîchissement des réglages peut aussi effacer la saisie, d'où la relance
        const Q = '1 Place Fictive, 74000 Annecy';
        for (let i = 0; i < 40 && !(await p.locator('[data-act=geo-add]').count()); i++) {
          if (i % 10 === 0 && !/Recherche…/.test(await p.locator('#geoHits').textContent())) { await p.fill('#geoQ', Q); await p.locator('[data-act=geo-search]').click(); }
          await s.settle(1);
        }
        assert(await p.locator('[data-act=geo-add]').count() > 0, 'résultats de recherche affichés : ' + await p.locator('#geoHits').textContent());
        await p.locator('[data-act=geo-add]').first().click(); await s.settle(2);
        const r = await p.evaluate(() => { const c = S.customs[S.customs.length - 1], m = USER_STORE.state.dayContext.nextDestination.destinationPoint, j = x => JSON.stringify(montagneInfo(x, '2026-11-03T17:15', null));
          return { meta: [c.deptCode, c.dept, c.city, c.postcode], same: j(c) === j(m), inDept: montagneInfo(c, '2026-11-03', null).inDept }; });
        assert.deepEqual(r.meta, ['74', 'Haute-Savoie', 'Annecy', '74000']); assert.equal(r.same, true); assert.equal(r.inDept, true);
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
