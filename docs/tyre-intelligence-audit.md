# Tyre Intelligence V1 — audit avant modification

Base inspectée : `d82bf413b701630b7eb377cf295d018e706f9292`, branche `main`, 18 octobre 2026.

## Architecture confirmée

- PWA statique, JavaScript classique assemblé dans un HTML autonome par `tools/build.js`. Les sections `src/app/*.js` sont incluses par `tools/app-source.js`. Aucun serveur de base de données applicative.
- Catalogue public `src/tiredb.json` (sélection de modèles/variantes) et fiches descriptives `src/tirespecs.js`. Les deux ne constituent pas une base d'essais indépendants.
- Monte active : `S.cars[].tire`. Projet hiver : `plan`, jeux déposés : `sets`. Le domaine `tyrestate.js` lit profondeurs par essieu, relevés datés, DOT et contrôle de pression. Les informations saisies restent privées dans le coffre ; le catalogue public ne doit pas contenir un profil personnel.
- `engine.js` calcule des indices météo et pneus ; `tyrelab.js` estime température, adhérence, freinage et aquaplaning avec des hypothèses générales. Il contient notamment une conversion de profondeur en mètres de freinage provisoire, non calibrée sur le véhicule.
- Météo déjà normalisée dans `CX.m`, données brutes horodatées dans `RAW`, points de trajet dans `wxTrips`. Actualisation à cinq minutes lorsque l'application est visible. L'état de chaussée et sa température sont généralement estimés, distincts des observations utilisateur.
- Vues : cartes Pneus dans `app.js`, Météo dans `app/weather-view.js`, Analyse dans `app/analysis-view.js`, Trajet dans `app/trip-view.js`. Le contexte canonique choisit le véhicule actif.
- Sauvegardes : `backup.js`, `config-import.js`, coffre et journal cumulatif. Validation de configuration par liste fermée. Un ajout de champ doit être explicitement validé, sans perte à l'export/import. Aucune nouvelle clé de stockage nécessaire pour un catalogue public embarqué.
- CI : registre `tests/ci/suites.js`, lane unitaire/build, matrice Chromium/WebKit en trois shards, relais, confidentialité et validation agrégée. Les données de recette sont fictives. Les workflows existants suffisent pour enregistrer les nouvelles suites.

## Problèmes et décisions

1. Aucun modèle d'essais sourcés, ni comparaison de variantes/dimensions. Ajouter un catalogue public versionné et un domaine pur, séparés des vues et des relevés privés.
2. Une fiche constructeur disponible n'est pas une preuve de calibration physique. Conserver les sources et protocoles, ne produire aucun classement global ni coefficient de gomme.
3. Les distances génériques historiques ne doivent pas être présentées comme la conséquence d'une profondeur précise validée sur la monte. La nouvelle intelligence ne les utilisera pas ; l'interface Analyse doit clairement isoler l'ancien simulateur et ses hypothèses.
4. Le format historique ne distingue pas le centre et les épaules d'un relevé. Étendre de façon optionnelle chaque relevé avec une position, sans réécrire les anciennes valeurs ni déduire une date à partir d'une note libre.
5. Pression recommandée et pression réellement contrôlée sont distinctes. Une date et une température seules ne prouvent pas une valeur mesurée.
6. L'absence de source primaire vérifiée pour un modèle demeure une absence de preuve, sans pénalité arbitraire.

## Périmètre de réalisation

Catalogue initial Michelin Pilot Sport 4S, Rovelo RPX-988 et Goodyear UltraGrip Performance 3. Liaison par identité exacte avec la monte active et, séparément, le projet hiver existant : aucun remplacement de la monte, aucun préremplissage de données personnelles. Lecture des mesures existantes et des notes intactes ; adaptation de schéma optionnelle et non destructive. Moteur explicable, sans API supplémentaire, sans scraping à l'exécution, utilisable hors ligne dans le shell déjà mis en cache.

Aucun déploiement ou fusion autorisé pour cette PR. Les modifications du validateur d'import nécessitent la revue explicite du propriétaire conformément à `AGENTS.md`.
