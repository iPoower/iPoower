// Audit dans Brave du 16/11/2026 (extension Claude, profil réel ; reproduit ici sur données FICTIVES), PC puis iPhone :
// « Quelle voiture prendre ? » sur le prochain trajet affiché et mêmes scores que sa carte ; vigilance de demain hors du
// verdict « Ici, maintenant » ; tuile Pluie en mm/h ; « gomme estimée » ; relevés du même jour ; action destructive séparée.
'use strict';
const fs = require('fs'), vm = require('vm'), BR = require('./lib/browser'), { unlockIfLocked } = require('./lib/unlock');
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const O = 'https://ipoower.github.io', U = O + '/iPoower/race-control/';
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + d)); if (!ok) fail++; };
async function run(b, dev, view) {
  const c = await b.newContext({ ...view, timezoneId: 'Europe/Paris' }), p = await c.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.route('**/*', r => {
    const url = new URL(r.request().url()), host = url.hostname, J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (host === 'open-meteo.com' || host.endsWith('.open-meteo.com')) {
      const q = url.searchParams, la = String(q.get('latitude')).split(','), lo = String(q.get('longitude')).split(','), one = i => ctx.mk('doux', { lat: +la[i], lon: +lo[i] }, 'Europe/Paris', 0);
      if (la.length > 1) return J(la.map((_, i) => one(i)));
      const x = one(0); return J(host.startsWith('ensemble') || url.pathname.includes('ensemble') ? ctx.me(x) : q.get('minutely_15') ? ctx.mn(x) : host.startsWith('air-quality') ? {} : x);
    }
    if (url.origin === O && url.pathname.endsWith('/calendar.sealed.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/cal.fake.json', 'utf8') });
    if (host === 'public.opendatasoft.com') {
      const dom = url.searchParams.get('refine.domain_id') || '00', now = Date.now(), iso = t => new Date(t).toISOString();
      const mid = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Europe/Paris' })); mid.setHours(24, 0, 0, 0);
      const tomorrow = now + (mid - new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Europe/Paris' })));
      const rec = f => ({ fields: { domain_id: dom, product_datetime: iso(now - 3600e3), ...f } });
      return J({ records: [rec({ color_id: 1, color: 'vert', phenomenon: 'vent', echeance: 'J', begin_time: iso(now - 3600e3), end_time: iso(tomorrow) }),
        rec({ color_id: 3, color: 'orange', phenomenon: 'vent', echeance: 'J1', begin_time: iso(tomorrow), end_time: iso(tomorrow + 864e5) })] });
    }
    if (host === 'api.rainviewer.com') return J({ host: 'https://tilecache.rainviewer.com', radar: { past: [] } });
    if (host === 'tilecache.rainviewer.com' || host.endsWith('.arcgisonline.com') || host === 'tile.openstreetmap.org' || host.endsWith('.tile.openstreetmap.org')) return r.fulfill({ status: 200, contentType: 'image/png', body: PX });
    if (url.origin === O && url.pathname.endsWith('/vendor/leaflet/leaflet.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
    if (url.origin === O && url.pathname.endsWith('/vendor/leaflet/leaflet.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
    if (url.origin === O && url.pathname.endsWith('/obs.json')) return J({ stations: {} });
    if (url.origin === O && url.pathname.endsWith('/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (url.origin === O && !/\.(js|json)$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();
  });
  const ready = () => p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault' && document.querySelector('#secCars article.car'), null, { timeout: 40000 });
  await p.goto(U); await p.waitForTimeout(800); await unlockIfLocked(p); await ready();
  // Profil FICTIF complété : deux voitures avec pneus renseignés (comparaison possible).
  await p.evaluate(() => { const [a, b] = S.cars; a.tire.brand = 'Marque test'; a.tire.model = 'Été test'; b.tire.type = 'winter'; b.tire.brand = 'Marque test'; b.tire.model = 'Hiver test'; b.tire.size = b.tire.size || '205/55 R16';
    saveSettings(); rebuild(); });
  await p.waitForTimeout(2500);
  // 1-2. « Quelle voiture prendre ? » = le prochain trajet du contexte, avec les mêmes scores que la carte trajet
  const cmp = await p.evaluate(() => {
    const nt = APP_CONTEXT.snapshot && (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip), el = document.getElementById('secCmp');
    const scores = nt && nt.res ? nt.res.map(r => [r.c.short, r.w.score]) : [];
    return { has: !!(nt && nt.seq && nt.seq.length), from: nt && nt.from, to: nt && nt.to, span: nt ? tripSpan(nt) : '', text: el ? el.textContent : '', scores };
  });
  check(`${dev} · « Quelle voiture prendre ? » compare le prochain trajet affiché (mêmes lieux, même horaire)`, !cmp.has || (cmp.text.includes(cmp.from) && cmp.text.includes(cmp.to) && cmp.text.includes(cmp.span)), JSON.stringify({ from: cmp.from, to: cmp.to, span: cmp.span, text: cmp.text.slice(0, 300) }));
  check(`${dev} · même score par voiture que la carte du prochain trajet`, !cmp.has || cmp.scores.every(([s, v]) => cmp.text.includes(s + ' · ' + v + '/100')), JSON.stringify(cmp.scores) + ' | ' + cmp.text.slice(0, 200));
  // 4. Vigilance orange DEMAIN : listée dans les alertes, absente du verdict « Ici, maintenant »
  await p.waitForFunction(() => window.VIGI && VIGI.state === 'ok', null, { timeout: 15000 }).catch(() => {});
  const vg = await p.evaluate(() => ({ state: VIGI.state, listed: !!(CX.alerts && CX.alerts.vigi && /orange/i.test(CX.alerts.vigi.title)), now: !!(CX.alertsNow && CX.alertsNow.vigi && CX.alertsNow.vigi.sev >= 2), hero: (document.querySelector('#decisionCore') || {}).textContent || '' }));
  check(`${dev} · vigilance orange de demain : dans les alertes, jamais dans le verdict « Ici, maintenant »`, vg.state === 'ok' && vg.listed && !vg.now && !/Vigilance orange/.test(vg.hero), JSON.stringify({ state: vg.state, listed: vg.listed, now: vg.now, hero: vg.hero.slice(0, 160) }));
  // 11. Tuile Pluie de la carte trajet : intensité en mm/h, jamais « mm » seul
  const rain = await p.evaluate(() => [...document.querySelectorAll('.kpi')].filter(k => /^Pluie/.test((k.querySelector('.k') || {}).textContent || '')).map(k => (k.querySelector('.v small') || {}).textContent));
  check(`${dev} · tuile Pluie : unité mm/h (ou % de probabilité)`, rain.every(u => u === 'mm/h' || u === '%'), JSON.stringify(rain));
  // 18. Gomme : la plage entre parenthèses est nommée « gomme estimée »
  const gum = await p.evaluate(() => [...document.querySelectorAll('[data-k=gum] span')].map(s => s.textContent).join(' | '));
  check(`${dev} · gomme : « gomme estimée » devant la plage de température`, !/Départ|Maintenant/.test(gum) || /gomme estimée/.test(gum), gum.slice(0, 200));
  // 5, 7, 12. Garage : deux relevés le même jour, sous-titre honnête, action destructive séparée
  const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  await p.evaluate(([a, b]) => { S.cars[0].odo = [{ d: a, km: 50000 }, { d: b, km: 50620 }, { d: b, km: 50600 }]; delete S.cars[0].odoGoal; saveSettings(); }, [day(20), day(5)]);
  await p.locator('#viewSeg [data-act=view][data-v=garage]').first().click(); await p.waitForTimeout(900);
  await p.evaluate(() => { renderGarage.last = null; renderGarage(); }); await p.waitForTimeout(300);
  const A = p.locator('[data-garage-odo="carA"]');
  await A.locator('details.ux-fold > summary').click();
  const g = await A.evaluate(el => ({ sub: el.querySelector('details.ux-fold > summary small').textContent, dup: [...el.querySelectorAll('.odo-list li[data-odo-dup]')].map(li => li.textContent),
    rows: [...el.querySelectorAll('.odo-list li')].map(li => li.querySelector('b').textContent), tile: el.querySelector('.odo-stats li span').textContent, total: el.textContent }));
  check(`${dev} · même jour : le plus élevé compte, l’autre est « non compté », ordre date puis km`, g.dup.length === 1 && /50\s600 km/.test(g.dup[0]) && /non compté/.test(g.dup[0]) && /50\s620/.test(g.rows[0]) && /50\s600/.test(g.rows[1]) && /620 km/.test(g.total), JSON.stringify(g.rows) + ' | ' + g.dup.join(','));
  check(`${dev} · sous-titre et tuile honnêtes : 3 relevés listés, 2 jours, « aucun objectif »`, /^3 relevés · aucun objectif$/.test(g.sub) && g.tile === 'Jours relevés', g.sub + ' | ' + g.tile);
  await A.locator(`[data-odo-fix][data-d="${day(20)}"]`).first().click(); await p.waitForTimeout(400);
  const sep = await A.evaluate(el => { const f = el.querySelector('.odo-fix-form'), v = f && f.querySelector('.odo-fix-danger [data-odo-void]'), c = f && f.querySelector('[data-odo-fix-cancel]'); if (!v || !c) return null;
    const a = v.getBoundingClientRect(), b = c.getBoundingClientRect(); return { gap: Math.round(a.top - b.bottom), separate: !v.parentElement.contains(c) }; });
  check(`${dev} · « Annuler ce relevé » séparé de « Fermer » (ligne à part)`, !!sep && sep.separate && sep.gap >= 8, JSON.stringify(sep));
  await A.locator('[data-odo-fix-cancel]').click(); await p.waitForTimeout(200);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${dev} · aucun débordement horizontal`, over <= 1, String(over));
  check(`${dev} · aucune erreur JavaScript`, !errors.length, errors.join(' / '));
  await c.close();
}
(async () => {
  const b = await BR.launch();
  try {
    await run(b, 'PC', { viewport: { width: 1440, height: 900 } });
    await run(b, 'iPhone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  } finally { await b.close(); }
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
