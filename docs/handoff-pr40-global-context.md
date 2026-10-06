# Checkpoint PR #40 — contexte global Race Control

## Reprise quota critique — 6 octobre, validation ciblée

DERNIER COMMIT produit : `d9973acaa87cf144c54529ca123e8e55f4ea2ebc`.
e2e50 Chromium : **vert**, 41 s.
e2e50 WebKit : **vert**, 79 s.
Preuve : https://github.com/iPoower/iPoower/actions/runs/37437358482
(job `112182343005`, checkout du SHA ci-dessus).
e2e53 Chromium : run `37438002486` rouge, diagnostic complet obtenu ; fixture corrigée, à retester.
e2e53 WebKit : après Chromium vert.

Cause exacte e2e53 : PC/configuré, Pneus, départ de l'aller,
`#secBrf [data-act=trip-start]` absent (visible/enabled faux, aucun overlay).
USER_STORE domicile confirmé, aucun départ/arrivée ; APP_CONTEXT domicile,
prochain aller lundi 12 octobre 06:30. Le jeudi du scénario n'était pas dans les
jours travaillés du preset fictif `[1,2,3]`. Correction limitée au scénario :
déclarer explicitement ce jeudi travaillé. Aucun trajet inventé dans le produit.
Erreur complète : logs du job `112185043500`, run ci-dessus.
Deuxième diagnostic e2e53 : run `37438637685`, job `112186595250`.
La réouverture remettait artificiellement l'horloge à T0+5 min : nouvelle
confirmation Travail `1791433505011`, arrivée Maison antérieure dans le parcours
mais timestamp `1791433532365`. L'assertion `nextDir` échouait (`go !== ret`).
La fixture conserve désormais l'heure du scénario avant fermeture, sans retour
en arrière ; la garde produit sur les arrivées plus récentes reste intacte.
Run suivant `37439115848` : les quatre cycles et le soir passent sur Chromium.
Dernière assertion fragile : `#notice` affiche « MÉTÉO INDISPONIBLE » via CSS,
alors que la regex était sensible à la casse. Comparaison passée en `/i`, sans
modifier le produit ni retirer les assertions de contexte. À retester.

CAUSES CORRIGÉES : les boutons du checkpoint sont validés sur les deux moteurs.
La première acquisition GPS précise dans une géofence exige désormais un second
relevé cohérent. Un GPS stocké en attente ne devient pas un lieu logique à la
première observation après reload. Les nouvelles régressions e2e50 vérifient le
point initial au travail, sa réouverture, le lieu canonique indéterminé et
l'absence de confirmation/arrivée inventée ; le cycle GPS continue à passer.
`TMAP.map.invalidateSize` ne réapparaît pas dans ces deux exécutions.

PROCHAINE ACTION : uniquement e2e53 Chromium, puis WebKit. Le label `quota-ciblee`
suspend la CI complète pour cette branche ; `pr40-targeted.yml` exécute uniquement
e2e50, ou uniquement e2e53 avec le label `e2e53-only`. Aucun secret ni déploiement.
Retirer ces labels après autorisation de la validation complète, pas avant.
Le passage local e2e50 a été bloqué par l'exécutable Playwright absent ; les
résultats ci-dessus proviennent du runner GitHub. Les sections suivantes sont
le checkpoint historique et ne remplacent pas ces résultats ciblés plus récents.

Checkpoint demandé le 6 octobre 2026 à 09:56 Europe/Paris. Reprise de travail
uniquement sur instruction suivante : laisser la PR en draft, sans fusion ni
déploiement, sans nouveau développement DATEX ou Live Road Intelligence.

## Références à reprendre

- Dépôt : `iPoower/iPoower`.
- Branche : `fix/global-user-context`.
- PR : https://github.com/iPoower/iPoower/pull/40 — ouverte, draft.
- Worktree actuel : `/workspace/scratch/c37ae37579f7/global-user-context`.
- Dernière révision testée par la CI complète :
  `d57c06d3e082770aa1dc3c4eeac76fc305c7ed86`.
- Run complet : https://github.com/iPoower/iPoower/actions/runs/37432042133.
- Confidentialité PR verte sur cette révision :
  https://github.com/iPoower/iPoower/actions/runs/37432037595.
