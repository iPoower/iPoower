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
  ['test_datex_publish.js', 'DATEX publication : refus GitHub passagers espacés, échec persistant visible, relais concurrent, jamais d’écrasement par plus ancien', false],
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
SUITE.push(['e2e91-export-horodatage.js', 'export : réglage en mémoire enregistré avec son horodatage de saisie (aucun faux conflit), PC/iPhone', true]);
SUITE.push(['test_evidence_journal.js', 'dette D2 : journal de preuves jamais écrit pendant un rendu Météo, écrit sur nouvelle météo reçue, contre-tests', false]);
SUITE.push(['e2e92-preuves-espacement.js', 'journal du moteur de preuves : entrées automatiques espacées de 60 min par lieu, signalements immédiats, aucune écriture pendant un rendu Météo (D2), PC/iPhone', true]);
SUITE.push(['e2e93-position-vraisemblance.js', 'lot 1 : position approximative lointaine jamais utilisée en silence (lieu principal, utiliser quand même), GPS précis lointain accepté, PC/iPhone', true]);
SUITE.push(['e2e93-agenda-a-reserver.js', 'agenda : une réservation « [À réserver] » n’est pas un trajet par défaut, #trajet la rétablit, PC/iPhone', true]);
SUITE.push(['e2e96-brouillard-deux-episodes.js', 'acceptation #290 : brouillard en cours puis nouvel épisode, cohérent sur Pneus, Météo, Chronologie et Trajet ; visibilité datée ; confiance distincte du risque, PC/iPhone', true]);
SUITE.push(['e2e98-verdict-voiture-affichee.js', 'verdict « ici, maintenant » limité à la voiture affichée : montage hiver d’une autre voiture = planification VIGILANCE, jamais DANGER, PC/iPhone', true]);
SUITE.push(['e2e94-proprete-affichage.js', 'propreté de l’affichage : aucun horodatage brut, aucun none/null/undefined, aucune icône doublée sur tous les onglets et Réglages, PC/iPhone', true]);
SUITE.push(['e2e95-saisie-verrouillee.js', 'D1 · page verrouillée : contrôles d’écriture désactivés avec message, saisie forcée refusée, coffre inchangé, PC/iPhone', true]);
SUITE.push(['test_vault_sync_device_writes.js', 'constat C : écriture propre à l’appareil (GPS, cache, agenda chiffré) sans blocage ni perte pendant la synchro', false]);
SUITE.push(['e2e89-agenda-sablier.js', 'agenda : jamais de sablier « Lecture de l’agenda… » infini (sans réponse, erreur, réponse invalide, affichage en échec)', true]);
SUITE.push(['e2e88-car-add.js', 'Ajouter une voiture : fiche vierge, refus nom vide ou en double, Garage, compteur et rechargement', true]);
SUITE.push(['e2e87-drive-badge-count.js', 'badge de sauvegarde : seules les saisies de l’utilisateur comptent (écritures météo automatiques exclues)', true]);
SUITE.push(['e2e86-html-security.js', 'NOESIS : texte véhicule, attribut photo, stockage ancien et DOM réel Chromium/WebKit', true]);

SUITE.push(['test_drive_store_reopen.js', 'NOESIS-RC-003 : IndexedDB réessayable après erreur, blocage, versionchange et fermeture sans purge', false]);
SUITE.push(['test_tread_guard.js', 'PR 1 sécurité pneumatique : profondeur 1,59/1,60/1,99/2,00 mm, pluie dans la fenêtre, deux horizons, estimation, météo indisponible, profondeur inconnue, pneus été et froid, contre-tests', false]);
SUITE.push(['e2e99-profondeur-garde-fou.js', 'PR 1 sécurité pneumatique : 1,8 mm plafonne le verdict sur Pneus, panneau Alertes, Intelligence, Cockpit, Trajet, agenda, briefing et Garage ; profondeur inconnue = Analyse limitée, PC/iPhone', true]);
SUITE.push(['e2e100-voitures-coherence.js', 'PR 2 cohérence des véhicules : voiture affichée, proposée et confirmée distinguées sur Pneus, Trajet, A/B et Garage ; aucune voiture déduite ; position du Diagnostic à ~1 km, PC/iPhone', true]);
SUITE.push(['test_vehicle_coherence.js', 'PR 2 cohérence des véhicules : voiture confirmée, affichée et proposée, Prochaine mission, Trajet sans présélection, A/B, Diagnostic à ~1 km, contre-tests', false]);
SUITE.push(['test_tread_wheels.js', 'profondeur par pneu : migration sans perte, minimum par essieu, usure irrégulière, relevé dépassé, fusion et contre-tests', false],
  ['e2e90-profondeur-par-pneu.js', 'profondeur par pneu : saisie 4 × 2 points, minimum par essieu, usure irrégulière, transition, rechargement et 320 px, PC/iPhone', true]);
