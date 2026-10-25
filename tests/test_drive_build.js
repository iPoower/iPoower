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
  const scripts = [...recovery.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi)];
  assert.equal(scripts.length, 1, 'one exact recovery script, no additional script');
  const recoveryCode = scripts[0][1];
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
} finally { fs.rmSync(path.join(ROOT, OUT), { recursive: true, force: true }); }
