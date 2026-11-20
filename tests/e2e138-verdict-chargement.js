// CLARA R3-02 (20/11/2026), données FICTIVES, PC puis iPhone : au rechargement, vigilance et agenda retardés de 3 s.
// Pendant l'attente : jamais de verdict (ni « RAS », ni « Confiance solide », ni verdict d'un autre trajet) dans le bandeau
// « ICI, MAINTENANT » ni dans le titre de l'onglet ; « CALCUL EN COURS » affiché. Ensuite : le verdict final (PRUDENCE :
// 0,6 mm/h maintenant, 4,3 mm/h à H+1, sans vigilance), identique dans le bandeau et le titre.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 600))); if (!ok) fail++; };
const hourOf = t => +String(t).slice(11, 13), dayOf = t => String(t).slice(0, 10), RAIN = { 14: 0.6, 15: 4.3, 16: 1.0 };
const wx = o => {
  const H = o.hourly || {};
  if (Array.isArray(H.time)) {
    const d = t => dayOf(t) === '2026-11-16';
    for (const k of ['precipitation', 'rain']) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => d(H.time[i]) ? RAIN[hourOf(H.time[i])] || 0 : 0);
    if (Array.isArray(H.weather_code)) H.weather_code = H.weather_code.map((x, i) => d(H.time[i]) && RAIN[hourOf(H.time[i])] ? 61 : 2);
    for (const [k, v] of [['visibility', 20000], ['snowfall', 0], ['wind_gusts_10m', 25], ['temperature_2m', 10]]) if (Array.isArray(H[k])) H[k] = H[k].map(() => v);
  }
  return o;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T14:03:00+01:00', dev, wx }), p = s.p; await s.settle(4);
  await p.evaluate(() => { S.dept = { code: '99', name: 'Département test' }; S.work.dep = '06:30'; S.work.ret = '17:30'; saveSettings(); }); await s.settle(2);
  await p.evaluate(async () => { await window.TWRC_VAULT.flush(); });
  // Vigilance et agenda retardés de 3 s (temps réel) ; la vigilance répond « aucun bulletin ».
  await p.route('https://public.opendatasoft.com/**', async r => { await sleep(3000); r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ records: [] }) }); });
  await p.route('**/race-control/calendar.sealed.json', async r => { await sleep(3000); r.fallback(); });
  await p.reload();
  const seen = [];
  for (let k = 0; k < 40; k++) {
    await p.clock.runFor(300); await p.waitForTimeout(120);
    seen.push(await p.evaluate(() => ({ h: ((document.querySelector('#decisionCore:not([hidden]) h2') || {}).textContent || '').trim(), title: document.title,
      conf: ((document.querySelector('#decisionCore .decision-confidence') || {}).textContent || '').trim(), pending: typeof decisionBootPending === 'function' ? decisionBootPending() : null })).catch(() => null));
  }
  const during = seen.filter(x => x && x.pending), after = seen.filter(x => x && x.pending === '' && x.h);
  check(`${dev} · attente observée (vigilance et agenda retardés) : « CALCUL EN COURS » affiché`, during.length > 0 && during.some(x => /CALCUL EN COURS/.test(x.h)), JSON.stringify(seen.slice(0, 6)));
  const bad = during.filter(x => /RAS|PRUDENCE|VIGILANCE|DANGER|ANALYSE LIMITÉE|DONNÉES DÉGRADÉES/.test(x.h + ' ' + x.title) || /SOLIDE/i.test(x.conf));
  check(`${dev} · pendant l’attente : aucun verdict ni « Confiance solide » dans le bandeau ni le titre de l’onglet`, !bad.length, JSON.stringify(bad.slice(0, 3)));
  const last = after[after.length - 1];
  check(`${dev} · fin du chargement : verdict final PRUDENCE (pluie 4,3 mm/h à H+1), même niveau dans le bandeau et le titre`, !!last && /PRUDENCE/.test(last.h) && /PRUDENCE/.test(last.title), JSON.stringify(last || seen.slice(-3)));
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
