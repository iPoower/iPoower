// Matin du 12/11 · agenda : un rendez-vous de plusieurs jours ou un trajet qui ne tombe pas le jour du rendez-vous porte sa
// DATE (iPhone et PC, moteurs réels). Constat d'origine (passe R2) : séjour de 10 jours affiché « demain · 00:30 », aller
// « départ 23:06 » (la veille, sans le dire), retour « départ 18:10 … départ dans 10 j » sans aucune date, fin du séjour absente.
// Attendu : fin du rendez-vous écrite dans l'en-tête, date sur l'aller de la veille et sur le retour, arrivée après minuit datée ;
// un rendez-vous et ses trajets du même jour gardent l'affichage court, inchangé. Données 100 % fictives (Lieu A, Lieu B).
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
let n = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
// Agenda fictif injecté puis rendu, lu tel qu'affiché (en-tête de la carte et lignes ALLER / RETOUR).
const render = p => p.evaluate(() => {
  const H = { ...S.locs[0], label: 'Domicile', city: 'Domicile' }, A = { lat: 49.3, lon: 3.2, label: 'Lieu A', city: 'Lieu A' }, B = { lat: 49.6, lon: 3.6, label: 'Lieu B', city: 'Lieu B' };
  const leg = (k, from, to, dep, arr, fromKind) => ({ k, from, to, dep, arr, fromKind, km: 60, min: 40, routed: true, pts: [], g: [] });
  const events = [
    { id: 'fixture-sejour', t: 'Séjour fictif', s: '2026-10-03T00:30', e: '2026-10-12T18:00', ...A,
      legs: [leg('go', H, A, '2026-10-02T23:06', '2026-10-02T23:46', 'home'), leg('ret', A, H, '2026-10-12T18:10', '2026-10-12T18:50', 'event')] },
    { id: 'fixture-jour', t: 'Rendez-vous fictif', s: '2026-10-05T10:00', e: '2026-10-05T11:00', ...B,
      legs: [leg('go', H, B, '2026-10-05T09:10', '2026-10-05T09:50', 'home'), leg('ret', B, H, '2026-10-05T11:10', '2026-10-05T11:50', 'event')] },
    { id: 'fixture-nuit', t: 'Soirée fictive', s: '2026-10-06T20:00', e: '2026-10-06T23:30', ...A,
      legs: [leg('go', H, A, '2026-10-06T19:10', '2026-10-06T19:50', 'home'), leg('ret', A, H, '2026-10-06T23:40', '2026-10-07T00:20', 'event')] },
    { id: 'fixture-journees', t: 'Journées fictives', s: '2026-10-08T00:00', e: '2026-10-11T00:00', allDay: true, ...B,
      legs: [leg('go', H, B, '2026-10-08T08:10', '2026-10-08T08:50', 'home'), leg('ret', B, H, '2026-10-10T18:10', '2026-10-10T18:50', 'event')] }
  ];
  CAL = { events, updated: new Date().toISOString() }; CALDONE = true; UI.view = 'pneus'; renderAll();
  const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  return Object.fromEntries(events.map(e => {
    const card = document.querySelector(`#secCal .cal-e[data-event-id="${e.id}"]`);
    const legs = card ? [...card.querySelectorAll('.leg-h')].map(txt) : [];
    return [e.id, { card: !!card, head: txt(card && card.querySelector('.cal-h .cal-d')), go: legs.find(l => /^ALLER/.test(l)) || '', ret: legs.find(l => /^RETOUR/.test(l)) || '' }];
  }));
});
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(browser, { at: '2026-10-02T18:00:00+02:00', dev });
      const r = await render(s.p);
      await check(dev + ' · séjour de 10 jours : la fin est écrite dans l’en-tête de la carte', async () => {
        assert.equal(r['fixture-sejour'].card, true);
        assert.match(r['fixture-sejour'].head, /^demain · 00:30 → lun\.? 12\/10 18:00$/i, r['fixture-sejour'].head);
      });
      await check(dev + ' · aller de la veille : sa date est écrite (ven 02/10 23:06), jamais une heure seule', async () => {
        assert.match(r['fixture-sejour'].go, /départ ven\.? 02\/10 23:06 → 23:46/i, r['fixture-sejour'].go);
      });
      await check(dev + ' · retour 10 jours plus tard : sa date est écrite (lun 12/10 18:10), plus seulement « dans 10 j »', async () => {
        assert.match(r['fixture-sejour'].ret, /départ lun\.? 12\/10 18:10 → 18:50/i, r['fixture-sejour'].ret);
      });
      await check(dev + ' · rendez-vous et trajets du même jour : affichage court inchangé, aucune date ajoutée', async () => {
        const j = r['fixture-jour'];
        assert.match(j.head, /^\S+\.? 05\/10 · 10:00$/i, j.head); assert.doesNotMatch(j.head, /→/);
        assert.match(j.go, /départ 09:10 → 09:50 ·/, j.go); assert.match(j.ret, /départ 11:10 → 11:50 ·/, j.ret);
      });
      await check(dev + ' · retour qui arrive après minuit : l’arrivée porte sa date', async () => {
        assert.match(r['fixture-nuit'].ret, /départ 23:40 → mer\.? 07\/10 00:20 ·/i, r['fixture-nuit'].ret);
        assert.doesNotMatch(r['fixture-nuit'].head, /→/, 'soirée du même jour : en-tête court');
      });
      await check(dev + ' · « toute la journée » sur plusieurs jours : dernier jour inclus (fin ICS exclusive), sans heure', async () => {
        const j = r['fixture-journees'];
        assert.match(j.head, /· journée → sam\.? 10\/10$/i, j.head);
        assert.match(j.go, /départ 08:10 → 08:50 ·/, j.go); assert.match(j.ret, /départ sam\.? 10\/10 18:10 → 18:50/i, j.ret);
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await browser.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
