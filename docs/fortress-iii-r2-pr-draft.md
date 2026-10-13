# Description prête pour une PR DRAFT R2

Titre : `fix(security): traiter les liens de configuration dans le coffre`
Base : `main`. Head : `fix/fortress-iii-config-import-v1`. **draft: true**.

Un lien de configuration reste actuellement dans l'URL et son Base64 est
recopié dans `twrc.cfghash`. Un lien différent peut aussi remplacer les
réglages d'un appareil configuré. Cette proposition nettoie l'URL dès sa
capture, valide le schéma avant toute écriture et confie l'application au
coffre authentifié existant sous Web Locks, avec commit chiffré relu avant
exposition en mémoire. Un appareil configuré est préservé, un lien répété est
idempotent, l'ancienne métadonnée devient une empreinte SHA-256.

**DRAFT uniquement. Aucune fusion, publication de l'application, migration,
domaine, code personnel, notification réelle ou changement de secret/protection.**

Audit et politique : [dossier R2](fortress-iii-config-import.md).
Base auditée : `5186c7a052b2d1278d9f9b8864c0b7b92adbedd0`.

Fichiers : `src/config-import.js`, `src/app.js`, `src/session-vault.js`,
`tools/build.js`, deux nouvelles suites R2, registre `tests/ci/suites.js`,
compteurs et contre-tests `tests/test_ci_lanes.js`, dossier et description.
Les formats du coffre et des sauvegardes ne changent pas. Aucun fichier
personnel, moteur météo/GPS/pneus/trajectoire ou SW modifié.

| Validation exécutée localement | Résultat |
|---|---|
| Nouvelle sécurité R2 | 21/21 PASS, vrai WebCrypto / fixtures |
| Lane unitaire complète | 51/51 suites PASS, préparation/build fictifs |
| CI contre les omissions/faux verts | 27/27 PASS ; nouvelle couverture attendue 161 exécutions |
| Syntaxe | 229 scripts et hook PASS |
| Relais / outils de clés / confidentialité | 43/43, 3/3, 6/6 PASS, données et clés fictives |
| Scanner local / diff | PASS générique, sans valeurs secrètes réelles |
| E2E Chromium/WebKit | Lancements en échec d'infrastructure : binaires absents ; assertions NON VÉRIFIÉES |
| CI distante et scanner de main avec secrets | NON EXÉCUTÉS : publication de branche bloquée |
| iPhone physique | NON TESTÉ |

Les véhicules, DOT, profondeurs, jeux, compteur, plans de livraison, journal de
saison et clés durables sont comparés sur fixtures. Les conflits, quotas,
interruptions et expirations ne produisent pas un faux succès. Aucun test rouge
n'est contourné. La matrice complète sur le SHA exact demeure obligatoire.

Risques résiduels : anciens liens déjà copiés/historisés ; ancien shell offline
avant mise à jour ; restriction volontaire des anciens liens (première
configuration authentifiée et schéma borné seulement) ; code du coffre/boot
nécessitant une revue sensible ; R1 de même origine toujours ouvert.

Rollback : avant fusion, fermer le brouillon suffit. Après une éventuelle
publication autorisée, préparer un revert revu du code ; ne supprimer aucune
donnée, coffre, session ou sauvegarde. L'ancien code réintroduit les risques.

**NO GO validation finale tant que Chromium/WebKit/CI ne sont pas prouvés.
Ne pas fusionner automatiquement, même si les checks deviennent verts.**
