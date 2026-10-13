# Rendez-vous Agenda et retour automatique

Cette correction est indépendante de Forteresse III. Base : `b061211259a9fd669c2a5971e03386defc869d25`. Publication en PR **Draft uniquement**, sans fusion, déploiement manuel ni modification du calendrier réel.

## Cause vérifiée

La timeline trie les départs par heure : un retour domicile-travail automatique peut précéder un rendez-vous dont l’origine est pourtant le travail. Le bouton `appChooseAgendaDestination` déléguait aussi à la sélection générique d’une destination : celle-ci pouvait retenir la clé et l’heure du commute au lieu du rendez-vous cliqué. Le nouveau test unitaire reproduit cette mauvaise clé sur la base avant correction.

Un troisième défaut entretenait ce choix : si la clé disparaissait après actualisation ou annulation, `appLocalTrips` pouvait fabriquer un trajet local à sa place.

## Comportement proposé

- Le bouton Agenda sélectionne la vraie occurrence, avec son identifiant technique opaque, sa clé de trajet et son heure. Il refuse les occurrences ambiguës ou annulées, ainsi qu’un remplacement pendant un départ déjà engagé.
- À chaque projection, la sélection suit les données actuelles de cette même occurrence. Une nouvelle destination/route actualise le point, la clé et l’heure ; l’ancien point ne remplace jamais la destination reçue du calendrier. Aucun lieu proche ne remplace l’adresse exacte.
- Une occurrence absente, annulée, terminée ou non spatiale perd sa sélection ; aucun trajet local n’est fabriqué. Un calendrier temporairement absent garde la sélection en attente et ne la substitue pas par un commute.
- Depuis un travail réellement confirmé (manuel ou GPS précis), un aller Agenda depuis ce travail écarte le retour automatique du même jour incompatible avec le rendez-vous. Le conflit est visible dans Météo et Pneus. Cette exclusion est une projection en mémoire, pas une annulation persistée.
- Un domicile ou trajet manuel explicitement choisi reste prioritaire. Un départ réel et une demande explicite de retour maison sont préservés. Aucun déplacement par le domicile n’est inventé, aucun horaire de travail n’est modifié et aucun appel d’écriture Google Agenda n’est ajouté.
- Météo, Pneus, Trajet et Analyse consomment la même timeline. Un itinéraire prioritaire en attente reste affiché comme tel ; Analyse attend ses données au lieu de calculer un autre trajet.

## Vérifications reproductibles

```sh
node tests/run-ci.js --lane unit
node tests/run-ci.js --lane browser --suite e2e55-day-context.js
BROWSER=webkit node tests/run-ci.js --lane browser --suite e2e55-day-context.js
node tools/check-secrets.js
node tests/ci/syntax.js
```

Les fixtures, codes, agendas, positions et réponses réseau sont fictifs. Les navigateurs de test refusent le réseau réel et les Service Workers. L’E2E couvre PC/iPhone, profils configuré et vierge, sélection exacte, conflit avant/après travail, quatre onglets, rechargement chiffré, calendrier absent, changement d’adresse et d’heure, annulation locale, suppression du rendez-vous et choix explicite du domicile. Les scénarios unitaires ajoutent les occurrences simultanées au même lieu, l’ambiguïté, les trajets engagés et les conditions qui doivent conserver le retour.

Les résultats réellement exécutés et le SHA exact de la PR sont consignés dans sa description et ses checks. Une erreur d’installation locale des navigateurs n’est pas un succès de test. Le scan local sans clés ne couvre que les motifs génériques ; le scan privé de la PR reste obligatoire.

## Limites et rollback

La priorité automatique exige un lieu de travail fiable et une origine Agenda compatible ; elle n’invente aucune position lorsque ces éléments manquent. Un changement d’horaire de l’événement qui change l’identifiant d’occurrence exige une nouvelle sélection. Une source Agenda ancienne mais encore lisible reste soumise aux indicateurs de fraîcheur existants. Les notifications cloud suivent toujours leur calendrier et ne reçoivent pas cette projection locale. Aucun iPhone physique n’est testé par ces simulations.

Le champ technique facultatif de sélection reste dans le document canonique chiffré existant ; il n’ajoute pas de store ni de format de coffre. Aucun moteur météo, GPS, usure, secret, permission, workflow, protection de branche ou Service Worker n’est changé.

Rollback après éventuelle revue et fusion autorisée : revert du commit de cette PR par une nouvelle PR, puis CI complète et publication habituelle. Aucune réinitialisation de réglages, historique ou cache utilisateur n’est nécessaire.
