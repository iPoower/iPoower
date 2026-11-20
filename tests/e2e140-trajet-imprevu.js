// Trajets imprévus (20/11/2026, maquettes validées), données FICTIVES, PC puis iPhone : quelqu'un d'autre part avec une voiture.
// Formulaire de l'onglet Trajet (voiture, conducteur, départ, destination CHOISIE dans les résultats, départ maintenant, retour
// à 18:30) ; bandeau « PARTIE AVEC … » ; feuille de route (aller en cours sans GPS, retour prévu) ; voiture occupée ; la
// journée de l'utilisateur intacte (aucune destination, voiture active ni lieu modifiés) ; conservé au rechargement ;
// « Rentré·e » clôt le prêt ; saisie incomplète refusée sans écriture.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 600))); if (!ok) fail++; };
async function routes(p) {
  await p.route('https://data.geopf.fr/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ features: [{ properties: { label: '1 Rue Test 99999 Ville Test', city: 'Ville Test', type: 'housenumber' }, geometry: { coordinates: [2.9, 49.6] } }] }) }));
  await p.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }));
  await p.route('https://geocoding-api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"results":[]}' }));
  await p.route('https://router.project-osrm.org/**', r => {
    const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const coords = Array.from({ length: 12 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 11, A[1] + (B[1] - A[1]) * i / 11]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: 64000, duration: 3000,
      geometry: { coordinates: coords }, legs: [{ annotation: { duration: coords.slice(1).map(() => 3000 / 11) } }] }] }) });
  });
}
const state = p => p.evaluate(() => ({ loans: JSON.parse(JSON.stringify(S.loans || [])), banner: (document.querySelector('#secTripSummary .ln-busy') || {}).innerText || '',
  cards: [...document.querySelectorAll('#secTripSummary .fr-card')].map(c => ({ src: c.dataset.src, st: c.dataset.state, t: c.innerText.replace(/\s+/g, ' ') })),
  msg: (document.querySelector('#secTrip .ln-form .trip-message') || {}).textContent || '', form: !!document.querySelector('#secTrip .ln-form'),
  day: JSON.stringify({ n: appDay().nextDestination || null, car: appDay().activeCarId || null, conf: PLACE.conf ? PLACE.conf.placeId : null }),
  over: document.documentElement.scrollWidth - window.innerWidth }));
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T14:00:00+01:00', dev }), p = s.p; await routes(p); await s.settle(4);
  await p.evaluate(() => { S.work.days = []; S.loans = []; saveSettings(); UI.view = 'trajet'; rebuild(); renderAll(); }); await s.settle(4);
  const before = await state(p), car = await p.evaluate(() => S.cars[1].id), carName = await p.evaluate(() => (S.cars[1].short || S.cars[1].name).toUpperCase());
  // Saisie incomplète : refusée, rien n'est écrit.
  await p.locator('#secTrip [data-act=loan-open]').click(); await s.settle(1);
  await p.fill('#loanDriver', 'Conducteur B'); await p.locator('#secTrip [data-act=loan-save]').click(); await s.settle(1);
  const a = await state(p);
  check(`${dev} · destination non choisie : enregistrement refusé avec message, aucun trajet écrit`, a.form && /Recherche la destination/.test(a.msg) && a.loans.length === 0, JSON.stringify(a));
  // Saisie complète.
  await p.locator('#secTrip [data-act=loan-car][data-v="' + car + '"]').click(); await s.settle(1);
  check(`${dev} · conducteur conservé après le choix de la voiture (aucune saisie perdue)`, (await p.inputValue('#loanDriver')) === 'Conducteur B');
  await p.fill('#loanQ', 'Ville Test'); await p.locator('#secTrip [data-act=loan-search]').click(); await s.settle(3);
  await p.locator('#secTrip [data-act=loan-pick][data-i="0"]').click(); await s.settle(1);
  await p.fill('#loanRetTime', '18:30'); await p.locator('#secTrip [data-act=loan-save]').click(); await s.settle(8);
  const c = await state(p), x = c.loans[0];
  check(`${dev} · trajet imprévu enregistré : voiture, conducteur, départ maintenant (14:00), destination choisie, retour 18:30`,
    c.loans.length === 1 && x.carId === car && x.driver === 'Conducteur B' && x.dep === '2026-11-16T14:00' && x.ret === '2026-11-16T18:30' && /Rue Test|Ville Test/.test(x.to.name + ' ' + (x.to.address || '')) && x.back === null, JSON.stringify(c.loans));
  check(`${dev} · bandeau « ${carName} · PARTIE AVEC CONDUCTEUR B » avec retour prévu 18:30 et bouton « Rentré·e »`, c.banner.includes(carName + ' · PARTIE AVEC CONDUCTEUR B') && /retour prévu 18:30/.test(c.banner) && /Rentré·e/.test(c.banner), c.banner);
  const loanCards = c.cards.filter(k => k.src === 'loan');
  check(`${dev} · feuille de route : aller en cours sans GPS puis retour prévu, tous deux au nom du conducteur`, loanCards.length === 2 && loanCards[0].st === 'live' && /EN COURS · CONDUCTEUR B/.test(loanCards[0].t) && /SANS GPS/.test(loanCards[0].t) &&
    loanCards[1].st === 'later' && /PRÉVU · CONDUCTEUR B/.test(loanCards[1].t) && /18:30/.test(loanCards[1].t), JSON.stringify(c.cards));
  check(`${dev} · journée de l’utilisateur intacte (destination, voiture active, lieu confirmé)`, c.day === before.day, c.day + ' | ' + before.day);
  check(`${dev} · voiture occupée tant qu’elle n’est pas rentrée`, await p.evaluate(id => !!loanBusy(id), car));
  check(`${dev} · aucun débordement horizontal`, c.over <= 1, String(c.over));
  // Rechargement : conservé (réglages chiffrés).
  await p.evaluate(async () => { await window.TWRC_VAULT.flush(); });
  await p.reload(); await s.settle(10); await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(3);
  const d = await state(p);
  check(`${dev} · réouverture : trajet imprévu et bandeau conservés`, d.loans.length === 1 && d.loans[0].id === x.id && d.banner.includes('PARTIE AVEC CONDUCTEUR B'), JSON.stringify(d.loans));
  // Retour.
  await p.locator('#secTripSummary [data-act=loan-back]').click(); await s.settle(3);
  const e = await state(p);
  check(`${dev} · « Rentré·e » : prêt clos, bandeau retiré, voiture libre, trajets marqués rentrés`, Number.isFinite(e.loans[0].back) && !e.banner && await p.evaluate(id => !loanBusy(id), car) &&
    e.cards.filter(k => k.src === 'loan').every(k => k.st === 'done' && /RENTRÉ·E/.test(k.t)), JSON.stringify(e));
  check(`${dev} · aucun « undefined », « NaN » ni « null » affiché`, !/undefined|NaN|\bnull\b/.test(JSON.stringify(e.cards) + e.banner));
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
