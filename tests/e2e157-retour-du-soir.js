// Retour du soir (27/11/2026, choix du propriétaire), données FICTIVES, iPhone puis PC. Le soir, le retour va au domicile
// ou à un autre lieu enregistré (« Lieu fictif B »). Avant le départ : « Ce soir, je rentre » redirige le retour (destination,
// verdict, Départ), conservé au rechargement, réversible. Après coup : « Arrivé ailleurs » clôt le retour sur l'autre lieu
// (lieu confirmé, journal), l'aller reste intact. Jamais le travail parmi les choix, jamais sur un aller.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const PLACE_B = { id: 'lieu-fictif-b', name: 'Lieu fictif B' };
function setup(B) {
  S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', size: '205/55 R16 91V', tread: 6 }));
  const home = S.locs[0]; S.customs = (S.customs || []).filter(c => c.id !== B.id).concat([{ ...B, lat: +(home.lat + 0.05).toFixed(5), lon: +(home.lon + 0.04).toFixed(5) }]);
  S.work.dep = '06:30'; S.work.ret = '17:00'; S.work.durMin = 40; saveSettings(); appSetCar(S.cars[0].id); rebuild(); renderAll();
}
const card = (p, dir) => p.evaluate(d => {
  const c = [...document.querySelectorAll('#secTripSummary .fr-card')].find(c => new RegExp('\\|' + d + '$').test(c.querySelector('.fr-head').dataset.key)), q = s => c ? [...c.querySelectorAll(s)] : [];
  const t = tripDayList().find(x => new RegExp('\\|' + d + '$').test(x.t.key)), to = t && appTripPlace(t.t, 'to');
  return { key: t && t.t.key, state: t && t.state, to: to && to.id, choose: q('[data-act=trip-ret-dest]').map(b => ({ id: b.dataset.id, text: b.textContent.trim(), on: b.getAttribute('aria-pressed') === 'true', h: Math.round(b.getBoundingClientRect().height) })),
    elsewhere: q('[data-act=fr-arrived-at]').map(b => ({ id: b.dataset.id, text: b.textContent.trim() })), text: c ? c.innerText : '' };
}, dir);
async function run(b, dev) {
  // Avant le départ : 15:00, retour domicile-travail à 17:00.
  { const s = await session(b, { at: '2026-11-16T15:00:00+01:00', dev }), p = s.p; await s.settle(4);
    await p.evaluate(setup, PLACE_B); await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(6);
    const home = await p.evaluate(() => S.locs[0].id), work = await p.evaluate(() => S.work.to);
    const r0 = await card(p, 'ret'), g0 = await card(p, 'go');
    check(`${dev} · retour du soir : « Ce soir, je rentre » propose le domicile (choisi) et le lieu enregistré, jamais le travail, cibles ≥ 44 px`,
      r0.choose.length >= 2 && r0.choose.length <= 3 && r0.choose[0]?.id === home && r0.choose[0]?.on && r0.choose.some(c => c.id === PLACE_B.id && !c.on) && !r0.choose.some(c => c.id === work) && r0.choose.every(c => c.h >= 44) && r0.to === home, JSON.stringify(r0));
    check(`${dev} · aucun choix de retour sur l’aller`, !g0.choose.length && !g0.elsewhere.length, JSON.stringify(g0));
    await p.locator(`#secTripSummary [data-act=trip-ret-dest][data-id="${PLACE_B.id}"]`).click({ timeout: 3000 }).catch(() => {}); await s.settle(4);
    const r1 = await card(p, 'ret');
    check(`${dev} · choix « ${PLACE_B.name} » : le retour vise ce lieu (titre et destination), bouton enfoncé`, r1.to === PLACE_B.id && r1.choose.find(c => c.id === PLACE_B.id)?.on && new RegExp(PLACE_B.name).test(r1.text), JSON.stringify(r1));
    await p.evaluate(() => { UI.view = 'gps'; renderAll(); }); await s.settle(3);
    const dep = await p.evaluate(B => { const r = document.getElementById('secGps'); return { text: r.innerText, chips: [...r.querySelectorAll('[data-act=trip-ret-dest]')].map(b => b.dataset.id + ':' + b.getAttribute('aria-pressed')),
      hrefs: [...r.querySelectorAll('[data-gps=launch] a[href]')].map(a => a.getAttribute('href')) }; }, PLACE_B);
    check(`${dev} · onglet Départ : même choix, trajet vers ${PLACE_B.name}, aucun lien ne contient le lieu enregistré`, dep.chips.includes(PLACE_B.id + ':true') && dep.text.includes(PLACE_B.name) && !dep.hrefs.some(h => /maps\.apple\.com|google\.com\/maps|ll=/.test(h)), JSON.stringify(dep));
    await p.evaluate(async () => { await window.TWRC_VAULT.flush(); }); await p.reload(); await s.settle(8);
    await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(3);
    const r2 = await card(p, 'ret');
    check(`${dev} · rechargement : choix du soir conservé`, r2.to === PLACE_B.id && r2.choose.find(c => c.id === PLACE_B.id)?.on, JSON.stringify(r2));
    await p.locator(`#secTripSummary [data-act=trip-ret-dest][data-id="${home}"]`).click({ timeout: 3000 }).catch(() => {}); await s.settle(4);
    const r3 = await card(p, 'ret');
    check(`${dev} · retour au domicile : choix annulé, le retour vise de nouveau le domicile`, r3.to === home && r3.choose[0]?.on && r3.choose.filter(c => c.on).length === 1, JSON.stringify(r3));
    await s.c.close(); }
  // Après coup : 20:23, retour parti à 17:00 jamais confirmé ; l'aller est déjà clos.
  { const s = await session(b, { at: '2026-11-16T20:23:00+01:00', dev }), p = s.p; await s.settle(4);
    await p.evaluate(setup, PLACE_B); await s.settle(4);
    const go = await p.evaluate(() => { const g = tripDayList().find(x => /\|go$/.test(x.t.key));
      appAction(() => { USER_STORE.state.done[g.t.key] = { how: 'confirmé', at: Date.now() - 780 * 60e3, exp: Date.now() + 86400e3 }; });
      UI.view = 'trajet'; rebuild(); renderAll(); return { key: g.t.key, done: JSON.stringify(USER_STORE.state.done[g.t.key]) }; }); await s.settle(3);
    const r = await card(p, 'ret');
    check(`${dev} · retour parti non confirmé : « Confirmer mon arrivée » (domicile) et « Arrivé ailleurs : ${PLACE_B.name} »`, /Confirmer mon arrivée/.test(r.text) && r.elsewhere.some(e => e.id === PLACE_B.id) && !r.elsewhere.some(e => e.id === r.to) && /Arrivé ailleurs/.test(r.text), JSON.stringify(r));
    await p.evaluate(() => { UI.view = 'gps'; renderAll(); }); await s.settle(2);
    check(`${dev} · onglet Départ : même « Arrivé ailleurs »`, await p.locator(`#secGps [data-act=fr-arrived-at][data-id="${PLACE_B.id}"]`).count() === 1);
    await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(2);
    await p.locator(`#secTripSummary [data-act=fr-arrived-at][data-id="${PLACE_B.id}"]`).click({ timeout: 3000 }).catch(() => {}); await s.settle(4);
    const after = await p.evaluate(({ key, go }) => ({ done: USER_STORE.state.done[key] && USER_STORE.state.done[key].how, place: PLACE.conf && PLACE.conf.placeId,
      n: USER_STORE.state.debrief.entries.filter(e => e.key === key).length, go: JSON.stringify(USER_STORE.state.done[go]),
      text: ([...document.querySelectorAll('#secTripSummary .fr-card')].find(c => c.querySelector('.fr-head').dataset.key === key) || {}).innerText || '' }), { key: r.key, go: go.key });
    check(`${dev} · « Arrivé ailleurs » : retour clos (« confirmé »), lieu confirmé = ${PLACE_B.name} (jamais le domicile), une seule entrée au journal, aller intact`,
      after.done === 'confirmé' && after.place === PLACE_B.id && after.n <= 1 && after.go === go.done && /ARRIVÉE CONFIRMÉE/.test(after.text), JSON.stringify(after));
    check(`${dev} · plus aucun bouton d’arrivée ni de choix sur ce retour`, await p.locator('#secTripSummary [data-act=fr-arrived], #secTripSummary [data-act=fr-arrived-at], #secTripSummary [data-act=trip-ret-dest]').count() === 0);
    await s.c.close(); }
}
// Retour d'AGENDA (cas réel du 27/11) : rendez-vous fictif du 06/10, aller 12:27, retour 17:10.
async function agenda(b, dev) {
  const pick = () => { const L = tripDayList(); return { go: L.find(x => x.t.src === 'cal' && (x.t.planL || x.t.l).k === 'go'), ret: L.find(x => x.t.src === 'cal' && (x.t.planL || x.t.l).k === 'ret') }; };
  { const s = await session(b, { at: '2026-10-06T15:00:00+02:00', dev }), p = s.p; await s.settle(6);
    await p.evaluate(setup, PLACE_B); await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(6);
    const k = await p.evaluate(`(${pick})()`).then(r => r.ret && r.ret.t.key);
    if (!k) { check(`${dev} · agenda : retour du rendez-vous présent dans la feuille`, false, 'absent'); await s.c.close(); return; }
    await p.locator(`#secTripSummary [data-act=trip-ret-dest][data-key="${k}"][data-id="${PLACE_B.id}"]`).click({ timeout: 3000 }).catch(() => {}); await s.settle(6);
    const to = await p.evaluate(key => { const x = tripDayList().find(x => x.t.key === key); return x && (appTripPlace(x.t, 'to') || {}).id; }, k);
    check(`${dev} · agenda, avant le départ : « Ce soir, je rentre » redirige le retour du rendez-vous vers ${PLACE_B.name}`, to === PLACE_B.id, to);
    await s.c.close(); }
  { const s = await session(b, { at: '2026-10-06T20:00:00+02:00', dev }), p = s.p; await s.settle(6);
    await p.evaluate(setup, PLACE_B); await s.settle(4);
    const r = await p.evaluate(`(() => { const r = (${pick})(); if (!r.go || !r.ret) return null;
      appAction(() => { USER_STORE.state.done[r.go.t.key] = { how: 'confirmé', at: Date.now() - 300 * 60e3, exp: Date.now() + 86400e3 }; });
      UI.view = 'trajet'; rebuild(); renderAll(); return { go: r.go.t.key, ret: r.ret.t.key, done: JSON.stringify(USER_STORE.state.done[r.go.t.key]) }; })()`); await s.settle(4);
    if (!r) { check(`${dev} · agenda : aller et retour du rendez-vous présents`, false, 'absents'); await s.c.close(); return; }
    const n = await p.locator(`#secTripSummary [data-act=fr-arrived-at][data-key="${r.ret}"][data-id="${PLACE_B.id}"]`).count();
    check(`${dev} · agenda, retour parti non confirmé : « Arrivé ailleurs : ${PLACE_B.name} »`, n === 1);
    if (n) { await p.locator(`#secTripSummary [data-act=fr-arrived-at][data-key="${r.ret}"][data-id="${PLACE_B.id}"]`).click({ timeout: 3000 }).catch(() => {}); await s.settle(4); }
    const a = await p.evaluate(({ ret, go }) => ({ done: (USER_STORE.state.done[ret] || {}).how, place: PLACE.conf && PLACE.conf.placeId, go: JSON.stringify(USER_STORE.state.done[go]),
      n: USER_STORE.state.debrief.entries.filter(e => e.key === ret).length }), r);
    check(`${dev} · agenda : retour clos sur ${PLACE_B.name} (lieu confirmé, jamais le domicile), aller du rendez-vous intact, une seule entrée au journal`,
      a.done === 'confirmé' && a.place === PLACE_B.id && a.go === r.done && a.n <= 1, JSON.stringify(a));
    await s.c.close(); }
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'iphone'); await run(b, 'pc'); await agenda(b, 'iphone'); await agenda(b, 'pc'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