SUITE.push(['e2e101-profondeur-prod-compat.js', 'profondeur par pneu : compatibilité avec le vrai build en production 53315c242870 (run 192) (fusion, lecture, saisie par essieu, changement de monte, rechargement), PC/iPhone', true]);
SUITE.push(['test_tread_provenance.js', 'profondeur par pneu : origine de chaque ligne d’historique, treadEst de l’essieu le plus usé, historique ancien intact, reproducteur et contre-tests', false],
  ['e2e102-profondeur-provenance.js', 'profondeur par pneu : provenance de l’historique, scénario et symétrique, rechargement, historique ancien intact, PC/iPhone', true]);
SUITE.push(['test_frost_truth.js', 'Lot G : une seule vérité pour le gel (frostRisk), seuil sur la chaussée estimée avec sa marge, limites 0,9/1,0/1,1 °C, synthèse, A/B, contre-tests', false],
  ['test_frost_chain.js', 'Lot G : chaîne réelle des heures pour le gel (buildHours, P3, poste Météo, trajet, recalage, ensemble), heure sans P3 explicite, contre-tests', false],
  ['e2e105-gel-une-verite.js', 'Lot G : gel sur la fenêtre du trajet, synthèse jamais verte avec une incertitude gel, Gestion des pneus, A/B garde-fou, Ingénieur de course, PC/iPhone', true]);
SUITE.push(['test_trip_risk.js', 'Lot V : risque global du trajet (tripRisk) = pire cause sur la même fenêtre, option A inchangée, câblage des surfaces et statuts d’alerte, contre-tests', false]);
SUITE.push(['test_backup_visible.js', 'Lot S : sauvegarde visible, un libellé par état, dernière copie, âge des modifications, synthèse, persistance du stockage, contre-tests', false],
  ['e2e106-reconnexion-un-geste.js', 'Lot S : reconnexion Google Drive en un geste après rechargement à froid, Google simulé (avant, pendant, après la préparation ; fenêtre bloquée ; échec puis nouvel essai), PC/iPhone', true],
  ['e2e107-file-envoi-sans-drive.js', 'Lot S : file d’envoi au rechargement (un seul envoi complet), données visibles sans Drive, badge lisible à 375/414/1280 px', true],
  ['e2e108-historique-navigation.js', 'Lot S : historique de navigation (Retour PC, geste retour iPhone simulé), vues et panneau Paramètres, sans boucle, URL sans donnée', true],
  ['e2e109-hors-ligne-vue.js', 'Lot S : rechargement hors ligne sur ?vue=garage (hors ligne applicatif Chromium/WebKit ; vrai Service Worker sous Chromium), URL et paramètres intacts, replaceState sans URL', true],
  ['e2e110-verdict-global.js', 'Lot V : risque global du trajet partagé (briefing, synthèse, Trajet, Garage), indice pneus nommé, alertes non évaluables, voiture confirmée, minuit, aperçu verrouillé', true],
  ['e2e104-sauvegarde-visible.js', 'Lot S : sauvegarde visible, dernière copie, libellé unique par état, persistance du stockage demandée et affichée, PC/iPhone', true]);
SUITE.push(['e2e114-direct-depart-travail.js', 'Lot 2 R2 : #direct avec départ choisi au travail et itinéraire simulé abouti : message et ligne ALLER « depuis Travail », trajet recalculé, rechargement, Départ automatique, PC/iPhone', true]);
SUITE.push(['e2e112-agenda-disponible.js', 'Lot 2 R2 : rendez-vous « Disponible » sans trajet sauf #trajet, compté dans le pied de l’agenda, « Occupé » inchangé ; message #direct = départ de la ligne ALLER, PC/iPhone', true]);
SUITE.push(['e2e113-arome-degrade.js', 'Lot 1 R2 : AROME en échec pendant un cycle automatique (erreur HTTP, délai dépassé, 429) puis récupération : températures, verdict, messages, provenance du départ et vrais horodatages', true]);
SUITE.push(['e2e111-meteo-une-source.js', 'Lot 1 R2 : une seule température par lieu et par heure (AROME conservé par le cycle automatique, « AROME indisponible » seulement sur échec, départ de trajet = onglet Météo, Maintenant = valeur recalée)', true]);
SUITE.push(['test_tire_catalog.js', 'pneus : registre européen EPREL (étiquette UE par variante), saisons vérifiées conservées, saison déduite signalée, intégrité de la base', false],
  ['e2e115-pneus-etiquette-ue.js', 'paramètres · choix des pneus : étiquette UE, filtres saison/mouillé/conso/indices, recherche, tri, statistiques et lien EPREL, iPhone et PC', true]);
