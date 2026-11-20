// CLARA R3-03 (20/11/2026, choix du propriétaire : « titre = pire des deux », « tout sur 24 h »), données FICTIVES, PC puis iPhone.
// Gel la nuit suivante (02:00-06:00, air −1,5 °C humide) : à 13:00 il est HORS de la fenêtre de 12 h de l'indice pneus, DANS celle
// de 24 h du bulletin et des alertes. Attendu : la carte voiture aux pneus adaptés ne dit jamais « RAS · conditions adaptées » ;
// son titre prend le niveau du gel 24 h (même niveau que frostRisk(sum24) et que l'alerte gel), l'indice pneus seul reste affiché
// en dessous ; à 15:00 (le gel entre dans les 12 h) le titre ne saute pas ; nouvelle installation : horizon des verdicts 24 h.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 600))); if (!ok) fail++; };
const night = t => t >= '2026-11-17T01:00' && t <= '2026-11-17T06:00';
const wx = o => {
  const H = o.hourly || {};
  if (Array.isArray(H.time)) {
    H.temperature_2m = H.time.map(t => night(t) ? -1.5 : 9);
    if (H.relative_humidity_2m) H.relative_humidity_2m = H.time.map(t => night(t) ? 97 : 70);
    if (H.dew_point_2m) H.dew_point_2m = H.time.map(t => night(t) ? -1.8 : 4);
    for (const k of ['precipitation', 'rain']) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => H.time[i] >= '2026-11-16T22:00' && H.time[i] <= '2026-11-17T00:00' ? 0.5 : 0);
    if (H.snowfall) H.snowfall = H.snowfall.map(() => 0);
  }
  return o;
};
const read = p => p.evaluate(() => {
  const f = frostRisk(CX.sum24), cards = [...document.querySelectorAll('#secCars article.car')].map(a => {
    const id = (S.cars.find(c => c.name === (a.querySelector('h3') || {}).textContent) || {}).id, w = (CX.cars.find(x => x.car.id === id) || {}).w;
    return { id, v: (a.querySelector('.verdict') || {}).textContent || '', lv: (a.className.match(/\blv(\d)\b/) || [])[1], tyre: (a.querySelector('.verdict-tyre') || {}).textContent || '', wl: w ? w.level : null, score: w ? w.score : null };
  });
  const ice = Object.values(CX.alerts || {}).filter(x => x && /gel/i.test(x.title || '')).map(x => x.sev);
  return { fr: { key: f.key, level: f.level }, cards, ice, horizon: S.horizon };
});
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T13:00:00+01:00', dev, wx }), p = s.p; await s.settle(4);
  const fresh = await p.evaluate(() => DEFAULTS.horizon);
  check(`${dev} · nouvelle installation : horizon des verdicts 24 h (même fenêtre que le bulletin et les alertes)`, fresh === 24, String(fresh));
  await p.evaluate(() => { S.horizon = 12; S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', brand: 'Marque ' + i, model: 'Modèle', size: '205/55 R16 91V', tread: 6, treadAv: 6, treadAr: 6 })); saveSettings(); rebuild(); UI.view = 'pneus'; renderAll(); });
  await s.settle(6);
  const a = await read(p), ok = a.cards.find(c => c.wl != null && c.wl < (a.fr.level || 0));
  check(`${dev} · gel 24 h détecté (fixture) et hors des 12 h de l’indice : une voiture a des pneus adaptés sous le niveau du gel`, a.fr.level >= 2 && !!ok, JSON.stringify(a));
  if (ok) {
    check(`${dev} · carte aux pneus adaptés : titre au niveau du gel 24 h (jamais « RAS · conditions adaptées »), gel nommé avec son horizon`,
      +ok.lv === a.fr.level && !/CONDITIONS ADAPTÉES/.test(ok.v) && /GEL/.test(ok.v) && /24 H/.test(ok.v), JSON.stringify(ok));
    check(`${dev} · indice pneus seul conservé sous le titre (niveau et score)`, /Indice pneus seul/.test(ok.tyre) && ok.tyre.includes(ok.score + '/100'), ok.tyre);
    check(`${dev} · même niveau de gel dans la carte et dans l’alerte gel de la liste`, a.ice.length > 0 && a.ice.includes(a.fr.level), JSON.stringify(a.ice));
  }
  // 15:00 : 02:00 entre dans la fenêtre de 12 h de l'indice ; le titre de la carte ne saute pas.
  await p.clock.runFor(2 * 3600e3); await s.settle(4); await p.evaluate(() => { rebuild(); renderAll(); }); await s.settle(4);
  const z = await read(p), same = ok && z.cards.find(c => c.id === ok.id);
  check(`${dev} · 2 h plus tard (gel dans les 12 h) : même titre de carte, aucun saut`, !!same && same.lv === ok.lv && /GEL|DANGER|PRUDENCE/.test(same.v), JSON.stringify({ avant: ok, apres: same }));
  await s.c.close();
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'pc'); await run(b, 'iphone'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