- `main` vérifié : `955f901adaa024eb430cf20467aba37f5c27a8dc`.
- Production inchangée pour cette tâche : prod-34, SW `twrc-static-v10`.
  Le SW v11 appartient au correctif non déployé.
- Le SHA exact du commit de checkpoint est indiqué dans la PR et le handoff
  de conversation ; `git rev-parse HEAD` le restitue après checkout de la branche.
  Le message contient `[skip ci]` pour éviter un nouveau passage complet au push.

## OBSERVE et DIAGNOSE déjà effectués

Reproduction sur la production réelle, avec un profil public fictif utilisant
les lieux par défaut Paris/Lille, sans déverrouillage de données personnelles.
À 07:43, la confirmation au travail clôture l’aller dans Pneus, propose le retour
dans Météo/Analyse et survit au reload. Tenue conserve pourtant un segment
domicile → travail jusqu’à 08:10. Un retour annoncé à 07:48 reste absent de son
plan. Il ne faut pas prétendre que la confirmation manuelle au travail était
systématiquement perdue au reload : ce n’était pas le défaut reproduit.

Cause racine : `PLACE` gérait la confirmation, `LIVE` détenait le moteur de suivi,
le briefing produisait ses trajets pendant son rendu et `buildTenueDay`
reconstruisait une autre journée depuis le domicile et les horaires. Certains
handlers rendaient seulement le briefing. Les dérivations et les rendus pouvaient
donc publier plusieurs réalités pour un même utilisateur.

## Architecture actuelle

- `src/userctx.js` : store pur `userContextStore`, document canonique
  `twrc.context.v1`, transactions imbriquées avec une publication, révision et
  timestamps. Stockage refusé : maintien cohérent en mémoire.
- `src/app/user-context.js` : `USER_STORE`, adaptateurs `PLACE`, `GPS`,
  `TRIPSTART`, `TRIPEND`, `RETURNHOME` sur le même document, puis
  `APP_CONTEXT.snapshot` commun avant tous les rendus.
- Lieu confirmé et dernier lieu fiable, observation GPS acceptée, départ réel
  minimal, arrivées terminées, retour demandé et horodatages sont partagés.
  Les géométries de route et les plans de tenue restent en mémoire.
- `APP_CONTEXT.snapshot` expose lieu/statut, origine, destination, trajet actif,
  prochain trajet, départ, événement Agenda associé, GPS, retour et fraîcheur.
  `BRF_TRIPS`/`BRF_SHOWN` sont des adaptateurs de cette projection, pas des copies
  détenues par Pneus. `LIVE` reste le moteur GPS, pas un contexte utilisateur par vue.
- Arrivée : terminer le trajet et fixer le lieu dans une même transaction.
  Départ : conserver l’origine et le départ réel, puis dériver les prévisions.
  Le trajet démarré reste restaurable après son horaire d’arrivée prévu.
- Persistance : écrire d’abord le document canonique atomique, ensuite les
  anciennes clés de compatibilité. Les anciennes clés ne sont relues qu’en
  migration si le document canonique est absent.
- Synchronisation entre vues par abonnement ; entre fenêtres par l’événement
  `storage`, avec refus des événements retardés contredits par le stockage actuel.
  À la reprise/focus/pageshow, réévaluer la fraîcheur du même contexte.
- SW `twrc-static-v11`, cache public `twrc-data-v3` conservé, anciens shells purgés.
  Pas de GPS ou de réponses de fournisseurs externes en Cache Storage.

## Règles métier établies

**Planning = prédiction.**
**GPS = observation.**
**Confirmation utilisateur = fait explicite.**
**Contexte global = arbitre.**

Un lieu reconnu par GPS au travail est une observation ; il n’est pas une
confirmation utilisateur d’arrivée. Le GPS ne remplit pas `PLACE.conf` comme si
un bouton avait été pressé. Une arrivée automatique exige les observations
cohérentes de l’automate, et ne doit pas être inventée depuis l’horaire.

Un seul point GPS isolé ne doit pas suffire à modifier le lieu canonique.
Garder les règles de précision, fraîcheur, hystérésis, second relevé cohérent
et rejet des sauts impossibles. Le remplacement d’un lieu fiable antérieur
est déjà protégé. À analyser encore : l’acquisition initiale sans lieu antérieur
reconnaît actuellement une géofence dès un premier GPS précis dans le test
historique `e2e50`. Ce comportement ne doit pas être présenté comme une exception
validée à la règle demandée ; distinguer observation affichée et lieu canonique.

