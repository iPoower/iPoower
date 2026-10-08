# Live Road Intelligence — revue de livraison

Base : `main` à `7c7a0d59b4c39963f2e65d1a412e38997b3b399a` (prod-32 vérifiée). Branche : `feat/live-road-intelligence`. Recherche effectuée le 5 octobre 2026. La livraison nécessite la réussite du registre complet et des contrôles de confidentialité.

## Fournisseurs examinés

| Fournisseur | Données et couverture | Authentification, quota gratuit, premier tarif payant publié | Décision pour cette livraison |
|---|---|---|---|
| DATEX Bison Futé / DIR | Événements du réseau national **non concédé**, couverture partielle. Les autoroutes concédées ne sont pas incluses. Publications horodatées et mises à jour incrémentales. | Aucune clé ; données gratuites ; quota technique non publié. | **GO avec limites** : seul fournisseur activé. |
| TomTom Traffic | Incidents et flow sont deux produits distincts ; couverture commerciale à confirmer pour les axes retenus. | Clé ; 2 500 appels Details/mois, 20 000 Segment Data/mois, 200 000 tuiles/mois gratuits. Tarif payant exact non confirmé dans le calculateur consultable : aucune dépense engagée. | **NO-GO activation** : contrat d’usage automobile/navigation et conditions du cache à valider. Candidat ultérieur pour incidents + vitesses. |
| Google Routes | ETA et catégories de congestion liés à une route Google ; ne fournit pas le flux d’incidents indépendant souhaité. | Clé et facturation ; Compute Routes Pro : 5 000/mois gratuits puis 10 USD/1 000 au premier palier. Le SKU dépend des options. | **NO-GO dans ce périmètre** : second moteur de trajet et contraintes contractuelles de combinaison/affichage. |
| HERE Traffic | Offre incidents + flow ; couverture France, fréquence et contrat du compte non confirmés. | Authentification requise ; page tarifaire inaccessible (403), quota et prix actuels non confirmés. | **NO-GO activation** : documentation contractuelle et coûts incomplets. Aucun appel commercial. |
| Mapbox Directions | `driving-traffic` retourne congestion/incidents associés à la route Mapbox, disponibilité géographique à vérifier. | Token ; Directions : 100 000/mois gratuits puis 2 USD/1 000 au premier palier. | **NO-GO dans ce périmètre** : dépend d’une seconde route. Pas de token ni de nouveau moteur. |

Ces chiffres sont ceux des pages publiques consultées à cette date, en USD hors conversion/fiscalité. Une offre gratuite n’autorise pas tous les usages. Les quotas commerciaux ne servent à aucun appel dans cette PR.

| Fournisseur | Cache, stockage, polling, attribution et usage automobile/navigation | Cloudflare / intégration |
|---|---|---|
| DATEX DIR ouvert | Licence Ouverte 2.0 ; réutilisation et stockage avec attribution et date. Attribution Bison Futé / DIR et horodatages visibles. Une ingestion serveur globale toutes les 8 min ; polling client adaptatif. Les accès concédés et leurs conditions sont exclus. | Normalisation Python côté GitHub Actions ; aucun secret fournisseur. Worker optionnel inutile pour protéger une clé absente. |
| TomTom | Les conditions standard consultées, §2.1 et §11.4, excluent certains usages automobile/navigation sans accord et limitent stockage/cache aux autorisations explicites des réponses ; le cache mutualisé ne peut être présumé autorisé. Attribution et contrat exact à confirmer. Polling futur borné par contrat et quota. | Un proxy ne lève aucune restriction. Un éventuel bridge garderait la clé côté serveur et le cache désactivé par défaut. Aucun bridge n’est activé. |
| Google | Restrictions de stockage et obligations d’attribution ; règles EEE à examiner avec l’adresse de facturation française. Combinaison avec OSRM non validée. Aucun polling ni stockage. | Aucun proxy/clé, aucune route Google. |
| HERE | Droits de stockage, cache, navigation, attribution et polling non validés pour un compte identifié. | Aucun proxy/clé ; ne pas activer sur la base d’hypothèses de licence. |
| Mapbox | Attribution/conditions Directions et limites de stockage à valider pour l’usage exact ; pas de polling, de copie ni de cache de contenu Mapbox. | Aucun proxy/token ; Directions n’est pas utilisé. |

