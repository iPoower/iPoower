// Sécurité V1 : une nouvelle fenêtre ou une réouverture n'a pas la clé de session de l'onglet précédent ; elle demande le code.
// Déverrouille avec le code des fixtures (fictif) si le formulaire est présent ; sans effet en mode « sans code ».
'use strict';
const fs = require('fs');
async function unlockIfLocked(page, settle) {
  if (!(await page.locator('#unlockPw').count())) return false;
  await page.fill('#unlockPw', fs.readFileSync('.passphrase', 'utf8').trim());
  await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.click('#unlockForm button[type=submit]')]);
  if (settle) await settle();
  return true;
}
module.exports = { unlockIfLocked };
