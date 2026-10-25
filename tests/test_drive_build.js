'use strict';
const path = require('node:path');
const fs = require('node:fs'), assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const config = { approved: true, clientId: ['123456', 'fake.apps.googleusercontent.com'].join('-'), apiKey: 'AIza' + 'a'.repeat(35), appId: '123456', raceOrigin: 'https://race.example.com', vaultOrigin: 'https://vault.example.com' };
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(path.relative(ROOT, process.cwd()), 'drive-build-test');
const run = (value, dedicated = true) => spawnSync(process.execPath, [path.join(ROOT, 'tools/build.js')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RC_OUT: OUT, RC_PRIVATE: '.ci/nonexistent', GOOGLE_DRIVE_CONFIG: value, RC_DATA_BASE: dedicated ? 'https://data.example.com/rc/' : '' } });
const header = (text, name) => text.split('\n').map(line => line.trim()).find(line => line.startsWith(name + ': '))?.slice(name.length + 2) || '';
function cspOrigins(text, name = null) {
  const origins = new Set();
  for (const directive of header(text, 'Content-Security-Policy').split(';')) {
    const tokens = directive.trim().split(/\s+/); if (name && tokens[0] !== name) continue;
    for (const token of tokens.slice(1)) {
    try { const url = new URL(token); if (url.protocol === 'https:') origins.add(url.origin); } catch { /* mot-clé CSP ou empreinte inline */ }
    }
  }
  return origins;
}
try {
  assert.equal(run('').status, 0); assert.equal(fs.readFileSync(path.join(ROOT, OUT) + '/drive-config.json', 'utf8'), 'null');
  assert(!cspOrigins(fs.readFileSync(path.join(ROOT, OUT) + '/_headers', 'utf8')).has('https://accounts.google.com'));
  assert.equal(run(JSON.stringify(config)).status, 0);
  const headers = fs.readFileSync(path.join(ROOT, OUT) + '/_headers', 'utf8'), html = fs.readFileSync(path.join(ROOT, OUT) + '/index.html', 'utf8');
  const recovery = fs.readFileSync(path.join(ROOT, OUT) + '/recovery.html', 'utf8');
  // Assert our builder's exact serialization; this is not an HTML sanitizer.
  // Extra tags, attributes or alternate delimiters must fail this byte check.
  const lower = recovery.toLowerCase(), begin = lower.indexOf('<script'), end = lower.indexOf('</script');
  assert.equal(lower.split('<script').length, 2, 'one recovery script only');
  assert.equal(lower.split('</script').length, 2, 'one closing script tag only');
  assert.equal(recovery.slice(begin, begin + 8), '<script>');
  assert.equal(recovery.slice(end, end + 9), '</script>');
  const recoveryCode = recovery.slice(begin + 8, end);
  const codeHash = require('node:crypto').createHash('sha256').update(recoveryCode).digest('base64');
  assert(headers.includes("'sha256-" + codeHash + "'"), 'the recovery document uses an exact authorized script hash');
  assert(recovery.includes('id="recovery-consent"') && recovery.includes('id="recovery-verify"'));
  assert(!recovery.includes('window.TWRC_SEALED=') && !recovery.includes(config.clientId) && !recovery.includes(config.apiKey));
  assert(!recovery.includes('DeviceStorage.bootstrap(window,localStorage)') && !recovery.includes('function loadSettings()'));
  assert.equal(header(headers, 'Cross-Origin-Opener-Policy'), 'same-origin-allow-popups');
  assert(cspOrigins(headers, 'frame-src').has('https://docs.google.com'));
  for (const spoof of ['https://docs.google.com.example.org', 'https://docs.google.com@example.org', 'https://example.org/docs.google.com'])
    assert(!cspOrigins('Content-Security-Policy: frame-src ' + spoof, 'frame-src').has('https://docs.google.com'));
  assert(headers.includes('/drive-config.json\n  Cache-Control: no-store'));
  assert(!html.includes(config.clientId) && !html.includes(config.apiKey));
  assert(!/unsafe-eval/.test(headers));
  assert.notEqual(run(JSON.stringify(config), false).status, 0, 'jamais de configuration sur le build historique');
  for (const extra of [{ secret: 'no' }, { token: 'no' }, { folderId: 'no' }, { approved: false }]) assert.notEqual(run(JSON.stringify({ ...config, ...extra })).status, 0);
  console.log('✅ deux profils CSP, configuration publique séparée, opt-in strict, aucune configuration Google sur github.io');
  const profile = spawnSync(process.execPath, [path.join(ROOT, 'tools/build-drive-test.cjs')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, BUILD_SHA: 'a'.repeat(40), GOOGLE_DRIVE_CONFIG: '' }, timeout: 180000 });
  assert.equal(profile.status, 0, 'profil TEST complet construit et préréglage fictif déchiffré vérifié');
  const result = JSON.parse(profile.stdout.trim());
  const stamped = JSON.parse(fs.readFileSync(path.join(result.site, 'fixture-manifest.json'), 'utf8'));
  assert.equal(stamped.fixtureOnly, true); assert.equal(stamped.sourceSha, 'a'.repeat(40)); assert.equal(stamped.googleEnabled, false);
  assert.equal(fs.readFileSync(path.join(result.site, 'drive-config.json'), 'utf8'), 'null');
  assert(fs.readFileSync(path.join(result.site, 'index.html'), 'utf8').includes('TEST — DONNÉES FICTIVES UNIQUEMENT'));
  assert(fs.readFileSync(path.join(result.site, '_headers'), 'utf8').includes('geolocation=()'));
  assert(!Object.keys(stamped.files).some(f => /(^|\/)(preset\.json|artifact\.html|relay-config\.sealed\.json|relay\.js)$/.test(f)));
  for (const [name, expected] of Object.entries(stamped.files)) assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(result.site, name))).digest('hex'), expected);
  const denied = spawnSync(process.execPath, [path.join(ROOT, 'tools/build-drive-test.cjs')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, BUILD_SHA: 'a'.repeat(40), GOOGLE_DRIVE_CONFIG: JSON.stringify(config) } });
  assert.notEqual(denied.status, 0, 'profil TEST refuse les autres origines avant tout build');
  console.log('✅ profil TEST : fixture déchiffrée, fichiers limités, empreintes exactes, aucun Google implicite ni origine de production');
} finally { fs.rmSync(path.join(ROOT, OUT), { recursive: true, force: true }); }
