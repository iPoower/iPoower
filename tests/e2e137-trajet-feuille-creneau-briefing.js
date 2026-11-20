// Onglet Trajet · lot 1 (20/11/2026, maquettes validées), données FICTIVES, PC puis iPhone :
// 1. feuille de route du jour : les trajets du jour numérotés ES 1, ES 2…, état de chacun, détail au toucher, « voir dans le
//    mur des stands » sans rien écrire ;
// 2. créneau de départ : même lecture que departureOptions (±2 h, heures entières), trajet domicile-travail en simulation
//    seulement, trajet saisi décalé puis rétabli par la même fonction que « Mettre à jour le trajet » ;
// 3. briefing copilote : mêmes notes que le carnet de l'onglet Pneus (copilotNotes), lecture vocale sur appui uniquement.
// Lundi 16/11, il est 05:00 ; domicile-travail 06:30 → 07:10 puis retour 17:30 ; pluie 05 h 0,4 · 06 h 0,5 · 07 h 2,4 · 08 h 1,0 mm/h.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 600))); if (!ok) fail++; };
const hourOf = t => +String(t).slice(11, 13), dayOf = t => String(t).slice(0, 10);
const RAIN = { 5: 0.4, 6: 0.5, 7: 2.4, 8: 1.0 };
const wx = o => {
  const H = o.hourly || {};
  if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) {
    const mon = t => dayOf(t) === '2026-11-16';
    H.temperature_2m = H.time.map((t, i) => mon(t) ? 9 + hourOf(t) * 0.2 : H.temperature_2m[i]);
    for (const k of ['precipitation', 'rain']) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => mon(H.time[i]) ? RAIN[hourOf(H.time[i])] || 0 : x);
    for (const [k, v] of [['visibility', 20000], ['snowfall', 0], ['wind_gusts_10m', 25]]) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => mon(H.time[i]) ? v : x);
    if (Array.isArray(H.weather_code)) H.weather_code = H.weather_code.map((x, i) => mon(H.time[i]) ? (RAIN[hourOf(H.time[i])] ? 61 : 2) : x);
  }
  return o;
};
function setup() {
  S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', brand: 'Marque ' + i, model: 'Modèle test', size: '205/55 R16 91V', tread: 6, treadAv: 6, treadAr: 6 }));
  S.work.dep = '06:30'; S.work.ret = '17:30'; S.work.durMin = 40; S.work.days = [1, 2, 3, 4, 5];
  saveSettings(); appSetCar(S.cars[0].id); rebuild(); renderAll();
}
const read = p => p.evaluate(() => {
  const q = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
  return { sheet: (q('#secTripSummary .fr-sheet') || {}).innerText || '', cards: all('#secTripSummary .fr-card').map(c => ({ st: c.dataset.state, t: c.innerText, open: c.querySelector('.fr-head').getAttribute('aria-expanded') })),
    list: tripDayList().map(x => ({ key: x.t.key, st: x.state })), focus: (q('#secTrip .fr-focus') || {}).innerText || '',
    slots: all('#secTrip .sl-col').map(b => ({ s: b.dataset.s, on: b.getAttribute('aria-pressed'), lv: b.querySelector('.sl-bar').dataset.lv, tag: b.querySelector('.sl-tag').textContent, hm: b.querySelector('b').textContent, h: Math.round(b.getBoundingClientRect().height) })),
    detail: (q('#secTrip .sl-detail') || {}).innerText || '', apply: q('#secTrip [data-act=slot-apply]') ? q('#secTrip [data-act=slot-apply]').textContent : null,
    slotText: (q('#secTrip .sl-box') || {}).innerText || '', best: !!q('#secTrip .pw-best'),
    brief: (q('#secTrip .bf-box') || {}).innerText || '', notes: all('#secTrip .bf-notes li span').map(x => x.textContent), play: q('#secTrip [data-act=brief-play]') && q('#secTrip [data-act=brief-play]').getAttribute('aria-pressed'),
    nd: appDay().nextDestination && { dep: appDay().nextDestination.dep, key: appDay().nextDestination.tripKey },
    text: ((q('#secTripSummary') || {}).innerText || '') + ((q('#secTrip') || {}).innerText || ''), over: document.documentElement.scrollWidth - window.innerWidth };
});
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T05:00:00+01:00', dev, wx }), p = s.p; await s.settle(4);
  // Itinéraire simulé qui aboutit pour le trajet saisi (la session de base refuse toute requête d'itinéraire).
  await p.route('https://router.project-osrm.org/**', r => {
    const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const coords = Array.from({ length: 12 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 11, A[1] + (B[1] - A[1]) * i / 11]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: 40000, duration: 2400,
      geometry: { coordinates: coords }, legs: [{ annotation: { duration: coords.slice(1).map(() => 2400 / 11) } }] }] }) });
  });
  await p.evaluate(setup); await s.settle(8);
  await p.evaluate(() => { UI.view = 'trajet'; renderAll(); window.scrollTo(0, 0); }); await s.settle(4);
  const before = await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work, day: appDay().nextDestination || null }));
  // 1 · Feuille de route du jour
  const a = await read(p);
  check(`${dev} · feuille de route : 2 spéciales du jour (aller 06:30 puis retour 17:30), ES 1 prochaine, ES 2 prévue`,
    /FEUILLE DE ROUTE/.test(a.sheet) && /2 SPÉCIALES/.test(a.sheet) && a.cards.length === 2 && a.cards[0].st === 'next' && a.cards[1].st === 'later' &&
    /ES 1/.test(a.cards[0].t) && /06:30/.test(a.cards[0].t) && /ES 2/.test(a.cards[1].t) && /17:30/.test(a.cards[1].t) && /PROCHAINE · départ dans/.test(a.cards[0].t), JSON.stringify(a.cards));
  check(`${dev} · feuille : temps sur place entre les deux spéciales, étape la plus délicate nommée (ES 1, même risque que le mur)`,
    /Sur place · 10 h 20/.test(a.sheet) && /ÉTAPE LA PLUS DÉLICATE : ES 1 · (PRUDENCE|VIGILANCE)/.test(a.sheet), a.sheet);
  await p.locator('#secTripSummary .fr-card >> nth=1 >> [data-act=fr-open]').click(); await s.settle(1);
  const b1 = await read(p);
  check(`${dev} · ES 2 touchée : détail ouvert (aria-expanded), bouton « Voir dans le mur des stands », focus conservé`,
    b1.cards[1].open === 'true' && /Voir dans le mur des stands/.test(b1.cards[1].t) && await p.evaluate(() => document.activeElement && document.activeElement.dataset.act === 'fr-open'), JSON.stringify(b1.cards[1]));
  await p.locator('#secTripSummary [data-act=fr-focus]').click(); await s.settle(2);
  const c1 = await read(p);
  check(`${dev} · « Voir dans le mur des stands » : le mur affiche la spéciale de 17:30, bandeau de retour visible`, /départ 17:30/.test(c1.focus) && /Revenir au prochain trajet/.test(c1.focus), c1.focus);
  await p.locator('#secTrip .fr-focus [data-act=fr-focus]').click(); await s.settle(2);
  const d1 = await read(p);
  check(`${dev} · retour au prochain trajet : bandeau retiré`, !d1.focus, d1.focus);
  // 2 · Créneau de départ (trajet domicile-travail : simulation seulement)
  const ref = await p.evaluate(() => { const t = APP_CONTEXT.snapshot.nextTrip, o = F1Pure.departureOptions(t.seq, { shifts: [-2, -1, 1, 2] });
    return o && { lv: o.options.map(x => x.available ? String(x.level) : 'x'), best: o.best ? o.best.shift : null, planned: o.planned.level }; });
  check(`${dev} · créneau : 5 colonnes (−2 h → +2 h), niveaux identiques à departureOptions, « PRÉVU » à 06:30`,
    !!ref && d1.slots.length === 5 && d1.slots.every((x, i) => x.lv === ref.lv[i]) && d1.slots[2].tag === 'PRÉVU' && d1.slots[2].hm === '06:30', JSON.stringify({ slots: d1.slots, ref }));
  check(`${dev} · créneau : meilleur départ sélectionné et marqué « MIEUX » (ou horaire prévu si rien de mieux)`,
    ref.best == null ? d1.slots[2].on === 'true' : d1.slots.find(x => x.s === String(ref.best)).on === 'true' && d1.slots.find(x => x.s === String(ref.best)).tag === 'MIEUX', JSON.stringify({ slots: d1.slots, ref }));
  check(`${dev} · domicile-travail : simulation seulement, aucun bouton « Décaler », ancien lien « Meilleur départ » retiré`,
    d1.apply === null && /Simulation seulement : l’horaire vient de tes réglages domicile-travail, rien n’est modifié ici/.test(d1.slotText) && !d1.best, d1.slotText);
  await p.locator('#secTrip [data-act=slot-pick][data-s="1"]').click(); await s.settle(1);
  const e1 = await read(p);
  check(`${dev} · heure touchée (+1 h) : sélectionnée, détail 07:30 → 08:10 « 1 h 00 plus tard », focus conservé`,
    e1.slots[3].on === 'true' && /07:30 → 08:10/.test(e1.detail) && /Départ 1 h 00 plus tard/.test(e1.detail) && await p.evaluate(() => document.activeElement && document.activeElement.dataset.s === '1'), e1.detail);
  if (dev === 'iphone') { const small = e1.slots.filter(x => x.h < 44); check(`${dev} · colonnes du créneau ≥ 44 pt`, !small.length, JSON.stringify(small)); }
  // 3 · Briefing copilote : mêmes notes que le carnet de l'onglet Pneus
  const pneus = await p.evaluate(() => { const t = APP_CONTEXT.snapshot.nextTrip; return tripBriefNotes(t).map(n => n.text); });
  check(`${dev} · briefing : mêmes notes que copilotNotes, bouton « ÉCOUTER LE BRIEFING » au-dessus de « Programmer »`,
    pneus.length > 0 && JSON.stringify(e1.notes) === JSON.stringify(pneus) && /ÉCOUTER LE BRIEFING/.test(e1.brief) &&
    await p.evaluate(() => { const b = document.querySelector('#secTrip .bf-box'), a = document.querySelector('#secTrip .trip-actions'); return !!b && !!a && b.compareDocumentPosition(a) === Node.DOCUMENT_POSITION_FOLLOWING; }), JSON.stringify({ notes: e1.notes, pneus }));
  // Synthèse vocale simulée : les phrases lues sont relevées, rien n'est lu sans appui.
  await p.evaluate(() => { window.__said = []; const fake = { speak: u => { window.__said.push(u.text); }, cancel: () => {} };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake }); window.SpeechSynthesisUtterance = function (t) { this.text = t; }; });
  check(`${dev} · aucune lecture sans appui`, (await p.evaluate(() => window.__said.length)) === 0);
  await p.locator('#secTrip [data-act=brief-play]').click(); await s.settle(1);
  const f1 = await p.evaluate(() => ({ said: window.__said, pressed: document.querySelector('#secTrip [data-act=brief-play]').getAttribute('aria-pressed') }));
  check(`${dev} · « Écouter » : introduction puis une phrase par note (chiffres lisibles à voix haute), bouton « Arrêter »`,
    f1.said.length === pneus.length + 1 && /^Briefing\./.test(f1.said[0]) && !f1.said.some(x => /mm\/h|°C/.test(x)) && f1.pressed === 'true', JSON.stringify(f1));
  await p.locator('#secTrip [data-act=brief-play]').click(); await s.settle(1);
  check(`${dev} · second appui : lecture arrêtée`, (await p.evaluate(() => document.querySelector('#secTrip [data-act=brief-play]').getAttribute('aria-pressed'))) === 'false');
  check(`${dev} · rien d’écrit par la feuille, le créneau en simulation ni le briefing`, before === await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work, day: appDay().nextDestination || null })));
  // Trajet saisi : « Décaler le départ » réécrit l'heure par la même fonction que « Mettre à jour le trajet », puis « Revenir ».
  await p.evaluate(() => { const [o, d] = S.locs; appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep: '2026-11-16T07:00', carId: null }); rebuild(); renderAll(); });
  await s.settle(8);
  const g = await read(p);
  const shift = g.slots.find(x => x.s !== '0' && x.lv !== 'x' && x.hm > '05:05');
  check(`${dev} · trajet saisi : créneau disponible et bouton « Décaler le départ à … » sur une autre heure`, !!shift, JSON.stringify(g.slots));
  if (shift) {
    await p.locator('#secTrip [data-act=slot-pick][data-s="' + shift.s + '"]').click(); await s.settle(1);
    const h = await read(p);
    check(`${dev} · bouton « Décaler le départ à ${shift.hm} »`, h.apply === 'Décaler le départ à ' + shift.hm, String(h.apply));
    await p.locator('#secTrip [data-act=slot-apply]').click(); await s.settle(8);
    const i = await read(p);
    check(`${dev} · départ décalé à ${shift.hm} : même trajet (même clé), confirmation et « Revenir à 07:00 »`,
      i.nd && i.nd.dep === '2026-11-16T' + shift.hm && i.nd.key === g.nd.key && /DÉPART DÉCALÉ À/.test(i.slotText) && /Revenir à 07:00/.test(i.slotText), JSON.stringify({ nd: i.nd, t: i.slotText }));
    await p.locator('#secTrip [data-act=slot-undo]').click(); await s.settle(8);
    const j = await read(p);
    check(`${dev} · « Revenir » : départ rétabli à 07:00, même trajet`, j.nd && j.nd.dep === '2026-11-16T07:00' && j.nd.key === g.nd.key, JSON.stringify(j.nd));
  }
  const z = await read(p);
  check(`${dev} · aucun « undefined », « NaN » ni « null » affiché, aucun débordement horizontal`, !/undefined|NaN|\bnull\b/.test(z.text) && z.over <= 1, z.text.slice(0, 300) + ' | ' + z.over);
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
