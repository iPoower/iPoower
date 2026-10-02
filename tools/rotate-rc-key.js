#!/usr/bin/env node
// TRANSITOIRE (Phase B, rotation de RC_KEY) : supprimé au nettoyage final.
// Rechiffre la configuration du relais, de RC_KEY (clé actuelle) vers RC_KEY_NEXT (nouvelle clé), SANS jamais l'écrire en clair :
// le texte clair n'existe qu'en mémoire, rien n'est affiché sauf ✅ / ❌ par contrôle, aucun message d'erreur brut n'est repris.
// Exécuté uniquement par .github/workflows/rc-key-rotation.yml, depuis le code de main (jamais depuis une branche de PR).
// Usage : RC_KEY=… RC_KEY_NEXT=… APP_KEY=… node tools/rotate-rc-key.js --from <source {v,sealed}> --prod <fichier en ligne> --out <cible>
//   --from : config chiffrée de main (= celle de la production actuelle)
//   --prod : relay-config.sealed.json publié sur gh-pages : la source doit lui être identique (on ne rechiffre que ce qui tourne en production)
//   --out  : fichier écrit uniquement si TOUS les contrôles sont verts
'use strict';
const fs = require('fs'), path = require('path'), { norm, seal, tryUnseal } = require('./keys');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const rows = []; let fail = 0;
const check = (label, ok) => { rows.push(`${ok ? '✅' : '❌'} ${label}`); if (!ok) fail++; return ok; };
const done = () => {
  console.log(rows.join('\n') + `\n\n${fail ? `❌ Rotation refusée (${fail} contrôle(s)) : aucun fichier modifié.` : '✅ Configuration du relais rechiffrée avec RC_KEY_NEXT.'}`);
  if (process.env.GITHUB_ACTIONS) console.log(fail ? `::error title=Rotation RC_KEY::${rows.filter(r => r.startsWith('❌')).join(' / ')}` : '::notice title=Rotation RC_KEY::✅ config rechiffrée avec RC_KEY_NEXT, ouverte et vérifiée');
  process.exit(fail ? 1 : 0);
};
const load = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };   // fichiers chiffrés uniquement
const rc = norm(process.env.RC_KEY), next = norm(process.env.RC_KEY_NEXT), app = norm(process.env.APP_KEY);
const FROM = arg('--from'), PROD = arg('--prod'), OUT = arg('--out');
// 1. clés
check('secret RC_KEY présent (clé actuelle du relais)', !!rc);
check('secret RC_KEY_NEXT présent (nouvelle clé)', !!next);
check('secret APP_KEY présent', !!app);
check('RC_KEY_NEXT d’au moins 32 caractères', next.length >= 32);
check('RC_KEY_NEXT différente de RC_KEY', !!next && next !== rc);
check('RC_KEY_NEXT différente de APP_KEY', !!next && next !== app);
if (fail) done();
// 2. source = production actuelle
const src = FROM && load(FROM), prod = PROD && load(PROD);
check('source (main) lisible', !!(src && src.sealed && src.v));
check('source identique à la config en production', !!src && !!prod && JSON.stringify(src.sealed) === JSON.stringify(prod));
if (fail) done();
const plain = tryUnseal(src.sealed, rc);
check('source ouverte avec RC_KEY', !!plain);
if (fail) done();
// 3. rechiffrement + vérifications avant écriture
const sealed = seal(plain, next), back = tryUnseal(sealed, next);
check('nouvelle config ouverte avec RC_KEY_NEXT', !!back);
check('contenu identique à l’original', !!back && JSON.stringify(back) === JSON.stringify(plain));
check('nouvelle config refusée avec RC_KEY (ancienne clé)', !tryUnseal(sealed, rc));
check('nouvelle config refusée avec APP_KEY', !tryUnseal(sealed, app));
check('fichier cible indiqué', !!OUT);
if (fail) done();
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ v: src.v, sealed }));   // même v : contenu inchangé
check('fichier chiffré écrit (texte clair jamais écrit)', true);
done();
