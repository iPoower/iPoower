// Reproduction explicite du transport opaque, pas de dépendance de production
// entre origines. Usage : node tools/vendor-vault-drive.js ../Control-Vault
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const vault = path.resolve(process.argv[2] || ''), root = path.resolve(__dirname, '..');
const files = ['src/services/opaque-drive.ts', 'src/core/race-packet.ts', 'src/core/sync-revision.ts', 'src/core/crypto.ts'];
const sources = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(vault, file))).digest('hex')]));
(async () => {
  const { build } = require(path.join(vault, 'node_modules/esbuild'));
  const out = await build({ stdin: { contents: "export { OpaqueDrive } from './src/services/opaque-drive'; export { readRacePacket } from './src/core/race-packet';", resolveDir: vault, sourcefile: 'drive-entry.ts', loader: 'ts' },
    bundle: true, format: 'iife', globalName: 'DriveTransport', target: 'es2022', write: false, legalComments: 'none' });
  const header = '/* Transport opaque Control Vault. Reproduction : tools/vendor-vault-drive.js.\n * Aucun code, clé ou déchiffrement. Sources SHA-256 :\n' + JSON.stringify(sources, null, 1) + '\n */\n';
  fs.writeFileSync(path.join(root, 'src/drive-transport.js'), header + out.outputFiles[0].text);
})().catch(() => { console.error('Transport non reconstruit : vérifier le clone Vault et ses dépendances.'); process.exitCode = 1; });
