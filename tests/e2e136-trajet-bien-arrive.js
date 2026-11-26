// Onglet Trajet · « Bien arrivé » (retour du 19/11, app iPhone), données FICTIVES, PC puis iPhone : trajet domicile-travail
// fictif du lundi 16/11 06:30 → 07:10, il est 08:10 (arrivé depuis 1 h, aucune arrivée détectée). La carte « ARRIVÉE À
// CONFIRMER » s'affiche en tête de l'onglet Trajet ; « Bien arrivé » clôt le trajet par la même machine que l'arrivée GPS
// (journal, lieu confirmé), la carte disparaît et ne revient pas au rechargement ; aucune carte avant le départ ni 3 h après.
// La feuille conserve une confirmation volontaire pour le dernier trajet parti du jour, même après 3 h, sans GPS ni réseau.
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
    check(`${dev} · avant le départ (06:00) : aucune carte ni action d’arrivée dans la feuille`, !(await state(p)).card && await p.locator('#secTripSummary [data-act=fr-arrived]').count() === 0); await s.c.close(); }
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
  // Retour oublié : 16:00 → 16:40, il est 20:23. L'aller est déjà clos ; le bandeau de 3 h a disparu.
  { const q = await session(b, { at: '2026-11-16T20:23:00+01:00', dev }), pp = q.p; await q.settle(4); await pp.evaluate(setup); await q.settle(6);
    const original = await pp.evaluate(() => {
      S.work.ret = '16:00'; saveSettings(); rebuild();
      const go = tripDayList().find(x => /\|go$/.test(x.t.key));
      appAction(() => { USER_STORE.state.done[go.t.key] = { how: 'confirmé', at: Date.now() - 690 * 60e3, exp: Date.now() + 86400e3 }; });
      UI.view = 'trajet'; rebuild(); renderAll();
      return { go: go.t.key, done: JSON.stringify(USER_STORE.state.done[go.t.key]), home: (homeExact() || {}).id };
    }); await q.settle(3);
    const before = await pp.evaluate(() => {
      const b = document.querySelector('#secTripSummary [data-act=fr-arrived]'), c = b && b.closest('.fr-card');
      return { key: b && b.dataset.key, text: c && c.innerText, h: b && b.getBoundingClientRect().height,
        opacity: c && getComputedStyle(c).opacity, expanded: c && c.querySelector('.fr-head').getAttribute('aria-expanded') };
    });
    check(`${dev} · à 20:23, action visible dans le retour de la feuille fermée malgré l’expiration du bandeau`, !((await state(pp)).card) && /\|ret$/.test(before.key || '') && /ARRIVÉE NON CONFIRMÉE/.test(before.text || '') && /Confirmer mon arrivée/.test(before.text || '') && before.expanded === 'false', JSON.stringify(before));
    check(`${dev} · confirmation : cible ≥ 44 pt, carte pleinement lisible, heure de confirmation annoncée`, before.h >= 44 && before.opacity === '1' && /heure de confirmation sera enregistrée/.test(before.text || ''), JSON.stringify(before));
    const guard = await pp.evaluate(({ go, ret }) => {
      const saved = JSON.stringify(USER_STORE.state), stale = tripDayConfirmArrival(go), unchanged = saved === JSON.stringify(USER_STORE.state);
      DEMO.on = true; const demo = tripDayConfirmArrival(ret); DEMO.on = false;
      const now = liveNow(), old = { t: { key: 'ancien', src: 'work', dep: addMin(now, -360) }, state: 'past' }, last = { t: { key: 'dernier', src: 'work', dep: addMin(now, -240) }, state: 'past' };
      const loan = { t: { key: 'pret', src: 'loan', dep: addMin(now, -60) }, state: 'past' };
      const done = tripDayArrival([old, { ...last, state: 'done' }]), loans = tripDayArrival([last, loan]);
      const previous = { key: LIVE.key, phase: LIVE.phase };
      let other, early;
      try {
        Object.assign(LIVE, { key: 'autre', phase: 'active' }); other = tripDayArrival([last]);
        Object.assign(LIVE, { key: 'parti-en-avance', phase: 'active' });
        early = tripDayArrival([{ t: { key: LIVE.key, src: 'work', dep: addMin(now, 30) }, state: 'live' }]);
      } finally { Object.assign(LIVE, previous); }
      return { stale, unchanged, demo, done: done === null, loans: loans && loans.t.key, other: other === null, early: early && early.live };
    }, { go: original.go, ret: before.key });
    check(`${dev} · garde-fous : ancien trajet et démo refusés, aucune réouverture après clôture, prêt exclu, autre suivi préservé, départ anticipé accepté`, !guard.stale && guard.unchanged && !guard.demo && guard.done && guard.loans === 'dernier' && guard.other && guard.early, JSON.stringify(guard));
    await q.c.setOffline(true);
    await pp.locator('#secTripSummary [data-act=fr-arrived]').click(); await q.settle(3);
    const after = await state(pp);
    const closed = await pp.evaluate(({ key, go }) => {
      const c = [...document.querySelectorAll('#secTripSummary .fr-card')].find(c => c.querySelector('.fr-head').dataset.key === key);
      const e = USER_STORE.state.debrief.entries.find(e => e.key === key);
      return { text: c && c.innerText, state: c && c.dataset.state, at: USER_STORE.state.done[key] && USER_STORE.state.done[key].at,
        go: JSON.stringify(USER_STORE.state.done[go]), noStart: !e || !e.start, again: tripDayConfirmArrival(key),
        focused: document.activeElement && document.activeElement.dataset.act === 'fr-open', n: USER_STORE.state.debrief.entries.filter(e => e.key === key).length };
    }, { key: before.key, go: original.go });
    check(`${dev} · hors ligne sans GPS : même clôture, lieu domicile confirmé, heure 20:23, aller conservé, aucun départ inventé ni doublon`, after.done.includes(before.key) && (after.journal.includes(before.key) || !after.writable) && after.conf && after.conf.id === original.home && closed.state === 'done' && /ARRIVÉE CONFIRMÉE À 20:23/.test(closed.text || '') && closed.at >= q.T0 && closed.at < q.T0 + 60000 && closed.go === original.done && closed.noStart && !closed.again && closed.n <= 1, JSON.stringify({ after, closed }));
    check(`${dev} · bouton retiré et focus rendu à la spéciale après confirmation`, await pp.locator('#secTripSummary [data-act=fr-arrived]').count() === 0 && closed.focused);
    await pp.evaluate(async () => { await window.TWRC_VAULT.flush(); if (window.TWRC_VAULT.pendingWrites || window.TWRC_VAULT.error) throw new Error('enregistrement non confirmé'); });
    await q.c.setOffline(false); await pp.reload(); await q.settle(8); await pp.evaluate(() => { UI.view = 'trajet'; renderAll(); }); await q.settle(3);
    check(`${dev} · rechargement : retour toujours confirmé, aucun bouton ni doublon`, (await state(pp)).done.includes(before.key) && await pp.locator('#secTripSummary [data-act=fr-arrived]').count() === 0);
    await q.c.close();
  }
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'pc'); await run(b, 'iphone'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
