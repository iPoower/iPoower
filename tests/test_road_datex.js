'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = cp.spawnSync('python3', [path.join(__dirname, 'road_datex_test.py')], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
assert.equal(out.status, 0, out.stdout + out.stderr); assert(/Ran 16 tests/.test(out.stderr)); console.log('✅ DATEX : 16 scénarios snapshot, deltas, curseurs, fin, validité et exclusions, confidentialité, erreurs et écriture atomique');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'road-deploy-'));
try {
  const src = path.join(folder, 'src'), dst = path.join(folder, 'dst'); fs.mkdirSync(src); fs.mkdirSync(dst);
  for (const f of ['index.html', 'engine.js', 'evidence.js', 'relay.js', 'sw.js', 'widget.js', 'manifest.webmanifest', 'relay-config.sealed.json', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) fs.writeFileSync(path.join(src, f), 'fictif');
  fs.writeFileSync(path.join(src, 'tiredb.json'), '{"version":1}');
  for (const f of ['road-datex.json', 'obs.json', 'calendar.sealed.json']) fs.writeFileSync(path.join(dst, f), 'flux serveur fictif');
  cp.execFileSync(process.execPath, [path.join(root, 'tools/deploy-copy.js'), src, dst], { stdio: 'pipe' });
  for (const f of ['road-datex.json', 'obs.json', 'calendar.sealed.json']) assert.equal(fs.readFileSync(path.join(dst, f), 'utf8'), 'flux serveur fictif');
  console.log('✅ déploiement et rollback : flux DATEX, météo et agenda conservés');
} finally { fs.rmSync(folder, { recursive: true, force: true }); }
console.log('17/17 scénarios OK');