Une confirmation et un départ annoncés plus récents priment sur un ancien GPS.
Réévaluer les prévisions au créneau actuel ne rouvre pas automatiquement la
fenêtre GPS d’un vieux départ planifié. Une arrivée plus récente invalide un
ancien départ à l’hydratation. Un horaire passé seul ne signifie pas « en cours ».

Les chips de lieu sont une consultation météo explicitement libellée ; elles
ne déclarent pas un déplacement. « Demain » dans Tenue reste une projection du
planning. Sans lieu réel connu, conserver les prévisions du planning au lieu
d’inventer une position actuelle.

## Correctifs implémentés et état de validation

- Tenue utilise le lieu et le trajet effectifs : l’aller terminé après une
  arrivée au travail et un retour anticipé ne restent plus des segments actifs.
- Météo de route et Tenue utilisent les heures du départ réel ; la clé du trajet
  prévu reste stable pour sa clôture. Analyse utilise ce même départ pour le roulage.
- Un GPS domicile antérieur à la confirmation au travail ou au départ du retour
  ne devient pas l’origine du retour, y compris à l’hydratation.
- Une confirmation d’arrivée plus récente clôture un ancien départ contradictoire.
- Météo lit le trajet actif global pour « en cours », pas seulement les horaires.
- L’arrivée à un lieu Agenda conserve la météo déjà récupérée pour cette
  destination, avec son timestamp d’origine, sans la rajeunir artificiellement.
- Sans lieu physique connu, la planification Tenue continue de prévoir les
  activités et trajets ; les événements inconnus ne reçoivent pas une météo inventée.
- Réouverture, migration d’anciennes clés et cache SW, puis fonctionnement PWA
  hors ligne sont couverts par `e2e54-context-sw.js`, vert sur le dernier run complet.
- Le créneau météo actuel ne rouvre plus automatiquement le suivi GPS d’un vieux
  départ ; les assertions GPS de premier point/second point avancent désormais
  jusqu’au blocage de bouton décrit plus bas dans `e2e50-geolocation.js`.
- Les callbacks différés de mini-carte/radar capturent l’instance et vérifient
  qu’elle est encore courante avant `invalidateSize`. L’exception WebKit précédente
  n’apparaît plus dans le dernier run ; `e2e50` n’est cependant pas encore vert.

Le cycle complet de `e2e53` n’est pas validé : ne pas déclarer la correction
fonctionnelle terminée. Les succès historiques et PWA ne suffisent pas à cela.

## Dernières modifications incluses dans le checkpoint

Ces modifications suivent le run complet `d57c06d` et n’ont pas encore été
retestées dans les navigateurs :

1. `renderPlace` conserve les confirmations Maison et Travail même quand une
   suggestion d’arrivée existe. Avec un lieu déjà confirmé, l’autre lieu reste
   directement confirmable. Même design et composants de boutons existants.
2. `e2e53-global-context.js` ajoute `action(...)` et une phase pour les principaux
   clics, puis aplatit l’erreur finale afin que le résumé CI conserve le sélecteur
   et le call log d’un timeout.

Les 26 unitaires ont terminé au vert sur ce code local après ces modifications
(rapport complété à `2026-10-06T07:57:50.557Z`, durée 4,4 s). Syntaxe et
`git diff --check` ont également passé. Aucun nouveau run navigateur complet
ne doit être déclenché pour le checkpoint.

## Résultats réellement terminés

Dernier run complet `37432042133` : **86/90 exécutions vertes**,
soit 26/26 unitaires, 32/34 Chromium et 28/30 WebKit. Verdict global rouge.

