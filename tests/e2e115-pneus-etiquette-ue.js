// Paramètres · choix des pneus avec l'étiquette UE officielle (registre EPREL), filtres, tri et statistiques.
// Voitures fictives (215/40 ZR18 89Y XL et 225/45 R17 94W), base publiée site/tiredb.json, iPhone puis PC.
'use strict';
const fs = require('fs'), BR = require('./lib/browser');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), html = fs.readFileSync('site/index.html', 'utf8');
const O = 'https://ipoower.github.io', U = O + '/iPoower/race-control/';
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + d)); if (!ok) fail++; };
async function run(b, label, view) {
  const c = await b.newContext({ ...view, timezoneId: 'Europe/Paris' });
  const p = await c.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', r => {
    const url = new URL(r.request().url());
    if (url.origin === O && url.pathname.endsWith('/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (url.origin === O && !/\.(js|json)$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();   // météo, agenda, cartes : hors sujet ici, refusés
  });
  await p.goto(U); await p.waitForTimeout(800);
  if (await p.locator('#unlockPw').isVisible().catch(() => false)) {
    await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
  }
  await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault', null, { timeout: 30000 });
  // la base publiée est chargée en ligne (version ≥ 4 avec étiquettes) ; sinon on la charge comme le ferait refreshTireDB
  await p.evaluate(async () => { if (!(TIRE_DB_META.version >= 4)) { const js = await (await fetch('tiredb.json')).json(); loadTireDB(js, 'en ligne'); } });
  const openSettings = async () => { if (!await p.locator('#settings').evaluate(d => d.open)) await p.locator('#settings > summary').click(); await p.locator('#f-db-0').waitFor({ timeout: 10000 }); };
  await p.evaluate(() => renderSettings(true)); await openSettings();
  const opts = i => p.locator(`#f-db-${i} option`).allInnerTexts();
  const lab0 = await p.locator('#tp-n-0').innerText();
  let o = await opts(0);
  check(`${label} · liste en 215/40 R18 : des centaines de modèles avec leur étiquette`, /215\/40 R18/.test(lab0) && o.length > 100 && o.filter(x => /☔[A-E] ⛽[A-E]/.test(x)).length > 100, lab0 + ' · ' + o.length);
  // indices de la monte (89Y) : aucune option sous 89 ou sous Y
  const low = await p.evaluate(() => tpList(S.cars[0], 0).rows.filter(r => r.l && (r.l.li < 89 || siRank(r.l.si) < siRank('Y'))).length);
  check(`${label} · filtre « Indices ≥ 89Y » : aucune variante sous la monte`, low === 0, String(low));
  // saison été + mouillé A : uniquement ☔A, triés
  await p.locator('[data-tp="season"][data-i="0"]').selectOption('summer');
  await p.locator('[data-tp="wet"][data-i="0"]').selectOption('A');
  o = (await opts(0)).slice(1);
  check(`${label} · Été + mouillé A : uniquement des pneus classés A sur mouillé`, o.length > 3 && o.every(x => /☔A/.test(x)) && !o.some(x => /· hiver|· 4 saisons/.test(x)), o.slice(0, 3).join(' / '));
  // recherche, sans perdre le focus du champ
  const q = p.locator('[data-tp="q"][data-i="0"]');
  await p.locator('[data-tp="wet"][data-i="0"]').selectOption('');
  await q.fill('pilot sport 4s'); await p.waitForTimeout(500);
  o = (await opts(0)).slice(1);
  const focused = await p.evaluate(() => document.activeElement && document.activeElement.dataset.tp === 'q');
  check(`${label} · recherche « pilot sport 4s » : Michelin Pilot Sport 4S trouvé, focus conservé`, o.some(x => /^Michelin Pilot Sport 4S ·/.test(x)) && focused, o.join(' / '));
  // choix → monte enregistrée, statistiques et variantes avec lien EPREL
  const idx = await p.evaluate(() => TIRE_DB.indexOf(findTire('Michelin', 'Pilot Sport 4S')));
  await p.locator('#f-db-0').selectOption(String(idx)); await p.waitForTimeout(400); await openSettings();
  const car = await p.evaluate(() => [S.cars[0].tire.brand, S.cars[0].tire.model, S.cars[0].tire.type]);
  const st = await p.locator('#tp-stats-0').innerText();
  check(`${label} · choix enregistré sur la voiture (marque, modèle, saison)`, JSON.stringify(car) === JSON.stringify(['Michelin', 'Pilot Sport 4S', 'summer']), JSON.stringify(car));
  check(`${label} · statistiques : position du pneu monté et répartition par classe`, /Michelin Pilot Sport 4S/.test(st) && /mieux classé que \d+ %/.test(st) && /modèles été en 215\/40 R18/.test(st) && /registre européen EPREL/.test(st), st.slice(0, 200));
  const link = await p.locator('#tp-stats-0 a[href^="https://eprel.ec.europa.eu/screen/product/tyres/"]').count();
  check(`${label} · variantes du pneu monté avec lien vers la fiche officielle`, link >= 1, String(link));
  const sheet = await p.evaluate(() => tireSheet(S.cars[0].tire, '2026-11-11').lines.join(' / '));
  check(`${label} · fiche du pneu : étiquette UE de la variante exacte 89Y XL`, /Étiquette UE \(EPREL \d+\) : adhérence sur mouillé [A-E] · consommation [A-E]/.test(sheet), sheet);
  // deuxième voiture : autre dimension, filtres indépendants
  const lab1 = await p.locator('#tp-n-1').innerText();
  check(`${label} · deuxième voiture en 225/45 R17 : liste propre, filtres indépendants`, /225\/45 R17/.test(lab1) && await p.locator('[data-tp="season"][data-i="1"]').inputValue() === 'all', lab1);
  // mise en page : aucun débordement horizontal
  const over = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  check(`${label} · aucun débordement horizontal`, over <= 1, String(over));
  check(`${label} · aucune erreur JavaScript`, !errors.length, errors.join(' / '));
  await c.close();
}
(async () => {
  const b = await BR.launch();
  try {
    await run(b, 'iPhone', { viewport: { width: 414, height: 896 }, isMobile: BR.NAME !== 'firefox', hasTouch: true, deviceScaleFactor: 3 });
    await run(b, 'PC', { viewport: { width: 1280, height: 900 } });
  } finally { await b.close(); }
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' contrôles « pneus : étiquette UE »');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
