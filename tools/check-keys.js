#!/usr/bin/env node
// Contrôle de la séparation des clés : chaque clé ouvre SON fichier, et seulement le sien.
//   APP_KEY (code de déverrouillage) -> préréglage de l'app + agenda chiffré par le relais
//   RC_KEY  (clé du relais)          -> configuration du relais
// Aucune valeur n'est jamais affichée : uniquement ✅ / ❌ par contrôle.
// Usage : APP_KEY=… RC_KEY=… [RC_KEY_NEXT=…, rotation transitoire] node tools/check-keys.js [--enc dossier] [--prod dossier]
//   --enc  : dossier des réglages chiffrés du dépôt (défaut : encrypted/)
//   --prod : dossier contenant les fichiers publiés (relay-config.sealed.json, calendar.sealed.json), contrôlés s'ils sont présents
'use strict';
const fs = require('fs'), path = require('path'), { norm, tryUnseal } = require('./keys');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ENC = path.resolve(arg('--enc') || path.join(__dirname, '..', 'encrypted')), PROD = arg('--prod') ? path.resolve(arg('--prod')) : null;
const app = norm(process.env.APP_KEY), rc = norm(process.env.RC_KEY), next = norm(process.env.RC_KEY_NEXT);
// TRANSITOIRE (Phase B) : si RC_KEY_NEXT existe, c'est la clé du relais attendue ; l'ancienne RC_KEY (égale au code de l'app avant rotation)
// n'est plus qu'un état hérité, signalé ⚠️ sans bloquer. Sans RC_KEY_NEXT : contrôles complets sur RC_KEY.
const ROT = !!next, rk = ROT ? next : rc, RK = ROT ? 'RC_KEY_NEXT' : 'RC_KEY';
const load = (f, wrapped) => { try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); return wrapped ? o.sealed : o; } catch (e) { return null; } };
const rows = []; let fail = 0;
const check = (label, ok) => { rows.push(`${ok ? '✅' : '❌'} ${label}`); if (!ok) fail++; };
const warn = (label, ok) => rows.push(`${ok ? '✅' : '⚠️'} ${label}${ok ? '' : ' (état hérité, corrigé par la rotation)'}`);
const skip = label => rows.push(`⚪ ${label} (fichier absent, non vérifié)`);
if (ROT) rows.push('🔁 Rotation en cours : RC_KEY_NEXT est la clé du relais attendue');
check('secret APP_KEY présent', !!app);
check(`secret ${RK} présent`, !!rk);
check(`${RK} d’au moins ${ROT ? 32 : 16} caractères`, rk.length >= (ROT ? 32 : 16));
check(`APP_KEY et ${RK} différentes`, !!app && !!rk && app !== rk);
if (ROT && rc) warn('APP_KEY et RC_KEY (ancienne) différentes', rc !== app);
// dépôt : encrypted/
const preset = load(path.join(ENC, 'preset.sealed.json'), true), relay = load(path.join(ENC, 'relay-config.sealed.json'), true);
check('préréglage (dépôt) : s’ouvre avec APP_KEY', !!tryUnseal(preset, app));
check(`préréglage (dépôt) : refusé avec ${RK}`, !!preset && !tryUnseal(preset, rk));
if (ROT && rc && rc !== rk) warn('préréglage (dépôt) : refusé avec RC_KEY (ancienne)', !!preset && !tryUnseal(preset, rc));
check(`config du relais (dépôt) : s’ouvre avec ${RK}`, !!tryUnseal(relay, rk));
check('config du relais (dépôt) : refusée avec APP_KEY', !!relay && !tryUnseal(relay, app));
if (ROT && rc && rc !== rk) check('config du relais (dépôt) : refusée avec RC_KEY (ancienne)', !!relay && !tryUnseal(relay, rc));
// production (facultatif) : en rotation, la config en ligne peut encore être l'ancienne (avant déploiement) ou déjà la nouvelle
if (PROD) {
  const pr = load(path.join(PROD, 'relay-config.sealed.json'), false), cal = load(path.join(PROD, 'calendar.sealed.json'), false);
  if (pr && ROT && !tryUnseal(pr, rk) && rc && tryUnseal(pr, rc)) warn('config du relais (en ligne) : déjà rechiffrée avec RC_KEY_NEXT', false);   // avant déploiement : ancienne config, encore lue par RC_KEY
  else if (pr) { check(`config du relais (en ligne) : s’ouvre avec ${RK}`, !!tryUnseal(pr, rk)); check('config du relais (en ligne) : refusée avec APP_KEY', !tryUnseal(pr, app)); }
  else skip('config du relais (en ligne)');
  if (cal) { check('agenda (en ligne) : s’ouvre avec APP_KEY', !!tryUnseal(cal, app)); check(`agenda (en ligne) : refusé avec ${RK}`, !tryUnseal(cal, rk)); }
  else skip('agenda (en ligne)');
}
console.log(rows.join('\n') + `\n\n${fail ? `❌ ${fail} contrôle(s) en échec : les clés ne sont pas correctement séparées.` : '✅ Clés séparées : chaque clé n’ouvre que ses fichiers.'}`);
// résumé visible dans l'onglet du run GitHub (libellés seulement, jamais une valeur)
if (process.env.GITHUB_ACTIONS) console.log(fail ? `::error title=Séparation des clés::${rows.filter(r => r.startsWith('❌')).join(' / ')}` : `::notice title=Séparation des clés::✅ APP_KEY et ${RK} séparées, chacune n’ouvre que ses fichiers`);
process.exit(fail ? 1 : 0);
