// Onglet Départ (27/11/2026), données FICTIVES, iPhone puis PC. Le propriétaire roule avec CarPlay : par défaut, l'onglet
// ne guide plus, il donne le verdict du trajet et LANCE Plans (affiché par CarPlay). Le mode EN DIRECT reste disponible
// derrière la préférence de l'appareil « EN DIRECT (sans CarPlay) » (twrc.drive.live, jamais synchronisée).
// Contrôles : libellé « Départ » lisible à 414 et 375 px ; aucun bouton EN DIRECT ; « Lancer dans Plans » en premier, lien
// exact, aucune requête avant l'appui ; lieu enregistré jamais envoyé (favori Waze) ; aucune ouverture plein écran après
// « Partir maintenant » ; sans trajet, renvoi vers Trajet ; arrivée à confirmer par la même clôture que la feuille de route ;
// réglage EN DIRECT aller-retour, conservé au rechargement, propre à l'appareil.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const ADDR = '12 rue de l’Exemple, 00000 Lieu fictif B', ENC = encodeURIComponent(ADDR);
const GUIDE = /(^|\.)(waze\.com|apple\.com|google\.com)$/;
const tabs = p => p.evaluate(() => [...document.querySelectorAll('#viewSeg [data-act=view]')].map(b => { const r = b.getBoundingClientRect();
  return { v: b.dataset.v, text: b.textContent.replace(/\s+/g, ' ').trim().replace(/^\S+\s/, ''), h: Math.round(r.height), w: Math.round(r.width), clip: b.scrollWidth > b.clientWidth + 1 }; }));
