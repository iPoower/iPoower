// Audit A03 dans le vrai navigateur : AROME calcule 0 mm, le modèle de base donne 90 % (et 0,6 mm au lieu affiché).
// Avant : « Pas de pluie attendue » à côté d'une pénalité « probabilité 90 % ». Attendu : « pluie possible », sources citées,
// score prudent conservé, Tenue cohérente. Vraie fusion AROME → modèle → onglets Météo et Tenue, iPhone et PC, fixtures fictives.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
let n = 0, stage = ''; const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const fill = (H, k, v) => { if (Array.isArray(H[k])) H[k] = H[k].map(() => v); };
// base : probabilité 90 %, 0,6 mm au lieu affiché (0 mm aux points de trajet) ; AROME : 0 mm, ciel couvert ; quart d'heure sec
const wx = (o, kind) => {
  const H = o.hourly || {}, C = o.current || {}, mm = kind === 'base' ? 0.6 : 0;
  fill(H, 'precipitation', mm); fill(H, 'rain', mm); fill(H, 'showers', 0); fill(H, 'snowfall', 0); fill(H, 'weather_code', 3);
  // AROME ne fournit ni probabilité, ni visibilité, ni UV (requête Q_AR) : la réponse simulée non plus.
  if (kind === 'arome') ['precipitation_probability', 'visibility', 'uv_index'].forEach(k => delete H[k]); else fill(H, 'precipitation_probability', 90);
  ['precipitation', 'rain', 'showers', 'snowfall'].forEach(k => { if (k in C) C[k] = kind === 'base' && k !== 'snowfall' && k !== 'showers' ? mm : 0; });
  if ('weather_code' in C) C.weather_code = 3;
  if (kind === 'now' && o.minutely_15) { fill(o.minutely_15, 'precipitation', 0); fill(o.minutely_15, 'snowfall', 0); }
  return o;
};
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-10-08T06:40:00+02:00', dev, wx }), p = s.p;
      await check(dev + ' · modèle : quantité AROME 0 mm, quantité du modèle de base et probabilité conservées', async () => {
        const h = await p.evaluate(() => { const x = CX.m.hs[CX.m.nowI]; return { P: x.P, Pb: x.Pb, ar: x.ar, pp: x.pp }; });
        assert.deepEqual(h, { P: 0, Pb: 0.6, ar: true, pp: 90 });
      });
      await check(dev + ' · Météo : « pluie possible » sourcée, jamais « pas de pluie » ni « aucune »', async () => {
        const t = await p.locator('#secWx').textContent();
        assert.match(t, /Pluie possible/); assert.doesNotMatch(t, /Pas de pluie attendue|Pluie\s*Aucune avant|Rien de notable/);
        assert.match(t, /probabilité 90 % \(modèle de base\)/); assert.match(t, /selon AROME/); assert.match(t, /Modèles en désaccord/);
      });
      await check(dev + ' · Météo : prudence du score route conservée et expliquée, carte pluie au même niveau', async () => {
        const r = await p.evaluate(() => { const d = wxDesk(wxInput()), f = d.road.factors.find(x => x.id === 'rain'), c = d.phen.find(x => x.id === 'rain'); return { pen: f.pen, why: f.why, flv: f.lv, clv: c.lv }; });
        assert(r.pen > 0, JSON.stringify(r)); assert.match(r.why, /^pluie possible : /); assert.equal(r.clv, r.flv);
        assert.match(await p.locator('#secWx .wx-road').textContent(), /pluie possible/);
      });
      await check(dev + ' · Tenue : protection de pluie, cohérente avec « pluie possible »', async () => {
        await p.evaluate(() => { UI.view = 'tenue'; renderAll(); }); await s.settle(6);
        const t = await p.locator('#secTenue').textContent();
        assert.match(t, /Parapluie|imperméable|capuche/i, t.slice(0, 400));
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
