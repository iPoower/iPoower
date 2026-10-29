#!/usr/bin/env node
// Phase T — recette « testeur » de Race Control, cliquée comme un utilisateur.
// 100 % fictif : préréglage et clés de test, météo générée, Google Identity et Drive simulés en mémoire.
// Toute requête non simulée est bloquée (aucun compte ni service réel). Sorties : recette-output/<navigateur>/
//   PARCOURS.md + parcours.json, MATRICE.md + matrix.json, errors.json, screenshots/, traces/*.zip
// BROWSER=chromium → profil PC ; BROWSER=webkit → émulation iPhone en affichage autonome (écran d'accueil).
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), { spawnSync } = require('node:child_process');
const pw = require('playwright');
const { fakeDrive, GIS, GAPI } = require('./fake-google');
const { APP_KEY_TEST, RC_KEY_TEST } = require('../lib/test-keys');

const ROOT = path.resolve(__dirname, '../..');
const BROWSER = (process.env.BROWSER || 'chromium').toLowerCase();
const OUT = path.resolve(process.env.RECETTE_OUT || path.join(ROOT, 'recette-output'), BROWSER);
const MONKEY_MS = Number(process.env.MONKEY_MS || 300000);
const ORIGIN = 'https://rc-recette.example', VAULT_ORIGIN = 'https://cv-recette.example';
const CODE = APP_KEY_TEST;
const WORK = path.join(ROOT, '.recette'), SITE = path.join(WORK, 'site');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

// ---------- site fictif avec Drive activé (configuration publique fictive, origine dédiée simulée) ----------
function buildSite() {
  const fake = path.join(WORK, 'fake');
  fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(fake, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tests/fixtures/preset.fake.json'), path.join(fake, 'preset.json'));
  fs.copyFileSync(path.join(ROOT, 'tests/fixtures/relay-config.fake.json'), path.join(fake, 'relay-config.json'));
  fs.writeFileSync(path.join(fake, '.passphrase'), APP_KEY_TEST); fs.writeFileSync(path.join(fake, '.rc_key'), RC_KEY_TEST);
  const config = { approved: true, clientId: '123456789012-recettefictive.apps.googleusercontent.com', apiKey: 'AIza' + 'R'.repeat(35), appId: '123456789012', raceOrigin: ORIGIN, vaultOrigin: VAULT_ORIGIN };
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/build.js')], { cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, RC_PRIVATE: path.relative(ROOT, fake), RC_OUT: path.relative(ROOT, SITE), RC_ENCRYPTED: path.relative(ROOT, path.join(WORK, 'enc')), RC_DATA_BASE: ORIGIN + '/data/', GOOGLE_DRIVE_CONFIG: JSON.stringify(config) } });
  if (r.status !== 0) throw new Error('Build fictif de recette en échec');
  if (JSON.parse(fs.readFileSync(path.join(SITE, 'drive-config.json'), 'utf8')).raceOrigin !== ORIGIN) throw new Error('Drive non activé dans le build de recette');
  // version.json est écrit au déploiement (cloudflare.yml) : même forme, identité du build de recette.
  const build = /window\.TWRC_BUILD="([0-9a-f]{12})"/.exec(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'))[1];
  fs.writeFileSync(path.join(SITE, 'version.json'), JSON.stringify({ run: 999, sha: '0'.repeat(40), at: new Date().toISOString(), build }));
}

// ---------- météo générée par le moteur de démonstration (même méthode que les suites e2e) ----------
const weather = { console, Math, Date, Intl, Map, Set, JSON };
vm.createContext(weather);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/engine.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'src/demo.js'), 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', weather);
const CAL = path.join(ROOT, '.ci/prepared/out/cal.fake.json');

// ---------- journal de recette ----------
const parcours = [], matrix = [], errors = [], blocked = new Set(), dialogs = [];
let current = 'démarrage', shotNo = 0;
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ['screenshots', 'traces', 'downloads']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
async function shot(page, name) {
  try { await page.screenshot({ path: path.join(OUT, 'screenshots', String(++shotNo).padStart(3, '0') + '-' + slug(name) + '.png'), fullPage: false }); } catch { /* page fermée */ }
}
async function step(page, journey, name, fn) {
  current = journey + ' · ' + name; const t0 = Date.now(), before = errors.length;
  let ok = true, detail = '';
  try { detail = (await fn()) || ''; } catch (e) { ok = false; detail = String(e && e.message || e).split('\n')[0].slice(0, 300); }
  const errs = errors.slice(before).filter(e => !e.explained).length;
  parcours.push({ journey, step: name, ok, detail: String(detail).slice(0, 300), ms: Date.now() - t0, consoleErrors: errs });
  console.log(`${ok ? '✅' : '❌'} [${journey}] ${name}${detail ? ' · ' + String(detail).slice(0, 160) : ''}`);
  await shot(page, journey + '-' + name);
  return ok;
}
const until = async (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout });

// Erreurs « expliquées » : uniquement des causes établies par la recette elle-même.
function classify(text, url) {
  if (/ERR_INTERNET_DISCONNECTED/.test(text) && /hors ligne/.test(current)) return 'coupure réseau simulée par la recette (étape hors ligne)';
  if (/Failed to load resource/.test(text) && url && !url.startsWith(ORIGIN)) return 'requête externe non simulée, bloquée par la recette (' + new URL(url).hostname + ')';
  if (/Failed to load resource: the server responded with a status of 404/.test(text) && url && url.startsWith(ORIGIN + '/data/')) return 'donnée relais fictive absente du jeu de test (' + url.slice(ORIGIN.length) + ')';
  return null;
}

