# Tyre Intelligence Engine V1

## Architecture

Les trois sections `src/app/tyre-evidence.js` (catalogue public immuable), `tyre-intelligence.js` (domaine pur) et `tyre-intelligence-view.js` (adaptateur/vues) sont intégrées au script existant par le mécanisme `@include`. Aucun changement du build, du Service Worker, de la cryptographie ou des workflows. Le catalogue est embarqué dans le HTML déjà disponible hors ligne. Aucune nouvelle API, clé de stockage, dépendance ou tâche de scraping.

Le schéma du catalogue est versionné séparément des sauvegardes : `docs/schemas/tyreTestEvidence.v1.schema.json`. `TyreIntelligence.validate` contrôle aussi identités, unités, effectifs, bornes, dates et sources HTTPS autorisées. Une version inconnue est refusée, sans fabriquer des valeurs par défaut. Une mise à jour du catalogue passe par une PR : relire les sources primaires, augmenter `revision`, dater la revue, ajouter des tests, relancer CI et revue humaine. Le rafraîchissement météo ne modifie jamais les essais.

## Sources réellement consultées le 18 octobre 2026

| Référence | Source primaire | Portée retenue |
|---|---|---|
| Michelin Pilot Sport 4S | [Tyre Reviews 2021](https://www.tyrereviews.com/Tyre-Tests/2021-Tyre-Reviews-UHP-Summer-Tyre-Test.htm) | 225/40 R18 92Y XL, Golf GTI. Sec 100→1 km/h, mouillé 80→1 km/h ; disciplines séparées, 14 concurrents. Profondeur publiée 7,62 mm pour l'exemplaire testé. |
| Goodyear UltraGrip Performance 3 | [Tyre Reviews 2023](https://www.tyrereviews.com/Tyre-Tests/2023-Tyre-Reviews-Winter-Tyre-Test.htm) | 225/45 R18 95V XL. Sec 100→5 km/h à 8–9 °C (air/chaussée non précisé), mouillé 80→5 km/h. Onze pneus hiver classés ; références hors classement. Aucun résultat d'aquaplaning transversal ou bruit objectif retenu. |
| Goodyear UltraGrip Performance 3 | [ADAC 2024, fiche individuelle](https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/winterreifen/205-55-r16/goodyear-ultragrip-performance-3-id-4909/) | 205/55 R16 91H. Sec 100→0, mouillé 80→0 : asphalte et béton conservés séparément. Aquaplaning longitudinal et transversal distincts. Kilométrage ADAC explicitement projeté, jamais une durée de vie restante du véhicule. |
| Rovelo RPX-988 | Aucune publication primaire vérifiée lors de cette recherche | Des index secondaires évoquent Auto Bild 2017, mais cette donnée n'est pas intégrée sans publication primaire accessible et vérifiée. Le RPX-998 ne doit pas être confondu avec le RPX-988. |

L'[article général ADAC 2024](https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/winterreifen/205-55-r16/) confirme l'effectif de douze pneus. Les valeurs non documentées dans les sources retenues restent `null`. Nous n'importons ni avis consommateurs, ni pourcentages agrégés de sites comparateurs, ni étiquette UE comme mesure d'aquaplaning. Aucun texte éditorial long n'est reproduit.

## Décisions

- Identité modèle stricte : graphies explicites autorisées, générations et variantes jamais rapprochées par similarité floue. La seule annotation neutre acceptée est la position « AV + AR ».
- Comparabilité : même dimension **et** variante documentée, même modèle dans une autre dimension, comparabilité partielle, ou absence de preuve. Les résultats restent rattachés à leur essai et protocole. Pas de moyenne de distances ou de classement inter-essais.
- Qualité élevée seulement pour une variante/dimension et des conditions suffisamment documentées ; les essais initiaux ne justifient pas cette qualité pour les dimensions personnelles visées. Des protocoles contradictoires pour une même observation sont conservés et signalés.
- Monte active lue dans `cars[].tire`. Le projet `plan` et les trains stockés ne changent aucune capacité du pneu monté. Aucun profil personnel n'est injecté dans le dépôt public.
- La météo vient du contexte existant. Les températures d'air et de chaussée sont séparées ; celle de la chaussée est indiquée comme estimation. Les précipitations sont des prévisions, jamais une preuve d'épaisseur d'eau. Au-delà de 60 min, ou sans âge vérifiable, le contexte courant est insuffisant. Les points d'itinéraire sans horodatage de fournisseur exploitable restent explicitement incertains.
- Règles expliquées par identifiant, déclencheurs, provenance, dates et incertitudes. États : Information, Vigilance, Risque documenté, Données insuffisantes. Le repère interne de sculpture à 3 mm est une règle de vigilance en présence de pluie prévue, pas une loi d'adhérence ni une calibration en mètres. Le seuil de 7 °C n'est jamais une frontière de perte d'adhérence dans le nouveau domaine.
- Les distances personnalisées et les pourcentages de potentiel physique du simulateur historique ne sont plus présentés dans Analyse. Le modèle thermique historique conserve ses limites visibles ; il ne devient pas une fiche d'essai du modèle exact. Les scores météo historiques et le relais ne sont pas recalibrés par des coefficients arbitraires.

## Relevés privés et compatibilité

Aucune migration persistante automatique, aucun écrasement des véhicules, notes ou mesures. La migration de lecture expose les anciens scalaires avec portée inconnue. Elle ne duplique pas un relevé arrière aux autres rainures, ni un ancien scalaire aux deux essieux.

Extension optionnelle `tire.treads[].pos` : `unknown`, `shoulders`, `centre`, `inner`, `outer` ; `wheel` peut préciser une roue compatible avec l'essieu. Chaque point garde sa date, valeur, provenance et kilométrage. Les anciennes notes libres restent intégrales : aucune date ou position n'est extraite automatiquement. Les valeurs déjà renseignées ne sont pas corrigées par le catalogue. La saisie d'un point conserve les autres ; le minimum des points du même essieu et du même jour devient la référence. À trente relevés, l'ajout est refusé explicitement plutôt qu'effacer un ancien point silencieusement.

La pression cible reste distincte des champs optionnels `pchk.av` et `pchk.ar`, réellement mesurés. Une date de contrôle seule ne suffit pas à prouver ces valeurs. `variant` et `homologation` sont des chaînes optionnelles, sans inférence depuis un nom commercial.

`ConfigImport` autorise strictement ces extensions et refuse position, roue, valeur ou champ inconnus. Les anciens JSON restent acceptés par la nouvelle version ; la sauvegarde native conserve ses versions et enveloppes existantes. La nouvelle structure est transportée par le même coffre chiffré et les mêmes fonctions de copie. Un ancien logiciel à liste fermée peut refuser les nouveaux champs : mettre l'application à jour avant cet import. Aucune donnée de sauvegarde utilisateur n'a été modifiée pendant le développement.

## Recette

`test_tyre_intelligence.js` vérifie identités, variantes, dimensions, absences, points asymétriques, projet non monté, météo et pression périmées, contradictions, validation hostile, absence de réseau/mutation et aller-retour JSON. `e2e78-tyre-intelligence.js` utilise le HTML réel et le coffre avec des données fictives : quatre vues, sources, unités/protocoles, échappement des notes, disposition mobile/PC, catalogue offline, fraîcheur et conservation des relevés au rechargement. Les suites existantes gardent leur couverture des sauvegardes, de la PWA, du relais et des autres modules.

La recette iPhone dans les tests est une émulation WebKit, pas un essai sur téléphone physique. Les preuves d'exécution et la CI du SHA final sont consignées dans la Pull Request. Aucun merge ni déploiement sans validation explicite du propriétaire.
