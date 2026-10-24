# Description prête pour une PR DRAFT R1

Titre : `docs/security: actualiser la préparation d’isolation des origines`
Base : `main`. Head : `docs/fortress-iii-origin-readiness-v1`. **draft: true**.

Trois applications actives partagent `https://ipoower.github.io`. Cette
proposition complète la préparation consolidée de #134–#139 avec des preuves
HTTP publiques, un inventaire statique des ressources voisines et un préflight
fictif. Elle constate un blocage PWA supplémentaire : l'enregistrement SW actuel
est limité à `github.io`, donc une future copie sur un domaine dédié ne sera
pas automatiquement offline. Backup V2 ne couvre toujours pas les observations
humaines `reports` et `shadow`.

**DRAFT / préparation seulement. Aucun `src/`, coffre, secret, donnée réelle,
domaine/DNS, hébergement, publication, migration ou fusion modifié.**

Dossier : [R1 et preuves](fortress-iii-origin-readiness.md).
Base exacte : `5186c7a052b2d1278d9f9b8864c0b7b92adbedd0`.

La préparation de #134 est déjà reprise dans main par #141. Cette branche
actualise son document consolidé et ajoute un seul step au workflow PR-only
existant. Les branches #134–#140 et le prototype invité restent inchangés et
en DRAFT. Aucun workflow doublonné ni droit ajouté : `contents: read`, checkout
épinglé sans identifiants persistés, pas de secret ni Environment.

Fichiers : document de préparation existant, dossier R1, deux JSON de preuves
publiques sans données navigateur, `tests/fortress-iii-origin-preflight.js`,
un step de `.github/workflows/fortress-ii-consolidated.yml`, cette description.

| Contrôle exécuté | Résultat |
|---|---|
| Nouveau préflight | 13/13 PASS, modèle fictif et vrai build/SW en VM |
| Fixtures crypto/rollback/SW existantes | 15/15 PASS |
| Readiness/consentement/conservation existants | 17/17 PASS |
| Offline/SW fictif existant | 12/12 PASS |
| Inventaire statique | 48 JS, 43 références classifiées ; 4 classes à arbitrer |
| Syntaxe / scanner local / diff | PASS ; aucune valeur secrète réelle disponible |
| HTTPS des futures origines / iPhone physique | NON TESTÉS, origines non déployées |
| Chromium/WebKit de cette branche / CI distante | NON VÉRIFIÉS : installation locale et publication bloquées |

Cible : hôte HTTPS personnel exclusif et hôte HTTPS invité différent, HTTP CSP
et framing stricts, Permissions-Policy, aucun cookie partagé, pas de passerelle
de données privées. Hébergement statique et chaîne de publication à décider
séparément ; aucun compte/projet présumé ni intégration Git active.

La migration requiert encore l'inventaire runtime exhaustif, une sauvegarde
chiffrée réouverte et comparée, restauration complète, quota/coupures/rollback
bidirectionnel, SW/en-têtes/CORS/offline réels et validation physique iPhone.
L'ancienne application et son stockage doivent demeurer en place.

Rollback de cette préparation : fermer la PR ; aucun utilisateur n'a changé
d'origine et aucune donnée n'a besoin de restauration.

**GO étude d'architecture ; R1 OUVERT ; NO GO publication/migration.
Les tests fictifs et ce document ne valent jamais clôture de R1.**
