# Bryan — Cloud · DevSecOps · Cybersecurity

> Building production-minded projects while progressing toward Cloud, DevSecOps and cybersecurity roles — with a strong focus on reliability, automation, testing and privacy-by-design.

## Featured work

- **🏎️ Tyre Weather Race Control** — this repository. Mobile-first PWA combining weather, GPS, routing and tyre-state logic, with Playwright E2E tests, GitHub Actions CI/CD, offline support and privacy controls.  
  **Live:** https://ipoower.github.io/iPoower/race-control/
- **🎓 [Reconversion Control](https://github.com/iPoower/Reconversion-Control)** — learning cockpit for Cyber · Cloud · DevSecOps, with guided progression, practical labs, bilingual learning and automated browser tests.  
  **Live:** https://ipoower.github.io/Reconversion-Control/

**Current engineering focus:** Linux · Networking · JavaScript · PWA · Playwright · GitHub Actions · CI/CD · Cloud · DevSecOps · Security

> **FR —** Je construis des projets concrets et testés pour transformer ma reconversion Cloud / DevSecOps / cybersécurité en compétences démontrables.

---

## 🏎️ Tyre Weather Race Control — technical documentation

Application web personnelle : avant chaque trajet (domicile-travail ou agenda), elle croise météo, observations, température de chaussée estimée, pneus montés et itinéraire pour donner un verdict de GO à NO GO.

- **Production** : https://ipoower.github.io/iPoower/race-control/ (branche `gh-pages`, dossier `race-control/`)
- **Relais** : `.github/workflows/race-control.yml` exécute `race-control/relay.js` (observations, agenda chiffré, notifications)
- **Horloge du relais** : `tools/relay-clock/` (Cloudflare Workers, chaque minute, garde anti-tempête) lance le relais ; les crons GitHub restent le filet de secours

## Structure

| Dossier | Contenu |
|---|---|
| `src/` | Code source : `engine.js` (moteur partagé page + relais), `app.js` (interface), `wxdesk.js` (poste météo de l’onglet Météo), `tyrelab.js` et `tirespecs.js` (onglet Analyse), `placectx.js` (lieu courant de confiance), `evidence.js` (preuves météo v2), `tyrestate.js` (état pneumatique unique), `demo.js`, `style.css`, `shell.html`, `sw.js`, `relay.js`, `widget.js`, `tiredb.json`, `static/` (icônes) |
| `tools/` | `build.js` (assemble `dist/`), `check-secrets.js` (garde-fou de confidentialité), `check-keys.js` (séparation des clés), `keys.js` (chiffrement partagé), `deploy-copy.js` (publication), `pre-commit`, `relay-clock/` (horloge externe du relais), `relay-freshness.js` (mesure de fraîcheur) |
| `tests/` | Tests Playwright de bout en bout (horloge et réseau simulés) et harnais du relais (`relay-harness/`) |
| `encrypted/` | Réglages **déjà chiffrés** (AES-256-GCM, PBKDF2-SHA256 600 000 itérations) |

## Règles de confidentialité

- Jamais dans Git : code de déverrouillage, configuration du relais ou préréglage en clair, adresse iCal, coordonnées du domicile, captures d'écran.
- Ces éléments vivent dans `private/` (ignoré par Git) sur le poste de travail, ou dans les secrets GitHub (`APP_KEY`, `RC_KEY`, `GCAL_ICS`).
- **Deux clés indépendantes, sans repli de l'une sur l'autre** :

  | Clé | Local | Ouvre | Utilisée par |
  |---|---|---|---|
  | `APP_KEY` (code de déverrouillage) | `private/.passphrase` | préréglage de l'app, agenda chiffré | l'app (code saisi), le relais (chiffre l'agenda) |
  | `RC_KEY` (clé du relais) | `private/.rc_key` | configuration du relais uniquement | le relais |

  Le relais refuse toute clé de relais égale à `APP_KEY`, même si elle ouvrirait la configuration.
  Une fuite de `RC_KEY` n'ouvre ni l'app ni l'agenda. `tools/check-keys.js` vérifie, sans rien afficher, que chaque clé n'ouvre que ses fichiers (CI : job `confidentialite` ; en ligne : « contrôle des sources » lancé à la main).
- `tools/check-secrets.js` compare chaque fichier aux valeurs privées (lues localement ou déchiffrées avec les secrets) et bloque le commit (`tools/pre-commit`) ou le build.

## GPS dynamique (trajet vivant)

Pour **un seul** trajet à la fois (celui en cours, sinon le prochain qui part dans 90 min ou moins), l'app remplace l'origine
planifiée par la position réelle : itinéraire restant (OSRM, points météo placés selon le temps de parcours : départ, 25, 50, 75 %, arrivée),
puis score pneus, chaussée, pluie, visibilité, verglas et point critique sur ce trajet restant.

| Règle | Valeur |
|---|---|
| Départ adaptatif | **Aller** : l'arrivée prévue est la contrainte (marge du rendez-vous déjà incluse par le relais) → départ conseillé = arrivée prévue − durée OSRM × 1,1 depuis la position, **seulement à plus de 1 km de l'origine prévue** (chez soi, heure planifiée et durée choisie pour le boulot inchangées). **Retour** : le départ prévu reste la contrainte, l'arrivée est recalculée. Départ conseillé dépassé : arrivée estimée = maintenant + durée, avec retard estimé |
| Aperçu (avant la fenêtre vivante) | prochain aller seulement, jusqu'à 4 h avant le départ prévu, GPS frais (≤ 5 min, ≤ 250 m) et à plus de 1 km de l'origine prévue ; relevés **basse consommation uniquement** ; recalcul après 5 km ou 30 min ; même bascule atomique route + météo |
| Fenêtre vivante | dès min(départ prévu, départ conseillé) − 90 min : peut avancer le suivi, jamais le retarder |
| Position utilisable | précision ≤ 250 m ; relevé (`pos.timestamp`) ≤ 5 min avant départ, ≤ 2 min en trajet. **Aucune transition d'état sur un relevé périmé** (référence ≤ 5 min ; départ, vitesse et arrivée ≤ 2 min) |
| Phases | aperçu → imminent → départ conseillé dépassé → en cours → arrivé. **L'heure conseille quand partir, le mouvement décide si le trajet a commencé** : aucun critère d'heure n'empêche le passage « en cours » |
| Départ (en cours) | dans la fenêtre vivante (imminent ou départ dépassé, même avant l'heure conseillée) : référence = premier relevé frais du trajet, **figée** (jamais recalée tant que le trajet n'a pas commencé) ; départ = déplacement > max(300 m, 2 × incertitude) depuis la référence **et** vitesse voiture > 2 m/s sur deux relevés frais consécutifs (`coords.speed`, sinon vitesse dérivée distance / Δt, Δt ≥ 5 s, nulle si le déplacement reste dans 2 × la somme des incertitudes ; un intervalle non mesurable casse la série ; plus de 5 min entre deux relevés = nouvelle série). Marche, GPS qui saute, voiture garée : pas de départ. Pas de détection pendant l'aperçu (jusqu'à 4 h avant) : ni « en cours » sur une course, ni haute précision continue |
| Arrivée | vérifiée **dans toute la fenêtre vivante** — imminent, départ dépassé, en cours — y compris à la réouverture de l'app déjà à destination ; **jamais pendant l'aperçu** (ni arrivée automatique ni arrivée probable : passer près du lieu 3 h avant ne supprime pas le trajet). À l'entrée dans la fenêtre, relevé demandé et dernier relevé réexaminé. deux relevés frais ≤ 150 m de précision à moins de 300 m → arrivé. Au premier, nouveau relevé demandé aussitôt. Entre 0,3 et 1,5 km (hors aperçu) : « 🟡 Arrivée probable » + « ✓ Je suis arrivé ». Destination d'un retour = domicile exact local |
| Mémoire d'arrivée | `twrc.tripdone` : identifiant du trajet (heure de départ planifiée, aller/retour, début de l'événement), façon (`auto` / `confirmé`) et horodatage, **sans aucune coordonnée**, entrées de plus de 24 h effacées du stockage à chaque chargement (clé supprimée si vide) ; le trajet arrivé ne revient pas à la réouverture. « Annuler l'arrivée » (10 min) le rétablit et suspend l'arrivée automatique 10 min |
| Relevés demandés | à la création d'un trajet vivant (y compris réouverture de l'app) : relevé demandé activement (basse consommation en aperçu, précis ensuite) |
| Recalcul | après ~1 km ou 10 min, jamais plus d'une fois par 30 s. Réponses tardives : OSRM est protégé par un compteur de génération (`LIVE.gen`) ; la météo est isolée par la clé géographique de chaque route (`legKey` / `LEGM`), une réponse d'une ancienne route n'est jamais lue pour la route courante |
| Analyse « actuelle » | seulement si relevé frais + route **courante pour ce relevé** (même trajet, origine ≤ 1 km, calculée il y a ≤ 10 min) + météo de **cette** route prête. Bascule atomique : une nouvelle route n'est affichée qu'avec sa météo |
| Pannes | trajet planifié tant qu'aucune analyse vivante n'existe ; ensuite dernière analyse marquée « GPS ancien » (relevé périmé) ou « Itinéraire non actualisé » (GPS frais, route ou météo pas à jour), `lastOk` figé, 5 min au plus, puis repli explicite |
| Durée de vie | jamais parti : arrivée prévue + 30 min ; parti : jusqu'à l'arrivée (coupe-circuit : arrivée prévue + max(60 min, 2 × durée)) |
| Batterie | basse consommation hors trajet ; demande ponctuelle précise avant le départ ; haute précision continue seulement en trajet |

