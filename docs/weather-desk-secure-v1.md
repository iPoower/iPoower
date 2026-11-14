# WEATHER DESK SECURE V1 — PREVIEW, non déployable

**État : NO GO fusion / publication / DNS / migration.** Cette branche prépare une page autonome et des tests, sans nouveau moyen d'ouvrir le coffre.

## 1. Diagnostic initial et PR concurrentes

- 13 octobre 2026 : main protégé = 8f3e689f3d532ff61a24480d39b2cb45f9a105f9.
- Forteresse II #134, #135, #136 (ainsi que #137–#139 vérifiées) : PR Draft de préparation, tests et documentation uniquement. Pas de fichier commun avec cette proposition. Refaire le contrôle avant toute future fusion.
- tools/build.js assemble src/shell.html, initialise DeviceStorage.bootstrap, RememberDevice et SessionVault puis injecte l'application personnelle. Cette voie ne peut pas être utilisée pour un invité.
- src/app/weather-station.js dépend de LOCKED(), RAW, S, UI, refreshAll(), WeatherWatch et des événements personnels ; son Mode Station exige une session active. src/app/weather-view.js lit aussi le contexte des trajets. Ne PAS désactiver ces verrous.
- src/weather-watch.js et src/wxdesk.js sont des moteurs purs mais supposent des modèles déjà assemblés avec des données/contextes Race Control. Un import direct élargirait la dépendance. Le preview réutilise la terminologie et des seuils météorologiques simples, sans importer de code personnel.
- src/sw.js contrôle la PWA personnelle ; le prototype ne charge, n'enregistre ou ne modifie aucun SW, coffre, IndexedDB, Cache Storage, calendrier, agenda, GPS ou clés.

## 2. Architecture retenue

- weather-desk-preview/index.html, app.js et style.css forment une page autonome, avec politique CSP restrictive, zéro script externe, zéro stockage et aucun accès à l'API du relais privé.
- Choix manuel, public : Amiens initialement, Lille, Rouen, Paris. Ni IP-geolocation ni GPS, et jamais de lieux tirés des préférences privées.
- Le navigateur lit uniquement ./public-weather.json, sur **la même origine que le futur site invité dédié**, avec GET, credentials: omit, cache: no-store, pas de redirection et sans referrer.
- weather-desk-preview/generate.js est un producteur côté serveur **non programmé et non exécuté automatiquement**. Il interroge https://api.open-meteo.com/v1/forecast pour les quatre coordonnées **publiques et fixes**, séquentiellement. Il n'utilise ni code d'accès, ni coordonnées personnelles, ni clé de l'application. Sur HTTP 429, timeout ou réponse incomplète, il échoue sans remplacer un snapshot antérieur. Aucun accès Open-Meteo n'est effectué directement par le navigateur de l'utilisateur.
- La requête du futur serveur vers Open-Meteo divulguera son adresse IP de sortie et les coordonnées des quatre villes publiques. L'hébergeur du futur Weather Desk verra l'adresse IP de sortie du visiteur (éventuellement celle du VPN), son user-agent et les heures d'accès. La solution empêche la transmission des données de Race Control, **pas** toute métadonnée réseau.
- Le fichier public n'est pas commité : son absence affiche DONNÉES INDISPONIBLES. Aucune fausse mesure LIVE ou démo publiée.
- LIVE · MODÈLE seulement si un fichier de moins de 35 minutes vient d'être récupéré. CACHE après échec ou 35 min, au maximum 6 h ; au-delà, DONNÉES INDISPONIBLES. Copie uniquement en RAM, détruite au rechargement. L'onglet peut être suspendu après mise en veille.
- Température et ressenti du modèle, pluie, vent et rafales, prévisions 12 h. Le « gel/verglas » est une **estimation prudente à partir de la température de l'air et de la pluie**, pas une mesure de chaussée ni une réutilisation du moteur routier personnel. Pas d'alerte système.
- Le plein écran est uniquement déclenché par l'utilisateur ; l'entreprise peut le restreindre. Le retour à Race Control utilise une URL HTTPS publique fixe, sans identifiant, secret ni paramètre.

## 3. Blocage d'isolation d'origine

