// Onglet Trajet · « Bien arrivé » (retour du 19/11, app iPhone), données FICTIVES, PC puis iPhone : trajet domicile-travail
// fictif du lundi 16/11 06:30 → 07:10, il est 08:10 (arrivé depuis 1 h, aucune arrivée détectée). La carte « ARRIVÉE À
// CONFIRMER » s'affiche en tête de l'onglet Trajet ; « Bien arrivé » clôt le trajet par la même machine que l'arrivée GPS
// (journal, lieu confirmé), la carte disparaît et ne revient pas au rechargement ; aucune carte avant le départ ni 3 h après.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 500))); if (!ok) fail++; };
function setup() {
  S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', size: '205/55 R16 91V', tread: 6 }));
  S.work.dep = '06:30'; S.work.durMin = 40; saveSettings(); appSetCar(S.cars[0].id); rebuild(); renderAll();
}
const state = p => p.evaluate(() => {
  const card = document.querySelector('#secTripSummary .pw-arrive'), btn = card && card.querySelector('[data-act=trip-arrived-key]');
  const x = tripArrivalPending();
  return { card: card ? card.textContent : null, key: btn ? btn.dataset.key : null, pending: x && x.t.key, h: btn ? Math.round(btn.getBoundingClientRect().height) : null,
    done: Object.keys(USER_STORE.state.done || {}), journal: USER_STORE.state.debrief.entries.map(e => e.key), writable: !!(window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault' && !window.TWRC_VAULT.journalNeedsRecovery), conf: PLACE.conf && { id: PLACE.conf.placeId, how: PLACE.conf.how },
    work: S.work.to, over: document.documentElement.scrollWidth - window.innerWidth };
});
async function run(b, dev) {
  // Avant le départ : aucune carte.
  { const s = await session(b, { at: '2026-11-16T06:00:00+01:00', dev }), p = s.p; await s.settle(4); await p.evaluate(setup); await s.settle(6);
    await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(3);
    check(`${dev} · avant le départ (06:00) : aucune carte d’arrivée`, !(await state(p)).card); await s.c.close(); }
  const s = await session(b, { at: '2026-11-16T08:10:00+01:00', dev }), p = s.p; await s.settle(4);
  await p.evaluate(setup); await s.settle(6);
  await p.evaluate(() => { UI.view = 'trajet'; renderAll(); window.scrollTo(0, 0); }); await s.settle(3);
  const a = await state(p);
  check(`${dev} · arrivé depuis 1 h sans détection : « ARRIVÉE À CONFIRMER » en tête du Trajet, arrivée prévue 07:10`, !!a.card && /ARRIVÉE À CONFIRMER/.test(a.card) && /arrivée prévue 07:10/.test(a.card) && /Bien arrivé/.test(a.card) && a.key === a.pending && /\|go$/.test(a.key || ''), JSON.stringify(a));
  check(`${dev} · bouton ≥ 44 pt, aucun débordement`, a.h >= 44 && a.over <= 1, JSON.stringify({ h: a.h, over: a.over }));
  await p.locator('#secTripSummary [data-act=trip-arrived-key]').click(); await s.settle(3);
  const z = await state(p);
  check(`${dev} · « Bien arrivé » : trajet clos (même machine que l’arrivée GPS), au journal quand il est actif, lieu d’arrivée confirmé`, z.done.includes(a.key) && (z.journal.includes(a.key) || !z.writable) && !!z.conf && z.conf.how === 'arrival' && z.conf.id === z.work, JSON.stringify(z));
  check(`${dev} · carte retirée après confirmation`, !z.card && !z.pending, JSON.stringify(z));
  await p.evaluate(async () => { await window.TWRC_VAULT.flush(); if (window.TWRC_VAULT.pendingWrites || window.TWRC_VAULT.error) throw new Error('enregistrement non confirmé'); });
  await p.reload(); await s.settle(8); await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(3);
  const r = await state(p);
  check(`${dev} · réouverture : trajet toujours clos, carte absente`, r.done.includes(a.key) && !r.card, JSON.stringify(r));
  await s.c.close();
  // Plus de 3 h après l'arrivée prévue : plus de carte (aucune relance tardive).
  { const q = await session(b, { at: '2026-11-16T10:20:00+01:00', dev }), pp = q.p; await q.settle(4); await pp.evaluate(setup); await q.settle(6);
    await pp.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await q.settle(3);
    check(`${dev} · plus de 3 h après l’arrivée prévue : aucune carte`, !(await state(pp)).card); await q.c.close(); }
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'pc'); await run(b, 'iphone'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
