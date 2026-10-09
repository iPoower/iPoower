# JARVIS — baseline et optimisations localisées, 9 octobre 2026

PR : [#89](https://github.com/iPoower/iPoower/pull/89). Base : `da44b9a4ec00885ef0158d8bedb4bf56972bf684` (prod-73).
Code optimisé mesuré : `a1e63bee993f61a938e913107871ff6ce00b295d`.
**Aucune fusion ni publication de ce lot sans accord explicite.**

## Protection et méthode

Branche dédiée `perf/jarvis-baseline-20261009`, worktree indépendant. État distant inspecté avant intervention : #87 occupe `src/app/trip-view.js`, `src/geosearch.js` et leurs tests ; #86 occupe les protections GitHub ; #82 occupe la documentation de portfolio. Aucun de ces fichiers, PR ou branches n'est modifié.

La [première mesure](https://github.com/iPoower/iPoower/actions/runs/37898159993) précède les optimisations : sources applicatives identiques à la base, seuls le harnais et son workflow sont ajoutés. La [comparaison après modification](https://github.com/iPoower/iPoower/actions/runs/37899047779) reconstruit base et candidat sur le même runner pour chaque moteur. Les rapports JSON des deux navigateurs sont disponibles dans ces runs pendant 14 jours ; les valeurs essentielles sont conservées ici.

Chromium et WebKit, profils 414×896 / tactile / échelle 3 et PC 1440×900. Ce n'est **pas** un iPhone physique. Pas de throttling CPU artificiel. Date métier fixe, mais `performance.now()` réelle : ne pas utiliser l'horloge Playwright pour chronométrer du travail CPU. Chaque build utilise un contexte froid, un préréglage et des clés fictifs ; le trafic extérieur est intercepté, et un proxy injoignable bloque toute fuite. Même fixture météo issue de la base pour les deux builds. Ordre avant/après inversé sur PC. Neuf lots après trois appels de chauffe ; médiane et p95 conservés dans les rapports. Le SW est bloqué dans ce profilage et couvert séparément par les E2E historiques à SW réel.

Les temps sont des observations de runner, pas des garanties sur mobile. Les démarrages ne sont mesurés qu'une fois par profil : le premier contexte WebKit est sensiblement plus lent, même sans modification. **Aucun gain de chargement initial n'est revendiqué.**

## Photographie AVANT

| Module | Lignes avant | Responsabilité / constat |
|---|---:|---|
| `src/app.js` | 3 850 | Orchestration, réseau, nombreux rendus et trajet ; inclut dix sections, soit environ 5 104 lignes assemblées. |
| `src/engine.js` | 941 | Physique, temps, modèles, verdicts et recalage station. |
| `src/relay.js` | 399 | Observations publiques, agenda chiffré et notifications serveur. |
| `src/wardrobe.js` | 86 | Conseil de tenue pur ; pas une cible justifiant une refonte. |
| `src/style.css` | 925 | Mise en page mobile / PC ; aucune règle supprimée sans preuve visuelle. |
| `src/sw.js` | 101 | Shell réseau d'abord, données canoniques, secours hors ligne. |
| `src/weather-requests.js` | 117 | Deux téléchargements simultanés maximum, doublons partagés, cache RAM borné, pause 429. |
| `tools/build.js` | 94 | Assemblage autonome, chiffrement, CSP par empreintes et scanner. |

Build fictif avant : HTML **954 032 octets** ; JS intégré **865 731** ; CSS intégré **81 217**. Gzip niveau 9 : JS environ **279 086**, CSS **16 168**, HTML environ **297 951** octets. Les chiffrés sont générés avec IV/sel aléatoires : quelques octets gzip peuvent varier sans changement de code. JS et CSS sont intégrés au HTML : **ne pas additionner leur gzip à celui du HTML**.

Contrôle HTTP public séparé : prod-73 / build `0cae10ac264a` confirmé par `version.json`. GET gzip de la page : **333 280 octets reçus**, HTTP 200, TTFB **5,638 s**, total **5,713 s** depuis l'environnement d'audit. Cette mesure ponctuelle inclut son réseau/proxy ; ce n'est ni le temps de rendu ni une latence iPhone. L'enveloppe chiffrée réelle diffère de la fixture : ne pas comparer ce poids de production au poids du build fictif pour annoncer un gain.

| Mesure avant, run comparatif | Chromium iPhone simulé | WebKit iPhone simulé |
|---|---:|---:|
| Premier contexte générique, mesure unique | 595 ms | 3 518 ms |
| `renderAll`, médiane | 24,77 ms | 30,67 ms |
| `rebuild`, médiane | 13,00 ms | 10,00 ms |
| `renderView`, médiane de lots de 100 | 0,031 ms | 0,040 ms |
| Navigation : remplacements pour 903 appels identiques | 903 | 903 |
| Focus conservé après ces appels | Non | Non |
| Requêtes Open-Meteo jusqu'à disponibilité, y compris ouverture générique + déverrouillage/reload | 25 | 25 |

Sur la première baseline Chromium : interaction → prochain `requestAnimationFrame`, médiane 28,7 ms mobile / 28,5 ms PC ; DOM 1 372 / 1 413 éléments. Ces cinq interactions ne constituent pas une mesure INP. Mémoire Chromium rapportée grossièrement autour de 50,4 Mo ; pas de mesure de fuite sur session longue, ni de mémoire/énergie sur iPhone. Les tâches longues ne sont disponibles que si le moteur expose l'observateur ; `null` signifie indisponible, pas zéro.

### Réseau, cache, GPS et PWA

- Open-Meteo : les URLs identiques en cours sont déjà mutualisées ; cache mémoire de 48 réponses, aucune URL météo persistée par ce gestionnaire. Quota 429 prioritaire sur le cache, délais couvrant la file et annulation par groupe GPS. Les anciens retours GPS sont aussi invalidés par générations.
- Rafraîchissement automatique visible : cinq minutes, vérification toutes les 30 s. Le code utilise TTL de base 4 min (lieu consulté) / 18 min (autres), AROME 35 min, nowcast 14 min, ensemble jusqu'à une heure. Le refresh manuel force les téléchargements. Les dates de récupération ne sont pas rajeunies lors d'une relecture RAM. Secours météo local accepté jusqu'à 36 h, explicitement requalifié comme cache.
- OSRM : temporisation de recalcul de 30 s ; route active renouvelée après déplacement d'environ 1 km ou vieillissement de 10 min, aperçu selon limites dédiées. Routes de jambes en cours gardées par clé. ETA sans trafic. Le profilage ci-dessus ne simule **pas** un trajet GPS actif et ne mesure pas la latence réelle OSRM.
- GPS : watch remplacé/arrêté, générations distinctes pour demandes, suivi et météo ; suspension quand la page est masquée, reprise au premier plan. Ces garde-fous ne sont pas refondus. Plusieurs minuteurs de rendu restent actifs : une coalescence globale nécessiterait un profil de trajet et des tests dédiés, pas une suppression arbitraire.
- SW `twrc-static-v11` / `twrc-data-v3` : aucun fournisseur externe en Cache Storage ; clés canoniques pour les fichiers publics / agenda chiffré. Navigation en cache après attente réseau de 3 s, mise à jour poursuivie. DATEX de secours marqué non LIVE, rétention 24 h. Reprise hors ligne / réseau / ancien shell couverte par les suites historiques, pas par le profilage CPU.

## Lot retenu et comparaison

Deux fichiers applicatifs seulement : `src/app.js`, `src/engine.js`.

1. Comparer le HTML de navigation/raccourcis avant de remplacer les nœuds. Aucune clé de cache supplémentaire, aucune suppression de rendu métier. Les changements d'onglet, ARIA et présence du journal continuent d'être recalculés.
2. Réutiliser `Intl.DateTimeFormat` par fuseau, cache borné à 16. **Ne jamais conserver l'heure ou le décalage UTC** : chaque appel formate une nouvelle Date. Même sortie à la minute, même repli UTC en erreur ; aucun seuil météo modifié.

| Moteur / profil | `renderAll` avant → après | `renderView` avant → après | Remplacements nav avant → après | Focus après |
|---|---:|---:|---:|---|
| Chromium / 414×896 | 24,77 → 19,13 ms | 0,031 → 0,008 ms | 903 → 0 | Conservé |
| Chromium / PC | 24,90 → 18,43 ms | 0,031 → 0,008 ms | 903 → 0 | Conservé |
| WebKit / 414×896 | 30,67 → 24,33 ms | 0,040 → 0,010 ms | 903 → 0 | Conservé |
| WebKit / PC | 33,00 → 23,67 ms | 0,040 → 0,010 ms | 903 → 0 | Conservé |

Rendu complet environ **20–28 % plus court sur ces fixtures**. `nowIn` Chromium : 0,062 → 0,002 ms/appel ; WebKit : 0,050 ms avant, après trop bref pour la résolution de certains lots (ne pas interpréter le zéro arrondi comme absence de coût).

Poids JS : **865 731 → 866 474 octets**, soit **+743** ; gzip environ **+277 octets**. CSS inchangé. Requêtes météo **25 → 25**, détail identique : base 8, AROME 5, nowcast 5, ensemble 5, air 2, incluant les deux chargements. **Aucun gain réseau ni réduction artificielle des lignes annoncés.** Aucun framework ni dépendance ajouté. Un bénéfice DOM/accessibilité déterministe et un coût CPU réduit justifient ces quelques lignes.

## Étude des sources — pas de nouvelle intégration

Sources primaires consultées le 9 octobre 2026. Les quotas décrivent les publications, pas une garantie contractuelle de disponibilité.

| Source | État / utilité potentielle | Limites et décision |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/en/terms) | Fournisseur central actuel, cache/doublons/429 déjà traités. API gratuite non commerciale : limites publiées 600/min, 5 000/h, 10 000/j ; attribution CC BY 4.0. | Disponibilité/justesse non garanties. Ne pas créer des appels redondants, ni présumer qu'une requête multivariée équivaut toujours à une unité de quota. Conservé. |
| [Météo-France via Open-Meteo](https://open-meteo.com/en/docs/meteofrance-api) | Déjà demandé avec `meteofrance_seamless` ; AROME local, ARPEGE en prolongement. Documentation : AROME 2,5 km / HD 1,5 km, deux jours ; mises à jour 3 h, produits quart d'heure renouvelés à l'heure. | Précipitations, température/humidité/vent/neige disponibles ; visibilité/probabilité restent d'autres champs/modèles dans l'app. Ne pas annoncer du 1,5 km partout ni confondre `current` modèle et observation réelle. Pas d'API AROME doublonnée. |
| [ECMWF IFS](https://open-meteo.com/en/docs/ecmwf-api), [conditions ECMWF](https://www.ecmwf.int/en/forecasts/datasets/open-data) | ENS ECMWF déjà candidat dans l'app ; IFS déterministe 9 km candidat pour plusieurs jours. Données ouvertes avec attribution ; accès direct GRIB ajouterait du traitement. | Ne pas confondre IFS déterministe et ENS actuellement interrogé. La résolution n'établit pas un meilleur score local. Aucun appel IFS supplémentaire activé. |
| [Radar Météo-France](https://www.data.gouv.fr/dataservices/api-donnees-radar) | Observation des précipitations, cadence annoncée 5 min ; mosaïque ou zone/station. Quota affiché 850 requêtes/5 min. | Compte nécessaire. Documentation métier non lisible ici ; licence exacte, conditions de clé/cache, formats, latence effective et adéquation locale à confirmer avant intégration. Le radar n'est pas une mesure de température de chaussée. |
| [PIAF](https://www.data.gouv.fr/dataservices/api-modele-arome-prevision-immediate-agregee-fusionnee) | Précipitation probabiliste très courte échéance, jusqu'à T+3 h, cadence 5 min ; quota affiché 100/min. | Compte nécessaire ; aucun accès créé ni jeton demandé. Intérêt plausible pour arrivée/intensité de pluie, **bénéfice non mesuré**. Conditions techniques/licence exactes à vérifier dans la documentation métier et le contrat d'accès. |
| [METAR AWC](https://aviationweather.gov/data/api/) | Déjà lus côté relais : LFAQ / Albert-Bray et LFAY / Amiens-Glisy. JSON station / observation ; accès historique jusqu'à 30 jours, limite publiée 100/min. | CORS direct non autorisé : conserver l'accès serveur. Requête publique ponctuelle de 6 h : 12 relevés LFAQ, aucun LFAY retourné ; altitude LFAQ fournie à 107 m. Cela ne démontre pas l'indisponibilité permanente de LFAY. Distance/âge/altitude/exposition doivent accompagner la preuve ; pas une mesure du lieu utilisateur. |
| [Stations horaires Météo-France](https://www.data.gouv.fr/datasets/donnees-climatologiques-de-base-horaires) | Observations contrôlées, CSV compressés par département, horaires UTC en métropole ; Licence Ouverte 2.0. Candidat à la vérification rétrospective locale. | Fichiers récents actualisés quotidiennement : pas un flux d'alerte instantanée. Stations/champs manquants à inventorier avant un backtest ; jeu contrôlé distinct du modèle à vérifier. |
| [DATEX Bison Futé / DIR](https://www.bison-fute.gouv.fr/donnees-sur-la-circulation-du.html) | Déjà intégré pour les événements du réseau national non concédé. Des flux publics de vitesse/débit existent aussi selon la page officielle. | Couverture partielle, pas automatiquement les routes départementales ni autoroutes concédées. Ne pas fabriquer de trafic/retard à partir d'OSRM. Couverture réelle des axes et fraîcheur à démontrer avant tout autre flux. |
| [DiaLog](https://www.data.gouv.fr/dataservices/flux-datex-ii-des-restrictions-de-circulation), [licence / jeu](https://www.data.gouv.fr/datasets/base-de-donnees-nationale-de-la-reglementation-de-circulation) | Restrictions en DATEX II : interdictions, vitesse, stationnement, alternat ; endpoint ouvert, Licence Ouverte 2.0. | Ce n'est ni du trafic ni une garantie juridique (l'arrêté fait foi). Quota/fréquence non confirmés ; le fichier national affiché fait environ 31 Mo, impropre à un téléchargement mobile systématique. Aucun flux ajouté sans couverture pertinente et traitement serveur borné. |

### Banc de comparaison à constituer avant de choisir un fournisseur

La zone locale des déplacements a guidé l'étude, mais aucun domicile/destination ni tracé personnel n'est publié. **Pas de MAE ou de classement de fournisseurs inventé** : aucune archive prévision/observation suffisamment appariée et vérifiée n'est disponible dans ce dépôt.

- Prévisions : [Single Runs Open-Meteo](https://open-meteo.com/en/docs/single-runs-api), cycle explicite et échéance, plutôt qu'un historique recomposé/réanalyse présentée comme prévision passée. L'archive IFS inclut des hindcasts : les distinguer des prévisions opérationnelles réellement disponibles à l'époque.
- Journal minimal privé : fournisseur/modèle/cycle, heure réelle de disponibilité, récupération, heure valide, point de grille/altitude et champs manquants. Une initialisation n'est pas une preuve de publication à la même minute. À chaque décision, n'utiliser que les données déjà disponibles ; observations postérieures réservées à la vérification.
- Appariement à des stations officielles documentées ; règles fixées avant calcul pour distance, altitude, fraîcheur, unités, précipitation accumulée et interpolation temporelle. Aucun remplacement d'une observation manquante par le modèle testé.
- MAE/biais température par échéance, détection/fausses alertes de précipitation et métriques probabilistes si comparables. Évaluer séparément la proximité de 0 °C. Une température d'air ≤ 0 °C ne valide ni une température de chaussée ni un verglas observé.
- Séparer période de réglage et période de validation, événements froid/pluie/brouillard et saisons ; publier effectifs, taux de données manquantes, incertitudes et échecs. Une courte série d'un seul aéroport ne suffit pas à changer le moteur.

### Moteur commun de fiabilité : consolider l'existant d'abord

`evidence.js`, `decision.js` et les garde-fous de fraîcheur existent déjà. Ne pas ajouter un deuxième moteur de consensus. Proposition conditionnelle : un contrat de provenance normalisé (source/modèle/cycle/validité/récupération/qualité/couverture/manquants), puis adaptation progressive des fournisseurs existants. Sélection par phénomène et échéance, pas moyenne aveugle. Les observateurs éloignés restent des indices régionaux, avec âge/distance/altitude visibles. Une source absente ou ancienne ne prouve jamais l'absence de danger.

Garder quatre notions distinctes : **chaussée estimée**, mesure physique de chaussée, risque de verglas calculé, signalement officiel de verglas. Ne jamais augmenter la confiance sur la seule absence d'un incident DATEX. Aucun changement à ces logiques dans ce lot.

## Tests, preuves et limites restantes

- Baseline puis candidat : **39 suites unitaires exécutées localement et vertes** ; syntaxe des **179 scripts** et du hook validée ; scanner générique sans clé réelle vert. Le scanner PR de main avec les vrais secrets reste le contrôle de confidentialité pertinent avant livraison.
- Horaires : 91 combinaisons date/fuseau comparées au comportement précédent, 100 minutes successives, deux transitions DST, fuseaux fractionnaires, borne de cache et repli invalide.
- Comparaison locale à la source exacte de la base : **16 modèles complets et 64 évaluations pneus identiques**, froid/pluie/neige/doux autour des deux transitions DST.
- `e2e49-interactions.js` renforcé : conservation des nœuds, raccourcis et focus après rendus identiques puis changement réel d'onglet/ARIA. Le défaut est observé dans la baseline ; ces assertions le refusent.
- Premier passage CI : le nouveau contrôle ARIA avait un sélecteur trop large (deux boutons `data-v=pneus`) ; il est maintenant limité à `#viewSeg`, sans retirer d'assertion. `e2e41-sw-coldstart.js` échouait aussi dans la baseline sans optimisation ([job](https://github.com/iPoower/iPoower/actions/runs/37898159885/job/113714755469)) : le test fermait le navigateur immédiatement après des écritures dans le magasin mémoire du coffre. Diagnostic déterministe avec chiffrement retenu : le disque avant `flush` ne contient pas le cache, après `flush` la réouverture le retrouve sans copie en clair. La préparation attend désormais l'écriture vérifiée et refuse une erreur du coffre ; aucun seuil ni assertion de reprise/SW/hors ligne n'est assoupli. Huit fichiers modifiés au total, toujours deux seulement dans l'application.
- Un profilage WebKit ultérieur a refusé sa sonde d'horloge : l'ancienne boucle pure (`Math.sqrt` au résultat inutilisé) pouvait être optimisée ou tenir entre deux ticks. La sonde observe maintenant un délai réel de 50 ms et refuse toujours une horloge immobile ; sa durée est enregistrée séparément, hors échantillons CPU. Aucun zéro arrondi de micro-mesure n'est présenté comme une exécution gratuite. [Échec diagnostiqué](https://github.com/iPoower/iPoower/actions/runs/37901274745/job/113724167787).
- Profilages Chromium/WebKit exécutés dans GitHub et réussis. Les tests historiques complets, y compris pannes/quota, GPS, reprise, SW réel, changements de véhicule, import/coffre, restent requis. Lien de validation courant : [checks de #89](https://github.com/iPoower/iPoower/pull/89/checks).

Les contrôles CI complets du dernier commit et le scanner PR doivent tous être verts avant décision de fusion. Le profilage ne remplace pas ces contrôles ; pas de seuil chronométrique fragile qui transformerait un échec fonctionnel en succès. Le premier lot ne certifie pas la totalité des performances de trajet, les leaks en longue session, les fournisseurs live ou l'iPhone physique. Le test d'annulation manuel ancien présente une intermittence documentée dans #88 : aucun test affaibli, aucun fichier du périmètre #87 corrigé ici.

Retour arrière : avant fusion, abandonner cette branche suffit (production inchangée). Après fusion autorisée, revert Git des deux changements applicatifs via une nouvelle PR et contrôles habituels ; pas de migration de données à inverser. Le retour à une étiquette prod existante reste le workflow contrôlé du projet, jamais un reset de `gh-pages`.
