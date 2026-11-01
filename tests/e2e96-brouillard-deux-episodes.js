// Acceptation #290 : brouillard EN COURS jusqu'à 06:00 (220 m), dissipation, puis nouvel épisode 07:00–11:00 (minimum 160 m vers 08:00).
// Cas réel vu sur iPhone à 03:33, rejoué avec des données fictives (lieux de test). Attendu : les deux épisodes cohérents sur Pneus,
// Météo et Chronologie (le trajet de 06:30 traverse la dissipation puis le 2e épisode) ; jamais « début dans X h » pendant un épisode
// en cours ; toute visibilité affichée porte son heure ou sa fenêtre ; la confiance n'utilise pas les couleurs du risque.
// WebKit simule l'iPhone : ce n'est pas un iPhone physique.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
const AT = '2026-10-14T03:33:00+02:00';
const visAt = hh => hh < 6 ? 220 : hh === 6 ? 4000 : hh === 7 ? 400 : hh === 8 ? 160 : hh <= 10 ? 300 : 9000;
const fog = (o, kind) => {
  const H = o.hourly || {}; if (!Array.isArray(H.time) || kind === 'now') return o;
  const day = AT.slice(0, 10), hh = t => String(t).slice(0, 10) === day ? +String(t).slice(11, 13) : 99;
  const code = () => { if (Array.isArray(H.weather_code)) H.weather_code = H.time.map((t, i) => visAt(hh(t)) < 1000 ? 45 : H.weather_code[i]); };
  if (kind === 'arome') { delete H.visibility; code(); return o; }   // AROME ne fournit pas la visibilité, comme en production
  H.visibility = H.time.map(t => visAt(hh(t))); code();
  if (o.current) { o.current.visibility = 220; o.current.weather_code = 45; }
  return o;
};
let n = 0; const check = (label, ok, detail) => { assert(ok, label + ' · ' + String(detail || '').slice(0, 900)); n++; console.log('✅ ' + label); };
const NO_START_IN = /d[ée]but(?: estimé)? dans \d/i;
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: AT, dev, wx: fog }), p = s.p; await s.settle(6);
      const body = () => p.evaluate(() => document.body.innerText);
      const meteo = await body();
      const blk = await p.evaluate(() => ({ tl: (document.querySelector('.wx-tl') || {}).textContent || '', fog: (document.querySelector('.wx-ph [data-k=fog]') || {}).textContent || '',
        trust: [...document.querySelectorAll('.ev-ph .ev-t')].map(e => e.textContent), evRows: [...document.querySelectorAll('.ev-ph li')].map(e => e.textContent) }));
      check(dev + ' · Météo : épisode en cours annoncé d’abord, puis le nouvel épisode', /BROUILLARD EN COURS/.test(meteo) && meteo.includes('Maintenant 220 m · dissipation vers 06:00') && meteo.includes('Nouvel épisode 07:00–11:00 · minimum 160 m vers 08:00'), meteo.slice(0, 1500));
      check(dev + ' · Météo : jamais « début dans X h » pendant un épisode en cours', !NO_START_IN.test(meteo) && !NO_START_IN.test(blk.tl + blk.fog), (meteo.match(NO_START_IN) || [])[0]);
      check(dev + ' · Chronologie : brouillard en cours, dissipation 06:00, nouvel épisode 07:00 (160 m), dissipation 11:00', /maintenant\W*brouillard en cours/.test(blk.tl) && /06:00\W*dissipation du brouillard/.test(blk.tl) && /07:00\W*brouillard · 160 m/.test(blk.tl) && /11:00\W*dissipation du brouillard/.test(blk.tl), blk.tl);
      check(dev + ' · carte Brouillard : les deux épisodes, chacun daté, un seul pictogramme de niveau', blk.fog.includes('Visibilité 220 m maintenant · nouvel épisode 07:00–11:00, 160 m vers 08:00') && blk.fog.includes('Épisode en cours jusqu’à 06:00 · 220 m maintenant') && blk.fog.includes('Épisode 07:00–11:00 · minimum 160 m vers 08:00') && !/(🟢|🟡|🟠|🔴)\s*(🟢|🟡|🟠|🔴)/.test(blk.fog), blk.fog);
      check(dev + ' · preuves : confiance en points (●●○), jamais avec les couleurs du risque', blk.trust.length >= 5 && blk.trust.every(t => /^[●○]{3} confiance (faible|moyenne|élevée)$/.test(t)) && !blk.trust.some(t => /🟢|🟡|🟠|🔴/.test(t)), JSON.stringify(blk.trust));
      check(dev + ' · preuves : visibilité et brouillard portent leur fenêtre', blk.evRows.filter(r => /Visibilité|Brouillard/.test(r)).every(r => /\d{2}:\d{2} → \d{2}:\d{2}/.test(r)), JSON.stringify(blk.evRows));
      await p.locator('#viewSeg [data-act=view][data-v=pneus]').click(); await s.settle(4);
      const pneus = await body();
      check(dev + ' · Pneus : brouillard en cours et nouvel épisode dans la même ligne, visibilités datées', pneus.includes('Brouillard jusqu’à 06:00 · visibilité 220 m maintenant · nouvel épisode 07:00–11:00, minimum 160 m vers 08:00') && pneus.includes('Brouillard : visibilité 220 m maintenant'), pneus.slice(0, 1500));
      check(dev + ' · Pneus : le trajet de 06:30 signale le brouillard, jamais « début dans X h »', /Brouillard pendant le trajet aller \(06:30\)/.test(pneus) && !NO_START_IN.test(pneus), pneus.slice(0, 1500));
      // toute visibilité chiffrée porte une heure ou une fenêtre sur la même ligne (tableaux à colonnes horaires exceptés)
      const undated = txt => txt.split('\n').filter(l => /\b\d{2,4} m\b|\d,\d km\b/.test(l) && /isibilit|rouillard/i.test(l) && !/\d{2}:\d{2}|maintenant|\t/.test(l) && l.length < 200 && !/inférieure à|sous \d|< \d/.test(l));   // textes d'aide et seuils exceptés
      check(dev + ' · toute visibilité affichée porte son heure ou sa fenêtre (Météo et Pneus)', !undated(meteo).length && !undated(pneus).length, JSON.stringify(undated(meteo).concat(undated(pneus))));
      await s.c.close();
    }
    assert.deepEqual(errors, [], 'aucune erreur de page');
    console.log(`\n✅ ${n} contrôles au vert`);
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