SUITE.push(['test_audit_20261112.js', 'audit de l’app réelle du 12/11 : bandeaux 24 h « demain », pastille d’agenda sans débordement, contrôle Trajet sans voiture', false]);
SUITE.push(['test_garage_economics.js', 'Garage · coûts et pleins : saisie à la française, journal sans perte, amortissement, prix au litre, consommation entre pleins, fusion PC ↔ iPhone sans résurrection', false],
  ['e2e119-garage-couts.js', 'Garage · coûts et pleins : références, pleins et dépenses saisis, chiffres affichés, saisie invalide refusée, rechargement, coffre chiffré, retrait, comparatif, PC/iPhone', true]);
SUITE.push(['test_inbox.js', 'boîte de dépôt : bloc rc-depot-v1 non fiable lu strictement (champs inconnus, pièges, tailles, HTML), application sur copie, doublons, chronologie', false],
  ['e2e120-boite-depot.js', 'boîte de dépôt : saisies de Claude collées, relues (avant → après), validées ou rejetées une par une, coffre, synchro, aucun HTML interprété, journal intact, PC/iPhone', true]);
SUITE.push(['e2e124-coherence-mesures.js', 'cohérence des mesures : pneus remplacés (mesures détachées), montage ancien refusé, pression jamais redatée, chronologie unique des kilométrages (dépôt, budget, Paramètres), échec d’itinéraire visible avec nouvel essai, PC/iPhone', true]);
SUITE.push(['e2e117-agenda-plusieurs-jours.js', 'agenda : rendez-vous de plusieurs jours et trajets hors du jour du rendez-vous datés (aller la veille, retour, arrivée après minuit, journées), même jour inchangé, PC/iPhone', true]);
SUITE.push(['e2e118-base-pneus-a-la-demande.js', 'performance : base pneus publiée vérifiée à l’ouverture des Paramètres (au plus une fois par heure), plus jamais téléchargée au démarrage ; base plus récente chargée, erreur sans blocage', true]);
SUITE.push(['e2e116-lisibilite-accueil.js', 'lisibilité de l’accueil : voiture sans pneus repliée en une ligne, raccourci « Saisir la profondeur » jusqu’au relevé par pneu, iPhone 11 Pro Max et PC', true]);
SUITE.push(['e2e117-depart-annonce-reste.js', 'départ annoncé puis resté à la maison : bandeau honnête (Estimée, trajet non suivi), fin du départ par deux relevés GPS précis au lieu quitté après 15 min, iPhone et PC', true]);
SUITE.push(['test_relay_publish.js', 'relais météo et watchdog, publication : refus GitHub passagers espacés, échec persistant visible, DATEX concurrent, liste blanche, jamais d’écrasement par plus ancien', false]);
SUITE.push(['test_frost_option_a.js', 'cohérence gel (14/11) : règle option A, seuils −2/1/2/4 °C × humide/sec/inconnu, départage pire puis plus proche, un minimum par horizon, vocabulaire unique, note pneus alignée, contre-tests', false],
  ['e2e121-gel-une-verite-1411.js', 'cohérence gel (14/11) : fixture de la nuit humide, même niveau, même minimum et même humidité dans tous les blocs (bandeau, poste Météo, gel et verglas, alertes, cartes, courbe), PC et iPhone', true]);
SUITE.push(['test_trip_coherence.js', 'cohérence trajet (14/11) : État de la route et risque global, même fenêtre et mêmes seuils (pluie 0,2/2 mm/h, neige), Ingénieur de course daté, contre-tests', false],
  ['e2e122-trajet-coherence-1411.js', 'cohérence trajet (14/11) : trajet d’un autre jour daté partout (cartes, bandeau, Ingénieur de course, comparateur, onglet Trajet), gel borné à la fenêtre, État de la route = risque global, PC et iPhone', true]);
