'use strict';
// Profil de publication TEST uniquement. Aucun accès aux réglages chiffrés personnels.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const RACE = 'https://rc-drive-test-ipoower.pages.dev', VAULT = 'https://cv-drive-test-ipoower.pages.dev';
const sha = process.env.BUILD_SHA || '';
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('BUILD_SHA exact obligatoire.');
const text = process.env.GOOGLE_DRIVE_CONFIG || '';
const cfg = require('./drive-config').read(text, true);
if (cfg && (cfg.raceOrigin !== RACE || cfg.vaultOrigin !== VAULT)) throw new Error('Origines TEST exactes requises.');
const base = fs.mkdtempSync(path.join(ROOT, '.drive-test-profile-'));
const local = name => path.join(base, name), rel = name => path.relative(ROOT, local(name));
for (const name of ['fake', 'encrypted', 'built', 'site', 'harness']) fs.mkdirSync(local(name));
const preset = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/preset.fake.json'), 'utf8'));
const relay = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/relay-config.fake.json'), 'utf8'));
relay.site = RACE + '/'; relay.ntfy = '';
const { APP_KEY_TEST, RC_KEY_TEST } = require('../tests/lib/test-keys');
fs.writeFileSync(local('fake/preset.json'), JSON.stringify(preset));
fs.writeFileSync(local('fake/relay-config.json'), JSON.stringify(relay));
fs.writeFileSync(local('fake/.passphrase'), APP_KEY_TEST, { mode: 0o600 });
fs.writeFileSync(local('fake/.rc_key'), RC_KEY_TEST, { mode: 0o600 });
function run(args, cwd, env) {
  try { execFileSync(process.execPath, args, { cwd, env, stdio: 'pipe', timeout: 180000 }); }
  catch { throw new Error('Construction fictive refusée ; aucune sortie brute affichée.'); }
}
run(['tools/build.js'], ROOT, { ...process.env, RC_PRIVATE: rel('fake'), RC_ENCRYPTED: rel('encrypted'), RC_OUT: rel('built'), RC_DATA_BASE: RACE + '/', GOOGLE_DRIVE_CONFIG: text });
const { tryUnseal } = require('./keys');
const sealed = JSON.parse(fs.readFileSync(local('encrypted/preset.sealed.json'), 'utf8'));
const opened = tryUnseal(sealed.sealed, APP_KEY_TEST);
if (JSON.stringify(opened) !== JSON.stringify({ ...preset, configured: 1, ntfy: '' })) throw new Error('Préréglage fictif non vérifié.');
// Liste positive : aucun artifact privé, réglage du relais ou fichier de travail.
const names = ['index.html', 'recovery.html', 'engine.js', 'evidence.js', 'sw.js', 'widget.js', 'tiredb.json', 'manifest.webmanifest', 'drive-config.json', '_headers', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
for (const name of names) fs.copyFileSync(local('built/' + name), local('site/' + name));
fs.cpSync(local('built/vendor'), local('site/vendor'), { recursive: true });
for (const name of ['relay.js', 'engine.js', 'demo.js', 'evidence.js']) fs.copyFileSync(path.join(ROOT, 'src', name), local('harness/' + name));
for (const name of fs.readdirSync(path.join(ROOT, 'tests/relay-harness'))) fs.copyFileSync(path.join(ROOT, 'tests/relay-harness', name), local('harness/' + name));
fs.copyFileSync(local('built/relay-config.sealed.json'), local('harness/relay-config.sealed.json'));
run(['-r', './mock_tt.js', 'relay.js'], local('harness'), { ...process.env, FAKE: '2026-10-25T12:00:00+01:00', SCN: 'doux', GCAL_ICS: 'https://calendar.google.com/test.ics', APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_TEST });
for (const name of ['calendar.sealed.json', 'obs.json']) fs.copyFileSync(local('harness/' + name), local('site/' + name));
let html = fs.readFileSync(local('site/index.html'), 'utf8');
const build = html.match(/window\.TWRC_BUILD="([0-9a-f]{12})"/)[1];
const banner = '<aside id="drive-test-notice" role="note"><strong>TEST — DONNÉES FICTIVES UNIQUEMENT</strong> · Google personnel interdit · <a href="' + VAULT + '/#/drive" rel="noopener noreferrer">Control Vault TEST</a></aside>';
html = html.replace('<title>TYRE WEATHER RACE CONTROL</title>', '<title>Race Control — Drive TEST</title>').replace('<head>', '<head><link rel="stylesheet" href="drive-test.css">').replace('<body>', '<body>' + banner);
fs.writeFileSync(local('site/index.html'), html);
let recovery = fs.readFileSync(local('site/recovery.html'), 'utf8');
recovery = recovery.replace('<head>', '<head><link rel="stylesheet" href="drive-test.css">').replace('<body>', '<body>' + banner);
fs.writeFileSync(local('site/recovery.html'), recovery);
fs.writeFileSync(local('site/drive-test.css'), '#drive-test-notice{display:block;padding:12px;background:#49380b;color:#fff;font:14px/1.5 system-ui}#drive-test-notice a{color:#fff;text-decoration:underline}');
const manifest = JSON.parse(fs.readFileSync(local('site/manifest.webmanifest'), 'utf8'));
manifest.name = 'Race Control — Drive TEST'; manifest.short_name = 'RC TEST';
fs.writeFileSync(local('site/manifest.webmanifest'), JSON.stringify(manifest));
const headers = fs.readFileSync(local('site/_headers'), 'utf8').replace('geolocation=(self)', 'geolocation=()');
fs.writeFileSync(local('site/_headers'), headers);
fs.writeFileSync(local('site/version.json'), JSON.stringify({ run: 999, sha, build, at: new Date().toISOString(), environment: 'isolated-test', fixtureOnly: true, googleEnabled: !!cfg }));
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
function files(dir, prefix = '') { return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e => { const n = prefix + e.name; if (e.isDirectory()) return files(dir, n + '/'); if (!e.isFile()) throw new Error('Fichier non régulier.'); return [n]; }); }
const contents = Object.fromEntries(files(local('site')).map(n => [n, digest(fs.readFileSync(local('site/' + n)))]));
fs.writeFileSync(local('site/fixture-manifest.json'), JSON.stringify({ environment: 'isolated-test', fixtureOnly: true, sourceSha: sha, raceOrigin: RACE, vaultOrigin: VAULT, googleEnabled: !!cfg, presetFixtureSha256: digest(Buffer.from(JSON.stringify(preset))), files: contents }, null, 2));
console.log(JSON.stringify({ site: local('site'), sourceSha: sha, googleEnabled: !!cfg, fixtureVerified: true, files: Object.keys(contents).length }));