Une page sous https://ipoower.github.io/iPoower/race-control/weather-desk/ partagerait l'origine de Race Control et d'autres applications. Un sous-chemin ne compartimente **pas** localStorage, IndexedDB, cookies ni l'ensemble des capacités applicables à l'origine. Un script compromis d'une page sœur pourrait accéder aux mêmes magasins, malgré les protections cryptographiques du coffre.

Les tests sur **origines loopback fictives uniquement** démontrent la lecture d'une valeur-canari de localStorage par une page sœur de même origine et le SecurityError depuis une origine différente. Cela ne prouve pas une isolation finale en HTTPS réel, ni l'état d'un PC d'entreprise ou d'un iPhone physique.

Le futur site invité **doit** utiliser une nouvelle origine HTTPS dédiée, sans application sœur ni SW propriétaire existant. La proposition weather-desk-preview/_headers prévoit CSP, referrer, permissions et cache pour un hébergement statique compatible ; le fichier _headers n'a aucun effet automatique sur GitHub Pages. Les vrais en-têtes HTTP sont à mesurer après une future publication **séparément autorisée**.

## 4. Tests et autorisations restantes

Les tests automatisés (fixtures 100 % fictives ; Chromium/WebKit) contrôlent l'ouverture sans code personnel, les quatre villes, douze créneaux, le statut, l'absence de lectures de stockage privé, l'absence de GPS/service worker, les URL réseau autorisées, les 429, l'hors-ligne uniquement en mémoire datée, le rechargement sans cache privé et la séparation d'origines. Aucun secret, aucune donnée client, aucune API publique réelle n'est utilisée dans ces tests.

**Non validé à ce stade :** sauvegarde exhaustive du coffre (hors champ), non-régression complète du Mode Station sur terminaux réels, publication de données météo publiques, contrôle HTTP/CSP en hébergement final, résistance au SW d'une autre application sur origine partagée, fonctionnement sur PC Windows géré via VPN, mode plein écran longue durée iPhone/PC, contraintes ou autorisation de la DSI. Les checks de CI doivent être contrôlés sur le SHA exact de la PR.

### Conditions obligatoires avant toute future fusion

1. Origine HTTPS indépendante approuvée et tests d'isolation en situation réelle.
2. Émetteur de snapshot public dédié, pipeline de publication sans secrets ni données personnelles, contrôle 429/fraîcheur/rollback. Autorisation explicite de publication.
3. Tests iPhone Safari/WebKit et PC Chromium, réponse HTTP, CSP, stockage, offline, réseau d'entreprise et heures d'affichage.
4. Vérification de l'intégralité de la CI Race Control, privacy scan, et rebase sur main sans conflit.
5. **Après** validation de l'URL dédiée, préparer sur une autre PR le lien « 🌦️ Consulter la météo sans connexion » depuis l'écran verrouillé. Ne pas mettre un lien provisoire vers le sous-chemin actuel : il violerait l'objectif d'isolation.

## 5. Livraison et rollback

**Fichiers nouveaux uniquement (11 au total) :** weather-desk-preview/{index.html,style.css,app.js,generate.js,_headers}, tests/{weather-desk-preview.js,weather-desk-hosting.js}, tools/weather-desk-hosting.js, .github/workflows/weather-desk-preview.yml, docs/{weather-desk-secure-v1.md,weather-desk-hosting-isolation.md}.

**Hébergement indépendant, préparé sans publication :** voir [weather-desk-hosting-isolation.md](weather-desk-hosting-isolation.md). Le packaging fixe se limite à quatre fichiers publics sous `.ci/weather-desk-site/`, sans JSON météo ni coffre. Simulations Chromium/WebKit de l'origine séparée et de la politique CSP proposées dans `tests/weather-desk-hosting.js`. Aucun compte Cloudflare, nom de domaine, jeton, projet Pages ou déploiement n'est créé.

**Inchangés :** src/app/weather-station.js, src/app/weather-view.js, src/app/lifecycle.js, src/session-vault.js, src/remember-device.js, src/sw.js, src/shell.html, tools/build.js, encrypted/, main, gh-pages, DNS, production.

Retour arrière : fermer la PR Draft et supprimer sa branche. Aucun état utilisateur n'est à restaurer parce que cette PR ne lit, n'écrit et ne migre aucune donnée du coffre. Ne jamais copier le prototype dans une sous-route de l'origine personnelle pour « valider l'isolation ».

**Décision sécurité : GO tests de laboratoire isolés / NO GO fusion et déploiement.**