// ---------- contexte navigateur (PC ou iPhone autonome) ----------
let browser;
async function device(label, drive) {
  const iphone = BROWSER === 'webkit';
  const base = iphone ? { ...pw.devices['iPhone 13'] } : { viewport: { width: 1366, height: 900 } };
  const ctx = await browser.newContext({ ...base, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block', acceptDownloads: true });
  await ctx.tracing.start({ screenshots: true, snapshots: true, title: label });
  await ctx.addInitScript(({ iphone }) => {
    if (iphone) {   // application ajoutée à l'écran d'accueil (affichage autonome)
      Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
      const mm = window.matchMedia.bind(window);
      window.matchMedia = q => /display-mode:\s*standalone/.test(q) ? Object.assign(mm('(min-width:0px)'), { media: q, matches: true }) : mm(q);
    }
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(ok) { setTimeout(() => ok({ coords: { latitude: 48.8502, longitude: 2.3501, accuracy: 18, speed: null }, timestamp: Date.now() }), 20); },
      watchPosition(ok) { setTimeout(() => ok({ coords: { latitude: 48.8502, longitude: 2.3501, accuracy: 18, speed: null }, timestamp: Date.now() }), 20); return 1; },
      clearWatch() {} } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });
    // Mise en arrière-plan simulée (onglet masqué / app iPhone quittée) : document.hidden piloté par la recette.
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__hidden ? 'hidden' : 'visible' });
    window.__mut = 0; window.__vaultKeys = [];
    window.addEventListener('twrc-vault-change', e => { window.__vaultKeys.push(e.key); if (window.__vaultKeys.length > 40) window.__vaultKeys.shift(); });
    new MutationObserver(m => { window.__mut += m.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  }, { iphone });
  const dev = { offline: false };
  await ctx.route('**/*', async r => {
    if (dev.offline) return r.abort('internetdisconnected');
    const u = new URL(r.request().url()), J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.origin === ORIGIN) {
      if (u.pathname.startsWith('/data/')) {
        const name = u.pathname.slice(6);
        if (name === 'calendar.sealed.json' && fs.existsSync(CAL)) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(CAL) });
        if (name === 'obs.json') return J({ updated: new Date().toISOString(), stations: {} });
        return r.fulfill({ status: 404, body: '' });
      }
      let f = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
      if (!fs.existsSync(path.join(SITE, f)) && fs.existsSync(path.join(SITE, f + '.html'))) f += '.html';
      const full = path.join(SITE, f);
      if (!full.startsWith(SITE) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ status: 200, contentType: types[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(full) });
    }
    if (u.hostname === 'accounts.google.com') return r.fulfill({ contentType: u.pathname.endsWith('/style') ? 'text/css' : 'text/javascript', body: u.pathname.endsWith('/style') ? '' : GIS });
    if (u.hostname === 'apis.google.com') return r.fulfill({ contentType: 'text/javascript', body: GAPI });
    if (u.hostname === 'www.googleapis.com') return drive.handle(r);
    if (u.hostname === 'geocoding-api.open-meteo.com') return J({ results: [{ name: (u.searchParams.get('name') || 'Lieu') + ' test', admin1: 'Région test', country: 'France', latitude: 48.86, longitude: 2.34 }] });
    if (u.hostname.endsWith('open-meteo.com')) {
      const q = u.searchParams, la = String(q.get('latitude')).split(','), lo = String(q.get('longitude')).split(',');
      const one = i => weather.mk('doux', { lat: +la[i], lon: +lo[i] }, 'Europe/Paris', 0);
      if (la.length > 1) return J(la.map((_, i) => one(i)));
      const p = one(0); return J(u.pathname.includes('ensemble') || u.hostname.startsWith('ensemble') ? weather.me(p) : q.get('minutely_15') ? weather.mn(p) : u.hostname.startsWith('air-quality') ? {} : p);
    }
    if (u.hostname.endsWith('bigdatacloud.net')) return J({ locality: 'Position test', principalSubdivision: 'Région test' });
    if (u.hostname === 'ntfy.sh') return J({});
    if (u.hostname === 'api.rainviewer.com') return J({ host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: Math.floor(Date.now() / 1000), path: '/test' }] } });
    if (/tilecache\.rainviewer|arcgisonline|tile\.openstreetmap/.test(u.hostname)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (u.hostname === 'public.opendatasoft.com') return J({ total_count: 0, results: [] });
    blocked.add(u.hostname); return r.abort();
  });
  const page = await ctx.newPage();
  watch(page, label);
  return Object.assign(dev, { ctx, page, label });
}
function watch(page, label) {
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const url = m.location() && m.location().url, why = classify(m.text(), url);
    errors.push({ device: label, step: current, kind: 'console', text: m.text().slice(0, 400), url: url ? url.replace(/\?.*/, '') : '', explained: !!why, why: why || 'NON EXPLIQUÉE' });
  });
  page.on('pageerror', e => errors.push({ device: label, step: current, kind: 'exception', text: String(e.message).slice(0, 400), explained: false, why: 'NON EXPLIQUÉE' }));
  page.on('dialog', async d => { dialogs.push({ device: label, step: current, type: d.type(), message: d.message().slice(0, 300), policy: page.__dialog || 'accept' });
    try { if ((page.__dialog || 'accept') === 'accept') await d.accept(); else await d.dismiss(); } catch { /* déjà traité */ } });
  page.on('filechooser', fc => { page.__chooser = (page.__chooser || 0) + 1; if (page.__files) fc.setFiles(page.__files).catch(() => {}); });
}
async function finish(dev) {
  try { await dev.ctx.tracing.stop({ path: path.join(OUT, 'traces', slug(dev.label) + '.zip') }); } catch { /* trace indisponible */ }
  await dev.ctx.close().catch(() => {});
}

// ---------- gestes Race Control ----------
async function unlock(page) {
  const pw$ = page.locator('#unlockPw');
  if (!await pw$.isVisible().catch(() => false)) return 'déjà déverrouillé';
  await pw$.fill(CODE);
  await Promise.all([page.waitForNavigation({ timeout: 30000 }).catch(() => null), pw$.press('Enter')]);
  await page.waitForLoadState('domcontentloaded');
  await until(page, () => typeof S === 'object' && !document.querySelector('#unlockPw'), null, 30000);
  return 'coffre déverrouillé avec le code fictif';
}
async function openSettings(page) {
  const open = await page.locator('#settings').evaluate(d => d.open).catch(() => false);
  if (!open) await page.locator('#settings > summary').click();
  await until(page, () => !!document.querySelector('#bkSec'));
}
const panel = page => page.locator('#driveSyncPanel');
const panelButton = (page, name) => panel(page).getByRole('button', { name, exact: true });
const cloud = async page => ((await panel(page).innerText().catch(() => '')).split('\n').find(l => l.startsWith('CLOUD')) || '').trim();
async function waitCloud(page, re, timeout = 30000) {
  const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < timeout) { last = await cloud(page); if (re.test(last)) return last; await page.waitForTimeout(500); }
  throw new Error('CLOUD attendu ' + re + ' · obtenu « ' + last + ' »');
}
async function clickPanel(page, name, nextName) {
  const b = panelButton(page, name); await b.scrollIntoViewIfNeeded(); await b.click();
  if (nextName) await panelButton(page, nextName).first().waitFor({ timeout: 20000 });
}
async function exportCopy(page, tag) {
  await openSettings(page);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('[data-act=bk-export]').click()]);
  const file = path.join(OUT, 'downloads', slug(tag) + '-' + dl.suggestedFilename()); await dl.saveAs(file);
  await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(1500);
  if (await page.locator('#unlockPw').isVisible().catch(() => false)) await unlock(page);
  return file;
}
async function driveConnect(page, create) {
  await openSettings(page);
  await clickPanel(page, 'Préparer la connexion Google', 'Se connecter à Google');
  await clickPanel(page, 'Se connecter à Google', 'Confirmer ce compte dédié');
  await clickPanel(page, 'Confirmer ce compte dédié', 'Retrouver les dossiers dédiés');
  if (create) { await clickPanel(page, 'Créer un dossier neuf dédié'); await until(page, () => /créé et relu/.test(document.querySelector('#driveSyncPanel [role=status]').textContent)); }
  await clickPanel(page, 'Retrouver les dossiers dédiés', 'Utiliser ce dossier');
  await panelButton(page, 'Utiliser ce dossier').first().click();
  return waitCloud(page, /envoi confirmé et relu|bloqué|conflit/);
}
const syncNow = async page => { await openSettings(page); await clickPanel(page, 'Sauvegarder maintenant (envoi, relecture, vérification)'); await page.waitForTimeout(800); return waitCloud(page, /envoi confirmé et relu|conflit|bloqué/); };
const lastOdo = page => page.evaluate(() => (S.cars[0].odo || []).slice(-1)[0] || null);

