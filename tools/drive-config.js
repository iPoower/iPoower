// Configuration PUBLIQUE de production fournie par Actions. Ni dossier,
// compte, code, secret OAuth ni jeton. Échec fermé sur tout champ inconnu.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
function read(text, dedicated) {
  if (!text) return null;
  if (!dedicated || Buffer.byteLength(text) > 2048) throw new Error('Configuration Drive réservée à l’origine dédiée.');
  try {
    const input = JSON.parse(text), source = fs.readFileSync(path.join(__dirname, '../src/google-drive-session.js'), 'utf8');
    const c = { URL, Object }; vm.createContext(c); vm.runInContext(source + ';this.check=GoogleDriveSession.config;', c);
    return JSON.parse(JSON.stringify(c.check(input, input.raceOrigin)));
  } catch { throw new Error('Configuration Drive publique invalide (aucune valeur affichée).'); }
}
module.exports = { read };