const look = p => p.evaluate(() => {
  const r = document.getElementById('secGps'), q = s => r && r.querySelector(s), main = q('[data-gps=launch] .gps-go');
  return { shown: !!r && !r.hidden && r.getBoundingClientRect().height > 0, h2: (q('h2') || {}).textContent || '', label: r && r.getAttribute('aria-label'),
    live: r ? r.querySelectorAll('[data-act=drive-open], [data-act=drive-free], [data-act=drive-dest]').length : -1,
    verdict: (q('[data-gps=verdict]') || {}).textContent || '', main: main ? { id: main.dataset.guide, text: main.textContent.trim(), href: main.getAttribute('href'), tag: main.tagName,
      target: main.getAttribute('target'), rel: main.getAttribute('rel'), h: Math.round(main.getBoundingClientRect().height) } : null,
    others: r ? [...r.querySelectorAll('[data-gps=launch] .gps-guide-apps [data-guide]')].map(e => ({ id: e.dataset.guide, href: e.getAttribute('href'), dis: e.disabled === true, why: (e.nextElementSibling || {}).textContent || '' })) : [],
    none: !!q('[data-gps=none]'), arrival: q('[data-gps=arrival] [data-act=fr-arrived]') ? q('[data-gps=arrival] [data-act=fr-arrived]').dataset.key : null,
    over: document.documentElement.scrollWidth - window.innerWidth };
});
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T10:00:00+01:00', dev }), p = s.p, sent = [];
  await s.c.route(u => GUIDE.test(new URL(u).hostname), r => { sent.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>guidage</p>' }); });
  const RAD = Math.PI / 180, meters = (a, c) => 6371000 * RAD * Math.hypot(c[0] - a[0], (c[1] - a[1]) * Math.cos((a[0] + c[0]) * RAD / 2));
  await p.route('https://router.project-osrm.org/**', r => { const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const co = Array.from({ length: 21 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 20, A[1] + (B[1] - A[1]) * i / 20]), d = meters([A[1], A[0]], [B[1], B[0]]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: d, duration: d / 15, geometry: { coordinates: co }, legs: [{ steps: [], annotation: { duration: co.slice(1).map(() => d / 300) } }] }] }) }); });
  await p.emulateMedia({ reducedMotion: 'reduce' }); await s.settle(4);
  const pref = await p.evaluate(() => ({ live: driveLivePref(), stored: lsGet('twrc.drive.live'), device: SyncMerge.device('twrc.drive.live') }));
  check(`${dev} · par défaut : mode EN DIRECT masqué, préférence propre à l’appareil (jamais synchronisée)`, !pref.live && pref.stored === null && pref.device, JSON.stringify(pref));
  // Barre d'onglets : « Départ » à la place de « GPS », lisible sur téléphone.
  if (dev === 'iphone') for (const w of [414, 375]) {
    await p.setViewportSize({ width: w, height: 860 }); await s.settle(1);
    const t = await tabs(p), d = t.find(x => x.v === 'gps');
    check(`${dev} ${w} px · onglet « Départ » (raccourci 4), cible ≥ 44 px, aucun libellé coupé`, !!d && d.text === 'Départ' && d.h >= 44 && d.w >= 44 && t.every(x => !x.clip), JSON.stringify(t));
  }
  // Recette R4-04b (27/11) : sur PC (≥ 1200 px, souris), les six onglets tiennent dans la colonne sans être coupés.
  if (dev === 'pc') { for (const w of [1280, 1440, 1920, 2560]) {
    await p.setViewportSize({ width: w, height: 1000 }); await s.settle(1);
    const t = await tabs(p), bar = await p.evaluate(() => { const seg = document.querySelector('#viewSeg .seg.view'), r = seg.getBoundingClientRect();
      return { over: seg.scrollWidth - seg.clientWidth, out: [...seg.querySelectorAll('button')].filter(b => b.getBoundingClientRect().right > r.right + 1).map(b => b.textContent.trim()) }; });
    check(`${dev} ${w} px · six onglets entiers (« Analyse » compris), aucun débordement, cibles ≥ 44 px`, t.length === 6 && t.every(x => !x.clip && x.h >= 44) && bar.over <= 1 && !bar.out.length, JSON.stringify({ t, bar }));
  } await p.setViewportSize({ width: 1280, height: 800 }); await s.settle(1); }
  // Trajet vers une adresse NON enregistrée : verdict, puis « Lancer dans Plans ».
  await p.evaluate(A => { S.work.days = []; appSetDayType('off'); saveSettings(); const [o] = S.locs, pt = { id: 'fictif-b', name: 'Lieu fictif B', address: A, lat: +(o.lat + 0.27).toFixed(5), lon: +(o.lon + 0.01).toFixed(5) };
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: null, destinationPoint: pt, dep: liveNow().slice(0, 16), carId: S.cars[0].id }); rebuild(); renderAll(); }, ADDR);
  await s.settle(12);
  await p.locator('#viewSeg [data-v=gps]').click(); await s.settle(2);
  const g = await look(p);
  check(`${dev} · onglet Départ affiché, titre « Départ », aucun bouton EN DIRECT (Démarrer, Rouler sans destination)`, g.shown && g.h2 === 'Départ' && /^Départ/.test(g.label || '') && g.live === 0 && g.over <= 1, JSON.stringify(g));
  check(`${dev} · verdict du trajet en une ligne avant de partir (« ${g.verdict} »)`, /^Verdict du trajet : (RAS|VIGILANCE|PRUDENCE|DANGER|INDÉTERMINÉ) · .*pneus .* · .*gel/.test(g.verdict), g.verdict);
  check(`${dev} · bouton principal « ▶ Lancer dans Plans », lien officiel exact, ouvert hors de l’app sans référent, cible ≥ 48 px`,
    !!g.main && g.main.id === 'plans' && g.main.text === '▶ Lancer dans Plans' && g.main.href === `https://maps.apple.com/?daddr=${ENC}&dirflg=d` && g.main.tag === 'A' && g.main.target === '_blank' && /noopener/.test(g.main.rel) && /noreferrer/.test(g.main.rel) && g.main.h >= 48, JSON.stringify(g.main));
  check(`${dev} · Waze et Google Maps en second, dans cet ordre`, g.others.map(x => x.id).join(',') === 'waze,google' && g.others.every(x => x.href && !x.dis), JSON.stringify(g.others));
  check(`${dev} · aucune requête vers Apple, Waze ou Google avant l’appui`, sent.length === 0, sent.join(' '));
  if (g.main && g.main.href) {
    const [pop] = await Promise.all([s.c.waitForEvent('page', { timeout: 10000 }), p.locator('#secGps [data-gps=launch] .gps-go').click()]);
    await pop.waitForLoadState('domcontentloaded').catch(() => {});
    check(`${dev} · à l’appui : le lien Plans s’ouvre, et lui seul`, sent.length >= 1 && sent.every(u => u.startsWith('https://maps.apple.com/')) && pop.url() === g.main.href, JSON.stringify({ sent, url: pop.url() }));
    await pop.close();
  } else check(`${dev} · à l’appui : le lien Plans s’ouvre`, false, 'aucun bouton « Lancer dans Plans »');
  // « Partir maintenant » : l'ouverture automatique du plein écran ne se déclenche plus.
  const auto = await p.evaluate(async () => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; driveAutoOpen(t.key, 1, () => ({ pts: [] }));
    await new Promise(r => setTimeout(r, 50)); const root = document.getElementById('liveDrive'); return { open: DRIVE.open, hidden: !root || root.hidden }; });
  await s.settle(2);
  check(`${dev} · « Partir maintenant » n’ouvre plus le mode EN DIRECT en plein écran`, !auto.open && auto.hidden && !(await p.evaluate(() => DRIVE.open)), JSON.stringify(auto));
  // Trajet vers le travail (lieu enregistré) : jamais d'adresse ni de position ; Waze par son favori, Plans indisponible.
  const work = await p.evaluate(() => { const [o] = S.locs, w = S.locs.find(l => l.id === S.work.to) || S.locs[1];
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: w.id, destinationPoint: null, dep: liveNow().slice(0, 16), carId: S.cars[0].id }); rebuild(); renderAll();
    return { lat: w.lat, lon: w.lon, name: w.name, address: w.address || '' }; }); await s.settle(4);
  const h = await look(p), hrefs = [h.main && h.main.href || ''].concat(h.others.map(x => x.href || '')).join(' ');
  const leak = [String(work.lat).slice(0, 6), String(work.lon).slice(0, 5), encodeURIComponent(work.name)].concat(work.address ? [encodeURIComponent(work.address)] : []).filter(v => v && hrefs.includes(v));
  check(`${dev} · destination = travail (lieu enregistré) : « Lancer dans Waze » par le favori « work », Plans et Google Maps indisponibles avec la raison, aucune adresse ni position`,
    !!h.main && h.main.id === 'waze' && h.main.href === 'https://waze.com/ul?favorite=work&navigate=yes' && h.others.length === 2 && h.others.every(x => x.dis && !x.href && /lieu enregistré/.test(x.why)) && !leak.length, JSON.stringify({ h, leak }));
  await s.c.close();
  // Sans trajet dans les 3 h : renvoi vers l'onglet Trajet.
  const q = await session(b, { at: '2026-11-16T10:00:00+01:00', dev }), pq = q.p; await q.settle(4);
  await pq.evaluate(() => { S.work.days = []; appSetDayType('off'); saveSettings(); rebuild(); renderAll(); }); await q.settle(2);
  await pq.locator('#viewSeg [data-v=gps]').click(); await q.settle(2);
  const n = await look(pq);
  check(`${dev} · sans trajet dans les 3 h : « Préparer un trajet », aucun bouton EN DIRECT`, n.shown && n.none && n.live === 0 && !n.main, JSON.stringify(n));
  await pq.locator('#secGps [data-gps=none] .gps-go').click({ timeout: 3000 }).catch(() => {}); await q.settle(2);
  check(`${dev} · « Préparer un trajet » ouvre l’onglet Trajet`, await pq.evaluate(() => UI.view) === 'trajet');
  // Réglage : EN DIRECT (sans CarPlay) puis retour à CarPlay ; conservé au rechargement.
  await pq.evaluate(() => { UI.view = 'gps'; renderAll(); }); await q.settle(1);
  await pq.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'drive-live'; b.dataset.v = '1'; document.body.appendChild(b); b.click(); b.remove(); }); await q.settle(2);
  const on = await pq.evaluate(() => ({ stored: lsGet('twrc.drive.live'), tab: (document.querySelector('#viewSeg [data-v=gps]') || {}).textContent || '', h2: (document.querySelector('#secGps h2') || {}).textContent || '',
    live: document.querySelectorAll('#secGps [data-act=drive-free], #secGps [data-act=drive-open]').length }));
  check(`${dev} · réglage « EN DIRECT (sans CarPlay) » : onglet « GPS », cockpit de nouveau accessible`, on.stored === '1' && /GPS/.test(on.tab) && /EN DIRECT/.test(on.h2) && on.live >= 1, JSON.stringify(on));
  await pq.evaluate(async () => { await window.TWRC_VAULT.flush(); }); await pq.reload(); await q.settle(8);
  await pq.evaluate(() => { UI.view = 'gps'; renderAll(); }); await q.settle(1);
  check(`${dev} · rechargement : préférence EN DIRECT conservée`, await pq.evaluate(() => driveLivePref() && /EN DIRECT/.test((document.querySelector('#secGps h2') || {}).textContent || '')));
  await pq.evaluate(() => { const b = document.createElement('button'); b.dataset.act = 'drive-live'; b.dataset.v = '0'; document.body.appendChild(b); b.click(); b.remove(); }); await q.settle(2);
  const off = await pq.evaluate(() => ({ stored: lsGet('twrc.drive.live'), tab: (document.querySelector('#viewSeg [data-v=gps]') || {}).textContent || '', h2: (document.querySelector('#secGps h2') || {}).textContent || '' }));
  check(`${dev} · retour à « CarPlay : Plans guide » : onglet « Départ »`, off.stored === '0' && /Départ/.test(off.tab) && off.h2 === 'Départ', JSON.stringify(off));
  await q.c.close();
  // Arrivée non détectée (aller fictif 06:30 → 07:10, il est 08:10) : confirmation depuis l'onglet Départ, même clôture.
  const a = await session(b, { at: '2026-11-16T08:10:00+01:00', dev }), pa = a.p; await a.settle(4);
  await pa.evaluate(() => { S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', size: '205/55 R16 91V', tread: 6 }));
    S.work.dep = '06:30'; S.work.durMin = 40; saveSettings(); appSetCar(S.cars[0].id); rebuild(); UI.view = 'gps'; renderAll(); }); await a.settle(6);
  const before = await look(pa);
  check(`${dev} · arrivée non détectée : « ✓ Confirmer mon arrivée » en tête de l’onglet Départ, sur l’aller du jour`, !!before.arrival && /\|go$/.test(before.arrival), JSON.stringify(before));
  if (before.arrival) {
    await pa.locator('#secGps [data-gps=arrival] [data-act=fr-arrived]').click(); await a.settle(3);
    const after = await pa.evaluate(k => ({ done: !!USER_STORE.state.done[k], how: (USER_STORE.state.done[k] || {}).how, n: USER_STORE.state.debrief.entries.filter(e => e.key === k).length,
      again: document.querySelectorAll('#secGps [data-act=fr-arrived]').length }), before.arrival);
    check(`${dev} · confirmation : trajet clos (« confirmé »), une seule entrée au journal, bouton retiré`, after.done && after.how === 'confirmé' && after.n <= 1 && after.again === 0, JSON.stringify(after));
  }
  await a.c.close();
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'iphone'); await run(b, 'pc'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
