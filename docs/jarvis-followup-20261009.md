# Race Control — corrections après prod-74

Base vérifiée : `prod-74`, commit `e9f16ffbb42e99e83a8127eb6fb239c3a878c9bb` (PR #89 déjà fusionnée). Travail sur une branche indépendante ; aucune modification des branches sources des PR #86, #87 ou #90.

## Protection des branches (P1)

À la vérification initiale, `main` et `gh-pages` étaient déclarées non protégées ; aucun ruleset actif. Reprise de la préparation #86 (`cce5eb6330ee087877527dd122d675b035479b92`) et renforcement de ses vérifications.

Le script exige les droits administrateur avant toute écriture et vérifie la configuration réellement relue : PR obligatoire, contrôles `unit`, `validation`, `scan` à jour, conversations résolues, historique linéaire, interdiction de suppression et de force-push. `gh-pages` reçoit uniquement les protections suppression/réécriture ; aucun contrôle ni PR n'y bloque les publications du relais, de DATEX ou de l'application.

La procédure exacte est dans [BRANCH-PROTECTION-RUNBOOK.md](security/BRANCH-PROTECTION-RUNBOOK.md). Les huit scénarios de `test_branch_protection.js` utilisent une API fictive et le vrai interpréteur `jq`. Ils vérifient les droits, la réexécution sans doublon, les contrôles manquants, les exclusions/bypass, une règle bloquant les publications et l'échec d'une activation partielle. Ils ne constituent pas une activation GitHub. Celle-ci reste une opération propriétaire à vérifier séparément.

## Champs PC/iPhone (P2)

Le diagnostic #90 est corrigé à la source : les contrôles rapides utilisent `quick-work-dep/ret/durMin/from/to`, les paramètres gardent leurs identifiants `f-*`. Leurs chemins `data-bind` restent les mêmes. Après une saisie, les autres contrôles de ce réglage reçoivent aussi la nouvelle valeur, sans reconstruire le formulaire ouvert. Les libellés, le focus et les valeurs affichées restent cohérents.

La suite `e2e67-controls-safety.js` ouvre les réglages depuis les cinq vues, vérifie l'unicité des identifiants, l'association et le focus des libellés, les deux sens, les saisies rapides/paramètres et leur reprise après rechargement. Les anciens scripts de saisie rapide ont aussi leurs sélecteurs actualisés. Le fichier d'audit de l'autre agent reste intact.

## Recherche d'adresses (P2)

Reprise exacte des quatre fichiers de #87 (`2cb29b8f43e65facfec1c10e0c76047104d1a6da`) sur `prod-74`, sans conflit. Les générations de recherche invalident les réponses tardives dès la modification de l'origine ou de la destination et retirent les suggestions anciennes sans perdre le focus. Nominatim garde sa file, sa cadence d'au moins 1,1 s entre départs d'appels, son cache de 10 minutes et sa déduplication.

Les scénarios unitaires et `e2e59-trip-tab.js` vérifient ces comportements sur la base actuelle, ainsi que la programmation, la route, les cinq vues, le rechargement et le mode hors connexion. La limitation Nominatim reste locale à l'instance du géocodeur : ce changement ne fournit pas de quota global entre appareils ou onglets.

## Historique météo (P3)

Les 20 derniers échecs d'appels Open-Meteo sont conservés dans le stockage applicatif sous `twrc.weather.incidents.v1`, dans le coffre chiffré lorsqu'il est actif. Seuls `at`, `kind`, `durationMs` et, lorsqu'il existe, le statut HTTP sont autorisés. Ni URL, ni coordonnées, ni message d'erreur, ni nom de lieu ne sont enregistrés dans cet historique.

Catégories : panne réseau, délai dépassé, HTTP, JSON illisible, réponse invalide et quotas minute/heure/jour/concurrence/autre. Les prévisions structurées mais refusées par le validateur existant sont également observées. Cette observation ne modifie jamais la réponse, le cache ou le moteur météo.

La durée est celle de l'appel HTTP, corps compris ; elle ne prétend pas mesurer la durée globale de l'indisponibilité du fournisseur. Les requêtes partagées comptent une fois ; les annulations de GPS, le géocodage et les demandes non envoyées pendant une pause de quota ne créent pas de faux incidents. Les succès et le rechargement ne suppriment pas l'historique. Le diagnostic affiche les cinq derniers échecs, même après retour en LIVE. Un stockage refusé conserve l'historique en mémoire.

`test_weather_requests.js` vérifie les catégories, les durées, la confidentialité, le volume borné, les annulations, le retour réseau et la reprise. Le parcours navigateur force une panne HTTP 503 avec des données fictives, vérifie le retour LIVE puis la conservation de sa cause après rechargement.

## Actions destructives (P3)

« Effacer la calibration » et « Réinitialiser les réglages » affichent une confirmation native avant toute mutation. L'annulation préserve réglages et contexte. Après acceptation, le comportement existant de chaque action est conservé. Les tests vérifient les deux réponses aux deux dialogues, sur profils fictifs uniquement ; aucune action destructive n'a été effectuée sur le compte réel.

## Validation avant intégration

- `node tests/ci/syntax.js`
- `node tools/check-secrets.js` (sans secrets localement ; contrôle de confiance séparé dans la CI GitHub)
- `node tests/run-ci.js --lane unit`
- CI complète : 87 suites enregistrées, 130 exécutions applicables au total, sept lanes (une unitaire et six Chromium/WebKit), confidentialité des PR et relais fictif.

Les preuves finales sont les contrôles du commit HEAD de la PR, pas ceux des anciennes branches. Les parcours PC/iPhone sont simulés sur Chromium et WebKit ; aucun test sur iPhone physique n'est revendiqué. La fusion, le déploiement et l'activation effective des protections sont des étapes distinctes de cette préparation.
