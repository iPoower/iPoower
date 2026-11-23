// Mode « EN DIRECT » v2 · lot 1, cockpit (21/11/2026), données FICTIVES, iPhone puis PC, GPS simulé.
// Vitesse GPS dans une pastille NEUTRE (jamais un cercle rouge) ; icône de feu NEUTRE sur la carte et dans l'alerte (aucune lampe
// colorée, aucun emoji) ; libellé « 3 feux · prochain à 180 m » ; fond Plan IGN clair le jour, sombre la nuit (bascule EN DIRECT
// au coucher, même carte) ; photo aérienne IGN choisie dans les Réglages, conservée, assombrie la nuit.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const RAD = Math.PI / 180, meters = (a, b) => 6371000 * RAD * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) * RAD / 2));
// Couleur « vive » (rouge, orange, vert…) : écart entre composantes > 60. Les gris, le blanc et le noir passent.
const COLORFUL = `c => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ''); if (!m) return false; const [r, g, b, a = 1] = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return a > 0 && Math.max(r, g, b) - Math.min(r, g, b) > 60; }`;
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T16:30:00+01:00', dev }), p = s.p, tiles = [];
  await p.route('https://data.geopf.fr/wmts**', r => { const u = r.request().url(); tiles.push(/LAYER=([A-Z0-9.]+)/.exec(u)[1]); return r.fulfill({ status: 200, contentType: /jpeg/.test(u) ? 'image/jpeg' : 'image/png', body: PX }); });
  await p.route('https://router.project-osrm.org/**', r => {
    const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const coords = Array.from({ length: 41 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 40, A[1] + (B[1] - A[1]) * i / 40]), d = meters([A[1], A[0]], [B[1], B[0]]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: d, duration: d / 20,
      geometry: { coordinates: coords }, legs: [{ annotation: { duration: coords.slice(1).map(() => d / 20 / 40) } }] }] }) });
  });
  let lightsAt = [], lightsMode = 'ok', lightsCalls = 0;
  await p.route('https://overpass-api.de/**', r => {
    lightsCalls++;
    const body = lightsMode === 'incomplete' ? { elements: [], remark: 'runtime error: Query timed out' } : { elements: lightsAt.map(([lat, lon], i) => ({ type: 'node', id: i + 1, lat, lon })) };
    return r.fulfill({ status: lightsMode === '503' ? 503 : 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await s.settle(4);
  const ends = await p.evaluate(() => { S.work.days = []; S.gpsAuto = 1; saveSettings(); const [o, d] = S.locs;
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep: liveNow().slice(0, 16), carId: S.cars[0].id });
    UI.view = 'trajet'; rebuild(); renderAll(); return { a: [o.lat, o.lon], b: [d.lat, d.lon] }; });
  const line = f => [ends.a[0] + (ends.b[0] - ends.a[0]) * f, ends.a[1] + (ends.b[1] - ends.a[1]) * f], total = meters(ends.a, ends.b);
  lightsAt = [line(0.3), line(0.5), line(0.7)];
  await s.settle(8);
  await p.locator('#viewSeg [data-v=gps]').click(); await s.settle(1); await p.locator('#secGps [data-act=drive-open]').click(); await s.settle(6);
  const look = () => p.evaluate(COLORFUL => { const colorful = eval(COLORFUL), root = document.getElementById('liveDrive'), sp = root.querySelector('.dv-speed'), cs = sp && getComputedStyle(sp);
    const icons = [...root.querySelectorAll('.dv-light, .dv-li')], parts = icons.flatMap(el => [el, ...el.querySelectorAll('*')]);
    const loud = parts.flatMap(el => { const c = getComputedStyle(el); return [c.fill, c.stroke, c.backgroundColor, c.color].filter(colorful).map(x => el.tagName + ':' + x)
      .concat(c.backgroundImage && c.backgroundImage !== 'none' ? [el.tagName + ':' + c.backgroundImage.slice(0, 40)] : []); });
    const q = k => (root.querySelector('[data-dv="' + k + '"]') || {}).textContent || '', al = root.querySelector('[data-dv="lightAlert"]'), plan = root.querySelector('.dv-plan'), ortho = root.querySelector('.dv-ortho');
    return { speed: sp ? sp.textContent : null, radius: cs ? parseFloat(cs.borderTopLeftRadius) : null, w: sp ? sp.offsetWidth : 0, spLoud: cs ? [cs.backgroundColor, cs.borderTopColor, cs.color].filter(colorful) : ['absente'],
      markers: root.querySelectorAll('.dv-light').length, loud, emoji: /\u{1F6A6}|\u{1F6A5}/u.test(root.textContent), label: q('lightsLabel'), alert: al && !al.hidden ? q('lightAlertText') : '',
      night: root.classList.contains('dv-night'), planFilter: plan ? getComputedStyle(plan).filter : null, orthoFilter: ortho ? getComputedStyle(ortho).filter : null, map: !!DRIVE.map }; }, COLORFUL);
  const a = await look();
  check(`${dev} · vitesse GPS dans une pastille neutre (coins arrondis, jamais un cercle ; aucune couleur vive)`, a.speed !== null && a.radius > 0 && a.radius < a.w / 2 - 4 && !a.spLoud.length, JSON.stringify(a));
  check(`${dev} · 16:30 (soleil levé) : Plan IGN clair, sans filtre sombre`, !a.night && tiles.includes('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2') && !tiles.includes('ORTHOIMAGERY.ORTHOPHOTOS') && (!a.planFilter || a.planFilter === 'none'), JSON.stringify({ a, tiles: [...new Set(tiles)] }));
  // Trajet démarré, GPS sur l'itinéraire à 90 km/h.
  await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; liveStart(t.key); });
  const step = 1500 / total, geo = async f => { await p.evaluate(g => { window.__geo = { lat: g[0], lon: g[1], acc: 8 }; window.__geoPush(); }, line(f)); await s.settle(3); };
  let f = 0.12; for (let i = 0; i < 3; i++) { if (i) await p.clock.runFor(60e3); await geo(f); f += step; }
  const c = await look();
  check(`${dev} · en roulant : vitesse GPS dans la pastille (≈ 90 km/h)`, /^\d+km\/h$/.test(c.speed) && Math.abs(parseInt(c.speed, 10) - 90) <= 15, c.speed);
  check(`${dev} · libellé « N feux · prochain à … m » (${c.label})`, /^\d feux? · prochain à \d+ m$/.test(c.label), c.label);
  check(`${dev} · icônes de feu neutres sur la carte (${c.markers}) : aucune lampe colorée, aucun emoji`, c.markers >= 1 && !c.loud.length && !c.emoji, JSON.stringify(c.loud));
  // Approche d'un feu : alerte sans emoji, icône neutre.
  f = 0.5 - 250 / total; await p.clock.runFor(80e3); await geo(f);
  const d = await look();
  check(`${dev} · alerte d’approche « Feu dans 250 m » : icône neutre, aucun emoji`, /^Feu dans 2[45]0 m$/.test(d.alert) && !d.loud.length && !d.emoji, JSON.stringify({ alert: d.alert, loud: d.loud }));
  // Nuit noire pendant le trajet : même carte, Plan IGN sombre.
  await p.evaluate(() => { window.__map0 = DRIVE.map; });
  await p.clock.setSystemTime(new Date('2026-11-16T17:35:00+01:00')); await s.settle(4);
  const n = await look(), same = await p.evaluate(() => !!DRIVE.map && DRIVE.map === window.__map0);
  check(`${dev} · 17:35 (il fait noir) : Plan IGN sombre en direct, sur la même carte`, n.night && /invert/.test(n.planFilter || '') && same, JSON.stringify({ n, same }));
  // Photo aérienne choisie dans les Réglages : conservée, demandée à la Géoplateforme, assombrie la nuit.
  await p.locator('#liveDrive [data-act=drive-close]').click(); await s.settle(2);
  await p.evaluate(() => { const d = document.getElementById('settings'); if (d) d.open = true; renderSettings(true); }); await s.settle(1);
  const opt = p.locator('#settings [data-act=drive-base][data-v=ortho]');
  if (await opt.count()) { await opt.click(); await s.settle(2); }
  const pref = await p.evaluate(() => { const x = document.querySelector('#settings [data-act=drive-base][data-v=ortho]'); return { v: lsGet('twrc.drive.base'), pressed: x ? x.getAttribute('aria-pressed') : 'réglage absent' }; });
  await p.locator('#viewSeg [data-v=gps]').click(); await s.settle(1); await p.locator('#secGps [data-act=drive-open]').click(); await s.settle(6);
  const o = await look();
  check(`${dev} · Réglages → « Photo aérienne IGN » : choix conservé, BD ORTHO demandée, assombrie la nuit`, pref.v === 'ortho' && pref.pressed === 'true' && tiles.includes('ORTHOIMAGERY.ORTHOPHOTOS') && /brightness/.test(o.orthoFilter || '') && o.night, JSON.stringify({ pref, o, tiles: [...new Set(tiles)] }));
  await p.clock.setSystemTime(new Date('2026-11-16T17:00:00+01:00')); await geo(f);
  // Une erreur HTTP ou une réponse Overpass tronquée laisse le résultat inconnu, puis le même tracé se rétablit tout seul.
  for (const mode of ['503', 'incomplete']) {
    await p.locator('#liveDrive [data-act=drive-close]').click(); await s.settle(1);
    await p.evaluate(() => DRIVE_LIGHTS.clear()); lightsMode = mode;
    const before = lightsCalls;
    await p.locator('#secGps [data-act=drive-open]').click(); await s.settle(5);
    const bad = await p.evaluate(() => ({ unknown: DRIVE.lights === null, cached: DRIVE_LIGHTS.size, attempts: DRIVE.lightsAttempts, retryIn: DRIVE.lightsRetryAt - Date.now(), visible: document.getElementById('liveDrive').innerText }));
    check(`${dev} · feux ${mode} : résultat inconnu, sans faux « aucun feu », état rangé dans Détails`, bad.unknown && bad.cached === 0 && bad.attempts === 1 && !/Feux indisponibles|Aucun feu sur le parcours/.test(bad.visible), JSON.stringify(bad));
    await p.clock.runFor(Math.max(0, bad.retryIn - 1000));
    check(`${dev} · feux ${mode} : aucun nouvel appel avant le délai de reprise`, lightsCalls === before + 1, String(lightsCalls - before));
    lightsMode = 'ok'; await p.clock.runFor(2500); await s.settle(4);
    const recovered = await p.evaluate(() => ({ n: DRIVE.lights && DRIVE.lights.length, markers: DRIVE.mv && DRIVE.mv.counts().lights, attempts: DRIVE.lightsAttempts, err: DRIVE.lightsErr }));
    check(`${dev} · feux ${mode} : reprise automatique, feux dessinés sur la carte (${recovered.markers})`, recovered.n > 0 && recovered.markers === recovered.n && recovered.attempts === 2 && !recovered.err && lightsCalls === before + 2, JSON.stringify(recovered));
  }
  // Une panne prolongée est bornée à trois essais et une fermeture annule la reprise.
  await p.locator('#liveDrive [data-act=drive-close]').click(); await s.settle(1);
  await p.evaluate(() => DRIVE_LIGHTS.clear()); lightsMode = '503';
  const capBefore = lightsCalls;
  await p.locator('#secGps [data-act=drive-open]').click(); await s.settle(5);
  await p.clock.runFor(180000); await s.settle(4);
  const capped = await p.evaluate(() => ({ attempts: DRIVE.lightsAttempts, unknown: DRIVE.lights === null }));
  check(`${dev} · feux en panne prolongée : trois essais au plus, résultat toujours inconnu`, lightsCalls === capBefore + 3 && capped.attempts === 3 && capped.unknown, JSON.stringify({ capped, calls: lightsCalls - capBefore }));
  await p.locator('#liveDrive [data-act=drive-close]').click();
  const closedCalls = lightsCalls; await p.clock.runFor(120000);
  check(`${dev} · aucun appel des feux après la fermeture du GPS`, lightsCalls === closedCalls);
  await s.c.close();
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'iphone'); await run(b, 'pc'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