| Contrôle | Résultat sur `d57c06d` | Preuve |
| --- | --- | --- |
| Unitaires + contre-tests | 26/26 verts | job `112164968361` |
| Chromium shard 2/3 | 12/12 verts | job `112165100767` |
| WebKit shard 1/3 | 10/10 verts | job `112165100845` |
| WebKit shard 3/3 | 10/10 verts | job `112165100829` |
| Chromium shard 1/3 | 9 verts, `e2e50` rouge | job `112165100613` |
| Chromium shard 3/3 | 11 verts, `e2e53` rouge | job `112165101007` |
| WebKit shard 2/3 | 8 verts, `e2e50` et `e2e53` rouges | job `112165100687` |
| PWA, migration v10/v11, cycle et réouverture hors ligne | `e2e54-context-sw.js` vert, Chromium | shard Chromium 2/3 |
| Timeline planifiée sans départ inventé | `e2e25.js` vert, Chromium et WebKit | Chromium 3/3, WebKit 1/3 |
| Tenue, agenda, lecture seule et interface | `e2e32.js` vert, Chromium et WebKit | Chromium 1/3, WebKit 1/3 |
| Version, relay-smoke | verts | jobs `112164932336`, `112164968426` |
| Confidentialité PR | verte | run `37432037595` |
| Validation globale | rouge, conformément aux 4 échecs | job `112167716958` |
| Déploiement | sauté | job `112167789330` |

Le job de confidentialité de production et le rollback sont normalement sautés
sur cette PR ; ne pas les présenter comme des contrôles production verts.

Unitaires exacts : `test_weather_requests.js`, `test_gps_requests.js`,
`test_engine.js`, `test_examples.js`, `test_engine_verdicts.js`,
`engine-countertests.js`, `test_widget.js`, `test_relay_clock.js`,
`test_wardrobe.js`, `test_calendar_ids.js`, `test_tripcancel.js`,
`test_dayplan.js`, `dayplan-countertests.js`, `test_wxdesk.js`,
`test_tyrelab.js`, `test_placectx.js`, `test_evidence.js`, `test_tyrestate.js`,
`test_settings_work.js`, `test_geolocation.js`, `test_road_intelligence.js`,
`test_road_providers.js`, `test_road_datex.js`, `test_userctx.js`,
`test_app_source.js`, `test_ci_lanes.js`.

Les suites Road/DATEX citées sont des régressions existantes conservées. Aucun
fournisseur, flux ou synchroniseur DATEX n’est modifié. Dans `e2e52-road-sw.js`,
seul le nom attendu du cache statique passe à v11 pour le correctif PWA.

## Échecs restants et classification

### `e2e25.js` — Chromium et WebKit : désormais vert

Anciennes attentes : « Trajet en cours » à 15:36/16:10 le samedi et 06:31/07:11
le lundi, sans clic de départ ni mouvement GPS. C’étaient des attentes historiques
incompatibles avec la règle métier demandée. Les tests vérifient maintenant le
trajet prévu pertinent et exigent l’absence de trajet actif et de « Trajet en cours ».
Les 11 scénarios passent sur les deux moteurs. Ne pas réintroduire une activité
automatique depuis l’horloge pour satisfaire les anciennes assertions.

### `e2e50-geolocation.js` — Chromium et WebKit : rouge

Erreur exacte publiée :
`locator.click: Timeout 30000ms exceeded. Call log: - waiting for locator('#placeBar [data-act=place-confirm][data-place=home]')`.

Dernière étape indiquée : `PC · oublier : anciens callbacks ignorés`, puis clic
de confirmation Maison après désactivation du GPS. Le test attend un bouton
qui était masqué par une suggestion d’arrivée au travail.

Classification : vraie régression UX exposée par le nouveau prochain trajet
pertinent, pas une assertion à supprimer. Le checkpoint corrige la visibilité
des confirmations dans `renderPlace`. Prochaine action : test ciblé sur les
deux navigateurs, conserver les assertions d’hystérésis et de GPS isolé, puis
vérifier séparément la sémantique d’acquisition initiale décrite plus haut.

L’échec précédent `PC · un point au travail ne suffit pas`, `'work' !== 'home'`,
provenait de nouvelles demandes GPS automatiques ouvertes par le créneau météo
recalculé. La garde sur le départ prévu corrige ce chemin ; le dernier run passe
cette étape et progresse jusqu’au bouton Maison. Ne pas confondre ces deux échecs.

### `e2e53-global-context.js` — Chromium et WebKit : rouge

Erreur exacte publiée sur le dernier run :
`locator.click: Timeout 30000ms exceeded.`

