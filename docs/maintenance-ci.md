# Maintenance du 5 octobre 2026

## Périmètre et preuve de compatibilité

Maintenance issue de `562ed6fcef03df0e24a53b0830686568fe147a4d` (prod-31). Le code exécuté dans le navigateur reste identique : quatre sections de `src/app.js` sont incluses à leur position historique par `tools/app-source.js`. Il n'y a ni module chargé au runtime, ni nouvelle portée, ni réordonnancement des déclarations, événements ou initialisations.

| Responsabilité | Avant | Après |
|---|---|---|
| Rendu Météo et preuves | `src/app.js` | `src/app/weather-view.js` |
| Rendu Analyse | `src/app.js` | `src/app/analysis-view.js` |
| Diagnostic, version et état SW | `src/app.js` | `src/app/diagnostics.js` |
| Reprise, réseau, minuteur, SW et démarrage | `src/app.js` | `src/app/lifecycle.js` |
| État partagé, agenda, GPS, réglages et autres rendus | `src/app.js` | `src/app.js` ; dette explicite, à extraire progressivement |

Le source réassemblé a été comparé octet par octet au source de prod-31. Tous les fichiers du build avant/après ont également été comparés avec les mêmes réglages et chiffrés **fictifs** : identité exacte, dont `index.html` (646 046 octets). CSS, shell HTML, images, Service Worker, moteur météo, file de requêtes et schémas de stockage n'ont pas changé. Aucune donnée de production n'est nécessaire à cette comparaison.

Le chargeur de sections refuse chemins invalides, cycles, fichiers absents et liens de fichiers ; le chemin réel doit rester dans `src`. Ses tests protègent l'ordre, la portée lexicale et la compilation complète.

## Audit initial

Cartographie en lecture seule : 104 scripts (16 source, 80 tests, 8 outils), six workflows, build statique, SW, scanners, relais et horloge Cloudflare. Les scripts anciens de capture ou d'E2E restent présents et passent le contrôle de syntaxe ; ils n'étaient pas dans le registre de validation active et n'y sont pas ajoutés silencieusement.

`app.js` : 354 676 octets, 3 605 lignes. Les responsabilités mélangées partagent un état lexical et des listeners globaux. Les plus grosses fonctions sont `renderSettings` (15,4 Ko), `buildTenueDay` (14,5 Ko), `renderLab` (13,2 Ko), le gestionnaire global de clics (11,3 Ko) et `renderWx` (8,6 Ko). Une migration ESM massive changerait ces contrats ; l'extraction mécanique garde leur ordre exact.

Les E2E actifs possèdent leurs contextes navigateur, utilisent des fixtures fictives et bloquent le réseau extérieur. Les deux tests SW utilisent un répertoire temporaire et un port dynamique. Leur isolation est compatible avec des runners séparés ; aucune concurrence de suites n'est introduite dans un même job.

L'audit GPS/429 retrouve les limites et protections de prod-31 : concurrence météo bornée, déduplication, priorité, Retry-After/backoff, délai réseau, cooldown entre onglets, annulation après changement GPS et rejet des réponses obsolètes. Aucun défaut supplémentaire n'a été démontré ; ces fichiers et leurs tests restent inchangés.

Le SW conserve navigation network-first, fallback canonique, séparation STATIC/DATA et refus des fournisseurs météo externes. Les données agenda restent chiffrées. Ancien cache, démarrage offline, réseau muet, reprise iOS et changement de version sont vérifiés par les E2E existants. Aucun changement de cache ni migration localStorage.

Cloudflare → dispatch → relais → obs/agenda → gh-pages reste intact. Relais et watchdog gardent leur même groupe de concurrence non annulable et les anti-doublons existants. Le déploiement conserve les fichiers du relais, les nouveaux fichiers de pneus et les reprises de push. Aucun nouveau backend, déclenchement ou suivi utilisateur.

## Baseline mesurée