SUITE.push(['test_display_safe.js', 'affichage sans risque (14/11) : monte enregistrée sans « Prévu », relevés antérieurs au montage hors monte et projection (conservés), points du Garage avec rôle et lieu, titres d’agenda, formats français, contre-tests', false],
  ['e2e123-affichage-donnees-1411.js', 'affichage sans risque (14/11) : plus de « NON MONTÉ », relevés de la monte actuelle, tous les points du Garage, un seul ressenti, formats français, #direct masqué, Départ depuis sans doublon, PC et iPhone', true]);
SUITE.push(['e2e125-audit-navigateurs-1511.js', 'audit navigateurs (15/11) : « Pas de code ? » sur sa ligne à l’écran de verrouillage, « ANALYSE LIMITÉE » en ton neutre (jamais ✓ vert) comme les cartes voiture, RAS vert retrouvé après saisie de la profondeur, météo bloquée (HTTP 429) sans « prévisions déjà chargées » ni « non renseigné bar », PC et iPhone', true]);
SUITE.push(['test_odo_trend.js', 'Garage · évolution du kilométrage : objectif km ou « à vie » validé, rythme de l’entretien, date d’objectif, objectif atteint, 12 derniers mois, compteur qui recule, historique long jamais tronqué, immutabilité, relevé invraisemblable écarté (chiffre manquant ou en trop), saut refusé dans la boîte de dépôt', false],
  ['e2e126-garage-kilometrage.js', 'Garage · évolution du kilométrage : courbe des relevés, objectif 250 000 km (progression, reste, date, projection) et « à vie », valeur invalide refusée, coffre relu après rechargement, 66 relevés gardés, relevé invraisemblable signalé et confirmation de saisie, PC et iPhone', true]);
SUITE.push(['e2e127-bureau-arriere-plan.js', 'ordinateur · onglet en arrière-plan : titre et icône = verdict (heure de départ, aucun lieu), pastille de l’app installée dès VIGILANCE, raccourcis 1 à 5 et R (inactifs verrouillé, en saisie, avec modificateur), scénarios doux et neige', true]);
SUITE.push(['test_odo_correction.js', 'Garage · correction d’un relevé : marqueur d’annulation (jamais d’effacement), annulation seule, idempotence, re-correction, synchronisation PC ↔ iPhone dans les deux sens, nouveau relevé de l’autre appareil, boîte de dépôt et chronologie', false],
  ['e2e128-garage-correction-releve.js', 'Garage · correction d’un relevé : liste, relevé incohérent mis en évidence, Corriger (confirmation, marqueur, coffre relu après rechargement), Annuler ce relevé, Fermer, PC et iPhone', true]);
SUITE.push(['e2e129-audit-brave-1611.js', 'audit dans Brave (16/11) : « Quelle voiture prendre ? » sur le prochain trajet affiché avec les mêmes scores que sa carte, vigilance de demain hors du verdict « Ici, maintenant », tuile Pluie en mm/h, « gomme estimée », relevés du même jour, action destructive séparée, PC et iPhone', true]);
SUITE.push(['test_vault_boot_failclosed.js', 'lot A : démarrage du coffre fail closed, aucune copie en clair ne remplace un coffre, copies écartées gardées chiffrées, restauration indépendante', false]);
SUITE.push(['e2e130-coffre-demarrage-ferme.js', 'lot A : échec d’ouverture du coffre → application non démarrée sur le stockage brut, message et copie brute, stockage intact', true]);
SUITE.push(['test_engine_tyre_golden.js', 'pneus V2 : verdicts du moteur figés (576 horaires + 576 trajets), relais limité à engine.js et evidence.js, train prévu sans effet, contre-tests', false],
  ['test_tyre_v2.js', 'pneus V2 : 10 scénarios pluie/froid/verglas/eau stagnante, limites thermiques sans marche à 7 °C, indice de vitesse sans effet, isolation des véhicules, catalogue jamais converti en coefficient', false],
  ['e2e131-pneus-v2.js', 'pneus V2 : essais ADAC affichés avec comparabilité, aucune règle des 7 °C ni « haute performance » déduite de l’indice, isolation des deux voitures, hors ligne, PC et iPhone', true]);
