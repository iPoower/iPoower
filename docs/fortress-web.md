# Forteresse — scripts signés et bibliothèque locale

## Défaut et correction proposée

La CSP actuelle autorise les empreintes du code applicatif, mais aussi toute l'origine `https://unpkg.com` dans script-src. Les deux balises Leaflet portent déjà SRI ; cela ne force pas une balise hostile distincte à utiliser SRI. L'autorisation globale du CDN doit donc disparaître.

Leaflet 1.9.4 est désormais un asset local figé, avec sa licence et ses images. Les octets JS/CSS restent exactement ceux déjà approuvés par SRI. Le build refuse une empreinte modifiée ou un lien symbolique, sans dépendre d'une installation npm pour produire le site. La CSP n'autorise que les empreintes des scripts applicatifs et le SHA-384 Leaflet ; même un script arbitraire de même origine est refusé. Pas de unsafe-eval ni de unsafe-inline pour les scripts. Les styles inline restent nécessaires au rendu existant et à Leaflet ; leur refonte est un chantier distinct.

Le Service Worker v12 précharge la bibliothèque et ses images pour le mode hors ligne et ne traite plus les requêtes d'un autre dossier de la même origine. Il conserve le cache de données v3 et les restrictions sur les données externes. Cette limite de portée n'isole pas localStorage/IndexedDB/Cache Storage entre applications : seul un changement d'origine peut le faire.

deploy-copy transporte une liste précise d'assets et refuse les liens de source/destination ainsi qu'un build contenant les données du relais **avant** de modifier le shell. Les observations, agenda chiffré et DATEX restent propriété du relais. Les builds historiques sans assets locaux restent compatibles avec l'outil.

## En-têtes et limite de l'hébergement

La page inclut une meta Referrer-Policy `no-referrer`. Le build prépare `_headers` pour une origine statique Cloudflare Pages : CSP identique plus frame-ancestors 'none', X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy (GPS self ; caméra/micro/paiement/USB interdits), COOP et HSTS.

**Ces en-têtes ne sont pas annoncés actifs sur GitHub Pages.** La réponse HTTP de production observée ne les fournit pas et frame-ancestors n'est pas appliqué via meta. Le fichier `_headers` ne suffit pas sur cet hébergeur. Le plan séparé `docs/fortress-origin-plan.md` exige une vérification HTTP et navigateur après une publication autorisée sur le nouvel hébergement.

## Validation et retour arrière

- Tests unitaires : CSP exacte, empreintes, asset modifié, liens, publication sans écriture partielle, conservation des données du relais et non-interception d'une autre application par le SW.
- Nouveau scénario Chromium/WebKit iPhone/PC : bibliothèque locale réellement chargée, saisie HTML hostile conservée comme texte, scripts non approuvés bloqués, SRI altéré refusé et démonstration du partage d'origine. Un CryptoKey non extractible de l'appareil mémorisé reste utilisable depuis une application voisine de même origine ; le scénario doit confirmer cette limite.
- Les anciennes suites de cartes, radar, Service Worker et hors ligne restent intégrales. Leurs routeurs fictifs suivent le nouveau chemin d'asset ; les tests de migration v9/v10 continuent d'exiger la suppression de l'ancien cache et la conservation des données. Le profilage comparative garde le support des assets de la base et du candidat.
- La validation CI exige 50 suites unitaires et la couverture exacte de 158 exécutions applicables au total (Chromium/WebKit). Aucun contrôle historique retiré.

Avant fusion, fermer la PR. Après une fusion autorisée, un retour de code reste une nouvelle publication soumise aux contrôles et à l'accord du propriétaire. Conserver le coffre et les sorties du relais. Préférer réparer les assets/CSP ; rétablir l'autorisation générale du CDN réintroduirait le risque. Le retour du SW doit garder le lecteur des données existantes et purger seulement les caches de shell obsolètes. La restauration utilisateur est indépendante du cache ; ne jamais supprimer le coffre pour réparer un téléchargement.