Source : [dernière CI réussie de prod-31](https://github.com/iPoower/iPoower/actions/runs/37306170549). Temps GitHub réels du run créé à 11:56:26 UTC jusqu'au dernier job de validation terminé à 12:11:20 UTC ; les étapes de déploiement sont exclues du budget de validation.

| Mesure | Avant |
|---|---:|
| Validation complète, attente et installations incluses | 14 min 54 s |
| Workflow complet, déploiement et vérification en ligne inclus | 15 min 51 s |
| Job Chromium | 9 min 02 s |
| Job WebKit | 14 min 45 s |
| Runner de suites Chromium | 8 min 25 s |
| Runner de suites WebKit | 13 min 19 s |
| `npm ci` | Chromium 0 s ; WebKit 1 s |
| Installation Playwright | Chromium 25 s ; WebKit 73 s |
| Job relay-smoke | 27 s ; relais 10 s, outils de clés 4 s, scanner PR fictif 3 s |
| Job confidentialité après fusion | 10 s ; scanner <1 s, séparation des clés 1 s |
| Build fictif local initial | 312 ms ; préparation complète 621 ms |

Durées de chaque suite : `tests/ci/durations.json`, relevées dans les logs du même run, arrondies à la seconde par le runner historique. Les dix suites WebKit les plus lentes :

| Suite | WebKit | Chromium |
|---|---:|---:|
| e2e34.js | 110 s | 69 s |
| e2e28.js | 103 s | 66 s |
| e2e30.js | 98 s | 54 s |
| e2e35.js | 57 s | 37 s |
| e2e44-place.js | 53 s | 29 s |
| e2e25.js | 44 s | 23 s |
| e2e42-meteo.js | 36 s | 21 s |
| e2e24.js | 34 s | 25 s |
| e2e40-network.js | 30 s | 25 s |
| e2e27.js | 26 s | 17 s |

Benchmark local du build sur cinq paires avant/après, mêmes fixtures et chiffrés fictifs, Node 24.19.0 : médianes 310,4 ms avant et 322,3 ms après. La lecture Git du source historique remplace seulement la lecture de `app.js` dans le build témoin. Cet écart de 11,9 ms est petit devant le temps navigateur ; aucun gain de build n'est revendiqué. Le build conserve sa sortie exacte et ses dépendances. La CI garde Node 20.

## Nouvelle validation

1. `unit` : syntaxe de tous les scripts et du hook, scanner sans secrets, 21 suites sans navigateur, puis partage d'un seul build et agenda fictifs.
2. `tests` : Chromium × 3 et WebKit × 3, chacun sur son propre runner. Répartition déterministe par durée historique (longest processing time). Suites séquentielles dans chaque job, assertions et délais E2E inchangés.
3. `relay-smoke` : contrôle indépendant du vrai relais sur données fictives, séparation des clés et comportement du scanner de PR. Sa préparation propre reste nécessaire à son contrat de sécurité et coûte peu.
4. `validation` : sept rapports requis, fingerprint du source/tests/outils/dépendances identique au checkout, liste exacte des suites de chaque shard, toutes réussies. Une omission, un doublon, un rapport ciblé, périmé ou en erreur bloque le verdict. Les statuts de tous les jobs de sécurité et tests sont vérifiés ; les skips ne sont acceptés que lorsqu'attendus.
5. `deploy` : garde le déclenchement après push sur main ou rollback, les permissions d'écriture et la concurrence non annulable. Il exige explicitement le verdict unique, la confidentialité et le relais verts. Une PR ne déploie jamais.

47 suites historiques conservées, dont 19 sans navigateur, 28 E2E Chromium et 26 E2E WebKit ; les deux SW Chromium-only restent dans leur plateforme historique. Deux nouvelles suites d'infrastructure protègent les extractions et les faux verts. Total : 49 suites distinctes et 75 exécutions (21 + 28 + 26), contre 92 auparavant avec les 19 mêmes suites unitaires exécutées deux fois. Aucun scénario ni assertion métier supprimé ou désactivé.

Le [premier run réparti](https://github.com/iPoower/iPoower/actions/runs/37313750544) a rejeté un faux vert : E2E 37 Chromium avait ses routes prêtes en mémoire, mais lisait le DOM avant le rendu différé de `fetchLeg.t`. Le test vérifie désormais la fin des requêtes météo puis avance l'horloge fictive pour terminer ce rendu avant les assertions Waze et réseau. Les 24 tentatives, les délais de test et toutes les assertions métier sont conservés ; aucun changement du code navigateur. Les cinq autres shards étaient verts et le verdict final est bien resté rouge. Ce défaut de synchronisation du test est la seule modification des fichiers de tests historiques.

Le verdict affiche les durées de chaque lane et de la préparation. Chaque suite imprime immédiatement sa durée ; un rapport JSON minimal conserve ces mesures sans captures ni logs bruts. Artifacts fictifs : 1 jour ; rapports de temps/statuts/noms de suites : 14 jours. Les clés de test sont recréées dans le workspace, pas partagées dans l'artifact. Les payloads sont contrôlés par fingerprint et empreintes de chaque fichier, puis copiés par lane.

L'objectif ≤10 minutes concerne la validation normale complète et sera vérifié sur le run de la PR, avec début du run, fin du verdict, installations et files d'attente incluses. Les mesures après, le gain en minutes et en pourcentage et le lien du run sont consignés dans la description finale de la PR ; une estimation de sharding ne vaut pas une mesure.

`npm ci` et le build ne sont pas le goulot : conserver le cache npm existant suffit. [Playwright déconseille le cache de ses navigateurs](https://playwright.dev/docs/ci#caching-browsers), notamment parce que les dépendances Linux restent à installer. Chaque job installe uniquement son navigateur et conserve des ressources stables ; pas de cache de navigateur ni de parallélisme intra-job pour simuler un gain.

## Frontières de sécurité et maintenance Actions

Aucun secret dans `unit`, `tests`, `tests-rollback`, `relay-smoke` ou `validation`. `contents: read` par défaut ; identifiants checkout non persistés dans tous les jobs de lecture. Le job deploy conserve les identifiants nécessaires à ses pushes et `contents: write`.

Le job `confidentialite` conserve l'Environment production, la frontière main et la séparation des clés. Le contrôle réel avant fusion reste `pr-privacy.yml`, inchangé : scanner de confiance provenant de main, checkout de PR sans identifiants, lecture comme données uniquement, secrets seulement à l'étape du scanner. Il est contrôlé séparément avant de déclarer la PR terminée.

Seules les Actions du workflow CI modifié sont épinglées à des commits immuables vérifiés, conformément à la [documentation GitHub](https://docs.github.com/en/actions/reference/security/secure-use). Les versions restent en commentaires ; Dependabot `github-actions` hebdomadaire reste actif.

| Action | Version | Commit |
|---|---|---|
| `actions/checkout` | v7 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7 | `820762786026740c76f36085b0efc47a31fe5020` |
| `actions/upload-artifact` | v7.0.1 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| `actions/download-artifact` | v8.0.1 | `3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` |

Les cinq autres workflows sont audités et non modifiés. Les épingler sans exécuter leurs cas de production/Cloudflare ne ferait pas partie d'une modification validée ; cela reste une tâche séparée.

## Retour arrière

Les tags déjà déployés n'ont pas les nouveaux fichiers de CI. Avec une entrée `version=prod-N`, le workflow actuel conserve `tests-rollback`, sa matrice historique complète Chromium/WebKit et les contrôles de confidentialité et relais du tag. Le vérificateur de statuts provient du workflow actuel ; il accepte seulement les skips attendus des nouvelles lanes. Aucune commande nouvelle n'est demandée à un ancien tag.

Le build du tag reste redéployé par le mécanisme historique, sans reset de gh-pages ni écrasement des observations/agenda récents. Les guards de ce chemin sont couverts par les contre-tests de CI et l'audit du graphe de jobs. Aucun rollback réel n'est lancé dans cette PR. Les temps des anciens runners peuvent rester supérieurs à 10 minutes ; le plafond est celui de la nouvelle validation normale.

## Commandes de développement

```sh
npm ci --no-audit --no-fund
node tests/ci/syntax.js
node tests/run-ci.js --lane unit
npx playwright install --with-deps chromium webkit
# Suite ciblée : pas de faux verdict « validation complète ».
BROWSER=chromium node tests/run-ci.js --lane browser --suite e2e42-meteo.js --reuse
BROWSER=webkit node tests/run-ci.js --lane browser --suite e2e42-meteo.js --reuse
# Shard complet, mêmes fixtures vérifiées, workspace propre à sa lane.
BROWSER=chromium node tests/run-ci.js --lane browser --shard 1/3 --reuse
# Runner local intégral conservé.
BROWSER=webkit node tests/run-ci.js
```

`--list` montre la sélection sans lancer de build. `--prepare-only` prépare les fixtures. Une préparation supprime `.ci` pour éviter les faux résultats anciens : la terminer avant de lancer plusieurs lanes avec `--reuse`. Les jobs GitHub disposent de workspaces physiques distincts.

## Risques et dette restante

Le source partagé reste lexicalement couplé ; les quatre fichiers sont des sections de build, pas des modules runtime indépendants. `app.js` reste volumineux (305 604 octets, −13,8 %) : réglages, agenda, tenue, orchestrations GPS et rendus restants demandent d'autres petits lots protégés. Aucun découplage artificiel n'est revendiqué.

La CI consomme six runners navigateur simultanés ; une queue GitHub ou un changement de performance peut augmenter le temps mur. Les poids de répartition viennent d'une mesure précise mais doivent évoluer si de nouvelles suites deviennent dominantes. Les rapports permettent de détecter ce changement sans réduire la couverture. Les artifacts refusent toute source ou fixture périmée.

Les tags anciens conservent leur runner plus lent. L'épinglage des workflows de production séparés, les scripts de capture historiques et l'amélioration des retries de push gh-pages restent hors de ce lot. Aucune modification des règles métier, du diagnostic utilisateur ou des données n'est nécessaire. Aucun tracking ajouté.
