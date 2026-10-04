#!/usr/bin/env node
// Suite de tests de la CI : construit l'app avec des réglages fictifs, prépare un dossier de travail,
// génère les jeux de test de l'agenda avec le harnais du relais (données fictives), puis exécute chaque test et contrôle son verdict.
// Tout est fictif (préréglage, relais, agenda, deux clés distinctes) : aucun secret ni donnée réelle n'est nécessaire. Rien n'est écrit en dehors de .ci/ (ignoré par Git).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), CI = path.join(ROOT, '.ci'), W = path.join(CI, 'w'), H = path.join(CI, 'h'), OUT = path.join(CI, 'out');
const BROWSER = (process.env.BROWSER || 'chromium').toLowerCase();
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), cp = (a, b) => fs.copyFileSync(path.join(ROOT, a), b);
// Les tests n'utilisent AUCUNE donnée ni clé réelle : préréglage, configuration du relais, agenda et clés sont fictifs.
// Deux clés de test distinctes, comme en production : APP_KEY_TEST (app, agenda) et RC_KEY_TEST (configuration du relais).
const { APP_KEY_TEST, RC_KEY_TEST } = require('./lib/test-keys');
const FAKE = path.join(CI, 'fake'), DIST = path.join(CI, 'dist');
fs.rmSync(CI, { recursive: true, force: true }); [W, path.join(W, 'site'), H, OUT, FAKE].forEach(d => fs.mkdirSync(d, { recursive: true }));
cp('tests/fixtures/preset.fake.json', path.join(FAKE, 'preset.json')); cp('tests/fixtures/relay-config.fake.json', path.join(FAKE, 'relay-config.json'));
fs.writeFileSync(path.join(FAKE, '.passphrase'), APP_KEY_TEST); fs.writeFileSync(path.join(FAKE, '.rc_key'), RC_KEY_TEST);
// build du même code source, avec les réglages fictifs (sortie et chiffrés de test dans .ci/, jamais dans dist/ ni encrypted/)
const b = spawnSync(process.execPath, [path.join(ROOT, 'tools/build.js')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RC_PRIVATE: '.ci/fake', RC_OUT: '.ci/dist', RC_ENCRYPTED: '.ci/enc' } });
if (b.status !== 0) { console.error('Build de test en échec :\n' + (b.stdout || '') + (b.stderr || '')); process.exit(1); }
const scrub = t => t;   // plus rien de réel à masquer : tout est fictif
// dossier de travail des tests (même disposition que l'atelier d'origine)
for (const f of fs.readdirSync(DIST)) fs.copyFileSync(path.join(DIST, f), path.join(W, 'site', f));
['engine.js', 'demo.js', 'relay.js'].forEach(f => cp('src/' + f, path.join(W, f)));
fs.writeFileSync(path.join(W, '.passphrase'), APP_KEY_TEST);   // code saisi dans l'app par les tests
cp('tests/fixtures/preset.fake.json', path.join(W, 'preset.json'));
// widget : configuration fictive pour le test (le widget public n'en contient pas)
fs.writeFileSync(path.join(W, 'widget.js'), rd('src/widget.js').replace(/const CFG = null;[^\n]*/, 'const CFG = ' + JSON.stringify({ home: { id: 'home', name: 'Maison test', lat: 48.85, lon: 2.35 }, work: { id: 'work', name: 'Travail test', lat: 48.9, lon: 2.25 }, dep: '06:30', durMin: 40, days: [1, 2, 3], cars: [{ short: 'Test A', sporty: 1, tire: { type: 'summer', size: '215/40 R18', tread: null, dot: '1023' }, plan: { on: 0 } }] }) + ';'));
const NM = fs.existsSync(path.join(ROOT, 'node_modules')) ? path.join(ROOT, 'node_modules') : process.env.NODE_MODULES_DIR;
if (NM) fs.symlinkSync(NM, path.join(W, 'node_modules'), 'dir');
// jeu de test de l'agenda : le vrai relais tourne sur un agenda fictif, avec la date simulée du scénario
['relay.js', 'engine.js', 'demo.js'].forEach(f => cp('src/' + f, path.join(H, f)));
fs.readdirSync(path.join(ROOT, 'tests/relay-harness')).forEach(f => cp('tests/relay-harness/' + f, path.join(H, f)));
fs.copyFileSync(path.join(DIST, 'relay-config.sealed.json'), path.join(H, 'relay-config.sealed.json'));
const rel = spawnSync(process.execPath, ['-r', './mock_tt.js', 'relay.js'], { cwd: H, encoding: 'utf8', timeout: 180e3,
  env: { ...process.env, FAKE: '2026-10-02T08:00:00+02:00', SCN: 'doux', GCAL_ICS: 'https://calendar.google.com/test.ics', APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_TEST } });
