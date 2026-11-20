// Onglet Trajet · « mur des stands » (19/11/2026), données FICTIVES, PC puis iPhone : en-tête avec compte à rebours, état de
// la piste = risque global du trajet, tour du parcours = points météo réels (même lecture qu'« État de la route »), point
// touché, stratégie pneus et comparatif des voitures du même trajet, meilleur départ, formulaire et check conservés,
// trois colonnes sur PC, une colonne sur iPhone, rien d'écrit, focus conservé.
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
  S.work.dep = '06:30'; S.work.durMin = 40; S.flags = S.flags || {};
  saveSettings(); appSetCar(S.cars[0].id); rebuild(); renderAll();
}
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-14T20:30:00+01:00', dev, wx: wx(false) }), p = s.p; await s.settle(4);
  await p.evaluate(setup); await s.settle(8);
  await p.evaluate(() => { UI.view = 'trajet'; renderAll(); window.scrollTo(0, 0); }); await s.settle(4);
  const before = await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work }));
  const r = await p.evaluate(() => {
    const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip, risk = t && tripRisk(t), tower = t ? F1Pure.routeTower(t.seq) : [];
    const q = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
    return { head: (q('#secTripSummary') || {}).innerText || '', cd: (q('#secTripSummary .pw-count .cd') || {}).textContent || '',
      flag: q('#secTrip .pw-flag') ? { lv: q('#secTrip .pw-flag').dataset.lv, t: q('#secTrip .pw-flag').textContent } : null, risk: risk && { lv: risk.lv, why: risk.why },
      rows: all('#secTrip .pw-row').map(x => ({ on: x.getAttribute('aria-pressed'), lv: x.querySelector('i').dataset.lv, t: x.textContent })), tower: tower.map(x => x.level),
      compound: (q('#secTrip .pw-compound') || {}).dataset, bars: all('#secTrip .pw-bar').length, res: t && t.res ? t.res.filter(x => x && x.w && Number.isFinite(x.w.score)).length : 0,
      best: (q('#secTrip .sl-col[aria-pressed="true"]') || {}).textContent || '', bestTag: (q('#secTrip .sl-col[aria-pressed="true"] .sl-tag') || {}).textContent || '', bestDetail: (q('#secTrip .sl-detail') || {}).textContent || '', oldBest: !!q('#secTrip .pw-best'), form: !!q('#secTrip #tripDestQ') && !!q('#secTrip [data-act=trip-plan]'), check: (q('#secTrip .trip-preflight h3') || {}).textContent || '',
      text: (q('#secTrip') || {}).innerText || '' };
  });
  check(`${dev} · en-tête : « PROCHAIN TRAJET » daté lun. 16/11 · 06:30 et compte à rebours « départ dans … »`, /PROCHAIN TRAJET/.test(r.head) && /lun\. 16\/11 · 06:30/.test(r.head) && /^départ dans \d+ j$|^départ dans \d+ h \d\d$/.test(r.cd), r.cd + ' | ' + r.head.slice(0, 200));
  check(`${dev} · état de la piste = risque global du trajet (même niveau, même cause)`, !!r.flag && !!r.risk && String(r.risk.lv) === r.flag.lv && r.flag.t.includes(r.risk.why || '§'), JSON.stringify({ flag: r.flag, risk: r.risk }));
  check(`${dev} · tour du parcours : une ligne par point météo, niveaux de la même lecture, le pire point sélectionné par défaut`, r.rows.length > 0 && r.rows.length === r.tower.length && r.rows.every((x, i) => x.lv === String(r.tower[i])) && r.rows.filter(x => x.on === 'true').length === 1 && r.rows.findIndex(x => x.on === 'true') === r.tower.indexOf(Math.max(...r.tower)), JSON.stringify(r.rows.map(x => [x.lv, x.on])) + ' | ' + JSON.stringify(r.tower));
  check(`${dev} · stratégie : monte été de la voiture A ; comparatif seulement à partir de deux voitures évaluées sur ce trajet`, !!r.compound && r.compound.t === 'summer' && r.res >= 1 && r.bars === (r.res >= 2 ? r.res : 0), JSON.stringify({ c: r.compound, bars: r.bars, res: r.res }));
  check(`${dev} · meilleur départ (créneau de départ, 20/11) : 05:30 sélectionné et marqué « MIEUX », vigilance au lieu de prudence ; ancien lien vers Météo retiré`, /05:30/.test(r.best) && r.bestTag === 'MIEUX' && /VIGILANCE/.test(r.bestDetail) && /Départ 1 h 00 plus tôt/.test(r.bestDetail) && !r.oldBest, r.best + ' | ' + r.bestTag + ' | ' + r.bestDetail);
  check(`${dev} · paramètres de course et « CHECK DES STANDS » conservés (formulaire intact)`, r.form && /CHECK DES STANDS/.test(r.check) && /PARAMÈTRES DE COURSE/.test(r.text), r.check);
  check(`${dev} · aucun « undefined », « NaN » ni « null » affiché`, !/undefined|NaN|\bnull\b/.test(r.text + r.head), r.text.slice(0, 300));
  // Touche d'un autre point : sélection, chiffres du point, focus conservé, rien d'écrit.
  const k = r.rows.findIndex(x => x.on !== 'true');
  await p.locator('#secTrip [data-act=pw-point][data-i="' + k + '"]').click(); await s.settle(1);
  const t2 = await p.evaluate(k => ({ on: document.querySelector('#secTrip [data-act=pw-point][data-i="' + k + '"]').getAttribute('aria-pressed'), focus: document.activeElement && document.activeElement.dataset.act + ':' + document.activeElement.dataset.i,
    detail: (document.querySelector('#secTrip .pw-detail') || {}).textContent || '' }), k);
  check(`${dev} · point touché : sélectionné, chiffres affichés (chaussée, visibilité, rafales), focus resté sur le bouton`, t2.on === 'true' && t2.focus === 'pw-point:' + k && /CHAUSSÉE.*°C/.test(t2.detail) && /RAFALES/.test(t2.detail), JSON.stringify(t2));
  check(`${dev} · aucune donnée écrite par le mur des stands`, before === await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work })));
  const lay = await p.evaluate(() => { const b = s => { const e = document.querySelector('#secTrip ' + s); const r = e && e.getBoundingClientRect(); return r && { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width) }; };
    return { c: b('.pw-c'), s: b('.pw-s'), l: b('.pw-l'), r: b('.pw-r'), sum: Math.round(document.getElementById('secTripSummary').getBoundingClientRect().top), over: document.documentElement.scrollWidth - window.innerWidth }; });
  if (dev === 'pc') check(`${dev} · trois colonnes : paramètres | tour du parcours | stratégie, en haut de l’onglet`, lay.l.l < lay.c.l && lay.c.l < lay.s.l && Math.abs(lay.l.t - lay.c.t) < 4 && Math.abs(lay.c.t - lay.s.t) < 4, JSON.stringify(lay));
  else {
    check(`${dev} · une colonne : piste et tour, puis stratégie, puis paramètres, puis radar`, lay.c.t < lay.s.t && lay.s.t < lay.l.t && lay.l.t < lay.r.t && lay.sum < lay.c.t, JSON.stringify(lay));
    const small = await p.evaluate(() => [...document.querySelectorAll('#secTrip .pw-row, #secTrip .sl-col')].filter(x => x.getBoundingClientRect().height < 43.5).map(x => x.className));
    check(`${dev} · cibles tactiles ≥ 44 pt (points du tour, heures du créneau)`, !small.length, JSON.stringify(small));
  }
  const cut = await p.evaluate(() => [...document.querySelectorAll('#secTrip .pw-pt b, #secTrip .pw-cols > span')].filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent));
  check(`${dev} · tour du parcours lisible : noms des points et en-têtes de colonnes ni tronqués ni chevauchés`, !cut.length, JSON.stringify(cut));
  check(`${dev} · aucun débordement horizontal`, lay.over <= 1, String(lay.over));
  // Retour du 19/11 (app iPhone) : une voiture choisie dans « Véhicule » devient la voiture active, enregistrée tout de suite,
  // visible dans le Garage et conservée après réouverture, sans programmer de trajet. « — à choisir — » ne la retire pas.
  const other = await p.evaluate(() => { const a = appDay().activeCarId; return (S.cars.find(c => c.id !== a) || {}).id; });
  await p.locator('#tripCar').selectOption(other); await s.settle(2);
  const picked = await p.evaluate(() => ({ active: appDay().activeCarId, next: !!appDay().nextDestination, sel: document.getElementById('tripCar').value }));
  check(`${dev} · « Véhicule » du Trajet : la voiture choisie devient la voiture active, sans trajet programmé`, picked.active === other && picked.sel === other, JSON.stringify(picked) + ' · attendu ' + other);
  await p.evaluate(() => { UI.view = 'garage'; renderAll(); }); await s.settle(2);
  const badge = await p.evaluate(() => { const b = document.querySelector('#secGarage .garage-active'); const c = b && b.closest('[data-garage-car]'); return c && c.dataset.garageCar; });
  check(`${dev} · Garage : « VOITURE ACTIVE » sur la voiture choisie dans le Trajet`, badge === other, String(badge));
  await p.evaluate(async () => { await window.TWRC_VAULT.flush(); if (window.TWRC_VAULT.pendingWrites || window.TWRC_VAULT.error) throw new Error('enregistrement non confirmé avant réouverture'); });
  await p.reload(); await s.settle(8);
  check(`${dev} · réouverture : voiture active conservée`, await p.evaluate(() => appDay().activeCarId) === other);
  await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(2);
  await p.locator('#tripCar').selectOption(''); await s.settle(2);
  check(`${dev} · « — à choisir — » dans le Trajet ne retire pas la voiture active`, await p.evaluate(() => appDay().activeCarId) === other);
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
