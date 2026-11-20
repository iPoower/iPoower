// Répartition des voitures (20/11/2026, maquette validée), données FICTIVES, PC puis iPhone. Lundi 16/11 : ton trajet 06:30
// (froid, chaussée sous 0 °C) et un trajet imprévu de « Conducteur B » à 05:00 (encore doux), retour 12:00 : ils se
// chevauchent. Voiture A en pneus été, voiture B en pneus hiver. Attendu : « Qui prend quelle voiture ? » compare les deux
// répartitions avec la météo de CHAQUE parcours, conseille toi B (hiver, trajet froid) et Conducteur B A ; rien n'est appliqué
// sans appui ; « Appliquer » change ta voiture active et celle du trajet imprévu ; la même voiture prévue pour les deux est signalée.
// Contrôle ajouté : le trajet imprévu reçoit son verdict pour SA voiture, même quand ta voiture active est l'autre.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 600))); if (!ok) fail++; };
const hourOf = t => +String(t).slice(11, 13), dayOf = t => String(t).slice(0, 10);
const wx = o => {
  const H = o.hourly || {};
  if (Array.isArray(H.time)) {
    const cold = t => dayOf(t) === '2026-11-16' && hourOf(t) >= 6 && hourOf(t) <= 9;
    H.temperature_2m = H.time.map(t => cold(t) ? -2 : 11);
    if (H.relative_humidity_2m) H.relative_humidity_2m = H.time.map(t => cold(t) ? 97 : 70);
    if (H.dew_point_2m) H.dew_point_2m = H.time.map(t => cold(t) ? -2.3 : 5);
    for (const k of ['precipitation', 'rain']) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => dayOf(H.time[i]) === '2026-11-16' && hourOf(H.time[i]) === 4 ? 0.4 : 0);
    if (H.snowfall) H.snowfall = H.snowfall.map(() => 0);
  }
  return o;
};
async function routes(p) {
  await p.route('https://router.project-osrm.org/**', r => {
    const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const coords = Array.from({ length: 12 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 11, A[1] + (B[1] - A[1]) * i / 11]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: 30000, duration: 1800,
      geometry: { coordinates: coords }, legs: [{ annotation: { duration: coords.slice(1).map(() => 1800 / 11) } }] }] }) });
  });
}
const read = p => p.evaluate(() => {
  const q = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
  return { box: (q('#secTripSummary .sp-box') || {}).innerText || '', opts: all('#secTripSummary .sp-opt').map(b => ({ on: b.getAttribute('aria-pressed'), t: b.innerText.replace(/\s+/g, ' ') })),
    apply: q('#secTripSummary [data-act=split-apply]') ? { t: q('#secTripSummary [data-act=split-apply]').textContent, dis: q('#secTripSummary [data-act=split-apply]').disabled } : null,
    active: appDay().activeCarId, loan: (S.loans || [])[0] && S.loans[0].carId, warn: (q('#secTripSummary .sp-warn') || {}).textContent || '',
    loanVerdict: (() => { const t = loanTrips().find(x => x.leg === 'go'); return t && t.res && t.res[0] && { car: t.res[0].c.id, lv: t.res[0].w.level }; })(),
    sp: (() => { const s = loanSplit(); return s && { best: [s.best.me.id, s.best.them.id], opts: s.opts.map(o => [o.me.id, o.them.id, o.worst]) }; })() };
});
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T04:45:00+01:00', dev, wx }), p = s.p; await routes(p); await s.settle(4);
  const ids = await p.evaluate(() => {
    S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', brand: 'Marque ' + i, model: 'Modèle', size: '205/55 R16 91V', tread: 6, treadAv: 6, treadAr: 6 }));
    S.work.days = []; const [o, d] = S.locs, A = S.cars[0].id, B = S.cars[1].id;
    S.loans = [RcLoans.make({ carId: B, driver: 'Conducteur B', from: { id: o.id, name: o.name, lat: o.lat, lon: o.lon }, to: { name: 'Lieu C', lat: d.lat + 0.05, lon: d.lon + 0.05 }, dep: '2026-11-16T05:00', ret: '2026-11-16T12:00' }, Date.now())];
    saveSettings(); appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep: '2026-11-16T06:30', carId: A });
    UI.view = 'trajet'; rebuild(); renderAll(); return { A, B };
  });
  await s.settle(10); await p.evaluate(() => { rebuild(); renderAll(); }); await s.settle(6);
  const a = await read(p);
  check(`${dev} · trajet imprévu évalué pour SA voiture (B), alors que ta voiture active est A`, !!a.loanVerdict && a.loanVerdict.car === ids.B && a.active === ids.A, JSON.stringify({ v: a.loanVerdict, active: a.active }));
  check(`${dev} · « Qui prend quelle voiture ? » affiché : deux trajets qui se chevauchent, deux répartitions comparées`, /QUI PREND QUELLE VOITURE/.test(a.box) && a.opts.length === 2, JSON.stringify(a.opts));
  check(`${dev} · conseil : toi B (hiver, trajet froid), Conducteur B A ; pire risque du conseil ≤ celui de l’autre choix`, !!a.sp && a.sp.best[0] === ids.B && a.sp.best[1] === ids.A &&
    Math.min(...a.sp.opts.map(o => o[2])) === a.sp.opts.find(o => o[0] === ids.B)[2], JSON.stringify(a.sp));
  check(`${dev} · rien n’est appliqué sans appui (voiture active A, trajet imprévu B inchangés)`, a.active === ids.A && a.loan === ids.B);
  const best = a.opts.findIndex(o => /CONSEILLÉ/.test(o.t));
  await p.locator('#secTripSummary [data-act=split-pick][data-i="' + best + '"]').click(); await s.settle(1);
  await p.locator('#secTripSummary [data-act=split-apply]').click(); await s.settle(6);
  const c = await read(p);
  check(`${dev} · « Appliquer » : ta voiture active devient B, le trajet imprévu passe en A, répartition marquée ACTUELLE`, c.active === ids.B && c.loan === ids.A && c.apply && c.apply.dis === true && /ACTUEL/.test(c.opts.find(o => /CONSEILLÉ/.test(o.t)).t), JSON.stringify(c));
  // Double réservation : la même voiture pour les deux trajets est signalée.
  await p.evaluate(B => { S.loans = S.loans.map(x => ({ ...x, carId: B })); saveSettings(); rebuild(); renderAll(); }, ids.B); await s.settle(4);
  const d = await read(p);
  check(`${dev} · même voiture prévue pour les deux trajets : signalé, deux répartitions proposées`, /même voiture est prévue pour les deux trajets/.test(d.warn) && d.opts.length === 2, JSON.stringify(d));
  check(`${dev} · aucun « undefined », « NaN » ni « null » affiché`, !/undefined|NaN|\bnull\b/.test(d.box));
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