// ---------- 1. parcours utilisateur ----------
async function journeys() {
  const drive = fakeDrive([ORIGIN]);
  const A = await device('A-' + (BROWSER === 'webkit' ? 'iPhone' : 'PC'), drive), p = A.page;
  const J1 = 'P1 premier lancement';
  await step(p, J1, 'ouverture de l’app (écran de code)', async () => { await p.goto(ORIGIN + '/'); await p.locator('#unlockPw').waitFor({ timeout: 30000 }); return 'écran de déverrouillage affiché'; });
  await step(p, J1, 'déverrouillage avec le code', () => unlock(p));
  await step(p, J1, 'écran principal (capture de référence avant/après)', async () => { await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(800); return 'capture plein écran'; });
  await step(p, J1, 'création d’une voiture', async () => {
    await openSettings(p);
    const add = await p.locator('#settingsBody').getByRole('button', { name: /ajouter.*(voiture|véhicule)/i }).count();
    if (!add) throw new Error('FONCTION ABSENTE : aucune commande « ajouter une voiture » dans l’interface ; les voitures proviennent de la configuration chiffrée (' + await p.evaluate(() => S.cars.length) + ' voitures)');
    return 'bouton présent';
  });
  await step(p, J1, 'relevé de compteur', async () => {
    await openSettings(p); await p.locator('#odo-0').scrollIntoViewIfNeeded(); await p.locator('#odo-0').fill('12345'); await p.locator('[data-act=odo][data-i="0"]').click(); await p.waitForTimeout(600);
    const o = await lastOdo(p); if (!o || o.km !== 12345) throw new Error('compteur non enregistré : ' + JSON.stringify(o)); return 'compteur 12 345 km enregistré (' + o.d + ')';
  });
  await step(p, J1, 'entretien / contrôle technique', async () => {
    await p.locator('[data-act=view][data-v=garage]').first().click(); await p.waitForTimeout(500);
    const quick = p.locator('[data-act=garage-quick][data-garage-target=maintenance]').first(); await quick.click(); await p.waitForTimeout(600);
    const ct = p.locator('#f-cars-0-maint-ct-d'); await ct.waitFor({ timeout: 10000 }); await ct.fill('2026-03-14'); await ct.dispatchEvent('change'); await p.waitForTimeout(600);
    const v = await p.evaluate(() => S.cars[0].maint && S.cars[0].maint.ct && S.cars[0].maint.ct.d); if (v !== '2026-03-14') throw new Error('CT non enregistré : ' + v);
    return 'CT du 14/03/2026 enregistré via « Renseigner l’entretien »';
  });
  const J2 = 'P2 sauvegarde fichier';
  let file = null;
  await step(p, J2, 'Exporter', async () => { file = await exportCopy(p, 'A-export'); return path.basename(file) + ' · ' + fs.statSync(file).size + ' o'; });
  await step(p, J2, 'Importer → confirmation', async () => {
    if (!file) throw new Error('aucun fichier exporté');
    await openSettings(p); const n = dialogs.length;
    await Promise.all([p.waitForNavigation({ timeout: 30000 }).catch(() => null), p.locator('#bkFile').setInputFiles(file)]);
    await p.waitForLoadState('domcontentloaded'); await p.waitForTimeout(1500);
    if (await p.locator('#unlockPw').isVisible().catch(() => false)) await unlock(p);
    const asked = dialogs.slice(n).map(d => d.message.split('\n')[0]).join(' | '), msg = await p.locator('#bkMsg').innerText().catch(() => '');
    if (!dialogs.slice(n).length) throw new Error('aucune confirmation demandée · message : ' + msg);
    const o = await lastOdo(p); if (!o || o.km !== 12345) throw new Error('données après import : ' + JSON.stringify(o));
    return 'confirmation : « ' + asked.slice(0, 120) + ' » · compteur conservé';
  });
  const J3 = 'P3 Google Drive';
  await step(p, J3, 'Préparer → Se connecter → Confirmer → Créer → Retrouver → Utiliser ce dossier', () => driveConnect(p, true));
  await step(p, J3, 'synchro vérifiée', async () => { const c = await syncNow(p); if (!/envoi confirmé et relu/.test(c)) throw new Error(c); return c + ' · ' + drive.revisions().length + ' révision(s) sur le Drive simulé'; });
  // Deuxième appareil sur le même Drive simulé.
  const B = await device('B-second-appareil', drive), q = B.page, J4 = 'P4 deux appareils';
  await step(q, J4, 'B : premier lancement et déverrouillage', async () => { await q.goto(ORIGIN + '/'); await q.locator('#unlockPw').waitFor({ timeout: 30000 }); return unlock(q); });
  await step(q, J4, 'B : copie complète (activation du journal)', async () => path.basename(await exportCopy(q, 'B-export')));
  await step(q, J4, 'B : même compte, même dossier', () => driveConnect(q, false));
  await step(q, J4, 'B : reçoit le compteur saisi sur A', async () => { await syncNow(q); const o = await lastOdo(q); if (!o || o.km !== 12345) throw new Error('compteur sur B : ' + JSON.stringify(o)); return 'compteur 12 345 km visible sur B'; });
  await step(p, J4, 'A : nouveau relevé 13 000 km puis envoi', async () => { await openSettings(p); await p.locator('#odo-0').fill('13000'); await p.locator('[data-act=odo][data-i="0"]').click(); await p.waitForTimeout(600); return syncNow(p); });
  await step(q, J4, 'B : voit 13 000 km', async () => { await syncNow(q); const o = await lastOdo(q); if (!o || o.km !== 13000) throw new Error('compteur sur B : ' + JSON.stringify(o)); return '13 000 km reçus'; });
  const J5 = 'P5 conflit';
  await step(p, J5, 'A et B modifient le même CT différemment', async () => {
    for (const [page, v] of [[p, '2026-01-15'], [q, '2026-02-20']]) { await openSettings(page); const f = page.locator('#f-cars-0-maint-ct-d'); await f.scrollIntoViewIfNeeded(); await f.fill(v); await f.dispatchEvent('change'); await page.waitForTimeout(500); }
    return 'A : 15/01 · B : 20/02';
  });
  await step(p, J5, 'A envoie', () => syncNow(p));
  await step(q, J5, 'B détecte le conflit', async () => { const c = await syncNow(q); const t = await panel(q).innerText(); if (!/CONFLIT/.test(t)) throw new Error('aucun conflit affiché · ' + c); return (t.split('\n').find(l => l.startsWith('cars.')) || c).slice(0, 160); });
  await step(q, J5, 'B résout « Garder cet appareil »', async () => {
    const b = panel(q).getByRole('button', { name: /^Garder cet appareil · cars\.0\.maint\.ct\.d/ }); await b.first().click(); await q.waitForTimeout(800);
    const c = await waitCloud(q, /envoi confirmé et relu|conflit|bloqué'/); const left = (await panel(q).innerText()).includes('CONFLIT');
    if (left) throw new Error('conflit toujours affiché après résolution · ' + c); return c;
  });
  await step(p, J5, 'A reçoit la résolution', async () => { await syncNow(p); const v = await p.evaluate(() => S.cars[0].maint.ct.d); if (v !== '2026-02-20') throw new Error('CT sur A : ' + v); return 'CT 20/02 sur les deux appareils'; });
  // Récupération sur un appareil vierge.
  const C = await device('C-nouvel-appareil', drive), r = C.page, J6 = 'P6 récupération appareil vierge';
  const st = () => r.locator('#recovery-status').innerText();
  const rclick = async id => { await until(r, i => !document.getElementById(i).disabled, id); await r.locator('#' + id).click(); await r.waitForTimeout(700); };
  await step(r, J6, 'ouverture de recovery.html', async () => { await r.goto(ORIGIN + '/recovery.html'); await until(r, () => !/Vérification de la version/.test(document.getElementById('recovery-status').textContent)); return st(); });
  await step(r, J6, 'Préparer puis Se connecter', async () => { await rclick('recovery-connect'); await rclick('recovery-connect'); await until(r, () => !document.getElementById('recovery-confirm-account').disabled); return st(); });
  await step(r, J6, 'Confirmer le compte → dossiers dédiés → Utiliser ce dossier', async () => { await rclick('recovery-confirm-account'); await rclick('recovery-dedicated'); await r.locator('#recovery-dedicated-list button').first().click(); await r.waitForTimeout(800); return st(); });
  await step(r, J6, 'code → Vérifier les versions chiffrées', async () => { await r.locator('#recovery-code').fill(CODE); await rclick('recovery-preview'); await until(r, () => document.getElementById('recovery-preview-info').textContent.length > 0); return r.locator('#recovery-preview-info').innerText(); });
  await step(r, J6, 'Exporter une copie chiffrée indépendante', async () => {
    const [dl] = await Promise.all([r.waitForEvent('download', { timeout: 15000 }), r.locator('#recovery-export').click()]);
    await dl.saveAs(path.join(OUT, 'downloads', 'C-' + dl.suggestedFilename())); return dl.suggestedFilename();
  });
  await step(r, J6, 'confirmation → Installer', async () => { await r.locator('#recovery-consent').check(); await rclick('recovery-install'); await until(r, () => /installée/.test(document.getElementById('recovery-status').textContent)); return st(); });
  await step(r, J6, 'réouverture → Vérifier après réouverture', async () => {
    await r.reload(); await r.locator('#recovery-code').fill(CODE); await rclick('recovery-verify');
    await until(r, () => /Restauration vérifiée/.test(document.getElementById('recovery-status').textContent)); return (await st()).slice(0, 160);
  });
  await step(r, J6, 'ouverture de l’app restaurée', async () => {
    await r.locator('#recovery-open-app').click(); await r.waitForLoadState('domcontentloaded'); await unlock(r);
    const o = await lastOdo(r), ct = await r.evaluate(() => S.cars[0].maint.ct.d);
    if (!o || o.km !== 13000 || ct !== '2026-02-20') throw new Error('données restaurées : ' + JSON.stringify({ o, ct })); return '13 000 km et CT 20/02 retrouvés';
  });
  // Récupération après un premier lancement de l'app (appareil non vierge).
  const D = await device('D-recuperation-apres-lancement', drive), s = D.page, J7 = 'P7 récupération après premier lancement';
  await step(s, J7, 'premier lancement puis déverrouillage', async () => { await s.goto(ORIGIN + '/'); await s.locator('#unlockPw').waitFor({ timeout: 30000 }); return unlock(s); });
  await step(s, J7, 'recovery.html → connexion → dossier → vérifier', async () => {
    await s.goto(ORIGIN + '/recovery.html'); await until(s, () => !/Vérification de la version/.test(document.getElementById('recovery-status').textContent));
    for (const id of ['recovery-connect', 'recovery-connect', 'recovery-confirm-account', 'recovery-dedicated']) { await until(s, i => !document.getElementById(i).disabled, id); await s.locator('#' + id).click(); await s.waitForTimeout(700); }
    await s.locator('#recovery-dedicated-list button').first().click(); await s.waitForTimeout(800);
    await s.locator('#recovery-code').fill(CODE); await until(s, () => !document.getElementById('recovery-preview').disabled); await s.locator('#recovery-preview').click(); await s.waitForTimeout(1500);
    return 'message affiché : « ' + (await s.locator('#recovery-status').innerText()) + ' »';
  });
  // Défauts signalés en production : chacun est rejoué ici (rouge tant qu'il n'est pas corrigé).
  const J8 = 'P8 défauts connus';
  await step(p, J8, 'journal de saison dérivé : aucun arbitrage manuel entre appareils', async () => {
    // Deux appareils enregistrent le même matin avec des prévisions différentes (cas réel du 28/10).
    for (const [page, T] of [[p, 5.6], [q, 5.9]]) await page.evaluate(T => { S.journal = { ...(S.journal || {}), '2026-10-28': { T, Tr: 4.5, ice: 0, vis: 3380, lv: {} } }; lsSet('twrc.settings.v1', JSON.stringify(S)); }, T);
    await syncNow(p); await syncNow(q); await syncNow(p);
    const text = await panel(q).innerText() + '\n' + await panel(p).innerText();
    if (/journal\.2026-10-28/.test(text)) {
      const keep = panel(q).getByRole('button', { name: /^Garder cet appareil · journal\.2026-10-28/ });
      if (await keep.count()) { await keep.first().click(); await q.waitForTimeout(1000); await syncNow(q); }
      const still = /journal\.2026-10-28/.test(await panel(q).innerText());
      throw new Error('conflit « journal.2026-10-28 » demandé à l’utilisateur' + (still ? ', et toujours présent après « Garder cet appareil »' : ''));
    }
    return 'aucun conflit pour la donnée dérivée';
  });
  await step(p, J8, 'reprise Drive après réouverture : un seul geste visible', async () => {
    await p.reload(); await p.waitForLoadState('domcontentloaded'); await unlock(p).catch(() => {});
    const visible = await p.getByRole('button', { name: /reprendre la sauvegarde/i }).count();
    await openSettings(p);
    const steps = [];
    for (const name of ['Préparer la reprise Drive', 'Reprendre la synchronisation Drive']) if (await panelButton(p, name).count()) { steps.push(name); await clickPanel(p, name); await p.waitForTimeout(800); }
    const c = await waitCloud(p, /envoi confirmé et relu|conflit|bloqué/).catch(e => e.message);
    if (!visible || steps.length > 1) throw new Error((visible ? '' : 'aucun bouton de reprise sur l’écran principal ; ') + steps.length + ' geste(s) dans Paramètres (' + steps.join(' → ') + ') · ' + c);
    return '1 geste · ' + c;
  });
  const F = await device('F-verification-avant-installation', drive), f = F.page;
  await step(f, J8, 'recovery.html : « Vérifier après réouverture » avant toute installation', async () => {
    await f.goto(ORIGIN + '/recovery.html'); await until(f, () => !/Vérification de la version/.test(document.getElementById('recovery-status').textContent));
    await f.locator('#recovery-code').fill(CODE); await until(f, () => !document.getElementById('recovery-verify').disabled); await f.locator('#recovery-verify').click(); await f.waitForTimeout(1200);
    const msg = await f.locator('#recovery-status').innerText();
    if (/motif : stockage/.test(msg)) throw new Error('message trompeur : « ' + msg.slice(0, 140) + ' » (rien n’est installé, le stockage fonctionne)');
    return msg.slice(0, 160);
  });
  await step(s, J8, 'récupération refusée sur appareil déjà utilisé : message actionnable', async () => {
    const msg = await s.locator('#recovery-status').innerText();
    if (/procédure de sauvegarde puis de fusion contrôlée/.test(msg)) throw new Error('message sans action concrète : « ' + msg + ' »');
    return msg.slice(0, 160);
  });
  for (const dev of [A, B, C, D, F]) await finish(dev);
  await badgeJourney();
  return drive;
}

// ---------- P9 sauvegarde visible et automatique (badge de la barre d'état) ----------
async function badgeJourney() {
  const drive = fakeDrive([ORIGIN]), J9 = 'P9 sauvegarde visible et automatique';
  const G = await device('G-badge', drive), g = G.page, H = await device('H-verification', drive), h = H.page;
  const badge = pg => pg.locator('#driveBadge');
  const badgeText = pg => badge(pg).evaluate(b => b.textContent + (/Action requise/.test(b.textContent) ? ' [' + b.title + ']' : '')).catch(() => '');
  const watchBadge = async (pg, re, timeout) => {   // relève la suite des états du badge jusqu'à l'état attendu
    const t0 = Date.now(), seen = [];
    while (Date.now() - t0 < timeout) { const t = await badgeText(pg); if (t && seen[seen.length - 1] !== t) seen.push(t); if (re.test(t)) return { ms: Date.now() - t0, seen }; await pg.waitForTimeout(200); }
    throw new Error('badge attendu ' + re + ' en ' + timeout / 1000 + ' s · vu : ' + (seen.join(' → ') || 'aucun badge'));
  };
  const revs = () => drive.revisions().length;
  for (const [pg, tag] of [[g, 'G'], [h, 'H']]) {
    await step(pg, J9, tag + ' : premier lancement, copie complète, Drive', async () => { await pg.goto(ORIGIN + '/'); await unlock(pg); await exportCopy(pg, tag + '-export'); return driveConnect(pg, tag === 'G'); });
  }
  await step(g, J9, 'badge visible en haut de l’écran principal', async () => {
    await g.locator('#settings > summary').click().catch(() => {}); await g.evaluate(() => scrollTo(0, 0)); await g.waitForTimeout(600);
    const r = await watchBadge(g, /À jour · \d\d:\d\d/, 15000);
    const box = await badge(g).boundingBox(), vp = g.viewportSize();
    if (!box || box.y > 160 || box.x + box.width > vp.width + 1) throw new Error('badge hors du haut de l’écran : ' + JSON.stringify(box));
    return r.seen.join(' → ');
  });
  await step(g, J9, 'compteur modifié depuis le Garage → ⏳ puis ✓ en moins de 30 s, sans ouvrir Sauvegarde', async () => {
    const before = revs();
    await g.locator('[data-act=view][data-v=garage]').first().click(); await g.waitForTimeout(400);
    await g.locator('[data-act=garage-quick][data-garage-target=odo]').first().click(); await g.waitForTimeout(500);
    await g.locator('#odo-0').fill('15500'); await g.locator('[data-act=odo][data-i="0"]').click();
    const r = await watchBadge(g, /À jour/, 30000);
    if (!r.seen.some(t => /Envoi|⏳/.test(t))) throw new Error('état ⏳ jamais affiché · ' + r.seen.join(' → '));
    if (revs() <= before) throw new Error('aucune nouvelle révision sur le Drive simulé');
    return r.seen.join(' → ') + ' en ' + (r.ms / 1000).toFixed(1) + ' s · révisions ' + before + ' → ' + revs();
  });
  await step(g, J9, 'session Google expirée → badge ⚠️ en moins de 10 s', async () => {
    await g.reload(); await unlock(g); await watchBadge(g, /Reconnexion requise/, 15000);
    await g.evaluate(() => { window.__recetteExpires = 40; });   // jeton de 40 s : expiré 10 s après la connexion (marge de 30 s de l'app)
    await badge(g).click(); const t0 = Date.now(); await watchBadge(g, /À jour/, 20000);
    const r = await watchBadge(g, /Reconnexion requise/, 25000), late = (Date.now() - t0) / 1000 - 10;
    if (late > 10) throw new Error('badge ⚠️ ' + late.toFixed(1) + ' s après l’expiration');
    return 'expiration à +10 s · badge ⚠️ ' + Math.max(0, late).toFixed(1) + ' s après';
  });
  await step(g, J9, 'reconnexion en un appui → modifications en attente envoyées, 0 perte', async () => {
    await openSettings(g); await g.locator('#odo-0').fill('16600'); await g.locator('[data-act=odo][data-i="0"]').click(); await g.waitForTimeout(1200);
    const ct = g.locator('#f-cars-0-maint-ct-d'); await ct.fill('2026-05-05'); await ct.dispatchEvent('change'); await g.waitForTimeout(600);
    const waiting = await badgeText(g); if (!/Reconnexion requise · 2 modifs en attente/.test(waiting)) throw new Error('badge pendant l’attente : ' + waiting);
    await g.evaluate(() => { window.__recetteExpires = 3600; }); await g.evaluate(() => scrollTo(0, 0)); await badge(g).click();
    await watchBadge(g, /À jour/, 30000); await syncNow(h);
    const got = await h.evaluate(() => ({ km: (S.cars[0].odo || []).slice(-1)[0].km, ct: S.cars[0].maint.ct.d }));
    if (got.km !== 16600 || got.ct !== '2026-05-05') throw new Error('reçu sur l’autre appareil : ' + JSON.stringify(got));
    return waiting + ' → À jour · les 2 modifications reçues sur l’autre appareil';
  });
  await step(g, J9, 'hors ligne : 3 modifications → retour réseau → 3 arrivées, empreintes identiques', async () => {
    G.offline = true; await G.ctx.setOffline(true); await g.waitForTimeout(500);
    await openSettings(g); await g.locator('#odo-0').fill('17700'); await g.locator('[data-act=odo][data-i="0"]').click(); await g.waitForTimeout(1200);
    for (const [id, v] of [['#f-cars-0-maint-ct-d', '2026-06-06'], ['#f-cars-0-maint-rev-d', '2026-04-04']]) { const f = g.locator(id); await f.fill(v); await f.dispatchEvent('change'); await g.waitForTimeout(1200); }
    const off = await badgeText(g); if (!/Hors ligne · 3 modifs en attente/.test(off)) throw new Error('badge hors ligne : ' + off);
    G.offline = false; await G.ctx.setOffline(false);
    const r = await watchBadge(g, /À jour/, 30000);
    const proof = await g.evaluate(async () => (await DriveStore.create('twrc.drive.sync.v1').read()).outbox.verified);
    const file = drive.files.get(proof.fileId), sha = require('node:crypto').createHash('sha256').update(file.bytes).digest('hex');
    if (sha !== proof.sha) throw new Error('empreinte Drive ' + sha.slice(0, 12) + ' ≠ empreinte vérifiée ' + proof.sha.slice(0, 12));
    await syncNow(h);
    const got = await h.evaluate(() => ({ km: (S.cars[0].odo || []).slice(-1)[0].km, ct: S.cars[0].maint.ct.d, rev: S.cars[0].maint.rev.d }));
    if (got.km !== 17700 || got.ct !== '2026-06-06' || got.rev !== '2026-04-04') throw new Error('reçu : ' + JSON.stringify(got));
    return off + ' → ' + r.seen.slice(-1)[0] + ' en ' + (r.ms / 1000).toFixed(1) + ' s · SHA-256 ' + sha.slice(0, 12) + '… identique · 3/3 reçues';
  });
  await step(g, J9, 'arrière-plan puis retour → synchro reprise sans geste', async () => {
    await g.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    await openSettings(h); await h.locator('#odo-0').fill('18800'); await h.locator('[data-act=odo][data-i="0"]').click(); await h.waitForTimeout(600); await syncNow(h);
    await g.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    const t0 = Date.now(); let km = 0;
    while (Date.now() - t0 < 20000) { km = await g.evaluate(() => (S.cars[0].odo || []).slice(-1)[0].km); if (km === 18800) break; await g.waitForTimeout(300); }
    if (km !== 18800) throw new Error('compteur sur l’appareil revenu au premier plan : ' + km);
    return 'modification de l’autre appareil reçue ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s après le retour';
  });
  await step(g, J9, 'écran principal avec badge (capture après)', async () => { await g.locator('[data-act=view][data-v=meteo]').first().click(); await g.evaluate(() => scrollTo(0, 0)); await g.waitForTimeout(800); return (await badgeText(g)) + ' · dernières clés écrites : ' + (await g.evaluate(() => window.__vaultKeys.slice(-6).join(','))); });
  for (const dev of [G, H]) await finish(dev);
}

// ---------- 2. exploration systématique ----------
// Chaque élément visible (bouton, lien, champ, sélecteur, résumé) est retrouvé par sa description, puis actionné.
const ENUM = () => {
  const sel = 'button, a[href], input:not([type=hidden]):not([type=file]), select, textarea, summary, [role=button], label[for]';
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]') && (!el.checkVisibility || el.checkVisibility()); };
  const seen = new Map();
  return [...document.querySelectorAll(sel)].filter(vis).filter(el => el.tagName !== 'LABEL' || (document.getElementById(el.htmlFor) || {}).type === 'file').map(el => {
    const field = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName), lab = field && el.id ? document.querySelector('label[for="' + el.id + '"]') : null;
    const text = (el.getAttribute('aria-label') || (field ? (lab && lab.innerText) || el.placeholder || el.name || '' : el.innerText || el.value) || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    const key = [el.tagName.toLowerCase(), el.type || '', el.dataset.act || '', el.dataset.v || el.dataset.i || el.dataset.car || '', el.id || '', el.dataset.bind || '', text].join('|');
    const n = (seen.get(key) || 0) + 1; seen.set(key, n);
    const href = el.tagName === 'A' ? el.href : '';
    return { key: key + '#' + n, tag: el.tagName.toLowerCase(), type: el.type || '', act: el.dataset.act || '', id: el.id || '', text, href,
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      why: el.title || (el.getAttribute('aria-describedby') && (document.getElementById(el.getAttribute('aria-describedby')) || {}).textContent) || '' };
  });
};
async function locate(page, key) {
  return page.evaluateHandle(({ key, enumSrc }) => {
    const items = (0, eval)('(' + enumSrc + ')')(); const i = items.findIndex(x => x.key === key); if (i < 0) return null;
    const sel = 'button, a[href], input:not([type=hidden]):not([type=file]), select, textarea, summary, [role=button], label[for]';
    const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]') && (!el.checkVisibility || el.checkVisibility()); };
    return [...document.querySelectorAll(sel)].filter(vis).filter(el => el.tagName !== 'LABEL' || (document.getElementById(el.htmlFor) || {}).type === 'file')[i];
  }, { key, enumSrc: ENUM.toString() });
}
async function closeDialogs(p) {
  if (!await p.evaluate(() => !!document.querySelector('dialog[open]')).catch(() => false)) return;
  await p.keyboard.press('Escape').catch(() => {});
  await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())).catch(() => {});
}
async function humanClick(el) {
  await el.evaluate(x => x.scrollIntoView({ block: 'center', inline: 'nearest' })).catch(() => {});
  try { await el.click({ timeout: 2000 }); return ''; }
  catch (e) {
    const m = String(e.message);
    if (/intercepts pointer events/.test(m) && await el.evaluate(x => { const r = x.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (x.contains(top) || top.contains(x) || !!x.closest('label') && x.closest('label').contains(top) || x.parentElement && x.parentElement.contains(top) && !!top.closest('label, .sw')); })) {
      await el.click({ timeout: 2000, force: true }); return 'clic sur le contrôle visible (interrupteur ou libellé)';
    }
    throw e;
  }
}
async function explore() {
  const drive = fakeDrive([ORIGIN]);
  const E = await device('E-exploration', drive), p = E.page;
  p.__dialog = 'dismiss';   // jamais de confirmation destructive pendant l'exploration (message relevé)
  const home = async () => { await p.goto(ORIGIN + '/'); await p.waitForLoadState('domcontentloaded'); await p.waitForTimeout(800); await unlock(p).catch(() => {}); };
  const screens = [
    ['Accueil (Météo)', async () => { await home(); await p.locator('[data-act=view][data-v=meteo]').first().click(); }],
    ['Pneus', async () => { await home(); await p.locator('[data-act=view][data-v=pneus]').first().click(); }],
    ['Trajet', async () => { await home(); await p.locator('[data-act=view][data-v=trajet]').first().click(); }],
    ['Garage', async () => { await home(); await p.locator('[data-act=view][data-v=garage]').first().click(); }],
    ['Analyse', async () => { await home(); await p.locator('[data-act=view][data-v=analyse]').first().click(); }],
    ['Paramètres', async () => { await home(); await openSettings(p); }],
    ['Écran de code (premier lancement)', async () => { await p.context().clearCookies(); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {}); await p.goto(ORIGIN + '/'); await p.waitForTimeout(800); }],
    ['Récupération (recovery.html)', async () => { await p.goto(ORIGIN + '/recovery.html'); await p.waitForTimeout(1500); }]
  ];
  for (const [screen, open] of screens.filter(([n]) => !process.env.SCREENS || process.env.SCREENS.split(',').some(x => n.startsWith(x)))) {
    current = 'exploration · ' + screen;
    try { await open().catch(async () => { await p.waitForTimeout(1500); await open(); }); } catch (e) { matrix.push({ screen, element: '(ouverture de l’écran)', browser: BROWSER, result: 'KO', detail: String(e.message).slice(0, 200) }); continue; }
    // Comme un utilisateur curieux : chaque section repliable est dépliée, puis les titres de section sont actionnés en dernier.
    const expand = () => p.evaluate(all => document.querySelectorAll('details:not([open])').forEach(d => { if (all || d.id !== 'settings') d.open = true; }), screen === 'Paramètres').catch(() => {});
    await expand(); await p.waitForTimeout(500); await shot(p, 'exploration-' + screen);
    const items = (await p.evaluate(ENUM)).sort((a, b) => (a.tag === 'summary') - (b.tag === 'summary'));
    console.log(`🔎 ${screen} : ${items.length} éléments`);
    for (const it of items) {
      const label = (it.text || it.id || it.act || it.tag) + (it.act ? ' [' + it.act + ']' : '') + (it.id ? ' #' + it.id : '');
      const row = { screen, element: label, kind: it.tag + (it.type ? ':' + it.type : ''), browser: BROWSER, result: '', detail: '' };
      matrix.push(row);
      if (it.href && !it.href.startsWith(ORIGIN)) { row.result = 'NON TESTABLE'; row.detail = 'lien externe ' + new URL(it.href).hostname + ' (non suivi)'; continue; }
      if (it.disabled) { row.result = it.why ? 'DÉSACTIVÉ (expliqué)' : 'DÉSACTIVÉ SANS EXPLICATION'; row.detail = it.why || 'aucun title / aria-describedby'; continue; }
      let h = await locate(p, it.key).catch(() => null);
      if (!h || !(await h.evaluate(x => !!x).catch(() => false))) { try { await open(); await expand(); await p.waitForTimeout(400); } catch { /* */ } h = await locate(p, it.key).catch(() => null); }
      if (!h || !(await h.evaluate(x => !!x).catch(() => false))) { row.result = 'NON RETROUVÉ'; row.detail = 'élément disparu (dépend d’un état précédent)'; continue; }
      await closeDialogs(p);   // une fenêtre modale ouverte par l'élément précédent ne doit pas masquer les suivants
      h = await locate(p, it.key).catch(() => null);
      if (!h || !(await h.evaluate(x => !!x).catch(() => false))) { row.result = 'NON RETROUVÉ'; row.detail = 'élément disparu (dépend d’un état précédent)'; continue; }
      const before = { err: errors.filter(e => !e.explained).length, mut: await p.evaluate(() => window.__mut).catch(() => 0), url: p.url(), dlg: dialogs.length, fc: p.__chooser || 0 };
      let downloaded = false; const onDl = () => { downloaded = true; }; p.on('download', onDl);
      const popups = []; const onPopup = pg => { popups.push(pg); pg.close().catch(() => {}); }; p.context().on('page', onPopup);
      try {
        const el = h.asElement();
        if (it.type === 'range') await el.evaluate(x => { x.value = x.min || 0; x.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new Event('change', { bubbles: true })); });
        else if (it.tag === 'select') { const vals = await el.evaluate(s => [...s.options].map(o => o.value)); const now = await el.evaluate(s => s.value); const v = vals.find(x => x !== now); if (v !== undefined) await el.selectOption(v); }
        else if (it.tag === 'input' && ['checkbox', 'radio'].includes(it.type)) await humanClick(el);
        else if ((it.tag === 'input' || it.tag === 'textarea') && await el.evaluate(x => x.readOnly)) { row.note = 'champ en lecture seule (valeur à copier)'; await el.click({ timeout: 2000 }); }
        else if (it.tag === 'input' || it.tag === 'textarea') { const v = it.type === 'number' ? '12' : it.type === 'date' ? '2026-10-15' : it.type === 'time' ? '07:45' : it.type === 'password' ? 'code-faux-recette' : 'Test recette'; await el.fill(v, { timeout: 3000 }); await el.press('Tab').catch(() => {}); }
        else row.note = await humanClick(el);
        await p.waitForTimeout(450);
        const after = { err: errors.filter(e => !e.explained).length, mut: await p.evaluate(() => window.__mut).catch(() => -1), url: p.url() };
        const newErr = errors.filter(e => !e.explained).slice(before.err);
        if (newErr.length) { row.result = 'KO'; row.detail = newErr.map(e => e.text).join(' / ').slice(0, 250); }
        else if (/lecture seule/.test(row.note || '') || after.url !== before.url || after.mut !== before.mut || dialogs.length > before.dlg || downloaded || (p.__chooser || 0) > before.fc || popups.length) {
          row.result = 'OK'; row.detail = [row.note || '', after.url !== before.url ? 'navigation ' + after.url.replace(ORIGIN, '') : '', dialogs.length > before.dlg ? 'boîte : « ' + dialogs[dialogs.length - 1].message.slice(0, 80) + ' » (annulée)' : '', downloaded ? 'téléchargement' : '', (p.__chooser || 0) > before.fc ? 'sélecteur de fichier' : '', popups.length ? 'fenêtre ouverte' : ''].filter(Boolean).join(' · ');
        } else { row.result = 'SANS EFFET VISIBLE'; row.detail = 'aucun changement du DOM, ni navigation, ni boîte de dialogue'; }
      } catch (e) {
        const m = String(e.message), cover = /<([^>]{1,120})> (?:from <[^>]*> subtree )?intercepts pointer events/.exec(m);
        const why = m.split('\n').map(l => l.replace(/\x1b\[[0-9;]*m/g, '').trim()).filter(l => /^- /.test(l) && !/^- (waiting|retrying)/.test(l)).slice(-1)[0] || '';
        // Diagnostic : quel ancêtre rend l'élément invisible pour le navigateur (repli, onglet inactif…).
        const hidden = /not visible/.test(why) ? await h.evaluate(x => { let a = x; while (a && a !== document.body) { const st = getComputedStyle(a), r = a.getBoundingClientRect();
          if (st.display === 'none' || st.visibility === 'hidden' || st.contentVisibility === 'hidden' || +st.opacity === 0 || r.width === 0 || r.height === 0) return a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (a.className && typeof a.className === 'string' ? '.' + a.className.split(' ')[0] : '') + ' (' + (st.display === 'none' ? 'display:none' : +st.opacity === 0 ? 'opacity:0' : st.visibility === 'hidden' ? 'visibility:hidden' : 'taille nulle') + ')';
          a = a.parentElement; } return x.isConnected ? 'aucun ancêtre masqué' : 'élément retiré du DOM'; }).catch(() => 'élément retiré du DOM') : '';
        row.result = cover ? 'MASQUÉ' : hidden ? 'NON RETROUVÉ' : 'KO';
        row.detail = cover ? 'inatteignable au doigt : recouvert par <' + cover[1] + '>' : hidden ? 'devenu invisible avant le clic : ' + hidden : 'action impossible : ' + m.split('\n')[0].slice(0, 120) + (why ? ' · ' + why.slice(0, 120) : '');
      }
      finally { p.off('download', onDl); p.context().off('page', onPopup); }
      // Rester sur l'écran exploré (verrouillage, navigation, réinitialisation…).
      if (p.url().replace(/#.*/, '') !== before.url.replace(/#.*/, '') || await p.locator('#unlockPw').isVisible().catch(() => false) && screen !== 'Écran de code (premier lancement)') { try { await open(); } catch { /* */ } }
    }
  }
  await finish(E);
}

// ---------- 3. robustesse : clics aléatoires (équivalent gremlins.js, événements synthétiques dans la page) ----------
const GREMLINS = async ({ ms, seed, origin }) => {
  let x = seed; const rnd = k => { x = (x * 1103515245 + 12345) % 2147483648; return x % k; };
  const sel = 'button, a[href], input:not([type=hidden]):not([type=file]), select, textarea, summary, [role=button], [data-act]';
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden' && (!el.checkVisibility || el.checkVisibility()); };
  const junk = ['', 'x', '-5', '0', '99999999', '2026-02-30', '<b>é</b>', '12', '   ', 'Lieu A'];
  const t0 = Date.now(); let n = 0;
  window.__gremlins = { n: 0, last: [] };
  while (Date.now() - t0 < ms) {
    const all = [...document.querySelectorAll(sel)].filter(el => vis(el) && !el.disabled && !(el.tagName === 'A' && !el.href.startsWith(origin)));
    if (!all.length) break;
    const el = all[rnd(all.length)], label = (el.dataset.act || el.id || el.innerText || el.tagName).replace(/\s+/g, ' ').slice(0, 40);
    window.__gremlins.last.push(label); if (window.__gremlins.last.length > 20) window.__gremlins.last.shift();
    try {
      if (el.tagName === 'SELECT' && el.options.length) { el.selectedIndex = rnd(el.options.length); el.dispatchEvent(new Event('change', { bubbles: true })); }
      else if ((el.tagName === 'INPUT' && !/checkbox|radio|range/.test(el.type)) || el.tagName === 'TEXTAREA') { el.focus(); el.value = junk[rnd(junk.length)]; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
      else el.click();
    } catch { /* l'exception de page est relevée côté recette */ }
    n++; window.__gremlins.n = n;
    if (rnd(25) === 0) scrollTo(0, rnd(Math.max(1, document.body.scrollHeight)));
    await new Promise(r => setTimeout(r, 40 + rnd(120)));
  }
  return n;
};
async function monkey() {
  const drive = fakeDrive([ORIGIN]);
  const M = await device('M-clics-aleatoires', drive), p = M.page;
  p.removeAllListeners('dialog');
  p.on('dialog', async d => { dialogs.push({ device: M.label, step: current, type: d.type(), message: d.message().slice(0, 200), policy: 'aléatoire' }); try { if (Math.random() < 0.5) await d.accept(); else await d.dismiss(); } catch { /* */ } });
  const t0 = Date.now(); let actions = 0, restarts = 0, round = 0;
  current = 'monkey';
  while (Date.now() - t0 < MONKEY_MS) {
    try {
      if (!p.url().startsWith(ORIGIN + '/') || round === 0) await p.goto(ORIGIN + '/');
      if (await p.locator('#unlockPw').isVisible().catch(() => false)) await unlock(p).catch(() => {});
      current = 'monkey · série ' + (++round);
      const left = MONKEY_MS - (Date.now() - t0);
      actions += await p.evaluate(GREMLINS, { ms: Math.min(60000, left), seed: 20261029 + round, origin: ORIGIN });
      await shot(p, 'monkey-serie-' + round);
    } catch (e) {
      // navigation (lien interne, verrouillage, rechargement) : la série s'interrompt, reprise sur l'accueil
      actions += await p.evaluate(() => window.__gremlins && window.__gremlins.n || 0).catch(() => 0);
      restarts++; await p.waitForTimeout(500);
      if (/closed|Target/.test(String(e.message)) && p.isClosed()) break;
    }
  }
  await shot(p, 'monkey-fin');
  await finish(M);
  return { actions, restarts, minutes: Math.round((Date.now() - t0) / 60000 * 10) / 10 };
}

// ---------- rapport ----------
function report(drive, monkeyStats) {
  const tested = matrix.filter(r => !['NON TESTABLE', 'NON RETROUVÉ'].includes(r.result)).length;
  const byResult = matrix.reduce((o, r) => (o[r.result] = (o[r.result] || 0) + 1, o), {});
  const unexplained = errors.filter(e => !e.explained);
  const summary = { browser: BROWSER, profile: BROWSER === 'webkit' ? 'iPhone 13 émulé, affichage autonome' : 'PC 1366×900',
    sha: process.env.GITHUB_SHA || spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(),
    journeys: { ok: parcours.filter(s => s.ok).length, total: parcours.length },
    coverage: { tested, found: matrix.length, rate: matrix.length ? Math.round(tested / matrix.length * 1000) / 10 : 0, byResult },
    errors: { total: errors.length, unexplained: unexplained.length }, monkey: monkeyStats, blockedHosts: [...blocked].sort(),
    driveCalls: drive ? drive.log.length : 0 };
  fs.writeFileSync(path.join(OUT, 'parcours.json'), JSON.stringify(parcours, null, 2));
  fs.writeFileSync(path.join(OUT, 'matrix.json'), JSON.stringify({ summary, rows: matrix }, null, 2));
  fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 2));
  fs.writeFileSync(path.join(OUT, 'dialogs.json'), JSON.stringify(dialogs, null, 2));
  const md = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  fs.writeFileSync(path.join(OUT, 'PARCOURS.md'), `# Parcours — ${summary.profile} (${BROWSER})\n\n${summary.journeys.ok}/${summary.journeys.total} étapes réussies · SHA ${summary.sha}\n\n| Parcours | Étape | Résultat | Détail | Erreurs console non expliquées |\n|---|---|---|---|---|\n` +
    parcours.map(s => `| ${md(s.journey)} | ${md(s.step)} | ${s.ok ? 'OK' : 'KO'} | ${md(s.detail)} | ${s.consoleErrors} |`).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'MATRICE.md'), `# Matrice de couverture — ${summary.profile} (${BROWSER})\n\nÉléments actionnés : **${tested}/${matrix.length}** (${summary.coverage.rate} %) · ` +
    Object.entries(byResult).map(([k, v]) => `${k} : ${v}`).join(' · ') + `\n\nErreurs console : ${errors.length} dont **${unexplained.length} non expliquée(s)** · clics aléatoires : ${monkeyStats ? monkeyStats.actions + ' actions en ' + monkeyStats.minutes + ' min' : 'non lancés'}\n\n` +
    `| Écran | Élément | Type | Navigateur | Résultat | Détail |\n|---|---|---|---|---|---|\n` + matrix.map(r => `| ${md(r.screen)} | ${md(r.element)} | ${r.kind || ''} | ${r.browser} | ${r.result} | ${md(r.detail)} |`).join('\n') + '\n');
  return summary;
}

