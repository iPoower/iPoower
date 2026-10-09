# Race Control — Mise en service des protections GitHub

**État : procédure propriétaire, non automatisée.** Ce document ne modifie aucun réglage GitHub.

## Pourquoi

- `main` : interdire le direct push, la suppression et le force-push ; exiger une PR et les contrôles `unit`, `validation`, `scan` à jour, avec historique linéaire.
- `gh-pages` : interdire seulement la suppression et le force-push. **Ne jamais imposer de PR sur `gh-pages`** : les relais météo, DATEX et les déploiements font des pushes normaux sur cette branche.
- L'auteur du dépôt est seul : **0 approbation requise**, mais PR obligatoire et résultats CI verts. Les PR de sécurité exigent une décision explicite du propriétaire.

## Contrôles préalables obligatoires

1. Confirmer que les tests de `main` sont verts et qu'aucune PR applicative n'est en cours de fusion.
2. Vérifier qu'une PR récente a les trois checks `unit`, `validation`, `scan` verts sur son commit HEAD (cas vérifié sur la PR #85). Pour les forks externes, `scan` peut être volontairement absent : ce réglage les bloquera, par sécurité.
3. Confirmer que GitHub Pages et les flux automatiques sont accessibles, et conserver le SHA actuel de `main`.
4. Vérifier que l'outil GitHub CLI (`gh`) est installé et authentifié avec **droits d'administration**. Une intégration GitHub sans permissions administratives ne suffit pas.

## Exécuter depuis une copie à jour du dépôt (après revue et fusion de la PR de préparation)

```bash
gh auth status
git switch main
git pull --ff-only
bash tools/github/protect-branches.sh iPoower/iPoower
```

Le script configure les protections et **relit les deux règles pour vérifier leur activation**. Il peut être relancé sans multiplier les rulesets `gh-pages` : il met à jour la règle existante si elle porte le même nom.

## Vérifications après activation

```bash
gh api repos/iPoower/iPoower/branches/main/protection --jq '{pr: (.required_pull_request_reviews != null), checks: .required_status_checks.contexts, strict: .required_status_checks.strict, admins: .enforce_admins.enabled}'
gh api repos/iPoower/iPoower/rulesets --jq '.[] | {name, enforcement}'
```

Vérifier également dans GitHub :

- `Settings > Branches` : `main` impose bien une PR, les 3 checks et interdit force-push/suppression. Les fusions **squash/rebase** respectent l'historique linéaire.
- `Settings > Rules > Rulesets` : `gh-pages` interdit réécriture et suppression **sans imposer de PR**.
- Ouvrir une petite PR non sensible et confirmer que les 3 checks passent et que la fusion est autorisée après validation.
- Observer au moins un cycle normal `Relais · horloge`, `Race Control · DATEX routier`, et un déploiement GitHub Pages ; contrôler que `race-control/version.json` ne régresse pas.

**Si le script échoue :** ne pas forcer la branche ni modifier les flux météo. Lire le message d'erreur et les règles partielles dans GitHub avant une nouvelle tentative. Ne pas lancer le script à partir d'une ancienne branche.

## Migration Cloudflare : chantier distinct

Le déploiement sur un nouveau domaine ne transporte **pas** les données du navigateur (origines isolées). Ne pas rediriger l'ancienne adresse. D'abord exporter une sauvegarde chiffrée depuis Race Control, ensuite importer sur l'origine dédiée, vérifier les véhicules, lieux, agenda et journal, et garder l'ancienne adresse opérationnelle tant que le transfert n'est pas validé sur l'iPhone physique.

## Périmètre hors de cette procédure

Ce document ne fusionne aucune PR, ne déclenche aucune administration GitHub et n'active pas Cloudflare. Les lots d'audit A07–A16 doivent reprendre leur cahier des charges d'origine ; ne pas leur attribuer de correctifs inventés.
