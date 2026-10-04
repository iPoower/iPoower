# Tyre Weather Race Control

Application web personnelle : avant chaque trajet (domicile-travail ou agenda), elle croise météo, observations, température de chaussée estimée, pneus montés et itinéraire pour donner un verdict de GO à NO GO.

- **Production** : https://ipoower.github.io/iPoower/race-control/ (branche `gh-pages`, dossier `race-control/`)
- **Relais** : `.github/workflows/race-control.yml` exécute `race-control/relay.js` (observations, agenda chiffré, notifications)

## Structure

| Dossier | Contenu |
|---|---|
| `src/` | Code source : `engine.js` (moteur partagé page + relais), `app.js` (interface), `demo.js`, `style.css`, `shell.html`, `sw.js`, `relay.js`, `widget.js`, `tiredb.json`, `static/` (icônes) |
| `tools/` | `build.js` (assemble `dist/`), `check-secrets.js` (garde-fou de confidentialité), `check-keys.js` (séparation des clés), `keys.js` (chiffrement partagé), `deploy-copy.js` (publication), `pre-commit` |
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
