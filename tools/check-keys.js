#!/usr/bin/env node
// Contrôle de la séparation des clés : chaque clé ouvre SON fichier, et seulement le sien.
//   APP_KEY (code de déverrouillage) -> préréglage de l'app + agenda chiffré par le relais
//   RC_KEY  (clé du relais)          -> configuration du relais
// Aucune valeur n'est jamais affichée : uniquement ✅ / ❌ par contrôle.
// Usage : APP_KEY=… RC_KEY=… node tools/check-keys.js [--enc dossier] [--prod dossier]
//   --enc  : dossier des réglages chiffrés du dépôt (défaut : encrypted/)
//   --prod : dossier contenant les fichiers publiés (relay-config.sealed.json, calendar.sealed.json), contrôlés s'ils sont présents
'use strict';
const fs = require('fs'), path = require('path'), { norm, tryUnseal } = require('./keys');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ENC = path.resolve(arg('--enc') || path.join(__dirname, '..', 'encrypted')), PROD = arg('--prod') ? path.resolve(arg('--prod')) : null;
const app = norm(process.env.APP_KEY), rc = norm(process.env.RC_KEY);
const load = (f, wrapped) => { try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); return wrapped ? o.sealed : o; } catch (e) { return null; } };
const rows = []; let fail = 0;
const check = (label, ok) => { rows.push(`${ok ? '✅' : '❌'} ${label}`); if (!ok) fail++; };
const skip = label => rows.push(`⚪ ${label} (fichier absent, non vérifié)`);
check('secret APP_KEY présent', !!app);
check('secret RC_KEY présent', !!rc);
check('RC_KEY d’au moins 32 caractères', rc.length >= 32);
check('APP_KEY et RC_KEY différentes', !!app && !!rc && app !== rc);
// dépôt : encrypted/
const preset = load(path.join(ENC, 'preset.sealed.json'), true), relay = load(path.join(ENC, 'relay-config.sealed.json'), true);
check('préréglage (dépôt) : s’ouvre avec APP_KEY', !!tryUnseal(preset, app));
check('préréglage (dépôt) : refusé avec RC_KEY', !!preset && !tryUnseal(preset, rc));
check('config du relais (dépôt) : s’ouvre avec RC_KEY', !!tryUnseal(relay, rc));
check('config du relais (dépôt) : refusée avec APP_KEY', !!relay && !tryUnseal(relay, app));
// production (facultatif)
if (PROD) {
  const pr = load(path.join(PROD, 'relay-config.sealed.json'), false), cal = load(path.join(PROD, 'calendar.sealed.json'), false);
  if (pr) { check('config du relais (en ligne) : s’ouvre avec RC_KEY', !!tryUnseal(pr, rc)); check('config du relais (en ligne) : refusée avec APP_KEY', !tryUnseal(pr, app)); }
  else skip('config du relais (en ligne)');
  if (cal) { check('agenda (en ligne) : s’ouvre avec APP_KEY', !!tryUnseal(cal, app)); check('agenda (en ligne) : refusé avec RC_KEY', !tryUnseal(cal, rc)); }
  else skip('agenda (en ligne)');
}
console.log(rows.join('\n') + `\n\n${fail ? `❌ ${fail} contrôle(s) en échec : les clés ne sont pas correctement séparées.` : '✅ Clés séparées : chaque clé n’ouvre que ses fichiers.'}`);
// résumé visible dans l'onglet du run GitHub (libellés seulement, jamais une valeur)
if (process.env.GITHUB_ACTIONS) console.log(fail ? `::error title=Séparation des clés::${rows.filter(r => r.startsWith('❌')).join(' / ')}` : '::notice title=Séparation des clés::✅ APP_KEY et RC_KEY séparées, chacune n’ouvre que ses fichiers');
process.exit(fail ? 1 : 0);
