# LIVE ROUTE dans Twin Garage

Le panneau du prochain trajet conserve Twin Garage, ses fiches, ses silhouettes SVG, ses thèmes et ses cinq onglets. Un cockpit cartographique précède la scène illustrative existante. Aucun second Garage ni second contexte de destination n'est créé.

## Comportement

- Carte Leaflet locale chargée lorsque le panneau devient visible ; fond Esri sombre/clair et secours OpenStreetMap déjà autorisés par l'app. Tracé OSRM existant uniquement. Une ligne droite estimée n'est jamais présentée comme une route. Sans géométrie, la scène 2D et un message restent accessibles.
- Simulation avant départ : curseur, lecture de quarante secondes, pause, trois secteurs de distance égale, distance restante, heure prévue et passage simulé. L'allure uniforme est annoncée ; ces valeurs ne sont pas des mesures de conduite. Mouvement réduit : curseur disponible et lecture automatique désactivée.
- Pendant un trajet actif canonique : mode GPS, simulation désactivée, utilisation exclusive de `FIX` déjà accepté. Précision maximale 60 m, âge maximal 15 s, garde des confirmations et du début de trajet, refus des réponses anciennes, déplacements incohérents, positions hors tracé et ambiguïtés. Aucun nouveau watch ou appel de géolocalisation.
- Une perte de position fige le véhicule et retire la distance/ETA courantes. Après suspension, un nouveau relevé est nécessaire. Aucun déplacement réel n'est extrapolé de l'horloge.
- Prévisions ponctuelles de Route Radar : seuls les points documentés sur l'itinéraire sont positionnés dans ce cockpit. Les points de progression inconnue restent dans les prévisions historiques du Garage. Pluie, visibilité, neige, rafales et vigilance sont nommées comme des prévisions ; réception et cache restent visibles.
- Road Intelligence : lecture des événements vérifiés déjà disponibles, uniquement pour le trajet et le fix courants, avec source et date. Pas d'activation de fournisseur ni de nouvelle requête DATEX. Une absence d'événement ne devient jamais une affirmation de circulation fluide.

## État et durabilité

La carte, le curseur et la lecture vivent en mémoire. Aucune clé, migration, sauvegarde, autorisation, dépendance, règle de déploiement ou Service Worker supplémentaire. Le trajet domicile-travail réutilise `tripGeo` et son cache cartographique historique `twrc.croute`, avec les mêmes arrondis privés ; le nouveau cockpit ne crée pas de format persistant.

Le DOM du cockpit reste identique pendant les mises à jour météo : zoom, geste et focus sont conservés. Changer réellement de trajet invalide géométrie, anciennes positions et réponses asynchrones. Sortir du Garage ou annuler le trajet nettoie carte, marqueurs, observateur et minuteurs. La lecture s'arrête hors écran, en arrière-plan ou à l'expiration de session.

Les ETA sont des estimations proportionnelles à la durée de l'itinéraire, sans trafic, et non un système de navigation. Si la géométrie courante est celle du parcours restant, le HUD le dit explicitement. Les distances issues d'une géométrie simplifiée sont approximatives.

## Validation

`test_live_route.js` couvre géométrie, immutabilité, distances, orientations, GPS périmé/imprécis, suspension, téléportation, croisements et météo ponctuelle. `e2e81-live-route.js` exerce la vraie vue Garage et Leaflet sur fixtures uniquement : PC/iPhone, deux thèmes, 320/375/414/1280 px, curseur/clavier, lecture/pause, réduction du mouvement, conservation du zoom/focus, GPS et nettoyage. Les deux suites sont inscrites dans le registre CI existant et ses contrôles de couverture : 121 suites, 180 exécutions applicables.

La matrice distante complète sur le SHA exact reste nécessaire avant fusion. L'environnement local refuse le démarrage Chromium (`socket(): Operation not permitted`) ; cet échec d'environnement ne vaut pas validation navigateur. Aucun essai Safari/PWA sur iPhone physique n'a été effectué.

Retour arrière : revert de la PR applicative ; aucune opération de restauration de données n'est nécessaire.
