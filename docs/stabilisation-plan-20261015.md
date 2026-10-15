# Plan de stabilisation — 15 octobre 2026

**Principe : aucune nouvelle fonctionnalité** tant que les cinq étapes ci-dessous ne sont pas faites. Race Control a beaucoup avancé en deux semaines ; ce plan transforme les fonctions en habitudes fiables.

Exigence de fond : Race Control ne ment pas sur la fraîcheur des données et ne compromet pas le coffre personnel. Cette exigence passe avant la disponibilité à 100 %.

## Point de départ (vérifié le 15 octobre 2026)

| Élément | État |
|---|---|
| Calculs et verdicts | Fiabilisés : chauffe à 0 km/h, pneu hors minimum légal prioritaire sur le score (#161), seuils de péremption et dates futures des preuves (#162), définition unique de la chaussée mouillée et limites affichées (#163) |
| Fraîcheur des données | Politique unique 15 / 60 min (#158), dates futures = inconnues (#157, #159), bandeau de relais en retard (#160) |
| Chaîne de livraison | CI Chromium + WebKit, déploiement automatique, `version.json` |
| Preuve sur iPhone réel | **Jamais faite** : c'est la première étape |

## Les cinq étapes

### 1. Usage quotidien sur iPhone
Utiliser l'application au quotidien et noter ce qui aide ou trompe (fiche ci-dessous). On teste : le trajet annoncé, le GPS, les alertes météo, le passage hors ligne.
- **Sortie** : une semaine de fiches, chaque anomalie classée « reproduite » ou « non reproduite ».
- **Qui** : l'utilisateur, sur son téléphone. Les tests WebKit de la CI simulent Safari, ils ne le remplacent pas.

### 2. Audit de cohérence entre onglets
Vérifier, en lecture seule d'abord, que le contexte déjà unifié reste identique partout : lieu, voiture, pneus, prochain trajet, fraîcheur météo. Un changement de départ doit se répercuter à l'identique.
- **Sortie** : une carte « onglet × information » avec la source de chaque valeur, les écarts trouvés, puis un test de cohérence automatisé.
- **Règle** : aucun code avant la lecture du rapport.

### 3. Petits correctifs prioritaires
Ne corriger que les anomalies **reproduites**, chacune avec un contre-test : le test doit rougir sans la correction et verdir avec.
- **Sortie** : une PR par anomalie, petite, relue, sans changement de comportement ailleurs.
- **Refusé** : tout correctif « au cas où », tout élargissement de périmètre.

### 4. Sauvegarde complète
Sauvegarder tout ce que l'application stocke, puis **prouver la restauration** sans perte avant toute migration ou changement d'origine. Les clés des signalements terrain et du journal fantôme ne sont pas encore exportées.
- **Sortie** : un test de restauration aller-retour sur des données fictives, puis une répétition sur copie.
- **Garde-fou** : `src/backup.js` est un chemin sensible (`AGENTS.md`) : accord explicite du propriétaire pour cette PR, même CI verte. Aucune migration de l'iPhone sans sauvegarde intégrale vérifiée.

### 5. Modularisation progressive
Réduire `src/app.js` (près de 400 Ko) en extrayant des modules à **comportement constant**.
- **Sortie** : à chaque extraction, le source réassemblé est comparé à l'ancien et les tests existants passent sans modification.
- **Règle** : une extraction par PR, jamais mélangée à un correctif.

## Fonctionnalités gelées jusqu'à la fin du plan
Agenda plus intelligent (distinguer rappels et « à réserver », télétravail et congé), briefing en cinq secondes, briefing vocal F1 repris sur cette synthèse. Elles reprennent après l'étape 3, selon les anomalies réellement constatées.

## Fiche quotidienne (iPhone)

À remplir en une minute, avec des lieux fictifs si elle est partagée (« Lieu A → Lieu B »).

| Date | Trajet annoncé juste ? | GPS cohérent ? | Alerte météo utile ou fausse ? | Hors ligne : ça tient ? | Ce qui m'a trompé / manqué |
|---|---|---|---|---|---|
| | oui / non | oui / non | utile / fausse / absente | oui / non | |

Pour une alerte douteuse : Réglages → Diagnostic (copiable) donne version, réseau, fraîcheur et lieu logique.

## Règles qui ne changent pas
- Un correctif sans test qui échoue d'abord n'est pas accepté.
- Chemins sensibles (`.github/workflows/**`, `src/backup.js`, `src/sw.js`, `src/session-vault.js`, `tools/relay-trust.js`, `encrypted/**`…) : accord explicite du propriétaire, même CI verte.
- Textes publics (PR, commits) : lieux fictifs uniquement.
- « Fusionné », « CI verte », « publié », « vérifié en ligne » et « testé sur iPhone réel » sont cinq états distincts.
