// État de la route (19/11/2026), données FICTIVES, PC puis iPhone : trajet daté dans l'en-tête, ruban des secteurs avec heure
// de passage, chiffres du secteur touché, meilleur départ (même lecture à −1 h / +1 h), simulation nommée et réversible,
// rien d'écrit, focus conservé ; trajet sec : aucun niveau affiché ni décalage proposé.
// Trajet domicile-travail fictif le lundi 16/11 06:30 → 07:10 ; pluie 05 h 0,4 · 06 h 0,5 · 07 h 2,4 · 08 h 1,0 mm/h :
// prévu (06 h-07 h) PRUDENCE, −1 h (05 h-06 h) VIGILANCE, +1 h (07 h-08 h) PRUDENCE → « Partir à 05:30 ».
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 500))); if (!ok) fail++; };
const hourOf = t => +String(t).slice(11, 13), dayOf = t => String(t).slice(0, 10);
const RAIN = { 5: 0.4, 6: 0.5, 7: 2.4, 8: 1.0 };
const wx = dry => o => {
  const H = o.hourly || {};
  if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) {
    const mon = t => dayOf(t) === '2026-11-16';
    H.temperature_2m = H.time.map((t, i) => mon(t) && hourOf(t) <= 10 ? 9 + hourOf(t) * 0.2 : H.temperature_2m[i]);
    for (const k of ['precipitation', 'rain']) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => mon(H.time[i]) ? (dry ? 0 : RAIN[hourOf(H.time[i])] || 0) : x);
    for (const [k, v] of [['visibility', 20000], ['snowfall', 0], ['wind_gusts_10m', 25]]) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => mon(H.time[i]) ? v : x);
    if (Array.isArray(H.weather_code)) H.weather_code = H.weather_code.map((x, i) => mon(H.time[i]) ? (dry ? 2 : 61) : x);
  }
  return o;
};
function setup() {
  const day = '2026-11-13';
  S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', brand: 'Marque ' + i, model: 'Modèle test', size: '205/55 R16 91V', treadEst: 0, dot: '1224',
    tread: 6, treadAv: 6, treadAr: 6, treads: [{ d: day, mm: 6, km: null, ax: 'av' }, { d: day, mm: 6, km: null, ax: 'ar' }] }));
  S.work.dep = '06:30'; S.work.durMin = 40; S.flags = S.flags || {}; S.flags.f1TrackConditions = 1;
  saveSettings(); appSetCar(S.cars[0].id); rebuild(); renderAll();
}
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-14T20:30:00+01:00', dev, wx: wx(false) }), p = s.p; await s.settle(4);
  await p.evaluate(setup); await s.settle(8);
  await p.evaluate(() => { UI.view = 'meteo'; renderAll(); }); await s.settle(4);
  const P = '#f1-panel-trackConditions';
  const read = () => p.evaluate(P => { const el = document.querySelector(P); if (!el) return null; el.open = true;
    const q = s => el.querySelector(s), all = s => [...el.querySelectorAll(s)];
    return { when: (q('.trk-when') || {}).textContent || '', verdict: (q('.trk-verdict') || {}).textContent || '', vlv: q('.trk-verdict') && q('.trk-verdict').dataset.lv,
      segs: all('.trk-seg').map(x => ({ lv: x.dataset.lv, on: x.getAttribute('aria-pressed'), t: x.textContent })), detail: (q('.trk-detail') || {}).textContent || '',
      deps: all('.trk-dep').map(x => ({ h: x.dataset.h, on: x.getAttribute('aria-pressed'), t: x.textContent })), best: (q('.trk-best') || {}).textContent || '', text: el.textContent }; }, P);
  const before = await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work }));
  // Retour du 20/11 (« ÉTAT DE LA ROUTE disparaît après ») : l'horloge redessine la section Météo chaque minute ; le panneau reste.
  const present = () => p.evaluate(P => !!document.querySelector(P), P);
  const t0 = await present(); await p.clock.runFor(3 * 60e3); await s.settle(4); const t3 = await present();
  check(`${dev} · « ÉTAT DE LA ROUTE » toujours affiché après 3 min (rafraîchissements minute par minute de la section Météo)`, t0 && t3, JSON.stringify({ t0, t3 }));
  let r = await read();
  check(`${dev} · en-tête daté « lun. 16/11 · 06:30 → arrivée 07:10 » (jamais l’heure seule pour un autre jour)`, !!r && /Départ lun\. 16\/11 · 06:30 → arrivée 07:10/.test(r.when), r && r.when);
  check(`${dev} · verdict PRUDENCE nommé avec sa cause et son secteur`, !!r && r.vlv === '2' && /PRUDENCE/.test(r.verdict) && /Pluie modérée ou forte prévue · secteur \d/.test(r.verdict), r && r.verdict);
  check(`${dev} · ruban : 1 à 3 secteurs colorés, un sélectionné, au moins un PRUDENCE`, !!r && r.segs.length >= 1 && r.segs.length <= 3 && r.segs.filter(x => x.on === 'true').length === 1 && r.segs.some(x => x.lv === '2'), JSON.stringify(r && r.segs));
  check(`${dev} · chiffres du secteur : pluie mm/h, chaussée °C, visibilité, rafales (jamais « undefined » ni « NaN »)`, !!r && /PLUIE\d/.test(r.detail.replace(/\s/g, '')) && /mm\/h/.test(r.detail) && /°C/.test(r.detail) && /RAFALES/.test(r.detail) && !/undefined|NaN|null/.test(r.text), r && r.detail);
  check(`${dev} · meilleur départ : −1 h VIGILANCE conseillé, prévu PRUDENCE, +1 h PRUDENCE`, !!r && r.deps.length === 3 && /−1 h · conseillé/.test(r.deps[0].t) && /05:30/.test(r.deps[0].t) && /VIGILANCE/.test(r.deps[0].t) && /PRUDENCE/.test(r.deps[1].t) && /PRUDENCE/.test(r.deps[2].t) && /Partir à 05:30 : vigilance au lieu de prudence/.test(r.best), JSON.stringify(r && r.deps) + ' | ' + (r && r.best));
  // Touche d'un secteur puis du départ conseillé : simulation nommée, verdict recalculé, focus conservé, rien d'écrit.
  const last = r.segs.length - 1;
  await p.locator(P + ' [data-act=track-sector][data-i="' + last + '"]').click(); await s.settle(1);
  r = await read();
  const f1 = await p.evaluate(() => document.activeElement && document.activeElement.dataset.act + ':' + document.activeElement.dataset.i);
  check(`${dev} · secteur touché : sélectionné, ses chiffres affichés, focus resté sur le bouton`, r.segs[last].on === 'true' && new RegExp('Secteur ' + (last + 1) + ' ·').test(r.detail) && f1 === 'track-sector:' + last, f1 + ' | ' + r.detail);
  await p.locator(P + ' [data-act=track-shift][data-h="-1"]').click(); await s.settle(1);
  r = await read();
  check(`${dev} · simulation −1 h : nommée « Simulation · départ … 05:30 », verdict VIGILANCE, horaire prévu rappelé`, /Simulation · départ lun\. 16\/11 · 05:30/.test(r.when) && /prévu 06:30/.test(r.when) && r.vlv === '1' && r.deps[0].on === 'true', r.when + ' | ' + r.verdict);
  await p.locator(P + ' [data-act=track-shift][data-h="0"]').click(); await s.settle(1);
  r = await read();
  check(`${dev} · retour à l’horaire prévu : en-tête et verdict d’origine`, /^Départ lun\. 16\/11 · 06:30/.test(r.when) && r.vlv === '2', r.when);
  check(`${dev} · aucune donnée écrite par la carte (voitures, horaires)`, before === await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work })));
  if (dev === 'iphone') {
    const small = await p.evaluate(P => [...document.querySelectorAll(P + ' .trk-seg, ' + P + ' .trk-dep')].filter(x => x.getBoundingClientRect().height < 43.5).map(x => x.className), P);
    check(`${dev} · cibles tactiles ≥ 44 pt (secteurs et départs)`, !small.length, JSON.stringify(small));
  }
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${dev} · aucun débordement horizontal`, over <= 1, String(over));
  await s.c.close();
  // Trajet sec : aucun niveau dans le bloc départ, aucune proposition de décalage.
  const d = await session(b, { at: '2026-11-14T20:30:00+01:00', dev, wx: wx(true) }), q = d.p; await d.settle(4);
  await q.evaluate(setup); await d.settle(8); await q.evaluate(() => { UI.view = 'meteo'; renderAll(); }); await d.settle(4);
  const dry = await q.evaluate(P => { const el = document.querySelector(P); return el ? { deps: el.querySelectorAll('.trk-dep').length, ok: (el.querySelector('.trk-best-ok') || {}).textContent || '', text: el.textContent } : null; }, P);
  check(`${dev} · trajet sec : RAS, aucun départ proposé, « pas besoin de décaler »`, !!dry && dry.deps === 0 && /pas besoin de décaler le départ/.test(dry.ok) && !/VIGILANCE|PRUDENCE|DANGER/.test(dry.text.replace(/ÉTAT DE LA ROUTE/i, '')), dry && dry.text.slice(0, 400));
  await d.c.close();
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'pc'); await run(b, 'iphone'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