if (!fs.existsSync(path.join(H, 'calendar.sealed.json'))) { console.error('Harnais du relais en échec :\n' + (rel.stdout || '') + (rel.stderr || '')); process.exit(1); }
fs.copyFileSync(path.join(H, 'calendar.sealed.json'), path.join(OUT, 'cal.fake.json'));
// suite : tests unitaires du moteur et du widget, puis parcours navigateur (horloge et réseau simulés)
const SUITE = [
  ['test_engine.js', 'moteur : verdicts, chaussée, verglas', false], ['test_examples.js', 'moteur : cas de référence', false],
  ['test_engine_verdicts.js', 'moteur : vérités de sécurité GO / NO GO', false], ['engine-countertests.js', 'moteur : régressions de sécurité rejetées par les contre-tests', false],
  ['test_widget.js', 'widget iPhone (Scriptable simulé)', false], ['test_relay_clock.js', 'relais : horloge externe et mesure de fraîcheur', false],
  ['e2e17.js', 'réglages conservés lors d’une mise à jour', true], ['e2e18.js', 'astuces et mode Météo', true], ['e2e24.js', 'jours de trajet domicile-travail', true],
  ['e2e25.js', 'timeline : prochain trajet, en cours, arrivée', true], ['e2e26.js', 'lieux et Ma position', true], ['e2e27.js', 'mini-carte ordinateur et iPhone', true],
  ['e2e28.js', 'GPS dynamique : trajet vivant depuis la position', true],
  ['e2e29.js', 'navigation : ouvrir le trajet affiché dans Waze', true],
  ['e2e30.js', 'automate du trajet : départ par le mouvement, arrivée à froid', true]];
SUITE.push(['test_wardrobe.js', 'tenue : confort, pluie, vent et jours locaux', false], ['e2e31.js', 'onglet Tenue sartoriale et interface mobile', true]);
SUITE.push(['test_gps_requests.js', 'GPS : réponses réseau tardives après déplacement ou oubli', false],
  ['test_calendar_ids.js', 'agenda : identifiants techniques opaques et stables', false],
  ['test_tripcancel.js', 'annulation locale : purge, chaîne et contre-tests', false],
  ['e2e33.js', 'GPS : déplacements successifs, reprise iOS et réponses anciennes', true],
  ['e2e34.js', 'trajets : origine, aperçu volontaire et annulations locales', true]);
SUITE.push(['test_dayplan.js', 'plan de tenue : couches, transitions et dangers courts', false],
  ['dayplan-countertests.js', 'plan de tenue : mutations détectées par les contre-tests', false],
  ['e2e32.js', 'plan de tenue : agenda, lieux, météo et interface', true]);
SUITE.push(['e2e35.js', 'intégration : annulations, Tenue et aperçu GPS frais', true],
  ['e2e36.js', 'hors connexion : cache météo, agenda chiffré et reconnexion', true],
  ['e2e38-resume.js', 'reprise iOS : fraîcheur réelle, horloge, actualisation unique', true],
  ['e2e37-sw.js', 'service worker réel : Cache Storage, panne serveur et redémarrage offline', true, 'chromium']);
const verdict = (code, out) => {
  const js = out.match(/erreurs JS : (?!aucune)([^\n]{0,300})/), ex = out.match(/^\w*Error:[^\n]{0,240}/m);   // données 100 % fictives : le motif peut être affiché
  if (code !== 0) return 'code de sortie ' + code + (js ? ' · erreurs JS : ' + js[1] : ex ? ' · ' + ex[0] : '');
  if (/❌|ERR |Error:|TimeoutError/.test(out)) return 'échec signalé dans la sortie';
  const sc = [...out.matchAll(/(\d+)\/(\d+) scénarios OK/g)]; if (sc.some(m => m[1] !== m[2])) return 'scénarios incomplets';
  const er = out.match(/errors (\[.*\])/); if (er && er[1] !== '[]') return 'erreurs JavaScript : ' + er[1].slice(0, 200);
  if (/erreurs JS : (?!aucune)/.test(out)) return 'erreurs JavaScript';
  if (/perdus [1-9]/.test(out)) return 'réglages perdus';
  return null;
};
let fail = 0, skipped = 0; const rows = [];
for (const [file, what, browser, only] of SUITE) {
  if (only && BROWSER !== only) { skipped++; rows.push(`↪️ ${file.padEnd(17)} ${what} [${BROWSER}] · non applicable (Playwright Service Worker : Chromium uniquement)`); continue; }
  const t0 = Date.now(), r = spawnSync(process.execPath, [path.join(ROOT, 'tests', file)], { cwd: W, encoding: 'utf8', timeout: 20 * 60e3, env: { ...process.env, SP: OUT, BROWSER } });
  const out = (r.stdout || '') + (r.stderr || ''), why = r.error ? String(r.error.message) : verdict(r.status, out);
  fs.writeFileSync(path.join(OUT, file.replace('.js', '.log')), out);
  rows.push(`${why ? '❌' : '✅'} ${file.padEnd(17)} ${what}${browser ? ` [${BROWSER}]` : ''} · ${Math.round((Date.now() - t0) / 1000)} s${why ? ' · ' + why : ''}`);
  if (why) { fail++;
    const labels = out.split('\n').map((l, i, A) => /^\s*❌/.test(l) ? l.trim().slice(0, 160) + ' ⏎ ' + (A[i + 1] || '').trim().slice(0, 260) : null).filter(Boolean).slice(0, 6).join(' / ');   // données 100 % fictives : le contexte peut être affiché
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=${file} (${BROWSER})::${scrub(why + (labels ? ' | ' + labels : '')).replace(/[\r\n%]/g, ' ')}`);   // dépôt public : jamais la sortie brute (elle peut contenir l'agenda)
    else console.log(out.split('\n').slice(-25).join('\n')); }
}
console.log('\n' + rows.join('\n') + `\n\n${fail ? `❌ ${fail} test(s) en échec` : `✅ ${SUITE.length - skipped} tests au vert${skipped ? ` + ${skipped} non applicable` : ''}`} (${BROWSER})`);
process.exit(fail ? 1 : 0);
