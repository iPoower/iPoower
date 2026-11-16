# Weather Desk — préparation de l'hébergement isolé (13/10/2026)

**ÉTAT : PR #140 DRAFT / AUCUN DÉPLOIEMENT / AUCUN DOMAINE / NO GO PUBLICATION.**
Ce document ne constitue pas une autorisation de créer un projet, un sous-domaine, un worker, un token ou un déploiement Cloudflare.

## Architecture recommandée : Cloudflare Pages **Direct Upload**, origine dédiée

Séparer réellement les origines :
- Race Control personnel : \`https://ipoower.github.io/iPoower/race-control/\` (ne pas modifier).
- Weather Desk futur : **nouveau projet Cloudflare Pages indépendant**, URL \`https://<nom-unique>.pages.dev/\` déterminée **uniquement après création expressément autorisée**. Aucun nom/domaine n'est réservé ou configuré dans cette PR.
- Ne PAS créer Weather Desk comme un chemin sous \`ipoower.github.io\`, ni comme une page servie par le même service worker que Race Control. Le chemin URL n'isole pas les stockages d'une origine.
- Ne pas connecter l'actuel dépôt iPoower/iPoower à un nouveau projet Pages en Git integration pendant la préparation : Git integration peut déployer automatiquement **main et les branches PR** (y compris des previews), et créer des URLs accessibles. Préférer pour le futur un projet **Direct Upload** isolé, puis une procédure de publication MANUELLE/APPROUVÉE, après intégration d'un producteur public fiable. Ne pas écrire de workflow upload, de clé/token ni lancer Wrangler ici.
- Une origine nouvelle crée une frontière navigateur entre Weather Desk et le coffre existant ; elle ne rend pas magiquement tous les scripts, le fournisseur ni les terminaux sûrs. Poursuivre les tests de séparation, en-têtes, XSS, caches, permissions et appareil géré.

Documentation éditeur vérifiée (oct. 2026) :
- Cloudflare Git integration, déploiements automatiques et désactivation : https://developers.cloudflare.com/pages/configuration/git-integration/
- Contrôle des branches preview : https://developers.cloudflare.com/pages/configuration/branch-build-controls/
- En-têtes \`_headers\` statiques : https://developers.cloudflare.com/pages/configuration/headers/
- CLI Pages et nécessité d'une action explicite : https://developers.cloudflare.com/workers/wrangler/commands/pages/

## Livré maintenant : préflight *hors ligne* sans hébergement

1. \`node tools/weather-desk-hosting.js\` crée **localement seulement** \`.ci/weather-desk-site/\` et vérifie les fichiers.
2. Allowlist exhaustive : \`index.html\`, \`app.js\`, \`style.css\`, \`_headers\`. Pas de \`src/\`, \`encrypted/\`, \`private/\`, IndexedDB, module de coffre, SW ou calendrier.
3. Le paquet n'inclut **aucun** \`public-weather.json\` : sans producteur public authentifié, l'interface annonce DONNÉES INDISPONIBLES. Pas de fixture de prévision publiée accidentellement.
4. \`tests/weather-desk-hosting.js\` recrée en local la politique d'en-têtes préparée et lance un profil Chromium/WebKit fictif : refus des scripts inline injectés, ressources exclusivement sous l'origine invitée, canari localStorage d'une autre origine non lu, garde HTTPS/Cloudflare non affirmée.
5. Workflow GitHub Actions **pull_request uniquement**, jeton **contents:read**, sans secrets, sans droit de déploiement, sans outil de publication.
6. Les tests du Mode Station personnel et de la confidentialité Race Control restent ceux de la CI du dépôt ; vérifier leur succès sur le SHA final de la PR.

## Modèle de flux météo : futur lot séparé et autorisé

\`\`\`text
[Futur producteur CI isolé, sans aucun secret personnel]
          -> Open-Meteo : 4 coordonnées de VILLES PUBLIQUES uniquement
          -> JSON strict, anti-injection et horodaté (≤ 6 h d'utilisation)
          -> contrôle qualité, absence de fuite et limitation HTTP 429
          -> PUBLICATION ATOMIQUE MANUELLEMENT AUTORISÉE
          -> [Cloudflare Pages, nouvelle origine HTTPS]
          -> navigateur invité : lecture GET same-origin, credentials:omit, no-store
\`\`\`

- Ce schéma est **une cible**, pas un producteur ou un déploiement opérationnel.
- Le script \`weather-desk-preview/generate.js\` n'est pas lancé par un workflow et ne publie rien. Il faudrait ajouter validation et anti-rollback des données publiques, tests d'erreurs Open-Meteo et un processus de publication atomique **avant** la mise en service. Une donnée météo sur le disque d'un ancien build n'est pas une source fraîche garantie.
- Le navigateur invité ne contactera ni fournisseur météo externe, ni endpoints privés. Le futur hébergeur recevra néanmoins l'IP de sortie du navigateur (y compris IP du VPN d'entreprise), l'agent utilisateur et les horaires de requêtes. Le producteur recevra les réponses Open-Meteo et divulguera son IP au fournisseur. Aucune dissimulation vis-à-vis des équipements de sécurité professionnels.
- Pas de notifications, de géolocalisation, de stockage navigateur de données privées ni de cookie d'authentification. En-têtes proposés : CSP \`default-src 'none'\`, script/style/connect \`self\`, \`frame-ancestors 'none'\`, \`Referrer-Policy: no-referrer\`, \`Permissions-Policy: geolocation=()\`, JSON et index \`Cache-Control: no-store\`. En-têtes effectifs **non vérifiés** sur un vrai site.

## Gates pour une future proposition GO

- [ ] Accord explicite pour **créer un projet Pages** (Direct Upload) et attribuer une origine indépendante.
- [ ] Contrôle qu'aucune autre application ni service worker n'utilise cette origine.
- [ ] Générateur et publication de JSON publics supervisés, politique 429, intégrité, horodatage, anti-rollback et échec fermé.
- [ ] Vérification des **vrais en-têtes HTTPS** et du comportement en navigation normale, hors ligne et au rechargement, sans contournement de réseau d'entreprise.
- [ ] Test de tentative d'accès entre \`ipoower.github.io\` et la nouvelle origine (IndexedDB/localStorage/Cache Storage) avec **données fictives** sur Chromium et WebKit.
- [ ] Validation physique iPhone 11 Pro Max Safari et Windows professionnel uniquement selon politique DSI (sans privilèges ni extension).
- [ ] CI principale et confidentialités au SHA exact vertes ; audit anti-conflit Forteresse II.
- [ ] Sur une autre PR, après URL confirmée et autorisation, ajout du lien invité sur l'écran verrouillé, sans session transmise.

**Verdict actuel : GO préparation et simulation statiques / NO GO création de projet, connexion Git Cloudflare, publication, lien sur login, fusion ou migration.**

**Retour arrière :** fermeture de la PR #140 et suppression de la branche. Aucun coffre, aucune donnée navigateur, aucun domaine ni service n'a été créé ou modifié par ce lot.