(async () => {
  buildSite();
  browser = BROWSER === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ args: ['--no-sandbox'] });
  let drive = null, monkeyStats = null;
  try {
    if (!process.env.ONLY || process.env.ONLY.includes('parcours')) drive = await journeys();
    else if (process.env.ONLY.includes('badge')) await badgeJourney();
    if (!process.env.ONLY || process.env.ONLY.includes('exploration')) await explore();
    if ((!process.env.ONLY || process.env.ONLY.includes('monkey')) && MONKEY_MS > 0) monkeyStats = await monkey();
  } finally { await browser.close().catch(() => {}); }
  const s = report(drive, monkeyStats);
  console.log(`\nParcours ${s.journeys.ok}/${s.journeys.total} · couverture ${s.coverage.tested}/${s.coverage.found} (${s.coverage.rate} %) · erreurs non expliquées ${s.errors.unexplained} · monkey ${monkeyStats ? monkeyStats.actions : 0} actions`);
  console.log('Hôtes bloqués : ' + (s.blockedHosts.join(', ') || 'aucun'));
  process.exitCode = s.journeys.ok === s.journeys.total && !s.errors.unexplained ? 0 : 1;
})().catch(e => { console.error('❌ Recette interrompue : ' + e.message); process.exitCode = 2; });
