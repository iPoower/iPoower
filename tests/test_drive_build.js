'use strict';
const path = require('node:path');
const fs = require('node:fs'), assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const config = { approved: true, clientId: ['123456', 'fake.apps.googleusercontent.com'].join('-'), apiKey: 'AIza' + 'a'.repeat(35), appId: '123456', raceOrigin: 'https://race.example.com', vaultOrigin: 'https://vault.example.com' };
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(path.relative(ROOT, process.cwd()), 'drive-build-test');
const run = (value, dedicated = true) => spawnSync(process.execPath, [path.join(ROOT, 'tools/build.js')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RC_OUT: OUT, RC_PRIVATE: '.ci/nonexistent', GOOGLE_DRIVE_CONFIG: value, RC_DATA_BASE: dedicated ? 'https://data.example.com/rc/' : '' } });
try {
  assert.equal(run('').status, 0); assert.equal(fs.readFileSync(path.join(ROOT, OUT) + '/drive-config.json', 'utf8'), 'null');
  assert(!fs.readFileSync(path.join(ROOT, OUT) + '/_headers', 'utf8').includes('accounts.google.com'));
  assert.equal(run(JSON.stringify(config)).status, 0);
  const headers = fs.readFileSync(path.join(ROOT, OUT) + '/_headers', 'utf8'), html = fs.readFileSync(path.join(ROOT, OUT) + '/index.html', 'utf8');
  assert(headers.includes('same-origin-allow-popups')); assert(headers.includes('https://docs.google.com'));
  assert(headers.includes('/drive-config.json\n  Cache-Control: no-store'));
  assert(!html.includes(config.clientId) && !html.includes(config.apiKey));
  assert(!/unsafe-eval/.test(headers));
  assert.notEqual(run(JSON.stringify(config), false).status, 0, 'jamais de configuration sur le build historique');
  for (const extra of [{ secret: 'no' }, { token: 'no' }, { folderId: 'no' }, { approved: false }]) assert.notEqual(run(JSON.stringify({ ...config, ...extra })).status, 0);
  console.log('✅ deux profils CSP, configuration publique séparée, opt-in strict, aucune configuration Google sur github.io');
} finally { fs.rmSync(path.join(ROOT, OUT), { recursive: true, force: true }); }
