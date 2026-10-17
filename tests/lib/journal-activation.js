'use strict';
// Précondition explicite des anciennes suites qui testent un journal ACTIF.
// Profil et code fictifs ; la copie est écrite sur disque puis relue. Les
// parcours utilisateur et les refus restent testés par journal-preservation-browser.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
module.exports = async function activateJournal(p) {
  const copy = await p.evaluate(async () => {
    if (TWRC_VAULT.mode !== 'vault') throw new Error('Fixture : coffre déverrouillé requis.');
    await TWRC_VAULT.flush();
    if (TWRC_VAULT.error || TWRC_VAULT.pendingWrites) throw new Error('Fixture : écriture non confirmée.');
    return TWRC_VAULT.recoverySnapshot();
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-fiction-'));
  try {
    const file = path.join(dir, 'recovery.json'); fs.writeFileSync(file, copy);
    await p.evaluate(text => TWRC_VAULT.activateJournal(text), fs.readFileSync(file, 'utf8'));
    await p.evaluate(() => renderAll());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