Le résumé CI n’expose pas le sélecteur ni la phase de ce clic. Le timeout n’est
pas une assertion de contexte documentée : l’échec interrompt le parcours avant
son bilan. Hypothèse à confirmer : le même masquage de confirmation, notamment
la reconfirmation Travail depuis Maison déjà confirmée. Ne pas prétendre avoir
identifié le clic exact à partir de la sortie tronquée.

Classification : blocage d’interaction, cause exacte encore à isoler ; possible
régression UX corrigée par le dernier patch de barre globale. Diagnostics du
checkpoint : phase des clics principaux et message d’erreur aplati.

Ancienne assertion fragile résolue : comparaison sensible à la casse de
`#secCur`, dont `innerText` était transformé en majuscules par CSS. Le test compare
désormais les noms sans dépendre de cette présentation. Le jeudi 8 octobre est
utilisé pour le cycle afin d’avoir un jour travaillé sans rendez-vous Agenda
intermédiaire dans le harnais fictif ; l’Agenda ne doit pas être ignoré dans le produit.

### WebKit `TMAP.map.invalidateSize` : exception précédente, absente du dernier run

Erreur précédente sur `0427dca` :
`clock.runFor: TypeError: null is not an object (evaluating 'TMAP.map.invalidateSize')`.

Cause : callback différé après destruction/remplacement de carte au rerender.
Correction déjà publiée dans `d57c06d` : capturer l’instance et vérifier son
identité avant l’invalidation, même garde pour le radar. Le dernier run WebKit
avance au-delà de cette étape et échoue sur le bouton Maison. Retester via
`e2e50` ; ne pas déclarer le parcours complet vert à partir de l’absence de cette erreur.

## Reprise exacte

1. Lire ce fichier et la PR #40 ; vérifier la branche distante, son HEAD et le
   statut draft. Préserver tous les autres worktrees.
2. Reprendre uniquement les suites ciblées `e2e50-geolocation.js` et
   `e2e53-global-context.js`, Chromium puis WebKit, en conservant leurs sorties
   complètes et la première phase/sélecteur en échec.
3. Commandes ciblées du runner existant, depuis le worktree :

   ```sh
   node tests/run-ci.js --lane browser --suite e2e50-geolocation.js --suite e2e53-global-context.js
   BROWSER=webkit node tests/run-ci.js --lane browser --suite e2e50-geolocation.js --suite e2e53-global-context.js
   ```

   Ce sont des simulations réseau fermées et des données fictives. Dans cet
   environnement, le lancement local de Chromium a été refusé par la politique
   d’exécution : ne pas contourner ce blocage par des privilèges/flags nouveaux.
   Choisir un environnement de test autorisé si ce blocage persiste. Le workflow
   GitHub existant exécute la suite complète ; il n’offre pas d’entrée ciblée.
   Ne pas le relancer pour le checkpoint.
4. Si un échec persiste, capturer état canonique, contrôles DOM effectivement
   disponibles et erreur complète avant d’éditer. Ne pas masquer par reload,
   délais arbitraires, suppression des assertions ou invention d’une arrivée.
5. La suite complète et la vérification production attendront une reprise
   autorisée et des tests ciblés verts. L’ordre reste OBSERVE → DIAGNOSE → FIX →
   TEST → VERIFY. Une simulation 414×896/WebKit ne prouve pas un essai sur iPhone physique.

## Fichiers principaux

- `src/userctx.js`, `src/app/user-context.js`, `src/app.js`.
- `src/app/weather-view.js`, `src/app/analysis-view.js`, `src/app/lifecycle.js`,
  `src/wxdesk.js`, `src/sw.js`, `tools/build.js`.
- `tests/test_userctx.js`, `tests/e2e53-global-context.js`,
  `tests/e2e54-context-sw.js`, `tests/lib/context-session.js`.
- Adaptations nécessaires des suites historiques : `e2e25`, `e2e28`, `e2e30`,
  `e2e32`, `e2e33`, `e2e34`, `e2e44-place`, `e2e50-geolocation`, `e2e52-road-sw`,
  et du registre/contrôle de couverture CI.
- `docs/global-user-context.md`, ce handoff.

À ne surtout pas faire : fusionner ou déployer #40, démarrer une nouvelle
fonctionnalité, modifier DATEX, forcer un reload pour synchroniser, déclarer
les derniers correctifs validés sur navigateur ou le cycle complet réparé.
