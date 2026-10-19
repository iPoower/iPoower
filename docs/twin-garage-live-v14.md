# Twin Garage Live V1.4

Le Garage conserve ses deux fiches complètes, les commandes de sélection et de modification, et ajoute des silhouettes SVG et une prévisualisation du prochain trajet. Le lien en tête mène à la scène ; les commandes des véhicules restent accessibles dans le premier écran mobile. Les styles utilisent exclusivement les variables et composants existants, dans une feuille limitée à `#secGarage` et assemblée avec la vue.

## Contrat des données

| Présentation | Source existante | Limite visible |
| --- | --- | --- |
| Véhicules, configuration, compteur | `S.cars`, `Garage.overview` | Dernier relevé daté, aucun compteur simulé |
| Monte, profondeur, pression, qualité | `tyreStateOf` / `tyreState` | Déclaration, estimation et contrôle daté distingués ; aucune pression instantanée |
| Prochain trajet | `APP_CONTEXT.snapshot.nextTrip` | Aucun trajet créé pour la scène |
| Points météo | `trip.seq` et modèles déjà chargés de `M`, `MIDM`, `CALM`, `LEGM` | Au plus trois points affichés, contrôle de couverture sur la séquence entière |
| Réception et fraîcheur | Horodatages des caches existants, `Reliability.freshState` | Prévision, cache, ancien, incomplet et hors ligne distingués |
| Jour / nuit | Heure de passage connue et éphémérides du modèle correspondant | Aucun horaire solaire ou passage intermédiaire deviné |
| Vigilances pneumatiques | `trip.res`, résultat existant de `windowAssess` | Pas de nouveau moteur, score ou classement de sécurité |

Le dessin reste explicitement **schématique, illustratif et sans échelle**. La boucle ne mesure ni position GPS ni progression. Aucun calcul de vitesse, distance, adhérence ou température mesurée de chaussée. Les silhouettes sont stylisées et leur teinte illustrative ; aucun véhicule ni profil ne sont codés en dur.

Pluie et neige nécessitent une valeur ou un code météo correspondant. Le brouillard nécessite un code explicite ; une faible visibilité seule ne devient pas un brouillard. Le vent n'a un mouvement directionnel que si la direction est fournie ; sa provenance météorologique est convertie en sens d’écoulement dans le SVG. Le mode démonstration reste identifié comme simulation et ne produit pas de comparaison fiable. Sans prévision ou provenance suffisamment complète, la scène demeure statique. Hors ligne, les fiches et les prévisions déjà disponibles restent consultables et identifiées comme telles.

La comparaison reprend les contrôles et signaux du moteur, avec les éléments manquants. **DONNÉES INSUFFISANTES** apparaît si la couverture ou les mesures déclarées ne permettent pas une lecture fiable. Aucun véhicule n'est désigné comme objectivement plus sûr.

## Performance et accessibilité

Aucune dépendance, image externe, requête météo, nouvelle clé de stockage ou minuterie d'animation. SVG et animations CSS de transform uniquement ; un `IntersectionObserver` suspend le mouvement hors écran. Pause manuelle accessible au clavier, pause en arrière-plan, événements `pagehide` / `pageshow`, et `prefers-reduced-motion`.

Le Garage rejoint le cycle minute de V1.3 par un appel de rendu dans `renderTemporalWeather`, sans minuteur supplémentaire. La vue étant en lecture seule, le contrôle d’animation focalisé reste conservé et n’empêche pas la projection de progresser.

Le rendu est séparé en trois parties. Des entrées identiques ne remplacent aucun nœud enfant ; une modification de météo ne reconstruit pas les fiches. Focus, panneaux `uxFold`, plans hiver et défilement sont conservés pendant les actualisations.

Mesure locale sur profil entièrement fictif : cinquante projections identiques, zéro mutation enfant et zéro requête supplémentaire. Sur la composition locale avec V1.3, ces cinquante projections ont pris 28 ms dans Chromium et 31 ms dans WebKit. Le temps mesuré est conservé dans les rapports du test navigateur ; il ne constitue pas une mesure de batterie ou un benchmark d'iPhone physique. L'ajout de code est d'environ 28 ko avant compression. Le profilage comparatif GitHub reste requis sur la tête finale.

## Recette reproductible

Les 54 suites unitaires locales de la composition V1.3 + V1.4 réussissent. Les suites Garage et bandeau LIVE réussissent aussi dans les deux moteurs, y compris le cycle minute avec un contrôle focalisé.

Les suites existantes `test_garage.js` et `e2e71-garage.js` sont enrichies ; aucun scénario historique n'est retiré. Le registre et les workflows restent inchangés.

- 18 scénarios unitaires Garage : immutabilité, réception inconnue/future, cache ancien, zéro degré, séquence incomplète, effets documentés, silhouettes, transition jour/nuit, comparaison et mode démonstration.
- Garage navigateur : comportements historiques et 20 scénarios Twin, 320/375/414/1440 px, thèmes clair/sombre et automatique, focus et clavier, sources échappées, intersection réelle, suspension/reprise, cycle minute V1.3, absence de trajet/météo, hors ligne et CSP.
- Régression des modules F1 et des cinq onglets via `e2e70-f1-pure.js` et `e2e72-mobile-ux.js`.
- Validation finale : toutes les suites unitaires et les six shards Chromium/WebKit, confidentialité, relais, agrégation, QA et profilage GitHub sur le SHA exact.

Commandes : `node tests/run-ci.js --lane unit`, puis `node tests/run-ci.js --reuse --lane browser --suite e2e71-garage.js --suite e2e72-mobile-ux.js --suite e2e70-f1-pure.js`, à répéter avec `BROWSER=webkit`.

Les captures ci-dessous utilisent exclusivement des configurations et trajets fictifs. La bande fixe globale est masquée pour la capture pleine hauteur seulement. **Aucun essai iPhone physique et aucune mesure de batterie réelle.**

| Chromium | WebKit |
| --- | --- |
| [414 px sombre](twin-garage-v14/twin-chromium-dark-414.jpg) | [414 px clair](twin-garage-v14/twin-webkit-light-414.jpg) |
| [1440 px clair](twin-garage-v14/twin-chromium-light-1440.jpg) | [1440 px sombre](twin-garage-v14/twin-webkit-dark-1440.jpg) |

## Intégration

Branche indépendante `feat/twin-garage-live-v14`. Aucun changement propre à cette PR dans `src/app.js`, `src/style.css`, workflows, build, chiffrement, sauvegarde, migration, profil ou Service Worker. Le seul raccord au lifecycle V1.3 est l’appel du rendu du Garage dans le cycle minute existant. Aucun travail de la PR #186 modifié.

La fusion de cette évolution ordinaire exige d'abord la fusion **et la publication vérifiée** de #186, puis l'intégration du nouveau `main` et une validation complète sur la tête exacte, sans revue bloquante. Après fusion : CI de `main`, déploiement Pages, `version.json` et build effectivement servi à vérifier séparément. Retour arrière logiciel par revert, sans migration de données.
