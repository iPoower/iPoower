// Reproduction explicite du transport opaque, pas de dépendance de production
// entre origines. Usage : node tools/vendor-vault-drive.js ../Control-Vault [--check]
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const args = process.argv.slice(2), check = args.includes('--check');
if (args.filter(a => a !== '--check').length !== 1 || args.some(a => a.startsWith('--') && a !== '--check')) throw new Error('Usage : vendor-vault-drive.js CHEMIN_VAULT [--check]');
const vault = path.resolve(args.find(a => a !== '--check')), root = path.resolve(__dirname, '..');
const files = ['src/services/opaque-drive.ts', 'src/core/race-packet.ts', 'src/core/sync-revision.ts', 'src/core/crypto.ts'];
const sources = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(vault, file))).digest('hex')]));
(async () => {
  const { build, version } = require(path.join(vault, 'node_modules/esbuild'));
  const lock = JSON.parse(fs.readFileSync(path.join(vault, 'package-lock.json'), 'utf8'));
  if (lock.packages?.['node_modules/esbuild']?.version !== version) throw new Error('Compilateur différent du lockfile Vault.');
  // Fix the working directory so comments never depend on the checkout's name.
  const out = await build({ absWorkingDir: vault, stdin: { contents: "export { OpaqueDrive } from './src/services/opaque-drive'; export { readRacePacket } from './src/core/race-packet';", resolveDir: vault, sourcefile: 'drive-entry.ts', loader: 'ts' },
    bundle: true, format: 'iife', globalName: 'DriveTransport', target: 'es2022', write: false, legalComments: 'none' });
  const header = '/* Transport opaque Control Vault. Reproduction : tools/vendor-vault-drive.js.\n * Aucun code, clé ou déchiffrement. Compilateur esbuild ' + version + '. Sources SHA-256 :\n' + JSON.stringify(sources, null, 1) + '\n */\n';
  const bytes = Buffer.from(header + out.outputFiles[0].text), destination = path.join(root, 'src/drive-transport.js');
  if (check) {
    if (!fs.readFileSync(destination).equals(bytes)) throw new Error('Transport différent de sa compilation.');
  } else fs.writeFileSync(destination, bytes);
  console.log(JSON.stringify({ verified: check, compiler: version, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sources }));
})().catch(() => { console.error('Transport non reconstruit : vérifier le clone Vault et ses dépendances.'); process.exitCode = 1; });
