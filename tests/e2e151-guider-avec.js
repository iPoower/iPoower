// « Guider avec… » (21/11/2026), données FICTIVES, iPhone puis PC.
// Onglet GPS, trajet vers une adresse non enregistrée : rappel du verdict du trajet (pneus et gel), trois liens officiels
// (Waze, Plans, Google Maps) aux URL exactes, AUCUNE requête vers ces services avant l'appui ; à l'appui, le lien choisi
// s'ouvre. Trajet vers le travail (lieu enregistré) : favori Waze « work », Plans et Google Maps indisponibles, aucune adresse
// ni position du lieu dans un lien.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const ADDR = "3 rue fictive de l'Église, Lieu B", ENC = "3%20rue%20fictive%20de%20l%27%C3%89glise%2C%20Lieu%20B";
const GUIDE = /(^|\.)waze\.com$|^maps\.apple\.com$|(^|\.)google\.com$/;
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T10:00:00+01:00', dev }), p = s.p, sent = [];
  await s.c.route(u => GUIDE.test(new URL(u).hostname), r => { sent.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>guidage</p>' }); });
  await p.route('https://data.geopf.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PX }));
  await p.route('https://overpass-api.de/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"elements":[]}' }));
  const RAD = Math.PI / 180, meters = (a, c) => 6371000 * RAD * Math.hypot(c[0] - a[0], (c[1] - a[1]) * Math.cos((a[0] + c[0]) * RAD / 2));
  await p.route('https://router.project-osrm.org/**', r => { const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const co = Array.from({ length: 21 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 20, A[1] + (B[1] - A[1]) * i / 20]), d = meters([A[1], A[0]], [B[1], B[0]]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: d, duration: d / 15, geometry: { coordinates: co }, legs: [{ steps: [], annotation: { duration: co.slice(1).map(() => d / 300) } }] }] }) }); });
  await p.emulateMedia({ reducedMotion: 'reduce' }); await s.settle(4);
  // Trajet vers une adresse NON enregistrée (≈ 30 km de tout lieu enregistré).
  const dest = await p.evaluate(A => { S.work.days = []; appSetDayType('off'); saveSettings(); const [o] = S.locs, pt = { id: 'fictif-b', name: 'Lieu fictif B', address: A, lat: +(o.lat + 0.27).toFixed(5), lon: +(o.lon + 0.01).toFixed(5) };
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: null, destinationPoint: pt, dep: liveNow().slice(0, 16), carId: S.cars[0].id }); rebuild(); renderAll(); return pt; }, ADDR);
  await s.settle(12);
  await p.locator('#viewSeg [data-v=gps]').click(); await s.settle(2);
  const g = await p.evaluate(() => { const r = document.querySelector('#secGps [data-gps=guide]'), q = k => r && r.querySelector('[data-guide=' + k + ']');
    const one = k => { const e = q(k); return e ? { tag: e.tagName, href: e.getAttribute('href'), text: e.textContent.trim(), dis: e.disabled === true, target: e.getAttribute('target'), rel: e.getAttribute('rel'), h: Math.round(e.getBoundingClientRect().height) } : null; };
    return { shown: !!r && r.getBoundingClientRect().height > 0, verdict: (r && r.querySelector('[data-gps=verdict]') || {}).textContent || '', waze: one('waze'), plans: one('plans'), google: one('google'),
      order: r ? [...r.querySelectorAll('[data-guide]')].map(e => e.dataset.guide).join(',') : '' }; });
  const ll = dest.lat.toFixed(5) + ',' + dest.lon.toFixed(5);
  check(`${dev} · onglet GPS : rappel du verdict du trajet en une ligne (« ${g.verdict} »)`, g.shown && /^Verdict du trajet : (RAS|VIGILANCE|PRUDENCE|DANGER|INDÉTERMINÉ) · .*pneus .* · .*gel/.test(g.verdict), JSON.stringify(g));
  check(`${dev} · trois boutons sous le trajet : « Guider avec Waze », « avec Plans », « avec Google Maps », cibles ≥ 44 px`, g.order === 'waze,plans,google' && (g.waze || {}).text === 'Guider avec Waze' && (g.plans || {}).text === 'avec Plans' && (g.google || {}).text === 'avec Google Maps' && [g.waze, g.plans, g.google].every(x => !!x && x.h >= 44), JSON.stringify(g));
  check(`${dev} · liens officiels exacts (adresse accentuée encodée, position à 5 décimales), ouverts hors de l’app, sans référent`,
    (g.waze || {}).href === `https://waze.com/ul?q=${ENC}&ll=${ll}&navigate=yes` && (g.plans || {}).href === `https://maps.apple.com/?daddr=${ENC}&dirflg=d` && (g.google || {}).href === `https://www.google.com/maps/dir/?api=1&destination=${ENC}&travelmode=driving`
    && [g.waze, g.plans, g.google].every(x => !!x && x.tag === 'A' && x.target === '_blank' && /noopener/.test(x.rel) && /noreferrer/.test(x.rel)), JSON.stringify({ g, ll }));
  check(`${dev} · aucune requête vers Waze, Apple ou Google avant l’appui`, sent.length === 0, sent.join(' '));
  if (!g.waze) { check(`${dev} · bouton « Guider avec Waze » présent`, false, 'absent'); await s.c.close(); return; }
  const [pop] = await Promise.all([s.c.waitForEvent('page', { timeout: 10000 }), p.locator('#secGps [data-guide=waze]').click()]);
  await pop.waitForLoadState('domcontentloaded').catch(() => {});
  check(`${dev} · à l’appui sur « Guider avec Waze » : le lien Waze s’ouvre, et lui seul`, sent.length >= 1 && sent.every(u => u.startsWith('https://waze.com/ul?')) && pop.url() === g.waze.href, JSON.stringify({ sent, url: pop.url() }));
  await pop.close();
  // Trajet vers le travail (lieu enregistré) : favori Waze « work », aucune adresse ni position dans un lien.
  const work = await p.evaluate(() => { const [o] = S.locs, w = S.locs.find(l => l.id === S.work.to) || S.locs[1];
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: w.id, destinationPoint: null, dep: liveNow().slice(0, 16), carId: S.cars[0].id }); rebuild(); renderAll();
    return { lat: w.lat, lon: w.lon, name: w.name, address: w.address || '' }; }); await s.settle(4);
  const h = await p.evaluate(() => { const r = document.querySelector('#secGps [data-gps=guide]'); return r ? [...r.querySelectorAll('[data-guide]')].map(e => ({ id: e.dataset.guide, href: e.getAttribute('href'), dis: e.disabled === true, why: (e.nextElementSibling || {}).textContent || '' })) : []; });
  const hrefs = h.map(x => x.href || '').join(' '), leak = [String(work.lat).slice(0, 6), String(work.lon).slice(0, 5), encodeURIComponent(work.name)].concat(work.address ? [encodeURIComponent(work.address)] : []).filter(v => v && hrefs.includes(v));
  check(`${dev} · destination = travail (lieu enregistré) : favori Waze « work », Plans et Google Maps indisponibles, aucune adresse ni position dans un lien`,
    h.length === 3 && h[0].href === 'https://waze.com/ul?favorite=work&navigate=yes' && h[1].dis && !h[1].href && h[2].dis && !h[2].href && /lieu enregistré/.test(h[1].why) && !leak.length, JSON.stringify({ h, leak }));
  check(`${dev} · toujours aucune requête vers Google ou Apple`, sent.every(u => u.startsWith('https://waze.com/')), sent.join(' '));
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
