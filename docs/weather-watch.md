# Weather Watch PC

Le bouton facultatif **🖥️ Mode Station** de Météo ouvre un cockpit dans une fenêtre modale. Fermer la station ou appuyer sur Échap restitue la vue, le focus et le défilement. Les cinq onglets gardent leur ordre et leurs interactions. Le bouton est masqué sur les appareils tactiles sans pointeur précis, dont le profil iPhone 11 Pro Max.

## Données et sources

| Affichage | Source existante |
| --- | --- |
| Température principale, ressenti | `wxDesk(wxInput()).current`, exactement comme Météo |
| Courbe et 12 heures à venir | `wxDesk().timeline.strip`, échéances réellement disponibles |
| Pluie, vent, rafales | Heure du modèle canonique ; AROME lorsque intégré, sinon modèle de base |
| Probabilité de pluie, visibilité | Modèle de base Open-Meteo |
| Chaussée, gel, verglas | `Tr` et `ice` déjà calculés par le moteur Race Control |
| Risque routier, prochain changement | Résultats du moteur Météo, avec sa période explicite |
| Station réelle, si disponible | `model.obs`, nom et horodatage du relevé conservés |

Il n'existe ni second moteur météo, ni nouveau fournisseur, ni score/confiance synthétique. Les températures des modèles ne sont jamais appelées mesures de station. Le cache affiche son âge et son statut. Une valeur actuelle de modèle vieille de plus de 30 min ne permet pas d'alerte fraîche, même si sa réponse vient d'être téléchargée.

## Surveillance et limites

Le minuteur existant vérifie toutes les 30 secondes l'échéance normale de cinq minutes. Quand la station est ouverte, il peut aussi travailler dans un onglet masqué. Une vérification de l'heure assure la progression locale des échéances hors ligne. Les événements existants de visibilité, focus, pageshow et réseau reprennent le moteur après suspension. Le fournisseur reste protégé par son gestionnaire de concurrence, caches et pause HTTP 429.

La surveillance cesse lorsque la station est fermée. Un navigateur fermé, une page suspendue ou un PC en veille ne permet aucune garantie d'exécution ou de notification. Il n'y a ni contournement des restrictions, ni service distant, ni nouveau timer permanent.

Pour deux stations utilisant les mêmes lieux, Web Locks refuse les actualisations automatiques simultanées. Seul un hash des requêtes figure dans le nom du verrou. Les mises à jour autorisées du coffre existant permettent d'adopter le cache météo plus récent, après vérification du lieu, des coordonnées, du contenu et de l'heure. Aucun BroadcastChannel de données privées ni nouvelle clé persistante. Cette coordination est **best effort** : elle ne prétend pas dédupliquer chaque requête de chaque application, les actualisations manuelles, ni les phases de démarrage.

Références des capacités navigateur : [visibilité et minuteurs](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), [Document Picture-in-Picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture).

## Alertes volontaires

Les alertes sont désactivées à l'ouverture initiale. Elles ne se déclenchent que sur données fraîches, en ligne, hors démo, couvertes par les prévisions et reçues depuis au plus 15 minutes.

| Seuil | Réarmement / règle |
| --- | --- |
| Air sous 7, 3 et 0 °C | Seuil +0,5 °C |
| Visibilité sous 1 000 et 500 m | Seuil +200 / +100 m |
| Gel / verglas | Hausse du niveau estimé existant |
| Pluie possible dans l'heure | Quantité ≥0,2 mm/h **ou** probabilité ≥60 % |
| Rafales | Hausse ≥15 km/h, valeur ≥55 km/h |
| Risque routier | Hausse du niveau existant, période Météo explicitée |

Déduplication par phénomène et lieu ; temporisation réglable à 5, 15, 30 ou 60 min. Une nouvelle base est établie à l'activation, à la réouverture et à la reconnexion : pas de notification rétroactive sur cache. Le mode silencieux conserve les alertes visuelles.

Les notifications Windows sont une option distincte, demandée par clic. Refus ou API absente laisse les alertes visuelles utilisables. Les messages système sont génériques, sans lieu, trajet, valeur privée ou donnée de véhicule. L'application n'en garantit pas la délivrance par le navigateur ou Windows.

## Journal et mini-cockpit

Le journal distingue mesures observées, révisions de prévision à échéance identique, estimations recalculées et changements de statut. Un simple écoulement du temps ou un téléchargement identique ne crée pas d'observation ou de révision. L'historique est en mémoire uniquement : 60 événements et 12 alertes par lieu, huit lieux au plus. Le fermer/recharger ne modifie pas les caches ou préférences existants.

Document Picture-in-Picture est ouvert exclusivement sur demande lorsque l'API existe. Il affiche les mêmes données et leur fraîcheur, sans second timer ni requête météo. En cas d'absence ou de refus, la station reste utilisable. Les fenêtres Station et mini-cockpit se ferment lors de la fermeture de la page ou de l'expiration de session ; aucun mécanisme d'authentification ou de chiffrement n'est remplacé.

## Validation et intégration

`test_weather_watch.js` couvre les seuils, la provenance, les données manquantes, l'hystérésis, la rétention et le journal. `e2e74-weather-watch.js` ajoute les scénarios PC, petits écrans, iPhone simulé, permissions, mini-fenêtre, cache, HTTP 429, reprise, coordination et expiration. Les suites rejoignent le registre obligatoire et sa couverture exacte. Les captures CI contiennent exclusivement le préréglage fictif du harnais existant.

Cette mission doit rester dans sa PR dédiée, sans fusion ni déploiement avant accord explicite du propriétaire et contrôles verts. Base examinée : prod-94, `a71fd211`. La PR #120 reste indépendante : seuls l'ajout du bouton Météo et ses règles CSS demandent une vérification d'intégration ; ses fichiers et sa branche ne sont pas modifiés.

Une simulation WebKit ne constitue pas un test sur iPhone physique. La veille et les notifications sont simulées dans les tests, pas testées sur un PC Windows réel.
