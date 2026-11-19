// Onglet Pneus · « épreuve spéciale » (maquette B « Rallye », 19/11/2026), données FICTIVES, PC puis iPhone : plaque du
// prochain trajet, niveau = risque global du trajet, notes du copilote et ruban de surface = lecture routeTower (mêmes points,
// mêmes niveaux), choix des pneus = même évaluation que « Quelle voiture prendre ? », assistance, bulletin, bouton de départ,
// décision « Ici, maintenant » toujours en tête, rien d'écrit sauf le choix explicite de voiture, absent des autres onglets.
// Trajet domicile-travail fictif le lundi 16/11 06:30 → 07:10 ; pluie 06 h 0,5 · 07 h 2,4 mm/h ; voiture A été, voiture B hiver.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 500))); if (!ok) fail++; };
const hourOf = t => +String(t).slice(11, 13), dayOf = t => String(t).slice(0, 10);
const RAIN = { 5: 0.4, 6: 0.5, 7: 2.4, 8: 1.0 };
const wx = o => {
  const H = o.hourly || {};
  if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) {
    const mon = t => dayOf(t) === '2026-11-16';
    H.temperature_2m = H.time.map((t, i) => mon(t) && hourOf(t) <= 10 ? 9 + hourOf(t) * 0.2 : H.temperature_2m[i]);
    for (const k of ['precipitation', 'rain']) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => mon(H.time[i]) ? RAIN[hourOf(H.time[i])] || 0 : x);
    for (const [k, v] of [['visibility', 20000], ['snowfall', 0], ['wind_gusts_10m', 25]]) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => mon(H.time[i]) ? v : x);
    if (Array.isArray(H.weather_code)) H.weather_code = H.weather_code.map((x, i) => mon(H.time[i]) ? 61 : x);
  }
  return o;
};
function setup() {
  const day = '2026-11-13';
  S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', brand: 'Marque ' + i, model: 'Modèle test', size: '205/55 R16 91V', treadEst: 0, dot: '1224',
    tread: 6, treadAv: 6, treadAr: 6, treads: [{ d: day, mm: 6, km: null, ax: 'av' }, { d: day, mm: 6, km: null, ax: 'ar' }] }));
  S.work.dep = '06:30'; S.work.durMin = 40; S.flags = S.flags || {};
  saveSettings(); appSetCar(S.cars[0].id); rebuild(); renderAll();
}
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-14T20:30:00+01:00', dev, wx }), p = s.p; await s.settle(4);
  await p.evaluate(setup); await s.settle(8);
  await p.evaluate(() => { UI.view = 'pneus'; renderAll(); window.scrollTo(0, 0); }); await s.settle(4);
  const before = await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work, day: appDay() }));
  const r = await p.evaluate(() => {
    const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip, risk = t && tripRisk(t);
    const tower = t ? F1Pure.routeTower(t.seq, { ageMin: f1WeatherSources(t.seq).known ? f1WeatherSources(t.seq).ageMin : null }) : [];
    const q = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
    const cmp = TCARS().map(c => ({ id: c.id, w: windowAssess(c, t.seq, 'trip') })).filter(x => x.w).map(x => ({ id: x.id, score: x.w.score, level: x.w.level }));
    return { shown: !q('#secRally').hidden, plate: (q('#secRally .rl-plate') || {}).textContent || '', flag: q('#secRally .rl-flag') ? { lv: q('#secRally .rl-flag').dataset.lv, t: q('#secRally .rl-flag').textContent } : null,
      risk: risk && { lv: risk.lv, why: risk.why }, notes: all('#secRally .rl-notes li').map(x => ({ n: x.querySelector('.rl-n').textContent, lv: x.querySelector('.rl-n').dataset.lv, t: x.textContent })),
      tower: tower.map(x => x.level), surface: all('#secRally .rl-ribbon span').map(x => x.dataset.k), expect: F1Pure.stageSurface(tower).map(x => x.kind || 'x'),
      cars: all('#secRally .rl-car').map(x => ({ id: x.dataset.car, best: x.classList.contains('best'), score: x.querySelector('.rl-score').textContent })), cmp,
      pick: q('#secRally .rl-choice [data-act=day-car]') ? q('#secRally .rl-choice [data-act=day-car]').dataset.id : null,
      chips: all('#secRally .rl-chip').map(x => x.textContent), lines: all('#secRally .rl-line').map(x => x.getAttribute('href')),
      go: q('#secRally .rl-go') ? { v: q('#secRally .rl-go').dataset.v, t: q('#secRally .rl-go').textContent } : null,
      order: [...document.querySelectorAll('#decisionCore, #secRally, #secBrf')].map(e => e.id),
      top: { core: q('#decisionCore').getBoundingClientRect().top, rally: q('#secRally').getBoundingClientRect().top }, text: q('#secRally').innerText };
  });
  check(`${dev} · Pneus : bloc « épreuve spéciale » affiché, après la décision « Ici, maintenant » et avant le briefing`, r.shown && r.order.join('>') === 'decisionCore>secRally>secBrf' && r.top.core < r.top.rally, JSON.stringify({ o: r.order, t: r.top }));
  check(`${dev} · plaque : prochain trajet (départ → arrivée), date, horaire et durée`, /PNEUS · ÉPREUVE SPÉCIALE/.test(r.plate) && /Maison test → Travail test/.test(r.plate) && /lun\. 16\/11 · 06:30 → 07:10 · 40 min/.test(r.plate), r.plate);
  check(`${dev} · niveau de l’épreuve = risque global du trajet (même niveau, même cause)`, !!r.flag && !!r.risk && String(r.risk.lv) === r.flag.lv && r.flag.t.includes(r.risk.why), JSON.stringify({ f: r.flag, r: r.risk }));
  check(`${dev} · notes du copilote : numérotées, départ et arrivée, niveaux tirés des points du trajet`, r.notes.length >= 3 && r.notes.every((x, i) => x.n === String(i + 1).padStart(2, '0')) && /^01Départ 06:30/.test(r.notes[0].t) && /Arrivée 07:10/.test(r.notes[r.notes.length - 1].t)
    && r.notes.slice(1, -1).every(x => r.tower.map(String).includes(x.lv)) && r.notes.some(x => /Pluie modérée ou forte prévue \(2,4 mm\/h\)/.test(x.t)), JSON.stringify(r.notes));
  check(`${dev} · ruban de surface = lecture des mêmes points (humide puis mouillé)`, r.surface.length > 0 && r.surface.join() === r.expect.join() && r.surface.includes('wet'), JSON.stringify({ s: r.surface, e: r.expect }));
  const best = [...r.cmp].sort((a, b) => a.level - b.level || b.score - a.score)[0];
  check(`${dev} · choix des pneus : les deux voitures, mêmes scores que « Quelle voiture prendre ? », la meilleure conseillée`, r.cars.length === 2 && r.cars.every(c => String((r.cmp.find(x => x.id === c.id) || {}).score) === c.score)
    && r.cars.filter(c => c.best).length === 1 && r.cars.find(c => c.best).id === best.id && r.pick === best.id, JSON.stringify({ c: r.cars, cmp: r.cmp, pick: r.pick }));
  check(`${dev} · assistance (profondeur, pression, DOT) et bulletin (gel, alertes, météo) avec liens vers les détails`, r.chips.length === 3 && /PROFONDEUR OK · 6,0 MM/.test(r.chips[0]) && /DOT 1224/.test(r.chips[2]) && r.lines.join() === '#secIce,#secAlerts,#secWeatherLink', JSON.stringify({ c: r.chips, l: r.lines }));
  check(`${dev} · bouton principal « PRÉPARER LE DÉPART » vers l’onglet Trajet`, !!r.go && r.go.v === 'trajet' && /PRÉPARER LE DÉPART/.test(r.go.t), JSON.stringify(r.go));
  check(`${dev} · aucun « undefined », « NaN » ni « null » affiché`, !/undefined|NaN|\bnull\b/.test(r.text), r.text.slice(0, 300));
  check(`${dev} · rien n’est écrit tant qu’aucun choix n’est fait`, before === await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work, day: appDay() })));
  const lay = await p.evaluate(() => {
    const b = s => { const e = document.querySelector('#secRally ' + s); const x = e && e.getBoundingClientRect(); return x && { l: Math.round(x.left), t: Math.round(x.top) }; };
    const small = [...document.querySelectorAll('#secRally button, #secRally a')].filter(x => x.getBoundingClientRect().height < 43.5).map(x => x.className + ':' + x.textContent.slice(0, 20));
    const cut = [...document.querySelectorAll('#secRally .rl-ribbon span, #secRally .rl-chip, #secRally .rl-car .rl-k')].filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent);
    return { a: b('.rl-a'), b: b('.rl-b'), small, cut, over: document.documentElement.scrollWidth - window.innerWidth };
  });
  if (dev === 'pc') check(`${dev} · deux colonnes : spéciale (plaque, notes, surface) | pneus (choix, assistance, bulletin)`, lay.a.l < lay.b.l && Math.abs(lay.a.t - lay.b.t) < 4, JSON.stringify(lay));
  else check(`${dev} · une colonne : spéciale puis pneus ; cibles tactiles ≥ 44 pt`, lay.a.t < lay.b.t && lay.a.l === lay.b.l && !lay.small.length, JSON.stringify(lay));
  check(`${dev} · aucun libellé tronqué ni débordement horizontal`, !lay.cut.length && lay.over <= 1, JSON.stringify({ cut: lay.cut, over: lay.over }));
  // Choix explicite : la voiture conseillée devient la voiture active (même commande que le Garage), enregistrée.
  await p.locator('#secRally .rl-choice [data-act=day-car]').click(); await s.settle(2);
  const after = await p.evaluate(() => ({ active: appDay().activeCarId, pick: !!document.querySelector('#secRally .rl-choice [data-act=day-car]') }));
  check(`${dev} · « Prendre … pour mes trajets » : voiture active changée, bouton retiré`, after.active === best.id && !after.pick, JSON.stringify(after));
  await p.evaluate(() => { UI.view = 'meteo'; renderAll(); }); await s.settle(2);
  check(`${dev} · absent des autres onglets`, await p.evaluate(() => document.getElementById('secRally').hidden));
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
