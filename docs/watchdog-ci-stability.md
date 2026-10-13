# WATCHDOG STABILITY V1 — revue sensible obligatoire

Date de référence : 13 octobre 2026. Branche : `fix/watchdog-ci-race-v1`.
Base exacte auditée : `b734d44e64d6dccfd06d6a4360279b94b8b1c2f1`.
Périmètre autorisé : audit, correction, tests fictifs et PR **Draft uniquement**.

## Cause racine vérifiée

Le même push sur `main` déclenche indépendamment `ci.yml` et
`race-control-watchdog.yml`. Il n'existe pas de dépendance inter-workflows.
Le job `approved` consulte la CI complète de ce SHA avant d'autoriser le relais.
Avant ce correctif, CI absente, en cours et terminée en échec produisent le même
échec générique. Le refus de secrets est correct ; le classement d'une attente
normale comme panne de workflow est artificiel.

| Preuve GitHub, même SHA exact | Heure UTC | Résultat observé |
| --- | --- | --- |
| [CI 38353651425](https://github.com/iPoower/iPoower/actions/runs/38353651425) et [watchdog 38353651436](https://github.com/iPoower/iPoower/actions/runs/38353651436) créés | 05:52:35 | Deux workflows indépendants, événement `push` |
| Log du job watchdog `115151475232` | 05:52:43.162 | `relay-trust.js` refuse l'absence de CI complète réussie, exit 1 |
| Job watchdog sensible | Même exécution | `skipped` : aucune étape avec secrets ni moteur météo exécutée |
| Fin de la CI exacte | 06:09:54 | `completed / success`, agrégateur et six shards verts |
| [Relais 38355300362](https://github.com/iPoower/iPoower/actions/runs/38355300362), job `115156665679` | 06:11:15.305 | Autorisation explicite du SHA `b734d44…` par la CI `38353651425` |

La CI dure 17 min 19 s dans cet incident. Les huit succès push/main les plus
récents lus dans l'API durent entre 17 min 08 s et 19 min 49 s. Ce sont des
observations, pas un délai garanti. Un watchdog à timeout de 3 min ne peut
raisonnablement attendre la fin complète de cette CI. Aucune panne du moteur
météo n'est démontrée par ce run : le job qui l'exécute est sauté.

## Coordination retenue

`tools/relay-trust.js` reste l'autorité. Ses critères existants sont conservés :
SHA exact, branche `main`, événement `push`, chemin `ci.yml`, dépôt source
identique, dernier run correspondant terminé avec succès. Un ancien vert ne
masque jamais un run plus récent non vert. Le mode CLI historique sans option
continue à échouer quand la CI n'est pas approuvée.

Les deux workflows météo/watchdog utilisent explicitement `--defer-pending` :

| État | Condition | Job de lecture | Job avec secrets |
| --- | --- | --- | --- |
| `pending` | Dernière CI exacte queued/in_progress/requested/waiting/pending, sans conclusion | Succès contrôlé + notice « différé », SHA vide | Sauté |
| `approved` | Dernière CI exacte completed/success et main encore au même SHA | Succès, SHA immuable transmis | Autorisé, sous réserve de fraîcheur et du dernier contrôle main |
| `rejected` | CI terminée sans succès, CI annulée, mauvais contexte ou main avancé | Échec explicite, SHA vide | Sauté |
| `unavailable` | CI absente, API indisponible, JSON/statut invalide ou réponse tronquée | Échec explicite, SHA vide | Sauté |

Le SHA de `main` est lu avant et après la recherche d'une CI verte. Les checkouts
sensibles utilisent exclusivement le SHA approuvé, jamais une branche flottante.
`--recheck-approved` confirme encore ce SHA et le dernier succès CI juste avant les secrets. Ce dernier
contrôle nécessite un SHA préalable identique à `GITHUB_SHA`, ne produit aucun
output d'autorisation CI et ne remplace pas le job initial.

Aucune boucle ni polling n'est ajouté : au plus trois GET de 20 s par contrôle
initial, puis trois GET de 20 s si le relais est dû. L'état pending initial coûte deux GET
et termine immédiatement. La pagination inattendue au-delà de 30 runs pour un
SHA et toute réponse incohérente restent refusées, sans fallback vers un ancien
commit. Les corps et erreurs brutes de l'API ne sont jamais journalisés.

## Déclencheurs, permissions et reprise

| Workflow / job | Déclenchement ou dépendance | Permissions |
| --- | --- | --- |
| CI | Push de chaque SHA main, PR, dispatch existant | `contents: read` global ; déploiement autorisé existant séparé |
| Watchdog | Push main, cron `4,14,24,34,44,54`, dispatch existant | `contents: read` global |
| Relais | Cron toutes les 5 min, horloge externe via dispatch existant | `contents: read` global |
| `approved` des deux relais | Première barrière, sans Environment production | `contents: read`, `actions: read`, aucun secret applicatif |
| `watchdog` / `relay` | `needs: approved` **et** `outputs.state == 'approved'` | `contents: write` existant ; `actions: read` ajouté pour revalider la CI ; Environment production existant, secrets sur une seule étape |

La seule extension de permission est `actions: read` dans ces deux jobs : aucune
permission d'écriture Actions, aucun droit d'administration, aucune modification
des secrets ou protections. Cette lecture et les conditions d'autorisation sont
expressément soumises à la revue propriétaire ; aucun merge automatique.
Une relance CI devenue pending/rouge/annulée entre les deux barrières est refusée
par la seconde barrière, sans utiliser les secrets ni publier.

La reprise se fait par une nouvelle exécution normale qui relit main et sa CI
exacte. Les crons, l'horloge externe, les seuils de fraîcheur 8/10 min et les
anti-doublons restent inchangés. Nominalement, le cron relais offre une occasion
de reprise sous 5 min après validation ; GitHub peut retarder ou supprimer un
cron. Le correctif ne garantit pas une cadence stricte et ne raccourcit pas la
période sans publication pendant la CI. Les observations précédentes et l'agenda
chiffré restent conservés. Aucune notification réelle de test n'est envoyée.

Les deux workflows conservent le groupe global partagé `race-control-relay` et
`cancel-in-progress: false`. Une exécution active n'est pas annulée par une autre ;
la fraîcheur est relue dans la file avant toute publication. La file GitHub peut
remplacer une exécution en attente par une plus récente : ce comportement
existant n'est pas une garantie de traitement FIFO de chaque déclenchement.

## Alternatives évaluées

- `workflow_run` de la CI avec `types: [completed]` et filtre main : techniquement
  pris en charge, mais les événements PR/rerun et le SHA de branche par défaut
  demandent des contrôles supplémentaires. Ce déclencheur peut accéder aux secrets
  et tokens d'écriture même si le workflow précédent ne le pouvait pas. Ajouter
  une troisième voie privilégiée est inutile ici avec les reprises existantes.
  Aucun `workflow_run` n'est ajouté, aucun artifact CI non fiable n'est exécuté.
- Attendre/poller la CI : consommation de minutes et blocage du groupe partagé
  pendant une durée généralement supérieure au timeout du watchdog. Écarté.
- Accepter une CI ancienne, un seul job vert ou une conclusion générique issue
  d'un autre workflow : écarté car affaiblit l'autorisation exacte existante.

Sources primaires vérifiées : [événement workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run),
[concurrence GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency),
[API des workflow runs](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow).

## Fichiers et validation reproductible

Sept fichiers : les workflows CI/watchdog/relais, `tools/relay-trust.js`,
`tests/relay-trust.js`, `tests/watchdog-stability.js` et ce rapport.
Aucun fichier `src/`, moteur, UI, GPS, pneu, trajet, chiffrement utilisateur,
configuration personnelle ou Service Worker n'est modifié.

Tests exécutables sans clés réelles :

```sh
node --test tests/watchdog-stability.js
node tests/relay-trust.js
node tests/relay-smoke.js
node tests/keys-tools.js
node tests/pr-privacy.js
node tests/run-ci.js --lane unit
node tests/ci/syntax.js
node tools/check-secrets.js
git diff --check
```

La nouvelle suite est exécutée dans le job obligatoire `relay-smoke`, avant le
verdict CI agrégé ; aucun gate existant n'est supprimé ni rendu facultatif.
Ses 30 tests couvrent les dix exigences, les codes de sortie et outputs CLI,
les statuts inattendus, les réponses tronquées, les erreurs API à chaque phase,
les accès aux secrets piégés, et les mutations dangereuses des workflows.
La concurrence et la reprise utilisent un modèle de file partagée avec les vrais
helpers de données/fraîcheur ; aucun dispatch réel concurrent n'est réalisé.
Le test historique exécute également le vrai relais sur un harnais fictif,
avec conservation des anti-doublons et code gh-pages hostile jamais exécuté.

Résultats locaux effectivement obtenus avant publication de la branche :

| Vérification | Résultat |
| --- | --- |
| Coordination watchdog, API/CLI, autorisation et concurrence simulée | 30/30 PASS |
| Frontière historique du relais | 8/8 PASS |
| Vrai relais sur harnais fictif | 43/43 PASS |
| Séparation des outils de clés | 3/3 PASS |
| Confidentialité des PR sur fichiers fictifs hostiles | 6/6 PASS |
| Lane unitaire complète et build/agenda fictifs | 50/50 suites PASS |
| Gates CI et publication sur Git fictif | 26/26 PASS |
| Protections sur API GitHub fictive | 8/8 PASS |
| Horloge externe sur API fictive | 24/24 PASS |
| Syntaxe de tous les scripts et du hook | 226 scripts PASS |
| YAML, déclencheurs conservés et permissions attendues | PASS |
| Scanner local sans clés réelles + diff whitespace | PASS, motifs génériques uniquement |

Les contrôles GitHub de la PR sont suivis séparément sur son head exact ; les
résultats locaux ne sont pas présentés comme une CI distante terminée. Le build
public `index.html` et `version.json` sont comparés avant/après en lecture seule,
sans charger les caches, données personnelles ou clés de l'utilisateur.

## Risques résiduels et limites de preuve

- Risque de régression **faible**, mais revue propriétaire impérative : la
  modification touche à l'autorisation CI. Le résultat pending est un succès
  de coordination, pas une preuve que les observations ont été renouvelées.
- Une API en panne, une CI échouée/absente ou une succession de commits empêche
  volontairement le renouvellement. La reprise exige une validation nouvelle.
- Main peut avancer immédiatement après le dernier GET. Le checkout reste au
  SHA immuable déjà validé : le nouveau code ne peut jamais hériter de son
  autorisation. Une revalidation HTTP n'est pas atomique avec l'étape sensible :
  une CI relancée immédiatement après la dernière lecture sera détectée par les
  contrôles suivants, sans autoriser un nouveau SHA. Les contrôles finaux exigent
  le dernier run exact vert au moment de leur lecture.
- `main` et `gh-pages` sont signalées protégées par l'API. Le ruleset gh-pages
  `24790055` est actif, sans bypass, avec interdictions de suppression et de
  non-fast-forward. Le détail de la protection classique main est inaccessible
  au connecteur (403) ; aucune règle administrative n'est modifiée ou supposée.
- Aucun secret réel n'est chargé par les tests locaux. Les tests de confidentialité
  réels du dépôt restent ceux du workflow existant. Aucun test physique iPhone
  n'est revendiqué. Le correctif ne touche pas l'application.
- La PR reste Draft. Ni merge, ni changement de règles/Environment, ni dispatch
  de relais/déploiement, ni modification des PR #134 à #140 ne sont autorisés.

## Rollback

Avant fusion : fermer la PR laisse la production intacte.
Après une fusion éventuellement autorisée : PR de revert limitée à ces sept
fichiers, revue sensible explicite et CI complète. Cela rétablit les refus
bruyants pendant la CI, tout en conservant la frontière de secrets antérieure.
Ne jamais réinitialiser main/gh-pages, modifier les protections, copier le code
gh-pages vers le relais de confiance ou restaurer les JSON utilisateur.

**GREEN → MERGE reste subordonné à la revue explicite du propriétaire.**
