# FORTERESSE II — étape 2 : répétition à blanc, sans migration

> **NON DÉPLOYABLE / NON FUSIONNÉ / NON EXÉCUTABLE SUR DONNÉES RÉELLES.**
> Complément proposé à la PR #134 (`docs/fortress-ii-origin-preparation.md`).
> Branche créée depuis `main` protégée, indépendamment de #134. **Ne prétend pas satisfaire les prérequis de migration réelle.**

## Pourquoi cette deuxième étape

La première préparation a identifié deux obstacles majeurs :

1. Les champs et clés à conservation humaine (`twrc.reports.v1`, `twrc.shadow.v1`) ne peuvent être supprimés ou exportés automatiquement. Backup V2 ne les couvre pas entièrement.
2. Le vrai SW v12 laisse hors de sa portée les JSON situés sur une autre origine ; un déploiement sur une origine dédiée exige donc un miroir de données sur la **future même origine**, ou une autre solution formellement revue, avant de promettre l'offline.

Cette PR **ne modifie aucun fichier applicatif** et ne dépend pas de #134 pour exécuter ses tests. Elle n'autorise aucune origine réelle, aucun import/export, aucun DNS, aucune authentification d'application et aucun déploiement.

## Matrice de refus du faux protocole

| Cas simulé | Résultat exigé | Portée |
|---|---|---|
| Clef `twrc.*` inconnue | Blocage avant toute écriture | Fail closed, registre de test non exhaustif |
| Signalements humains présents mais non arbitrés | Blocage explicite | Pas de suppression silencieuse |
| Observation humaine illisible | Blocage | Corriger dans une future procédure distincte |
| GPS actif ou trajet en cours dans le contexte | Blocage | Pas d'état éphémère transféré |
| Coffre, session, clés appareil ou cache réseau | Exclus du jeu fictif de données | **N'est pas une preuve** de restauration du vrai coffre |
| Origines fictives différentes du manifeste | Blocage | Origines `example.invalid`, aucune adresse réelle |
| Volume excessif / données essentielles absentes | Blocage | Pas de transfert partiel par troncature |
| Destination non vide, quota ou révision concurrente | Arrêt sans remplacer l'ancien état simulé | FakeStore : pas un équivalent atomique multi-stores IDB/localStorage |
| Projet en double activation | Refus | Aucun écrasement tacite |

Les faux réglages, pneus, trajets et signalements sont **synthétiques**. Les secrets imprimés sont des chaînes explicitement fictives et ne constituent pas des identifiants.

## Expérience SW v12, en VM

Le script `tests/fortress-ii-offline-rehearsal.js` charge le **vrai** `src/sw.js` dans un contexte Node VM sans enregistrer de Service Worker et simule une API Cache Storage et un serveur sans trafic réseau.

La VM doit montrer que :

- Les ressources de **l'ancienne origine** et celles d'une application voisine ne sont pas interceptées par le SW de la future origine.
- Les faux `obs.json`, `calendar.sealed.json` et `version.json` **mêmes origines/scope** servent leur dernière réponse quand le réseau tombe, après une première réponse valide.
- La réponse DATEX valide est réutilisable hors ligne avec son marqueur de repli.
- La réponse DATEX corrompue ne remplace pas l'ancien cache valide ; une copie DATEX vieillie est refusée.
- Les noms de cache sont cantonnés à la portée fictive, sans URL personnelle.

**Avertissement :** le code SW générique actuel n'inspecte pas de façon exhaustive les schémas des JSON `obs`, `version` et calendrier avant leur mise en cache. Le test simule leur validité initiale, **pas une garantie cryptographique ni anti-empoisonnement**. Les tests VM n'établissent pas CORS, CSP/headers de Cloudflare, disponibilité du miroir de données, intégrité du relais, comportement Safari iPhone, quota réel ou persistance IndexedDB réelle.

## Critères de passage — aucun changement de GO/NO GO pour l'instant

- Tests isolés 100 % verts et workflow GitHub Actions limité à `pull_request`, **aucun secret, aucun permission d'écriture, aucun déploiement**.
- Code applicatif (`src/`, `tools/build.js`, `gh-pages`, workflows existants) et `main` inchangés.
- La PR #134 conserve son statut en brouillon et cette PR nouvelle reste elle aussi en brouillon.
- **GO uniquement pour le banc d'essai fictif** : jamais une autorisation de préparer un export réel sans définir précisément les décisions de conservation des observations humaines.
- **NO GO migration** : tant que l'inventaire runtime sur profil **de test**, la preuve d'un package intégral déchiffrable, le miroir HTTPS same-origin, CORS/headers réels, la restauration iOS physique, les autorisations GPS et le rollback inverse n'ont pas été vérifiés.

## Notes pour la prochaine étape autorisée

La première étape pratique, **après autorisation distincte**, sera un **profil 100 % fictif dans un environnement de test séparé** disposant de ses propres origines, et non le coffre Safari réel. Mesurer les migrations de clés inconnues, les quotas/interruptions réels IDB/localStorage, deux SW cohabitant, le cache HTTP et les permissions sur iPhone. Ne pas déclencher de requête vers le domaine réel depuis les tests fictifs.
