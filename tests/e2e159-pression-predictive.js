// Pression prédictive (28/11/2026, choix du propriétaire), données FICTIVES, iPhone puis PC. Cible plaque 2,5 bar, mesure
// 2,45 bar le samedi 28/11 à 2 °C, prévision 2 °C partout sauf −5 °C le lundi 30/11 à 06:00.
// Analyse : trois pressions distinctes (cible, mesure, prédite ≈ 2,36 bar), fiabilité, courbe, 7 jours ; sans mesure, la
// projection devient une « simulation théorique ». Départ du lundi 06:00 : ligne d'alerte seulement depuis une vraie mesure
// sous la cible ; aucune ligne si la mesure suffit, aucune ligne depuis une simulation. Rien n'est écrit par l'affichage.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const wx = (o, kind) => {
  if (kind === 'now') return o;
  const H = o.hourly || {};
  if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) H.temperature_2m = H.time.map(t => String(t).slice(0, 16) === '2026-11-30T06:00' ? -5 : 2);
  return o;
};
const setCar = (p, pchk) => p.evaluate(pc => { const c = S.cars[0]; Object.assign(c.tire, { type: 'winter', size: '205/55 R16 91V', tread: 7, press: '2,5', pchk: pc });
  S.work.dep = '06:00'; S.work.durMin = 30; saveSettings(); appSetCar(c.id); rebuild(); renderAll(); return JSON.stringify(c.tire.pchk); }, pchk);
const read = p => p.evaluate(() => {
  const s = document.querySelector('.press-fc'), q = k => s && s.querySelector(`[data-press="${k}"]`);
  return { ok: !!s, target: q('target') && q('target').innerText, measured: q('measured') && q('measured').innerText, predicted: q('predicted') && q('predicted').innerText,
    rel: s && (s.querySelector('[data-press-rel]') || {}).dataset && s.querySelector('[data-press-rel]').dataset.pressRel, relText: s && (s.querySelector('[data-press-rel]') || {}).innerText,
    days: s ? s.querySelectorAll('.press-days tbody tr').length : 0, mon: s && (s.querySelector('tr[data-day="2026-11-30"]') || {}).innerText, svg: !!(s && s.querySelector('svg[role=img]')),
    over: s ? [s, ...s.querySelectorAll('*')].some(e => { const r = e.getBoundingClientRect(); return r.width && r.right > document.documentElement.clientWidth + 1; }) || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 : null, pchk: JSON.stringify(S.cars[0].tire.pchk) };
});
const depLine = p => p.evaluate(() => [...document.querySelectorAll('#secGps [data-press-dep]')].map(e => e.innerText));
async function run(b, dev) {
  { const s = await session(b, { at: '2026-11-28T09:15:00+01:00', dev, wx }), p = s.p; await s.settle(4);
    const pc = await setCar(p, { date: '2026-11-28', T: 2, av: 2.45, ar: 2.45 });
    await p.evaluate(() => { UI.view = 'analyse'; renderAll(); }); await s.settle(5);
    await p.evaluate(() => { const d = document.querySelector('.press-fc details'); if (d) d.open = true; }); await s.settle(1);
    const a = await read(p);
    check(`${dev} · Analyse : trois pressions distinctes (cible 2,50 · mesure 2,45 du 28/11 à 2 °C · prédite ≈ 2,36 lundi 06:00 à −5 °C)`,
      a.ok && /2,50 bar/.test(a.target) && /2,45 bar/.test(a.measured) && /2,0 °C/.test(a.measured) && /≈ 2,36 bar/.test(a.predicted) && /06:00/.test(a.predicted) && /−5,0 °C/.test(a.predicted), JSON.stringify(a));
    check(`${dev} · fiabilité « bonne » (mesure du jour), courbe et 7 jours, lundi 🟡`, a.rel === 'bonne' && a.svg && a.days === 7 && /🟡/.test(a.mon || ''), JSON.stringify(a));
    check(`${dev} · aucun débordement horizontal, rien d’écrit par l’affichage`, a.over === false && a.pchk === pc, JSON.stringify(a));
    // essieux différents (cible « 2,3 AV / 2,5 AR », mesures AV 2,20 / AR 2,45) : deux valeurs par jour, toujours sans débordement
    await p.evaluate(() => { S.cars[0].tire.press = '2,3 AV / 2,5 AR'; S.cars[0].tire.pchk = { date: '2026-11-28', T: 2, av: 2.2, ar: 2.45 }; saveSettings(); rebuild(); renderAll();
      const d = document.querySelector('.press-fc details'); if (d) d.open = true; }); await s.settle(3);
    const ax = await read(p);
    check(`${dev} · AV/AR différents : cible et mesure par essieu, lundi « AV ≈ 2,12 / AR ≈ 2,36 », aucun débordement`,
      /AV 2,30/.test(ax.target) && /AR 2,50/.test(ax.target) && /AV 2,20/.test(ax.measured) && /AV ≈ 2,12/.test(ax.mon || '') && /AR ≈ 2,36/.test(ax.mon || '') && ax.over === false, JSON.stringify(ax));
    await p.evaluate(() => { S.cars[0].tire.press = '2,5'; }); await setCar(p, { date: '', T: null }); await p.evaluate(() => { renderAll(); const d = document.querySelector('.press-fc details'); if (d) d.open = true; }); await s.settle(3);
    const sim = await read(p);
    check(`${dev} · sans mesure : « Simulation théorique », dernière mesure « aucune »`, sim.rel === 'théorique' && /Simulation théorique/.test(sim.relText) && /aucune/.test(sim.measured), JSON.stringify(sim));
    await s.c.close(); }
  { const s = await session(b, { at: '2026-11-30T05:00:00+01:00', dev, wx }), p = s.p; await s.settle(4);
    await setCar(p, { date: '2026-11-28', T: 2, av: 2.45, ar: 2.45 }); await p.evaluate(() => { UI.view = 'gps'; renderAll(); }); await s.settle(5);
    const d = await depLine(p);
    check(`${dev} · Départ lundi 06:00 : « ≈ 2,36 bar prévus à −5,0 °C », cible et date de la mesure`, d.length === 1 && /06:00/.test(d[0]) && /≈ 2,36 bar/.test(d[0]) && /2,50 bar/.test(d[0]) && /28\/11/.test(d[0]), JSON.stringify(d));
    await setCar(p, { date: '2026-11-28', T: 2, av: 2.6, ar: 2.6 }); await p.evaluate(() => renderAll()); await s.settle(3);
    const ok = await depLine(p);
    check(`${dev} · contre-épreuve : mesure 2,60 (≈ 2,51 à −5 °C) → aucune alerte au départ`, !ok.length, JSON.stringify(ok));
    await setCar(p, { date: '', T: null }); await p.evaluate(() => renderAll()); await s.settle(3);
    const none = await depLine(p);
    check(`${dev} · sans mesure : jamais d’alerte au départ depuis une simulation`, !none.length, JSON.stringify(none));
    await s.c.close(); }
}
(async () => {
  const b = await BR.launch();
  try { for (const dev of ['iphone', 'pc']) await run(b, dev); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