Sources primaires : [DATEX et conditions Bison Futé](https://www.bison-fute.gouv.fr/donnees-sur-la-circulation-du.html), [Licence Ouverte 2.0](https://www.etalab.gouv.fr/wp-content/uploads/2017/04/ETALAB-Licence-Ouverte-v2.0.pdf), [flux DIR ouvert](https://tipi.bison-fute.gouv.fr/bison-fute-ouvert/publicationsDIR/Evenementiel-DIR/grt/RRN/), [TomTom pricing](https://docs.tomtom.com/pricing), [TomTom terms](https://docs.tomtom.com/legal/terms-and-conditions/), [TomTom Traffic introduction](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/product-information/introduction/), [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [Google Routes policies](https://developers.google.com/maps/documentation/routes/policies), [Google service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), [HERE pricing](https://www.here.com/get-started/pricing), [HERE Traffic API](https://www.here.com/docs/bundle/traffic-api-v7-api-reference/page/index.html), [Mapbox pricing](https://www.mapbox.com/pricing), [Mapbox Directions](https://docs.mapbox.com/api/navigation/directions/), [Mapbox terms](https://www.mapbox.com/legal/tos).

## Architecture et vérité des données

`tools/road-datex/sync.py` lit `index.txt`, reconstruit le snapshot `content.xml`, puis applique chaque fichier numéroté dans l’ordre. Les curseurs DIR désignent le prochain delta : le curseur du snapshot est inclus, l’index cible est exclu. Un delta déclarant un curseur incohérent est rejeté ; les deltas DIR réels peuvent omettre ce champ. Le snapshot est reconstruit à chaque ingestion pour conserver correctement les situations futures ou suspendues absentes du JSON filtré. Les XML restent côté serveur. Un trou, une date impossible, une méthode partielle inconnue, un dépassement du budget de 180 s ou des bornes de taille provoquent un échec : le dernier fichier publié garde ses anciens horodatages.

Les deltas `allElementUpdate` remplacent la situation complète. Une situation vide, terminée, suspendue ou expirée disparaît. La validité est évaluée après l’application des deltas ; une période d’exclusion active ou impossible à interpréter masque l’événement. Les fenêtres récurrentes non interprétables et les restrictions réservées à d’autres véhicules sont masquées. Les mises à jour partielles `singleElementUpdate` ne sont pas interprétées : elles bloquent la publication, au lieu d’effacer arbitrairement d’autres enregistrements.

Le workflow `road-datex.yml`, uniquement sur `main`, publie le seul fichier public `road-datex.json` sur `gh-pages`, sans toucher aux fichiers météo ou agenda. Il est déclenché à la fin du relais météo ou du watchdog sur `main`, y compris si la météo a échoué : l’horloge externe existante entraîne ainsi l’ingestion routière. Le checkout du normaliseur reste explicitement sur `main` et les runs d’un autre dépôt sont rejetés. Le cron natif GitHub, le déclenchement manuel et les modifications du normaliseur sur `main` restent des possibilités de rattrapage. La concurrence commune `race-control-relay` sérialise les publications. Le déploiement de l’application et ses retours arrière conservent ce flux. Le relais Cloudflare existant n’est ni modifié ni redéployé. Aucun Worker supplémentaire n’est déployé : le parsing XML est exécuté sur GitHub, ce qui évite de supposer qu’il tient dans un budget CPU gratuit de Worker.

Incident du 6 octobre 2026 : à 06:02 (Paris), le flux publié était encore celui de la resynchronisation manuelle de 03:41, soit 141 minutes. Aucun run DATEX planifié n’avait démarré, alors que les relais météo issus de l’horloge terminaient toutes les 8 à 9 minutes. Le raccordement `workflow_run` corrige ce défaut de renouvellement ; il ne modifie aucun seuil de fraîcheur et ne transforme jamais une publication ancienne en donnée LIVE. La CI inclut désormais les modifications du workflow DATEX dans son filtre `push`.

Dans le navigateur, `RoadProvider` et `Manager` isolent activation, erreurs HTTP, quota, timeout de 8 s, retry, circuit, annulation et cache autorisé. `DatexRoadProvider` demande uniquement le fichier public global : aucune position, agenda, destination ou clé dans la requête. Chaque fournisseur peut être remplacé sans modifier le moteur OSRM. Le cache est interdit par défaut et n’est autorisé que pour DATEX dans cette livraison.

`liveParse` conserve les sorties existantes du trajet météo et ajoute un index spatial de la géométrie complète OSRM. Le même appel OSRM, en aperçu comme en trajet actif, reçoit `steps=true` pour connaître les axes ; aucun calcul de route supplémentaire pour DATEX. Les axes suivent la géométrie complète de chaque étape, y compris après une boucle ; une étape incohérente invalide la corrélation. La corrélation exige un GPS frais et précis, une proximité de la polyline, un axe connu et concordant, un sens compatible, la validité et la progression. Un point dépassé, une route voisine, un croisement ambigu ou une section non empruntée est rejeté. Une géométrie DATEX linéaire représente ses bornes, pas une polyline à interpoler aveuglément.

Les événements conservent les identifiants, producteur, horodatages et référence source. Une fusion entre fournisseurs nécessite type/axe/sens compatibles, proximité, dates et validités concordantes ; elle conserve chaque provenance. Les essais de fusion sont bornés dans les zones denses. Un événement dont la fin précède sa rencontre estimée est masqué. Les vitesses sont traitées séparément des incidents ; bouchon et ralentissement ne sont déclarés que par leur type DATEX explicite. Une vitesse faible ne crée jamais un accident. Les valeurs absentes restent `null`.

## Affichage, fraîcheur et vie du trajet

Une carte compacte dans Pneus affiche la source, sa couverture partielle, son âge, les trois prochains signalements, distance sur la route et rencontre approximative selon les durées OSRM. Les détails contiennent les horodatages et provenances. Les autres onglets et leurs verdicts ne sont pas modifiés par les événements routiers.

| Situation | Comportement |
|---|---|
| Réponse complète confirmée, vérification **et** publication ≤ 2 min | `LIVE` ; alertes visuelles possibles pour un événement sévère récent devant soi, en trajet actif. |
| Réponse confirmée entre 2 et 12 min | `Récent`, âge visible ; aucune alerte nouvelle. |
| Panne, copie SW ou cache local | Cache/non vérifié ou panne visible ; jamais `LIVE`. |
| Hors ligne | Cache daté éventuellement affiché jusqu’à 12 min ; aucune alerte LIVE. |
| Flux > 12 min | Événements masqués, source périmée. |
| Cache > 24 h | Copie supprimée. |
| GPS incertain, route périmée, dérive ou axe/sens inconnu | Signalements masqués ; repli GPS/OSRM/météo habituel. |
| Arrivée, annulation, changement de trajet ou de route | Réponses anciennes invalidées, anciennes alertes retirées, contexte recalculé. |
| App masquée ou fournisseur désactivé | Requêtes interrompues ; reprise selon cadence et contexte. |

Les alertes sont dédupliquées en mémoire, espacées d’au moins 5 min et retirées après 45 s ou passage/expiration. Elles sont visuelles pendant que l’app est ouverte. Aucune notification iOS app fermée n’est annoncée. L’ETA reste OSRM, explicitement sans trafic ; aucun retard fictif n’est ajouté. Le flux événementiel activé ne fournit pas de vitesses/free-flow, donc ces champs et l’ETA trafic sont indisponibles.

## PWA, confidentialité et performance

Le SW passe de `twrc-static-v9` à `twrc-static-v10` pour ce nouveau shell et conserve `twrc-data-v3`. Le cache DATEX a une clé canonique, une validation minimale et une rétention de 24 h. Une réponse de secours porte `X-TWRC-Cache: fallback`, qui interdit le statut LIVE même si son contenu est récent. Un refus de Cache Storage ou un quota plein n'empêche pas de lire une réponse réseau valide. Les futures URLs de bridge commercial sont exclues du cache implicite du shell. Les requêtes externes et coordonnées restent exclues de Cache Storage.

`twrc.road.datex` ne contient que le flux public non filtré. GPS, progression, itinéraire, ETA personnelle et historique d’alerte restent en mémoire. Aucun secret, donnée d’agenda, position privée ou notification personnelle n’est ajouté au dépôt public. L’ajout du réglage `road.on` utilise la normalisation de paramètres existante, sans modifier le chiffrement ou les migrations antérieures.

Essai serveur réel après revue du 5 octobre : **494 événements**, curseur **3571271** (prochain delta), publication **2026-10-05T22:31:33.052+02:00**, JSON **515 554 octets**, ingestion **14,45 s**. C’est une observation ponctuelle, pas une garantie de fréquence. Aucun de ces événements réels n’est commité comme fixture. Le client reçoit le JSON compact, pas les ~4,3 Mo du snapshot XML.

Le filtre utilise des cellules spatiales, des bornes de géométrie et un nombre limité de résultats visibles. Le polling visible varie de 10 min avant départ à 2 min imminent, puis 60 s en trajet et 30 s près d’un événement. L’ingestion suit les fins de relais de l’horloge externe ; le cron GitHub reste une relève toutes les 8 min, **sans garantie de ponctualité**. Aucun déclencheur ne justifie à lui seul le mot LIVE : l’âge de la publication réelle décide. Les retards de publication ou du fournisseur dégradent l’affichage.

## Validation et limites de livraison

- Build sans données privées et syntaxe JavaScript validés localement.
- **25 suites unitaires au vert**, incluant **45 scénarios routiers/DATEX/SW** et les pannes de Cache Storage ; suites historiques conservées.
- Registre complet : **57 suites**, **86 exécutions** prévues (25 unitaires, 32 Chromium, 29 WebKit).
- Nouveaux E2E : cockpit PC et iPhone 11 Pro Max 414×896 sur Chromium/WebKit ; SW réel Chromium, migration, cache, offline, 503, invalidité et protection de futurs bridges.
- Les [contrôles de la PR #37](https://github.com/iPoower/iPoower/pull/37/checks) donnent les preuves du commit courant. La validation exige les sept rapports du même code, sans suite absente ou dupliquée, ainsi que le contrôle de confidentialité.
- L’[incident GitHub Actions du 5 octobre](https://www.githubstatus.com/) a annulé cinq shards avant leur exécution ; le contrôle final signalait `tests (abandoned)`. Ces annulations ne constituent pas une preuve de régression. Les validations sont relancées après reprise des runners.
- iPhone physique/Safari réel non testé ; WebKit avec viewport iPhone ne remplace pas un essai sur appareil.

Limites connues : couverture DIR partielle ; événements récurrents ou direction/axe inconnus masqués ; pas de garantie d’identification verticale pont/tunnel lorsque les données ne permettent pas de distinguer la chaussée ; pas de vitesse trafic, pas d’ETA trafic ; cache récent ne prouve pas l’état actuel ; cadence de publication GitHub non garantie. Les fournisseurs commerciaux sont non activés.

| Fichiers | Rôle |
|---|---|
| `tools/road-datex/sync.py`, `.github/workflows/road-datex.yml` | Ingestion et publication du seul flux public DATEX. |
| `src/road-intelligence.js`, `src/road-providers.js` | Contrat commun, index OSRM, corrélation, état fournisseur et cache licite. |
| `src/app/road-view.js`, `src/app.js`, `src/shell.html`, `src/style.css` | Carte compacte, branchement au trajet existant et réglage de désactivation. |
| `src/sw.js`, `tools/build.js`, `tools/deploy-copy.js` | Assemblage, migration du shell, cache avec provenance et préservation du flux au déploiement. |
| `tests/test_road_intelligence.js`, `tests/test_road_providers.js`, `tests/test_road_datex.js`, `tests/road_datex_test.py`, `tests/lib/road-fixtures.js` | Modèles, pannes, protocole DATEX, validité, confidentialité et erreurs de stockage, données fictives. |
| `tests/e2e51-road.js`, `tests/e2e52-road-sw.js`, `tests/ci/suites.js`, `tests/test_ci_lanes.js` | Scénarios navigateur requis et couverture exacte sans retirer les tests historiques. |
| `docs/live-road-intelligence.md` | Recherche, choix, fonctionnement, preuves et limites. |

**Décision de revue : GO avec limites pour DATEX/OSRM uniquement après registre complet Chromium/WebKit et CI de la PR au vert. Aucune fusion sans validation de Bryan.**