SUITE.push(['test_bilan.js', 'Analyse · « Mon bilan » : échéances de toutes les voitures triées (plan hiver, pressions, profondeur, compteur, révision, contrôle technique), km des 30 derniers jours interpolés ou partiels, trajets (retour du conducteur prioritaire), matins froids, départs selon la monte, usure seulement avec deux mesures', false],
  ['e2e132-analyse-bilan.js', 'Analyse · « Mon bilan » : trois cartes en tête, laboratoire replié dessous, km des 30 derniers jours, objectif et « à vie », replis conservés au rafraîchissement, « Saisir » vers le champ existant sans rien écrire, PC et iPhone', true]);
SUITE.push(['test_route_depart.js', 'État de la route : chiffres par secteur (heures de passage, km, pluie, chaussée, visibilité, rafales), décalage d’heures entières refusé hors série contiguë, meilleur départ seulement s’il fait baisser le niveau, horaire prévu gardé à égalité', false],
  ['e2e133-etat-route.js', 'État de la route : trajet daté, ruban des secteurs, chiffres du secteur touché, meilleur départ −1 h / +1 h, simulation nommée et réversible, rien d’écrit, focus conservé, trajet sec sans décalage, PC et iPhone', true]);
SUITE.push(['e2e136-trajet-bien-arrive.js', 'Trajet · « Bien arrivé » : trajet parti et arrivé depuis moins de 3 h non détecté, carte en tête du Trajet, clôture par la même machine que l’arrivée GPS (journal, lieu confirmé), conservée au rechargement, aucune carte avant le départ ni 3 h après, PC et iPhone', true]);
SUITE.push(['e2e137-trajet-feuille-creneau-briefing.js', 'Trajet · feuille de route du jour (ES numérotées, état, détail, voir dans le mur), créneau de départ ±2 h (même lecture que departureOptions, simulation pour domicile-travail, décalage et retour d’un trajet saisi), briefing copilote (mêmes notes que Pneus, lecture vocale sur appui), PC et iPhone', true]);
SUITE.push(['e2e138-verdict-chargement.js', 'CLARA R3-02 · au chargement, vigilance et agenda retardés : jamais de verdict ni de « Confiance solide » dans le bandeau ni le titre de l’onglet, « CALCUL EN COURS » puis verdict final identique partout, PC et iPhone', true]);
SUITE.push(['e2e139-carte-pneus-gel-24h.js', 'CLARA R3-03 · carte voiture : titre = pire de l’indice pneus et du gel 24 h (jamais « RAS · conditions adaptées » au-dessus d’un gel DANGER), indice pneus seul conservé, même niveau que l’alerte gel, aucun saut quand le gel entre dans les 12 h, horizon 24 h par défaut, PC et iPhone', true]);
SUITE.push(['test_loans.js', 'Trajets imprévus · module pur : liste fermée et bornée, voiture occupée, aller/retour, purge, saisie incomplète refusée', false]);
SUITE.push(['e2e140-trajet-imprevu.js', 'Trajets imprévus · formulaire du Trajet (destination choisie, retour prévu), bandeau voiture partie, feuille de route sans GPS, journée de l’utilisateur intacte, rechargement, « Rentré·e », saisie incomplète refusée, PC et iPhone', true]);
SUITE.push(['e2e141-repartition-voitures.js', 'Répartition des voitures · ton trajet et un trajet imprévu qui se chevauchent : deux répartitions comparées avec la météo de chaque parcours, conseil, rien sans appui, « Appliquer », double réservation signalée, verdict du trajet imprévu pour sa voiture, PC et iPhone', true]);
SUITE.push(['e2e142-mode-en-direct.js', 'Mode « EN DIRECT » · plein écran depuis le Trajet, carte Plan IGN, GPS simulé sur l’itinéraire (km parcourus et restants, vitesse), fermeture, rien d’écrit, iPhone et PC', true]);
SUITE.push(['test_drive_nav.js', 'Navigation « EN DIRECT » · module pur : tracé OSRM complet, sortie d’itinéraire, cap, requête des feux hors lieux privés, feux regroupés, km du trajet pour le compteur', false]);
SUITE.push(['e2e143-en-direct-recalcul.js', 'Mode « EN DIRECT » · feux du parcours (hors lieux privés), sortie d’itinéraire → recalcul immédiat depuis la position, km continus, « BIEN ARRIVÉ » → trajet clos et compteur, arrivée GPS → compteur sur appui, iPhone et PC', true]);
SUITE.push(['e2e145-en-direct-cockpit.js', 'Mode « EN DIRECT » v2 · cockpit : vitesse GPS en pastille neutre, icône de feu neutre (carte et alerte, sans lampe colorée ni emoji), « 3 feux · prochain à 180 m », Plan IGN clair le jour et sombre la nuit (bascule en direct), photo aérienne en option, iPhone et PC', true]);
SUITE.push(['e2e146-en-direct-carte-3d-ign.js', 'Mode « EN DIRECT » v2 · carte 3D IGN : bâtiments à leur hauteur BD TOPO, sens de la marche et inclinaison, zoom auto (vitesse, manœuvre), flèche interpolée jamais extrapolée, nuit dérivée en direct, photo aérienne, repli à plat sans WebGL, iPhone et PC', true]);
SUITE.push(['test_drive_guide.js', 'Guidage EN DIRECT · module pur : consignes françaises tirées des étapes OSRM (rien de deviné), pictogrammes, paliers 1 km / 500 / 200 / 100 m / maintenant, voies seulement si fournies, manœuvre suivante', false]);
SUITE.push(['e2e147-en-direct-guidage.js', 'Mode « EN DIRECT » v2 · guidage : flèche, distance par paliers, rue, « Puis », voies seulement si OSRM les fournit, consignes après recalcul, OSRM en échec (ancien tracé gardé et dit, rien d’inventé), mention « la signalisation prime », iPhone et PC', true]);
SUITE.push(['e2e148-gps-voiture-libre.js', 'GPS · ouverture : sans trajet, choix de la voiture d’abord (rien d’écrit avant), trajet libre (km au GPS, ni feux ni guidage, compteur sur appui), destination via le Trajet ; trajet programmé : EN DIRECT direct, iPhone et PC', true]);
SUITE.push(['test_drive_alt.js', 'Altitude du parcours · module pur : points du profil hors lieux enregistrés, profil IGN, altitude interpolée, point haut devant, gel à son altitude', false]);
SUITE.push(['e2e149-en-direct-altitude.js', 'Mode « EN DIRECT » · altitude : profil IGN hors lieux enregistrés, altitude à la position, point haut devant et température prévue à son altitude (gel mis en évidence), iPhone et PC', true]);
SUITE.push(['e2e150-onglet-gps.js', 'Onglet GPS : 6 onglets lisibles à 414 et 375 px, sans trajet choix de la voiture puis « Rouler sans destination », avec trajet « Démarrer », plus de bouton EN DIRECT dans Trajet, raccourcis 1 à 6 et retour arrière, iPhone et PC', true]);
SUITE.push(['test_guide_links.js', '« Guider avec… » · module pur : URL exactes des liens officiels Waze, Apple Plans et Google Maps (accents, lieu sans adresse, coordonnées seules), favoris Waze pour domicile et travail, aucun lien pour un lieu enregistré', false]);
SUITE.push(['e2e151-guider-avec.js', '« Guider avec… » : onglet GPS, rappel du verdict, trois liens officiels exacts, aucune requête avant l’appui, lieu enregistré par favori Waze seulement, iPhone et PC', true]);
SUITE.push(['e2e152-releve-terrain-gps.js', 'Débrief · relevé terrain GPS (gel des fonctions GPS) : consignes fausses, annonces tardives, pertes du GPS, batterie départ/arrivée et %/h, enregistré avec le débrief, conservé au rechargement, iPhone et PC', true]);
SUITE.push(['test_stage_notes.js', 'Pneus · épreuve spéciale : ruban de surface et notes du copilote tirés des lignes du tour du parcours (mêmes points, mêmes niveaux, seuils 0,2 / 2 mm/h), parts en km sinon en points, pneus été sur route froide, rien d’inventé', false],
  ['e2e135-pneus-epreuve-speciale.js', 'Pneus · épreuve spéciale : plaque du prochain trajet, niveau = risque global, notes du copilote et surface = lecture du parcours, choix des pneus = « Quelle voiture prendre ? », assistance, bulletin, décision toujours en tête, rien d’écrit sauf le choix explicite, PC et iPhone', true]);
SUITE.push(['test_route_tower.js', 'Trajet · tour du parcours : une ligne par point météo dans l’ordre, secteur de lecture identique à trackConditions, niveau du point par la même lecture, valeurs absentes à null, prévisions trop anciennes refusées', false],
  ['e2e134-trajet-mur-des-stands.js', 'Trajet · mur des stands : compte à rebours, état de la piste = risque global, tour du parcours et point touché, stratégie pneus et voitures du même trajet, meilleur départ, formulaire et check conservés, trois colonnes PC / une colonne iPhone, rien d’écrit, PC et iPhone', true]);