**Confidentialité.** Le trajet vivant est calculé dans le navigateur, en mémoire : **aucune donnée supplémentaire du trajet vivant — route,
météo de route, phase ou relevé de référence — n'est persistée** (ni `localStorage`, ni `twrc.croute`), à la seule exception de la mémoire d'arrivée `twrc.tripdone` (sans coordonnée, 24 h) ni publiée (`obs.json`, agenda,
relais et GitHub Actions inchangés). Le stockage local `twrc.gps` existant (dernière position, pour la puce « Ma position ») reste inchangé. Aucun nouveau fournisseur externe : en mode trajet vivant,
la position courante arrondie à 0,001° est en plus transmise à OSRM pour calculer le trajet restant (domicile et travail
restent arrondis à 0,01° comme destination).
Les **notifications du relais** restent calculées depuis le trajet planifié : l'app ouverte corrige l'heure selon la position réelle,
mais la position n'est jamais envoyée à GitHub pour synchroniser une notification.

## Navigation (Waze)

« 🚙 Ouvrir dans Waze » sur le trajet affiché (briefing, y compris trajet vivant ou adaptatif) et sur chaque trajet de l'agenda :
lien universel `https://waze.com/ul?ll=LAT,LON&navigate=yes` vers la **destination** du trajet. Ouverture uniquement après un geste
de l'utilisateur ; aucune origine ni position GPS transmise (Waze part de la position courante de l'appareil) ; rien n'est stocké.
Retour au domicile : Waze reçoit le **domicile local exact** (préréglage de l'appareil), pas le domicile arrondi à 0,01° du relais —
cet arrondi reste en place pour tous les appels OSRM, le relais et l'agenda chiffré.

## Origine réelle et annulation locale

Avant la fenêtre adaptative de quatre heures, un trajet agenda conserve son origine planifiée.
Si le GPS est frais, précis et à plus de 1 km de cette origine, le briefing affiche « Origine planifiée »
et l’heure à partir de laquelle la position réelle sera prise en compte. Le bouton « Calculer depuis ici maintenant »
demande à chaque appui un nouveau relevé GPS (`maximumAge: 0`) et crée un aperçu ponctuel : route et météo basculent ensemble, sans démarrer LIVE,
sans suivi continu haute précision et sans écrire dans `twrc.croute`. L’aperçu expire après 30 minutes,
un déplacement supérieur à 1 km ou une modification du trajet ; la fenêtre adaptative reprend toujours la main.

« Je n’y vais pas » ignore localement les déplacements du rendez-vous, après confirmation, en conservant Google Agenda.
Les trajets suivants sont reconstruits depuis le dernier lieu valide ; tant qu’une nouvelle origine ou sa météo
n’est pas fiable, le briefing affiche « Origine à confirmer après annulation du trajet précédent » sans ancienne route,
risque ou lien Waze. « Pas de trajet aujourd’hui » masque les deux sens domicile-travail pour la date locale seulement.
« Annuler l’annulation » reste disponible pendant dix minutes. Annuler le trajet suivi arrête LIVE sans enregistrer une arrivée.

`twrc.tripcancel` conserve uniquement des identifiants techniques et les timestamps d’annulation et d’expiration.
Les entrées expirées sont réellement purgées au chargement et pendant l’utilisation ; aucun titre, adresse ou GPS n’y est stocké.
Le relais déjà existant ajoute un identifiant opaque dérivé de l’UID et de l’occurrence dans l’agenda chiffré,
pour distinguer des rendez-vous simultanés. Les anciens agendas ambigus doivent être actualisés avant une annulation séparée.
Le relais ne reçoit aucune annulation locale : une notification cloud déjà planifiée peut encore arriver.

L’agenda conserve toutes les occurrences de la fenêtre de huit jours, sans plafond de 25 événements.
Les événements sans lieu et `#pasdetrajet` ne peuvent donc pas évincer un rendez-vous routable plus tardif.
L’ordre est chronologique, avec un départage stable des heures identiques ; les caches existants mutualisent
les lieux et routes. Le temps de traitement dépend du nombre de lieux et déplacements de cette fenêtre.
Dans l’application, les rappels sans lieu reconnu et les événements `#pasdetrajet` sont exclus de l’Agenda,
de Tenue et du briefing, sans modifier Google Agenda. Un lieu est reconnu par des coordonnées valides
ou par une correspondance exacte du champ « Lieu » avec un lieu configuré ; le titre et d’anciennes routes ne suffisent pas.
Pour signaler un vrai déplacement dont le lieu reste à préciser, ajouter `#trajet` au titre ou à la description.
Il reste alors signalé comme inconnu, sans route, météo locale ou présence physique inventées.
Les anciennes chaînes en cache sont réparées depuis le dernier lieu valide ; un rappel exclu ne devient jamais une origine.

Le suivi GPS renouvelle aussi le nom de commune et la météo après plusieurs petits déplacements cumulés,
reprend après la veille et ignore les réponses anciennes après déplacement ou oubli. Les origines de référence restent en mémoire.
Tests : `test_tripcancel.js`, `test_calendar_ids.js`, `test_gps_requests.js`, `e2e33.js` et `e2e34.js`.

## Onglet Météo : poste météo

L’onglet **🌦️ Météo** répond d’abord à « quoi, quand, où, quel impact pour moi », en moins de 5 secondes.
Météo = environnement ; Pneus = réaction des pneumatiques ; Race Control = décision. L’analyse d’adhérence reste dans Pneus :
Météo n’en montre qu’une ligne (« Impact pneus : modéré ») et un lien **Voir analyse Pneus →**.

| Ordre | Bloc | Contenu |
|---|---|---|
| 1 | Verdict | 🟢🟡🟠🔴, phénomène dominant, début ou fin estimés, trajet concerné, température et ressenti, prochain changement, état LIVE / CACHE / HORS LIGNE et âge des données |
| 2 | Prochain trajet | origine → destination, horaires, durée, conditions au départ, à mi-parcours et à l’arrivée, point critique (au kilomètre pour l’agenda), trajets suivants |
| 3 | Chronologie | moments clés (phénomènes, départs, arrivées, lendemain signalé) puis bande heure par heure défilante (température, pluie, phénomène, heures de trajet) |
| 4 | Ce qui compte aujourd’hui | 1 à 5 lignes, la plus grave d’abord ; rassurances seulement quand la question se pose (froid, trajet prévu) |
| 5 | Phénomènes | pluie, brouillard, vent, gel, température, soleil rasant, chaussée : une ligne chacun, détail au toucher |
| 6 | Conditions route | score 100 − pénalités affichées une à une, fenêtre explicite (prochain trajet, sinon les 6 h à venir) |
| 7 | Détails | radar, 24 h, 7 jours, mesures détaillées, air et UV, verglas, alertes, sources et fraîcheur (inchangés, plus bas) |

Le moteur `src/wxdesk.js` est pur et déterministe (aucun réseau, stockage ni horloge). Il lit les heures déjà calculées
(air, pluie, visibilité, rafales, chaussée estimée, verglas) et les trajets déjà affichés par le briefing : domicile-travail
et rendez-vous de l’agenda reconnus comme trajets, jamais les rappels sans lieu ni les `#pasdetrajet`. Seuils (alignés sur le reste de l’app) :

| Phénomène | 🟡 | 🟠 | 🔴 | Pénalité route |
|---|---|---|---|---|
| Pluie | ≥ 0,2 mm/h (ou ≥ 60 % et ≥ 0,1 mm/h) | ≥ 2 mm/h, orage | — | −5 (≥ 60 %), −10, −20, −30 (≥ 7,6 mm/h) |
| Neige | — | chute prévue | — | −35 |
| Visibilité | < 1 000 m | < 500 m | < 200 m | −15, −25, −35 |
| Rafales | ≥ 55 km/h | ≥ 70 km/h | ≥ 90 km/h | −10, −20, −30 |
| Gel | chaussée estimée − 2 °C < 0 | chaussée + 2 °C < 0, verglas modéré | verglas élevé, pluie verglaçante | −8, −15, −25, −45 |
| Température | air ≥ 35 °C ou ressenti ≤ −10 °C | — | — | −5 (air ≤ 3 °C ou ≥ 35 °C) |
| Air saturé, soleil rasant | humidité ≥ 95 % sans pluie ; soleil bas dans l’axe d’un trajet | — | — | −5 chacun |

La couleur du score n’est jamais plus douce que son pire facteur. Hors connexion ou avec un cache de plus de 3 h,
le dernier verdict reste affiché, marqué indicatif. Sans météo (premier lancement hors ligne, fournisseur en panne),
le poste météo reste masqué : aucune valeur n’est inventée. Aucun nouveau fournisseur externe.

## Lieu courant : localisation de confiance

**Localisation physique brute ≠ localisation métier.** Sur ordinateur, sans GPS ni Wi-Fi exploitable, l’API de géolocalisation
du navigateur estime la position à partir de l’adresse IP : derrière un VPN d’entreprise, c’est l’IP de sortie du VPN, une ville
à des dizaines de kilomètres, avec une précision de plusieurs kilomètres. Cette position indique le réseau utilisé, pas la position physique.

`src/placectx.js` (pur, testé) est la seule source de vérité du lieu courant ; tous les modules (météo, tenue, analyse, briefing)
lisent le lieu qu’il retient, et un lieu confirmé verrouille l’origine jusqu’à un départ crédible.

| Rang | Source | Confiance affichée | Règle |
|---|---|---|---|
| 1 | Confirmation (« ✅ Bien arrivé », « 🏢 Je suis déjà au travail », « 🏠 Je suis déjà chez moi ») | Confirmée | prioritaire sur toute autre source encore valide |
| 2 | Trajet vivant en cours (mouvement confirmé au GPS) | Fiable | met fin à une confirmation antérieure (départ détecté) |
| 3 | Relevé précis (≤ 100 m, moins de 10 min), cohérent | Fiable | reconnaît un lieu connu ; loin d’un lieu confirmé et à vitesse plausible : départ réel |
| 4 | Relevé approximatif (≤ 1,5 km, moins de 30 min) | Estimée | ne contredit jamais un lieu confirmé |
| 5 | Dernier lieu fiable (moins de 12 h) | Estimée | identifiant du lieu seulement |
| 6 | Position réseau (> 1,5 km : IP, VPN) | Incertaine | jamais la position : « Localisation physique indisponible · Position réseau approximative : … · fiabilité faible — VPN possible » |

Garde de cohérence : tout relevé impliquant plus de 200 km/h depuis le dernier état fiable est rejeté, même précis.
Fin d’une confirmation : « 🚗 Je quitte le travail », départ détecté, relevé précis cohérent ailleurs ; plafonds de sécurité :
fin de la journée pour le travail, 20 h pour un autre lieu. La confirmation termine aussi le trajet aller dans la machine
de trajet existante (arrivée du trajet vivant, sinon trajet planifié marqué arrivé) et fonctionne hors connexion.
Stockage : `twrc.place.v1` (identifiants de lieux et heures, aucune coordonnée). Une position réseau reste en mémoire,
pour le badge et le diagnostic (Réglages → Diagnostic : brut, réseau, lieu logique, source retenue, sources écartées).

## État pneumatique : une seule source de vérité

L’onglet **Pneus** décrit ce qui est physiquement monté : `S.cars[i].tire` est la **monte active**, `S.cars[i].sets` garde les
jeux stockés (été, hiver…), `S.cars[i].odo` les relevés du compteur. `src/tyrestate.js` (pur, testé) lit ces données et les
expose à toute l’app ; Analyse, le diagnostic, l’entretien et la mémoire thermique n’ont **aucune saisie ni copie propre**.

| Donnée (saisie une fois dans Pneus) | Provenance | Fraîcheur | Utilisée par |
|---|---|---|---|
| Type, marque, modèle, dimension (charge, vitesse, XL, ZR) | saisie | permanente tant que la monte ne change pas | Analyse (fenêtres, profil technique), Pneus, relais |
| DOT (semaine, année) | saisie | permanent | âge depuis la fabrication : surveillance, confiance, entretien (jamais une pénalité d’adhérence calculée) |
| Date et compteur de montage | saisie | permanents | âge d’usage, kilomètres depuis le montage (si le compteur est connu) |
| Profondeur AV / AR et historique | mesure (jauge) ou estimation, signalée comme telle | fraîche ≤ 60 j, ancienne > 180 j | aquaplaning, freinage mouillé et verdict sur l’essieu le plus usé, confiance (estimation : −0,25 et jauge demandée), usure (≥ 2 mesures réelles du même essieu avec compteur) |
| Pression cible (AV / AR) et dernier contrôle | plaque du véhicule + contrôle | contrôle frais ≤ 14 j, ancien > 30 j | estimation à froid / à chaud, sous-gonflage, confiance, entretien |

Changer une valeur dans Pneus recalcule Analyse au rendu suivant (aucun cache de résultat). Changer de jeu change
l’identité de la monte : l’ancienne mémoire thermique est ignorée. Un jeu stocké n’est jamais analysé. Avant et arrière
sont distingués quand les pressions ou les profondeurs diffèrent ; aucune différence n’est inventée (un seul modèle ; un essieu
jamais saisi reste inconnu, l’ancienne profondeur commune `tread` vaut pour les deux essieux tant qu’aucun n’est saisi à part).
`tread` reste la valeur effective lue par le moteur et le relais : toujours l’essieu le plus usé, jamais une moyenne. L’entretien (âge ≥ 10 ans, 5 ans d’usage, profondeur, contrôle de pression) reste séparé du verdict de conduite.
Aucune migration : la structure existante est conservée telle quelle.

## Onglet Analyse : ingénieur pneumatique embarqué

L’onglet **🔬 Analyse** répond à « comment mes pneus se comportent-ils maintenant, sur ce trajet et dans ces conditions ? ».
Il n’analyse que la **monte active** du véhicule choisi (type, marque, modèle, dimension saisis dans Réglages). Sans monte connue :
« Monte active inconnue — sélectionner les pneus montés. » Pneus garde l’état, les références, le montage et les recommandations.

```
DONNÉES  météo (heures déjà chargées) · chaussée estimée · trajet du briefing · véhicule et monte · mémoire thermique
   ↓
MOTEUR   src/tyrelab.js (pur, déterministe, testé) + src/tirespecs.js (fiches constructeur sourcées)
   ↓     température estimée · mise en température · refroidissement · adhérence · freinage · aquaplaning · pression · confiance
INTERFACE  verdict, fenêtre, freinage, adhérence, aquaplaning, comparaison, trajet, pression, fiche, confiance (détails au toucher)
```

Le **briefing du trajet** (onglet Pneus) reprend la même estimation sur une ligne « 🌡️ Gomme · estimation » : état et plage °C
au départ → à l’arrivée (ou maintenant, en roulage), fenêtre favorable atteinte ou non, bouton Détail vers Analyse. Même calcul
`tyreLab` sur les mêmes points datés que la prévision figée au départ pour le débrief (`tripLab`), donc aucun chiffre divergent.

**Aucun capteur** : toutes les valeurs sont des estimations en plages (jamais « vos pneus sont à 42 °C »), et l’état affiché
est le plus prudent de la plage. Modèle thermique du premier ordre avec mémoire :

| Règle | Valeur | Origine |
|---|---|---|
| Environnement du pneu | ½ air + ½ chaussée estimée | hypothèse Race Control |
| Échauffement à l’équilibre | ville +14 °C, route +20 °C, autoroute +26 °C | cohérent avec ≈ +0,3 bar à chaud (Michelin) ≈ +25 °C de gaz |
| Eau, vent, pression, gomme | sec ×1 · humide ×0,85 · pluie ×0,65 · pluie forte/neige ×0,5 · rafales ≥ 50 km/h ×0,92 · sous-gonflage ×1,12 · 4 saisons ×1,05 · hiver ×1,1 | hypothèses Race Control |
| Montée en température | constante de 10 km (7 km en ville) | « froid » tant que moins de 3 km roulés (Michelin) |
| Refroidissement à l’arrêt | constante de 50 min (×0,8 sous la pluie) | « froid » après 2 h d’arrêt (Michelin) |
| Incertitude | ±3 °C + 25 % de l’écart + 3 °C sans historique (s’estompe en roulant) + 3 °C si météo > 90 min | hypothèse Race Control |
| Fenêtres (froid / chauffe / favorable / chaud) | été 10 / 20 / 50 / 65 °C (+5 °C pour W, Y, ZR) · 4 saisons 5 / 15 / 45 / 60 · hiver −5 / 5 / 35 / 50 | hypothèses Race Control |
| Adhérence relative | surface × gomme × ambiance (été < 7 °C ×0,9, hiver > 20 °C ×0,92) × profondeur (mouillé < 3 mm ×0,85, < 1,6 mm ×0,7) × pression | hypothèses Race Control |
| Distances (ordre de grandeur) | d = v² / (2 µ g), µ sec 0,7–0,9, mouillé 0,4–0,55, réaction 1 s à part ; jamais sur neige ou verglas | [Distance d’arrêt](https://fr.wikipedia.org/wiki/Distance_d%27arr%C3%AAt) |

**Mémoire thermique** : `twrc.tyretherm.v1` garde, par voiture, la dernière heure et la température estimée (aucune position,
aucun trajet), écrite pendant un trajet suivi au GPS et à l’arrivée. Sans historique, le pneu est supposé froid.
**Fiches constructeur** : uniquement des données publiées, chacune reliée à sa page source ; les rubriques sans source restent
« non disponible ». Étiquette UE : dépend de la dimension exacte (registre EPREL), jamais déduite du modèle.

## Tenue sartoriale

L’onglet **👔 Tenue**, à côté de Pneus et Météo, affiche le plan de la journée : kit de couches amovibles,
pièces à emporter et adaptations avec leurs heures et lieux. **Aujourd’hui** commence à la minute courante et finit à 23 h
(ou à minuit après 23 h) ; **demain** couvre 07 h–23 h. Bureau, Sortie et Promenade adaptent les accessoires et les chaussures.

`buildTenueDay` lit les modèles météo, les horaires de travail, l’agenda déchiffré et les trajets déjà en mémoire.
Il construit la journée effective de cet appareil : un rendez-vous annulé et une journée travail annulée
disparaissent aussi de Tenue. Le rétablissement et l’expiration les rendent immédiatement disponibles à nouveau.
Une chaîne reconstruite ne réutilise aucune météo d’une ancienne origine ; sa portion reste inconnue tant que
la route effective n’est pas prête. Afficher Tenue ne lance aucune requête pour reconstruire cette route.
Entre deux activités, le dernier lieu connu est conservé ; seuls les retours planifiés ramènent au domicile.
Un événement `#pasdetrajet` ou un rappel sans lieu reconnu est absent du plan : il ne change pas le lieu physique,
n’utilise pas la météo de son adresse et ne devient jamais l’origine du trajet suivant, même dans un ancien agenda.
Le « Kit complet de la journée » indique le niveau maximal à couvrir. Les couches nécessaires plus tard
sont à emporter ; la timeline indique ce qui est porté à chaque moment.
Les heures de l’agenda et des modèles sont converties dans le fuseau de la journée. Aujourd’hui, si « Ma position »
est sélectionnée avec un GPS fiable (≤ 5 min, précision ≤ 250 m), le plan commence au lieu observé même avec
un programme futur. Aucun trajet vers le domicile n’est inventé, et les segments antérieurs ne remplacent pas
cette observation. Une météo GPS ancienne ou manquante est signalée à ce lieu, sans lui substituer le domicile.
Sans programme localisé, le lieu sélectionné reste le lieu de base.
Les occurrences sans localisation exploitable restent dans l’agenda chiffré. Les déplacements explicitement
signalés par `#trajet`, `#direct` ou `#maison` affichent « Lieu inconnu · météo locale non calculée »,
sans substituer la météo du domicile ni créer d’adaptation ; les simples rappels restent exclus du plan.

`src/dayplan.js` est un moteur déterministe sans réseau, stockage ni horloge implicite. Son résultat alimente
la frise **et** la carte détaillée « Ta tenue » : un seul kit, couvrant le moment le plus froid retenu.
Les seuils de ressenti de `wardrobe.js` restent 0, 7, 13, 19 et 25 °C, avec repli explicite sur l’air.
Une marge de 1 °C et une durée de 2 h limitent les oscillations de confort ; un rendez-vous peut justifier une adaptation plus courte.
Pluie, neige, pluie verglaçante, orage et vent fort restent immédiats, même pour un créneau de 30 minutes.
L’indicateur principal reste « Tenue valable toute la journée », « 1 adaptation nécessaire » ou « Plusieurs adaptations » ;
les protections météo ont un avertissement séparé. L’absence de neige seule ne confirme pas la fin de la pluie :
un code météo sec connu ou un couple quantité/probabilité valide doit la confirmer, avec des données fraîches.
Les données partielles, inconnues ou anciennes conservent le besoin de protection ; un vent persistant impose de garder la couche extérieure.
Les semelles sont choisies pour la pire météo de la journée. Le conseil suppose des passages dehors et rappelle
de retirer la maille dans les lieux chauffés. Les pièces et couleurs restent des suggestions.

Absence de température : aucun conseil inventé. Données anciennes, partielles, lieux inconnus et agenda indisponible : indication explicite.
Le plan n’ajoute aucun appel externe ni stockage de rendez-vous, de titres ou de coordonnées.
L’onglet et l’usage gardent leur stockage existant ; le jour revient à Aujourd’hui au rechargement.
Tests : `test_wardrobe.js`, `test_dayplan.js`, trois mutations métier dans `dayplan-countertests.js`,
et `e2e31.js` / `e2e32.js` sur Chromium et WebKit, à 320, 414 et 1280 px avec commandes d’au moins 44 px.

## Frontière des secrets

Les vrais secrets (`APP_KEY`, `RC_KEY`, `GCAL_ICS`) vivent **uniquement dans l'Environment GitHub `production`**, dont la règle
« branches autorisées : `main` » est appliquée par GitHub lui-même (une branche qui modifierait un workflow ne peut pas y entrer).
Les jobs l'utilisent avec `deployment: false` (aucune entrée de déploiement créée).
Ce n'est pas une liste blanche de jobs : **tout job qui référence `production` obtient les secrets si sa référence (`GITHUB_REF`) est `main`**.
La frontière de confiance est donc la branche `main` (code relu et fusionné), pas un ensemble figé de fichiers YAML.
Cas particulier : avec `pull_request_target`, `GITHUB_REF` est la branche de base (`main`) ; c'est pourquoi `pr-privacy.yml`
n'exécute jamais le code de la PR et la lit uniquement comme des fichiers. Aujourd'hui, ces secrets servent à :

| Workflow | Secrets | Quand |
|---|---|---|
| `ci.yml` · `confidentialite` | oui | push sur `main`, retour arrière lancé depuis `main` ; **jamais sur une pull request** |
| `ci.yml` · `tests`, `relay-smoke` | non | partout (données et clés fictives) |
| `pr-privacy.yml` | oui | chaque PR **de ce dépôt** : workflow et scanner de `main`, la PR est lue comme des fichiers et jamais exécutée ; jamais pour un fork (sinon le rouge/vert servirait à deviner une valeur) |
| `env-boundary-proof.yml` | non | branche `preuve/…` poussée à la demande : démontre qu'une branche ne peut ni entrer dans `production` ni lire un secret de dépôt (ne couvre pas `pull_request_target`, protégé par la conception de `pr-privacy.yml`) |
| `race-control.yml` (relais) | oui | uniquement depuis `main` ; exécute le relais publié sur `gh-pages` |
| `sources-check.yml` | oui | uniquement depuis `main` |

## Robustesse : fraîcheur, pannes, hors connexion

| Invariant | Mécanisme | Test |
|---|---|---|
| Une donnée ancienne n'est jamais présentée comme temps réel | « LIVE » est dérivé de l'âge réel (≤ 15 min) à chaque reconstruction et à chaque reprise iOS (`expireLive`) ; au-delà : badge CACHE daté et « maintenant » = horloge. L'heure du fournisseur n'est retenue que si elle concorde avec l'horloge (± 1 h) | `e2e38-resume.js`, `test_engine_verdicts.js` |
| Une réponse invalide ne remplace jamais la dernière donnée valide | `validForecast` (≥ 24 h, horodatages croissants, températures présentes) avant toute écriture en mémoire ou en cache (lieux, route, événements, cache relu) ; agenda mis en cache seulement après déchiffrement ; copie plus ancienne ignorée | `e2e40-network.js` |
| Le relais ne se tait jamais sur une panne | prévision invalide ou séquence vide → `relay.err` dans `obs.json`, jamais « Conditions sans alerte » | `relay-smoke.js` |
| Démarrage à froid hors ligne | Service Worker : shell et données publiques en cache ; navigation réseau d'abord avec délai de 3 s si une copie existe (réseau muet), mise à jour poursuivie en arrière-plan ; déverrouillage possible sans météo | `e2e41-sw-coldstart.js` (vrai SW, navigateur fermé puis relancé hors ligne) |
| Une seule actualisation à la fois | `refreshAll` mono-vol (`busy`), réponses GPS tardives écartées par génération ; reprise automatique au cycle de 5 min, sans boucle de nouvelles tentatives | `e2e38-resume.js`, `e2e40-network.js` |

États de fraîcheur affichés dans **Réglages → Diagnostic** : `FRESH` ≤ 15 min · `AGING` ≤ 60 min · `STALE` au-delà · `UNAVAILABLE`.
Le diagnostic (copiable) donne version de l'app et du Service Worker, réseau, dernière actualisation, météo du lieu affiché
(état, mode, erreur), relais `obs.json`, agenda, stockage local et phase du trajet vivant, sans coordonnée, lieu ni rendez-vous.

**Une seule interface** sur iPhone 11 Pro Max et PC : mêmes sections, mêmes composants ; seules la largeur et la densité changent.
Gouttières `max(16 px, safe-area-inset)` (encoche en paysage), voile opaque sous l'horloge iOS, cibles ≥ 44 pt au doigt,
alertes qui passent à la ligne au lieu d'élargir la page. Test : `e2e39-layout.js` (414×896 et 896×414 @3x, 1280, 1920 ;
zones de sécurité émulées sous Chromium).

## Horloge du relais

Le planificateur `schedule` de GitHub Actions retarde ou abandonne des exécutions aux heures chargées. Mesuré du 2 au 4 octobre 2026
(`node tools/relay-freshness.js 3`) : écart médian de 40 min entre deux relais, maximum 5 h 55, et **obs.json frais (< 15 min)
seulement 9,6 % du temps pendant les matinées de semaine**. Le 4 octobre, aucun relais de 17:33 à 20:23 UTC.

**Cloudflare est l'horloge, GitHub Actions reste le moteur.** `tools/relay-clock/worker.mjs` (Cloudflare Workers, offre gratuite)
est un chien de garde exécuté **chaque minute** :

```
Cron Cloudflare (1 min) ──► lit l'âge public d'obs.json (Pages, sans jeton)
   │ fresh  (< 8 min)          → rien (aucun appel à GitHub)
   │ stale / invalid / unreachable
   ▼
garde anti-tempête (API GitHub, runs de race-control.yml et race-control-watchdog.yml)
   │ run en file ou en cours             → skipped « relais déjà en cours »
   │ run démarré après le passage à « dû », il y a < 6 min → skipped « cooldown » (publication Pages)
   ▼
workflow_dispatch race-control.yml (main, source=horloge)
   → le workflow refait son contrôle de fraîcheur (≥ 8 min), concurrency race-control-relay, puis relais
```

| Propriété | Garantie | Test (`test_relay_clock.js`) |
|---|---|---|
| Un seul dispatch par épisode de retard | garde basée sur l'état réel des runs GitHub, sans stockage | ticks chaque minute, 3 h sans cron GitHub : 18 dispatches, âge max 11 min |
| Pas de tempête si le relais est cassé | au plus un dispatch par période de 6 min | 60 min de relais cassé |
| Pas de dispatch à l'aveugle | liste des runs indisponible → erreur, aucun dispatch | panne de l'API GitHub |
| Panne GitHub visible | dispatch refusé (401/403/422/5xx) → invocation en échec | erreurs propres, sans secret |
| Aucune donnée personnelle | journal : `t`, `decision`, `age_min`, `action`, `reason`, `status` uniquement | contrôle des clés et du contenu des journaux |

**Observabilité, sans donnée personnelle :**
- Cloudflare → Workers → `race-control-relay-clock` → **Logs** (Workers Logs, offre gratuite) : une ligne JSON par minute,
  par exemple `{"decision":"stale","age_min":8.4,"action":"dispatched","status":204}`. Onglet **Triggers → Cron events** : exécutions.
- `https://race-control-relay-clock.<compte>.workers.dev/status` : âge observé d'obs.json et décision (lecture seule, sans appel à GitHub).
- GitHub → Actions : les runs lancés par le Worker s'appellent **« Relais · horloge »** ; les commits du relais finissent par
  `· horloge`, `· schedule` ou `· manuel`. `node tools/relay-freshness.js 7` donne la fraîcheur et la répartition par source.

**Sécurité.** Le seul secret, `GH_TOKEN`, vit dans Cloudflare (Settings → Variables and Secrets) : jeton GitHub *fine-grained*
limité au dépôt `iPoower/iPoower`, permission **Actions : Read and write** uniquement. Aucun secret dans ce dépôt. Un lancement
manuel depuis GitHub (`source=manuel`, valeur par défaut) force toujours le relais, comme avant.

**Si Cloudflare tombe :** rien ne casse. Les crons GitHub (`race-control.yml` et `race-control-watchdog.yml`) restent le filet
de secours, l'application continue d'afficher l'âge réel des données (relais périmé signalé). Le Worker ne fait que s'ajouter.

**Coût :** offre gratuite. ~1 440 exécutions/jour (quota 100 000 requêtes/jour), 1 sous-requête par minute quand tout est frais,
3 au plus lors d'un dispatch ; ~1 440 lignes de journal/jour (quota Workers Logs 200 000/jour).

Mise en service (faite le 5 octobre 2026) : Cloudflare **Workers Builds** relié à ce dépôt (chemin `tools/relay-clock`, branche
`main`, builds d'aperçu désactivés), puis le secret `GH_TOKEN`. Chaque push sur `main` redéploie le Worker depuis ce dossier.
⚠️ `GH_TOKEN` se place dans **Paramètres → Variables et secrets du Worker** (type Secret), **pas** dans les variables du build :
celles-ci ne sont visibles que pendant la compilation. Symptôme : journal `"reason":"GH_TOKEN absent (secret du Worker)"`.
Premier déclenchement réel : run « Relais · horloge » 37253059962 (5 octobre 2026, 01:51 UTC, obs.json alors vieux de 2 h 32).

## Rotation de `RC_KEY`

Effectuée le 2 octobre 2026 sans coupure du relais (PR #8 et #9) : nouvelle clé générée par le propriétaire, jamais vue hors de GitHub ;
config du relais rechiffrée par un workflow de confiance exécuté depuis `main` ; double lecture temporaire `RC_KEY` / `RC_KEY_NEXT`,
puis bascule et suppression de tout le code transitoire. Pour une future rotation, ce mécanisme est à restaurer depuis l'historique Git.

## Build

```sh
node tools/build.js
```

- Avec `private/` : les réglages sont rechiffrés dans `encrypted/` s'ils ont changé.
- Sans `private/` (clone public, GitHub Actions) : `encrypted/` est utilisé tel quel. Le résultat est identique, octet pour octet, à la production.

## Tests

```sh
npm ci
node tools/build.js
node tests/run-ci.js              # Chromium
BROWSER=webkit node tests/run-ci.js   # WebKit (moteur de Safari), profil iPhone
```

- Lieu courant : `test_placectx.js` (19 scénarios : VPN, changement de VPN, relevé imprécis ou impossible, départ réel, trajet, fin de journée, domicile, aucune position, réseau seul, lieu générique ; 6 régressions rejetées) ; `e2e44-place.js` (PC au travail + VPN, rechargement, hors ligne puis reconnexion, départ, retour à la maison, GPS légitime, iPhone).
- État pneumatique : `test_tyrestate.js` (13 scénarios A–K et 4 régressions rejetées) ; `e2e46-tyrelink.js` (saisie dans Pneus reprise par Analyse, changement de jeu, rechargement, hors ligne, essieux).
- Moteur de preuves v2 : `test_evidence.js` (incident du 5 octobre rejoué avec les METAR réels, cas A–L, red team ; 7 régressions rejetées) ; `e2e45-evidence.js` (carte, signalement, modes, hors ligne).
- Onglet Analyse : `test_tyrelab.js` (26 scénarios physiques : nuit, trajet récent, arrêt court ou long, 2 °C contre 20 °C, pluie froide, ville contre autoroute, été contre hiver, chaleur, 0 °C, pluie forte, trajet court ou long, sans trajet, sans météo, pression ou pneu inconnus, fiche partielle ; 8 régressions rejetées) ; `e2e43-analyse.js` (iPhone 11 Pro Max et PC, monte inconnue, mémoire thermique, roulage suivi, hors ligne, données anciennes, météo absente, autres onglets intacts).
- Onglet Météo : `test_wxdesk.js` (28 scénarios du moteur pur et 8 régressions volontaires rejetées) ; `e2e42-meteo.js` (iPhone 11 Pro Max, PC 1280 et 1920, hors connexion, cache ancien, fournisseur en panne ou absent puis rétabli, aucun ou plusieurs trajets, lien vers Pneus, aucun nouveau fournisseur).
- Moteur GO / NO GO : `test_engine_verdicts.js` fige des vérités de sécurité (pluie verglaçante, neige et verglas en pneus été, brouillard, rafales, usure, monotonie au froid, pneu inconnu traité comme été) ; `engine-countertests.js` vérifie que dix régressions volontaires du moteur sont rejetées.
- Moteur (verdicts, chaussée, verglas), widget, puis parcours navigateur avec horloge et réseau simulés : jours de trajet, timeline (avant départ, en cours, après arrivée), lieux, mini-carte, GPS dynamique, Waze, automate du trajet (départ par le mouvement, arrivée à froid, marche, jitter, vitesse dérivée).
- Isolement réseau strict : proxy inexistant, service workers bloqués, refus par défaut. Aucun test ne peut joindre le vrai site ni le vrai agenda.
- Les tests n'utilisent **aucun secret ni donnée réelle** : préréglage, configuration du relais, agenda, géographie et clé sont fictifs (`tests/fixtures/`, `tests/relay-harness/mock_tt.js`, clé publique `race-control-ci-test-only`). L'agenda de test est produit par le vrai relais.
- Les vrais secrets ne servent qu'au job `confidentialite` : vérifier qu'aucune donnée réelle n'est publiée, sans navigateur ni build de l'app.
- GitHub Actions (`ci.yml`) lance la suite sur Chromium et WebKit à chaque modification. Les journaux publics ne contiennent que les verdicts, jamais la sortie brute.

## Déploiement (automatique)

Chaque modification poussée sur `main` passe par `ci.yml` : `confidentialite` → `tests (chromium)` + `tests (webkit)` → `deploy`.

- `deploy` ne s'exécute **que si les trois sont verts**. Il construit l'app depuis `encrypted/` (aucun secret), copie le build dans `gh-pages/race-control/` avec `tools/deploy-copy.js`, puis vérifie que la version servie par GitHub Pages est bien celle construite.
- Les fichiers du relais (`obs.json`, `calendar.sealed.json`) ne sont jamais touchés. La base pneus n'est remplacée que par une version plus récente.
- Chaque mise en production reçoit une étiquette `prod-N`, qui sert de point de retour arrière, et un `version.json` affiché dans Réglages → Version.
- Plus aucune publication manuelle sur `gh-pages` : tout passe par `main` et la CI.

## Retour arrière

Actions → **Race Control · tests** → **Run workflow** → `version` = `prod-N` (par exemple `prod-7`).

- L'étiquette est vérifiée, puis l'ancien code repasse **les mêmes contrôles** (confidentialité, Chromium, WebKit) avant d'être redéployé.
- Ce n'est jamais un reset de `gh-pages` : seuls les fichiers de l'app sont remplacés, les données fraîches du relais (`obs.json`, agenda) sont conservées.
- Réglages → Version affiche alors « prod-N · retour arrière ». Pour revenir à la dernière version, relancer avec l'étiquette la plus récente.

## Mises à jour des dépendances

Dependabot (`.github/dependabot.yml`) propose chaque samedi les mises à jour des actions GitHub et de Playwright sous forme de pull request, testées par la CI. Leaflet reste manuel : son empreinte SRI est fixée dans l'app.
