# Garage — amortissement et coût d'usage (moteur isolé)

**Statut : brouillon technique, non raccordé à l'interface et non déployé.**

Le futur encart « Coût & rentabilité » doit s'ajouter dans l'onglet Garage existant, sans sixième onglet et sans modifier Twin Garage.
Le calculateur pur `src/garage-economics.js` et ses tests `tests/test_garage_economics.js` sont les seuls changements de cette branche.

## Principes

- Projection du **prix d'acquisition seul** à 12, 24, 36, 60 et 84 mois. Ce n'est pas un seuil de rentabilité.
- Kilométrages et dépenses : uniquement les valeurs déclarées. Toute valeur manquante est inconnue, jamais zéro.
- Les frais de carburant, assurance, entretien et réparations sont totalisés à part ; une catégorie manquante impose l'indication « partiel ».
- Valeur de revente estimée facultative, explicitement distincte d'un encaissement réalisé.
- Montants en centimes entiers et calculs purs, sans stockage, réseau ni effet de bord.
- Historique court (< 30 jours ou < 1 000 km) : avertissement contre toute extrapolation.

## Coordination impérative

- Ne pas modifier les travaux de l'autre agent sur Garage Life (#193) ni la navigation en cours (#230).
- Aucun changement dans `src/app.js`, `src/style.css`, `src/garage.js`, coffre, crypto, sauvegardes, synchronisation, Service Worker, CI, Twin Garage ou autres dépôts.
- Pas de données personnelles ni de prix réels consignés dans la branche, les tests ou la PR publique.
- Le moteur n'est **pas encore utilisé dans la PWA** : sa présence dans `src/` ne signifie pas qu'un encart apparaît à l'écran.
- Le futur raccord UI doit préserver `S.cars` comme source unique, le focus, la navigation mobile, les données existantes et les animations.
- Une éventuelle persistance de données financières exige un audit dédié (confidentialité, sauvegarde, synchronisation, conflits) et un accord séparé.
- PR à garder en **draft** jusqu'à coordination et validation CI complète sur le SHA exact : tests unitaires, 3 Chromium, 3 WebKit, confidentialité, sécurité et déploiement maîtrisé.

Test autonome : `node tests/test_garage_economics.js`.