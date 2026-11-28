// Recherche de bugs du 28/11/2026, données FICTIVES, iPhone puis PC.
// 1. Retour parti avant minuit (23:30), arrivée prévue 00:10 : à 00:20 il disparaissait de partout (bandeau « Bien arrivé »,
//    Départ) alors que sa fenêtre de 3 h courait. Attendu : arrivée à confirmer jusqu'à 03:10, par la même clôture.
// 2. Deux retours le même jour (domicile-travail et agenda) : choisir « Ce soir, je rentre » sur le second effaçait en silence
//    le choix du premier (un seul choix par jour). Attendu : choix proposé sur le retour du soir (dernier à venir) seulement.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const RET = 'commute|2026-11-16T23:30|ret', B = { id: 'lieu-fictif-b', name: 'Lieu fictif B' };
const late = () => { S.work.dep = '06:30'; S.work.ret = '23:30'; S.work.durMin = 40; saveSettings(); rebuild(); renderAll(); };
const state = p => p.evaluate(k => ({ banner: [...document.querySelectorAll('[data-act=trip-arrived-key]')].map(b => b.closest('#secGps') ? 'départ:' + b.dataset.key : 'trajet:' + b.dataset.key),
  done: !!(USER_STORE.state.done || {})[k], how: ((USER_STORE.state.done || {})[k] || {}).how, n: USER_STORE.state.debrief.entries.filter(e => e.key === k).length, place: PLACE.conf && PLACE.conf.placeId, home: S.locs[0].id }), RET);
async function midnight(b, dev) {
  { const s = await session(b, { at: '2026-11-17T00:20:00+01:00', dev }), p = s.p; await s.settle(5);
    await p.evaluate(late); await p.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await s.settle(5);
    const a = await state(p);
    check(`${dev} · 00:20, retour parti la veille à 23:30 : « Bien arrivé » toujours proposé dans Trajet`, a.banner.includes('trajet:' + RET) && !a.done, JSON.stringify(a));
    await p.evaluate(() => { UI.view = 'gps'; renderAll(); }); await s.settle(2);
    const d = await state(p);
    check(`${dev} · onglet Départ : même arrivée à confirmer`, d.banner.includes('départ:' + RET), JSON.stringify(d));
    await p.locator(`#secGps [data-act=trip-arrived-key][data-key="${RET}"]`).click({ timeout: 3000 }).catch(() => {}); await s.settle(4);
    const c = await state(p);
    check(`${dev} · confirmation après minuit : retour clos (« confirmé »), une seule entrée au journal, lieu confirmé = domicile, plus de bouton`,
      c.done && c.how === 'confirmé' && c.n <= 1 && c.place === c.home && !c.banner.length, JSON.stringify(c));
    await s.c.close(); }
  { const s = await session(b, { at: '2026-11-17T03:30:00+01:00', dev }), p = s.p; await s.settle(5);
    await p.evaluate(late); await p.evaluate(() => { UI.view = 'gps'; renderAll(); }); await s.settle(3);
    const e = await state(p);
    check(`${dev} · 03:30, plus de 3 h après l’arrivée prévue : plus de demande (même fenêtre que le bandeau)`, !e.banner.length, JSON.stringify(e));
    await s.c.close(); }
}
async function twoReturns(b, dev) {
  const s = await session(b, { at: '2026-10-06T11:00:00+02:00', dev }), p = s.p; await s.settle(6);
  await p.evaluate(B => { const h = S.locs[0]; S.customs = (S.customs || []).filter(c => c.id !== B.id).concat([{ ...B, lat: +(h.lat + 0.05).toFixed(5), lon: +(h.lon + 0.04).toFixed(5) }]); saveSettings(); UI.view = 'trajet'; rebuild(); renderAll(); }, B); await s.settle(6);
  const r = await p.evaluate(() => { const rets = tripDayList().filter(x => tripIsReturn(x.t) && ['next', 'later'].includes(x.state));
    return { rets: rets.map(x => ({ k: x.t.key, chips: document.querySelectorAll('[data-act=trip-ret-dest][data-key="' + CSS.escape(x.t.key) + '"]').length })) }; });
  check(`${dev} · deux retours à venir : « Ce soir, je rentre » sur le retour du soir (dernier) seulement`, r.rets.length >= 2 && r.rets[r.rets.length - 1].chips >= 2 && r.rets.slice(0, -1).every(x => x.chips === 0), JSON.stringify(r));
  if (r.rets.length >= 2) {
    const kEve = r.rets[r.rets.length - 1].k, kOther = r.rets[0].k;
    await p.locator(`[data-act=trip-ret-dest][data-key="${kEve}"][data-id="${B.id}"]`).click({ timeout: 3000 }).catch(() => {}); await s.settle(4);
    const q = await p.evaluate(([k1, k2, id]) => ({ refused: tripReturnChoose(k2, id) === false, to1: (appTripPlace(tripDayList().find(x => x.t.key === k1).t, 'to') || {}).id }), [kEve, kOther, B.id]); await s.settle(3);
    check(`${dev} · choix du retour du soir conservé ; un choix forcé sur l’autre retour est refusé`, q.refused && q.to1 === B.id, JSON.stringify(q));
  }
  await s.c.close();
}
(async () => {
  const b = await BR.launch();
  try { for (const dev of ['iphone', 'pc']) { await midnight(b, dev); await twoReturns(b, dev); } } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
