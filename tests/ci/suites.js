// Registre unique des suites existantes ; aucun scénario E2E n'est modifié.
'use strict';
const SUITE = [
  ['test_live_status.js', 'horloge Paris, dates/DST, réception, fraîcheur et échéance réelle', false],
  ['e2e79-live-status.js', 'bandeau LIVE : secondes sans réseau, reprise, focus, caches, 429 et mobile/PC', true],
  ['test_tyre_intelligence.js', 'essais pneus : catalogue, comparabilité, règles, positions et sauvegardes', false],
  ['e2e78-tyre-intelligence.js', 'intelligence pneus : quatre vues, preuves, iPhone/PC, hors ligne et absence de mutation', true],
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
  ['test_trip_projection.js', 'passages : heures météo distinctes, kilomètres monotones, même projection dans briefing et Analyse', false],
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
const FIRST = ['e2e81-live-route.js', 'e2e78-tyre-intelligence.js', 'e2e67-controls-safety.js', 'test_weather_requests.js', 'test_gps_requests.js', 'e2e33.js', 'e2e30.js', 'e2e44-place.js', 'e2e40-network.js'];
SUITE.sort((a, b) => (FIRST.includes(a[0]) ? FIRST.indexOf(a[0]) : FIRST.length) - (FIRST.includes(b[0]) ? FIRST.indexOf(b[0]) : FIRST.length));

SUITE.push(['test_road_intelligence.js', 'route : géométrie, sens, progression, validité, dédoublonnage et alertes', false],
  ['test_road_providers.js', 'fournisseurs : pannes isolées, fraîcheur, quota, cache licite, annulation et flux', false],
  ['test_road_datex.js', 'DATEX serveur : snapshot, deltas, fin, validité, atomique et conservation au déploiement', false],
  ['e2e51-road.js', 'Live Road Intelligence : cockpit PC/iPhone, clics, OSRM, DATEX, fraîcheur, panne et confidentialité', true],
  ['e2e52-road-sw.js', 'SW réel : migration v9/v11, DATEX, hors ligne, rétention et aucun faux LIVE', true, 'chromium'],
  ['test_sw_cache_boundaries.js', 'SW : routes de récupération/config isolées du shell et alias hors ligne explicites', false],
  ['test_path_guard.js', 'Réglages : pollution de prototype refusée et édition légitime préservée', false]);
SUITE.push(['test_userctx.js', 'contexte global : migration, transactions, persistance, fraîcheur et fenêtres', false],
  ['e2e53-global-context.js', 'contexte global : cycle maison/travail/retour dans les quatre vues, profils, iPhone/PC et rechargement', true],
  ['e2e54-context-sw.js', 'contexte global et vrai SW : migration v10/v11, cache, cycle de trajet et réouverture PWA hors ligne', true, 'chromium']);
SUITE.push(['test_app_source.js', 'assemblage statique : ordre, portée et inclusions sûres', false], ['test_ci_lanes.js', 'CI : isolation, couverture complète et refus des faux verts', false]);
SUITE.push(['test_day_context.js', 'contexte du jour : destination, origine, expiration, voiture et Tenue', false], ['e2e55-day-context.js', 'contexte du jour : vrais taps mobile/PC, quatre vues, profils et reload', true]);
SUITE.push(['test_debrief.js', 'débrief : arrivée unique, snapshot, observation et fiabilité locale', false],
  ['debrief-countertests.js', 'débrief : mutations de clôture, preuves, confidentialité et rétention rejetées', false],
  ['e2e56-debrief.js', 'débrief : vrais clics iPhone/PC, trois chemins d’arrivée, annulation, quatre vues et reload', true]);
SUITE.push(['test_calib.js', 'retours terrain : observation d’abord, correction par lieu à 5 retours cohérents, contre-tests', false]);
SUITE.push(['e2e57-place-compact.js', 'lieu confirmé compact : Modifier, GPS refusé, départ, quatre vues, fenêtres et hauteur iPhone/PC', true]);
SUITE.push(['test_reliability.js', 'fiabilité : journal runtime privé, anti-boucle PWA et cohérence de version', false]);
SUITE.push(['test_backup.js', 'sauvegarde V2 : contexte durable, confidentialité, compatibilité V1 et journal des trajets jamais effacé', false],
  ['e2e58-import-journal.js', 'import d’une sauvegarde : journal des trajets conservé, trajet clos non redemandé, iPhone/PC et reload', true]);
SUITE.push(['e2e60-lock.js', 'verrouillage réel puis déverrouillage, import refusé sans faux succès, iPhone/PC (vérification indépendante de l’audit A01/A02)', true]);
SUITE.push(['e2e61-rain-signal.js', 'pluie possible : AROME 0 mm contre 90 % du modèle de base, sources citées, score prudent et Tenue cohérente, iPhone/PC (audit A03)', true]);
SUITE.push(['test_profile_check.js', 'profil générique : lieux d’exemple, monte à renseigner, verrouillage et planning impossible repérés, contre-tests (audit A06)', false]);
SUITE.push(['test_no_plain_secrets.js', 'sécurité : garde-fou contre toute réintroduction de twrc.key / twrc.plain en clair', false]);
SUITE.push(['test_session_vault.js', 'sécurité : coffre de session chiffré, migration sans perte, reprise, stockage plein/refusé, multi-onglets, contre-tests', false]);
SUITE.push(['e2e64-security.js', 'sécurité : migration d’un ancien profil en clair, rien de sensible au repos, codes, réouverture, verrouillage, CSP, iPhone/PC', true]);
SUITE.push(['e2e65-cockpit.js', 'cockpit Pneus : décision d’abord, trajet visible, cohérence décision/confiance/alerte, scénarios pluie/brouillard/données insuffisantes, onglet et voiture conservés, iPhone/tablette/PC', true]);
SUITE.push(['e2e63-generic-profile.js', 'profil générique : aperçu au lieu de GO/100, planning impossible sans chauffe, verdict rétabli avec un vrai profil, iPhone/PC (audit A06)', true]);
SUITE.push(['test_montagne.js', 'Loi Montagne : département reconnu quelle que soit la source, période, source datée et contre-tests (audit A05)', false],
  ['test_vigilance.js', 'vigilance : département exact, bulletin daté, niveaux J/J1, absence et expiration neutres', false],
  ['e2e62-montagne.js', 'Loi Montagne : destination BAN conservée jusqu’au briefing après rechargement, même vigilance depuis Réglages, iPhone/PC (audit A05)', true]);
SUITE.push(['e2e59-brief-gum.js', 'briefing : gomme estimée au départ et à l’arrivée, fenêtre atteinte ou non, Détail → Analyse, iPhone/PC', true]);
SUITE.push(['test_decision.js', 'synthèse : décision, confiance qualitative et changements significatifs', false]);
SUITE.push(['test_geosearch.js', 'géocodage : adresse France IGN/BAN, monde OSM et replis réseau', false]);
SUITE.push(['e2e59-trip-tab.js', 'onglet TRAJET : adresse exacte, priorité manuelle, véhicule, horaire, reload, offline, annulation et mobile', true]);
SUITE.push(['test_device_storage.js', 'stockage : import vérifié, récupération et verrouillage chiffré sans perte du journal', false]);
SUITE.push(['test_branch_protection.js', 'protections GitHub : droits admin, lecture réelle, idempotence et publications conservées (API fictive)', false],
  ['e2e67-controls-safety.js', 'PC/iPhone : libellés uniques, historique météo après LIVE/reload, confirmations et annulations sans perte', true]);
SUITE.push(['test_calendar_origin.js', 'origines agenda : portée, nettoyage, règles et fusion des sauvegardes', false],
  ['e2e68-calendar-origin.js', 'Météo : départ par rendez-vous, route/météo, chiffrement, offline, GPS, PC et iPhone', true]);
SUITE.push(['test_wear_consistency.js', 'usure : seuil unique, essieu, fraîcheur et projections numériques cohérents', false],
  ['e2e69-wear.js', 'usure : saisies réelles PC/iPhone, taux partagé, rechargement et hors ligne', true]);
SUITE.push(['test_f1_pure.js', 'F1 Pure : six moteurs prudents, sans invention ni mutation', false],
  ['e2e70-f1-pure.js', 'F1 Pure : modules OFF par défaut, activation et rechargement PC/iPhone', true]);
SUITE.push(['test_garage.js', 'Garage : fiches techniques canoniques, relevés, plans hiver, sources et invariants', false],
  ['e2e71-garage.js', 'Garage : navigation 5 onglets, données véhicules et état, réglages, reload et offline PC/iPhone', true]);
SUITE.push(['e2e72-mobile-ux.js', 'UX mobile : cinq onglets, détails accessibles, focus, petits écrans, rechargement, données et hors ligne', true]);
SUITE.push(['e2e73-weekly-login.js', 'sécurité iPhone/PC : session 7 jours en IndexedDB, révocation, expiration et refus', true]);
SUITE.push(['test_route_radar.js', 'Route Radar : points réels, ETA, couverture, fraîcheur et absence de mutation', false],
  ['e2e80-route-radar.js', 'Route Radar PC/iPhone : points météo, replis, annulation, offline, focus et zéro nouvelle requête', true]);
module.exports = { SUITE, FIRST };
SUITE.push(['test_live_engine.js', 'live : horloge, provenance, données partielles, horizon et réponses tardives', false]);
SUITE.push(['e2e74-live-offline.js', 'Live/Offline : minuit, heures offline, données anciennes/partielles, reconnexion et 429 iPhone/PC', true]);
SUITE.push(['test_offline_weather.js', 'prévisions secondaires : cache, 503, offline prolongé, dates et reprise sans doublons', false]);
SUITE.push(['test_weather_watch.js', 'Weather Watch : provenance, seuils, hystérésis, journal, cache et rétention en mémoire', false],
  ['e2e74-weather-watch.js', 'Weather Watch PC : station facultative, reprise, alertes, mini-cockpit, Web Locks et iPhone préservé', true]);
SUITE.push(['test_web_security.js', 'Forteresse : CSP, assets signés, chemins sûrs et périmètre SW', false],
  ['e2e75-fortress-web.js', 'Forteresse iPhone/PC : XSS, scripts refusés, SRI et frontière d’origine', true]);
SUITE.push(['test_config_import.js', 'Forteresse III : liens privés, validation, coffre atomique, refus et données conservées', false],
  ['e2e76-config-import.js', 'Forteresse III PC/iPhone : vrais imports fictifs, verrouillage, URL et réouverture', true]);
SUITE.push(['e2e77-provider-limited.js', 'Incident 429 du 14/10 iPhone/PC : LIMITÉ ≠ HORS LIGNE, boutons en pause, zéro requête, ancien lien de configuration', true]);
SUITE.push(['test_road_policy.js', 'chaussée mouillée/humide : une seule définition pour le verdict, l’Analyse et le poste Météo, contre-tests', false]);
SUITE.push(['test_journey_replay.js', 'Journey Replay : prévisions archivées, déclaration conducteur, annulations, reprise et absence de télémétrie', false]);
SUITE.push(['e2e80-journey-replay.js', 'Journey Replay : avant/après, pause, réduction du mouvement, annulations, DOM stable et iPhone/PC', true]);
SUITE.push(['test_mission_control.js', 'Mission Control : projection canonique, provenance, absence, hors-ligne et absence de mutation', false]);
SUITE.push(['test_ux_mobile.js', 'UX mobile lot 1 : aucun texte sous 11 px, bandeau LIVE compact, cibles 44 pt et libellés', false]);
SUITE.push(['test_live_route.js', 'Live Route : géométrie, progression, GPS périmé/imprécis, secteurs et prévisions ponctuelles', false],
  ['e2e81-live-route.js', 'Live Route premium PC/iPhone : vraie carte, simulation, GPS, reprise, focus, thèmes et nettoyage', true]);
SUITE.push(['test_sync_merge.js', 'fusion PC ↔ iPhone (étape 1) : journal cumulatif, relevés additifs, réglages par chemin sans arbitrage d’horloge, état de l’appareil jamais importé', false]);
SUITE.push(['test_key_recovery_matrix.js', 'clés : appareil vierge, perte des deux appareils, code préréglage ≠ coffre, mauvais code, ancienne copie, Control Vault sans clé', false]);
SUITE.push(['test_data_coverage.js', 'couverture des données : chaque clé classée, export/Drive conformes au code, exclusions justifiées', false]);
SUITE.push(['test_sync_three_way.js', 'fusion à trois voies : ancêtre commun, horloges décalées, conflits consultables et résolution explicite', false]);

SUITE.push(['test_control_vault_packet.js', 'Control Vault : codec propriétaire V1, WebCrypto/AAD, archive intégrale et refus sans écriture', false],
  ['e2e82-control-vault-packet.js', 'Control Vault : chiffrement propriétaire Chromium/WebKit, profils PC/iPhone et fermeture des sessions', true]);
SUITE.push(['test_origin_build.js', 'origine dédiée : SW et CSP reçoivent la seule base de données autorisée, en-têtes complets, publication Cloudflare inactive et approuvée', false],
  ['e2e84-sw-data-origin.js', 'origine dédiée : vrai SW, données du relais lues en CORS gardées hors ligne, rien d’autre persisté', true, 'chromium']);
SUITE.push(['test_sync_key.js', 'synchronisation lot D1 : clé dérivée une fois, reprise sans code, expiration, verrouillage et refus', false],
  ['e2e83-sync-key-resume.js', 'synchronisation lot D1 : CryptoKey IndexedDB réelle Chromium/WebKit, onglets rouverts PC/iPhone sans code', true]);
SUITE.push(['test_sync_revisions.js', 'synchronisation lot D2 : révisions immuables, têtes concurrentes, conflits jamais absorbés, catalogue falsifié et convergence finie', false]);
SUITE.push(['test_sync_outbox.js', 'synchronisation lot D3 : local d’abord, regroupement, envois séquentiels, reprise après coupure, reconnexion visible et statuts prouvés', false]);
SUITE.push(['test_ci_browser_install.js', 'CI : installation du navigateur bornée, apt-get orphelin attendu avant chaque nouvel essai, navigateur inconnu refusé', false]);

SUITE.push(['test_drive_sync.js', 'raccord Drive : propriétaire réel, deux appareils, conservation, reprise immuable et blocages', false],
 ['test_google_drive_session.js', 'Google : origines, portée unique, comptes concurrents et jeton en mémoire', false],
 ['test_drive_build.js', 'Drive : profils de publication séparés, CSP et configuration publique approuvée', false]);

SUITE.push(['e2e85-drive-runtime.js', 'Drive : deux vrais coffres, file IDB, HTTP opaque, fermeture, copie avant fusion et verrouillage', true]);
SUITE.push(['e2e92-preuves-espacement.js', 'journal du moteur de preuves : entrées automatiques espacées de 60 min par lieu, signalements immédiats, PC/iPhone', true]);
SUITE.push(['test_vault_sync_device_writes.js', 'constat C : écriture propre à l’appareil (GPS, cache, agenda chiffré) sans blocage ni perte pendant la synchro', false]);
SUITE.push(['e2e89-agenda-sablier.js', 'agenda : jamais de sablier « Lecture de l’agenda… » infini (sans réponse, erreur, réponse invalide, affichage en échec)', true]);
SUITE.push(['e2e88-car-add.js', 'Ajouter une voiture : fiche vierge, refus nom vide ou en double, Garage, compteur et rechargement', true]);
SUITE.push(['e2e87-drive-badge-count.js', 'badge de sauvegarde : seules les saisies de l’utilisateur comptent (écritures météo automatiques exclues)', true]);
SUITE.push(['e2e86-html-security.js', 'NOESIS : texte véhicule, attribut photo, stockage ancien et DOM réel Chromium/WebKit', true]);

SUITE.push(['test_drive_store_reopen.js', 'NOESIS-RC-003 : IndexedDB réessayable après erreur, blocage, versionchange et fermeture sans purge', false]);
