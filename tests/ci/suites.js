// Registre unique des suites existantes ; aucun scénario E2E n'est modifié.
'use strict';
const SUITE = [
  ['test_engine.js', 'moteur : verdicts, chaussée, verglas', false], ['test_examples.js', 'moteur : cas de référence', false],
  ['test_engine_verdicts.js', 'moteur : vérités de sécurité GO / NO GO', false], ['engine-countertests.js', 'moteur : régressions de sécurité rejetées par les contre-tests', false],
  ['test_widget.js', 'widget iPhone (Scriptable simulé)', false], ['test_relay_clock.js', 'relais : horloge externe et mesure de fraîcheur', false],
  ['e2e17.js', 'réglages conservés lors d’une mise à jour', true], ['e2e18.js', 'astuces et mode Météo', true], ['e2e24.js', 'jours de trajet domicile-travail', true],
  ['e2e25.js', 'timeline : prochain trajet, en cours, arrivée', true], ['e2e26.js', 'lieux et Ma position', true], ['e2e27.js', 'mini-carte ordinateur et iPhone', true],
  ['e2e28.js', 'GPS dynamique : trajet vivant depuis la position', true],
  ['e2e29.js', 'navigation : ouvrir le trajet affiché dans Waze', true],
  ['e2e30.js', 'automate du trajet : départ par le mouvement, arrivée à froid', true]];
SUITE.push(['test_wardrobe.js', 'tenue : confort, pluie, vent et jours locaux', false], ['e2e31.js', 'onglet Tenue sartoriale et interface mobile', true]);
SUITE.push(['test_gps_requests.js', 'GPS : réponses réseau tardives après déplacement ou oubli', false],
  ['test_calendar_ids.js', 'agenda : identifiants techniques opaques et stables', false],
  ['test_tripcancel.js', 'annulation locale : purge, chaîne et contre-tests', false],
  ['e2e33.js', 'GPS : déplacements successifs, reprise iOS et réponses anciennes', true],
  ['e2e34.js', 'trajets : origine, aperçu volontaire et annulations locales', true]);
SUITE.push(['test_dayplan.js', 'plan de tenue : couches, transitions et dangers courts', false],
  ['dayplan-countertests.js', 'plan de tenue : mutations détectées par les contre-tests', false],
  ['e2e32.js', 'plan de tenue : agenda, lieux, météo et interface', true]);
SUITE.push(['e2e35.js', 'intégration : annulations, Tenue et aperçu GPS frais', true],
  ['e2e36.js', 'hors connexion : cache météo, agenda chiffré et reconnexion', true],
  ['e2e38-resume.js', 'reprise iOS : fraîcheur réelle, horloge, actualisation unique', true],
  ['e2e39-layout.js', 'iPhone 11 Pro Max et PC : débordement, cibles 44 pt, encoche, mêmes sections', true],
  ['e2e40-network.js', 'pannes fournisseur : 200 invalide, 429, 503, délai, agenda corrompu ou ancien', true],
  ['e2e41-sw-coldstart.js', 'service worker réel : démarrage à froid hors ligne, ancien cache, réseau muet', true, 'chromium'],
  ['e2e37-sw.js', 'service worker réel : Cache Storage, panne serveur et redémarrage offline', true, 'chromium']);
SUITE.push(['e2e37.js', 'agenda : rappels exclus des trajets et de Tenue, cache ancien et mobile', true]);
SUITE.push(['test_wxdesk.js', 'onglet Météo : verdict, chronologie, phénomènes, score route et contre-tests', false],
  ['e2e42-meteo.js', 'onglet Météo : iPhone, PC, hors ligne, panne, données anciennes, 0 ou plusieurs trajets', true]);
SUITE.push(['test_tyrelab.js', 'onglet Analyse : thermique, chauffe, refroidissement, adhérence, freinage, pression, confiance et contre-tests', false],
  ['e2e43-analyse.js', 'onglet Analyse : monte réelle, mémoire thermique, roulage, hors ligne, iPhone et PC', true]);
SUITE.push(['test_placectx.js', 'lieu courant : hiérarchie de confiance, garde de précision, fin de confirmation et contre-tests', false],
  ['e2e44-place.js', 'lieu courant : PC au travail + relevé navigateur approximatif, hors ligne, rechargement, départ, retour, GPS légitime', true]);
SUITE.push(['test_evidence.js', 'moteur de preuves v2 : brouillard, contradictions, pire crédible, confiance par phénomène, incident du 5 octobre', false],
  ['e2e45-evidence.js', 'moteur de preuves v2 : carte, signalement terrain, mode fantôme ou actif, hors ligne, iPhone', true]);
SUITE.push(['test_tyrestate.js', 'état pneumatique unique : profondeur, pression, DOT, jeux, essieux, mémoire et contre-tests', false],
  ['e2e46-tyrelink.js', 'liaison Pneus → Analyse : saisie reprise, changement de jeu, rechargement, hors ligne', true]);
SUITE.push(['e2e48-tripstart.js', '« Je pars maintenant » : avant départ, en cours hors ligne, rechargement, arrivée et historique thermique', true]);
SUITE.push(['e2e47-autorefresh.js', 'auto 5 min : nouvelle météo dans Pneus, Météo, Tenue et Analyse, sans clic, onglets masqués compris', true]);
SUITE.push(['test_settings_work.js', 'réparation de l’ancien ajout de destination, choix explicites préservés', false],
  ['test_weather_requests.js', 'API météo : concurrence, doublons, HTTP 429, reprise et délai réseau', false]);
SUITE.push(['test_geolocation.js', 'localisation : précision, provenance, géofences, hystérésis et drift', false],
  ['e2e49-interactions.js', 'commandes : clics réels PC/iPhone, saisie, clipboard, recherche dynamique et rerender', true],
  ['e2e50-geolocation.js', 'localisation : erreurs, priorité GPS, retour de veille, permissions, IP, drift et override', true]);
// Retour rapide sur la file réseau : GPS remplacé, lieux et reprise HTTP 429 avant les longs parcours.
const FIRST = ['test_weather_requests.js', 'test_gps_requests.js', 'e2e33.js', 'e2e30.js', 'e2e44-place.js', 'e2e40-network.js'];
SUITE.sort((a, b) => (FIRST.includes(a[0]) ? FIRST.indexOf(a[0]) : FIRST.length) - (FIRST.includes(b[0]) ? FIRST.indexOf(b[0]) : FIRST.length));

SUITE.push(['test_road_intelligence.js', 'route : géométrie, sens, progression, validité, dédoublonnage et alertes', false],
  ['test_road_providers.js', 'fournisseurs : pannes isolées, fraîcheur, quota, cache licite, annulation et flux', false],
  ['test_road_datex.js', 'DATEX serveur : snapshot, deltas, fin, validité, atomique et conservation au déploiement', false],
  ['e2e51-road.js', 'Live Road Intelligence : cockpit PC/iPhone, clics, OSRM, DATEX, fraîcheur, panne et confidentialité', true],
  ['e2e52-road-sw.js', 'SW réel : migration v9/v10, DATEX, hors ligne, rétention et aucun faux LIVE', true, 'chromium']);
SUITE.push(['test_app_source.js', 'assemblage statique : ordre, portée et inclusions sûres', false], ['test_ci_lanes.js', 'CI : isolation, couverture complète et refus des faux verts', false]);
module.exports = { SUITE };
