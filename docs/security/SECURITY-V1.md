# Race Control — Sécurité V1

Stockage local chiffré, isolation de l'origine et durcissement GitHub.
Ce document décrit ce qui est livré par la PR, ce qui reste à faire par le propriétaire, et les limites assumées.

## 1. Vulnérabilités confirmées (avant la V1)

| # | Constat | Gravité |
|---|---|---|
| V1 | `unseal()` écrivait le code de déverrouillage `twrc.key` **en clair** dans `localStorage` | Critique |
| V2 | `twrc.plain` (préréglage déchiffré : lieux, coordonnées, voitures) et `twrc.settings.v1`, `twrc.context.v1` (journal, GPS, trajets) restaient en clair tant que l'appareil n'était pas verrouillé à la main | Élevée |
| V3 | Le journal d'import `twrc.restore.pending.v1` contenait les anciennes valeurs en clair pendant un import | Moyenne |
| V4 | Race Control partage l'origine `ipoower.github.io` avec d'autres applications (dont Control Vault) : même `localStorage`, même périmètre de service worker possible | Élevée (structurelle) |
| V5 | `main` et `gh-pages` sans aucune protection (force-push, suppression possibles) | Élevée |
| V6 | Workflows annexes (relais, watchdog, sources, confidentialité de PR) sur des tags mobiles `@v7` | Moyenne |
| V7 | Aucune politique de sécurité du contenu (CSP) ; gestionnaire `onload` inline pour les polices | Moyenne |

## 2. Architecture retenue : coffre de session (`src/session-vault.js`)

**Au repos (`localStorage`)**, il ne reste que :
- le coffre `twrc.vault.v2`, chiffré ;
- quelques préférences sans donnée personnelle : onglet affiché, mode sans code, carte repliée, pause de quota météo, occasion de tenue, version du préréglage, marqueurs anti-boucle, signal de verrouillage.

**Pendant une session déverrouillée** :
- les valeurs vivent en mémoire, derrière une façade compatible `localStorage`. Le code applicatif et les moteurs sont inchangés ;
- chaque écriture est rechiffrée dans le coffre, en microtâche, puis relue et vérifiée.

**Clé de l'onglet** : `sessionStorage['twrc.session.v2']` contient la clé AES dérivée, jamais le code.
- Un rechargement ne redemande pas le code.
- La fermeture de l'onglet ou de l'app l'efface : le code est demandé à la réouverture.
- « Verrouiller » l'efface aussitôt et verrouille aussi les autres onglets.

| Élément | Choix |
|---|---|
| Chiffrement | AES-256-GCM, IV aléatoire de 96 bits **neuf à chaque écriture**, intégrité GCM |
| Dérivation | PBKDF2-SHA256, 600 000 itérations, sel aléatoire de 16 octets (WebCrypto natif : Safari, iPhone 11 Pro Max) |
| Argon2id | Écarté : il imposerait une bibliothèque WASM tierce (nouvelle dépendance, `wasm-unsafe-eval` dans la CSP, coût mémoire sur iPhone). PBKDF2 600 000 suit la recommandation OWASP pour SHA-256. |
| Format | JSON versionné `{ v: 2, kdf, it, n, t, s, i, c }`. `n`/`t` (ordre global des écritures) sont aussi dans le texte chiffré et doivent concorder : un en-tête modifié est refusé. |
| Vérification | Chaque écriture est relue, déchiffrée et comparée valeur par valeur avant d'être considérée comme faite |
| Stockage plein | Seuls les caches recalculables (`twrc.cache.*`, routes, DATEX) sont sacrifiés, jamais une donnée durable ; sinon l'écriture échoue sans rien effacer et un message invite à exporter une sauvegarde |
| Plusieurs onglets | Fusion des écritures : valeurs distantes, plus les modifications locales non encore écrites. Une écriture tardive d'une page qui se ferme est reconnue plus ancienne et l'état plus récent est réaffirmé. |
| Import de sauvegarde | Il réussit seulement une fois le coffre réécrit **et** relu ; sinon retour exact à l'état précédent. Le journal d'import reste en mémoire. |
| Démarrage | Le code applicatif est dans un bloc différé (`text/plain`) et ne démarre qu'après l'ouverture du coffre : aucune donnée personnelle n'est lisible avant |

Le code, toujours nécessaire en mémoire (agenda chiffré, sauvegardes, verrouillage, nouvelle version du préréglage), est **chiffré dans le coffre** et jamais écrit en clair.

**Limite assumée, et pas une promesse** : ce chiffrement protège les données **au repos** : copie du disque, autre application lisant le stockage, appareil verrouillé, profil fermé. Il **ne protège pas** contre un JavaScript malveillant exécuté dans une session déjà déverrouillée. La CSP réduit ce risque sans le supprimer. Face ID n'est pas intégré nativement : le trousseau de l'iPhone peut remplir le code dans le formulaire.

## 3. Migration sans perte (automatique au premier lancement)

Détection : `twrc.key` est présent en clair (appareil déverrouillé avec l'ancienne version).

1. Instantané de toutes les clés `twrc.*` sensibles.
2. Chiffrement dans un nouveau coffre (sel neuf).
3. Relecture, déchiffrement et **comparaison valeur par valeur**.
4. Seulement ensuite : clé de session, puis retrait des copies lisibles, et contrôle que plus aucune ne reste.
5. Bandeau « 🔐 Données chiffrées sur cet appareil ».

**Reprise** : si Safari est fermé, l'iPhone mis en veille ou la batterie épuisée après l'écriture du coffre, le démarrage suivant voit les données en clair **et** le coffre. Les données en clair font foi : le coffre est revérifié contre elles, réécrit si besoin, puis seulement le nettoyage a lieu.

**Échec** (stockage refusé, plein même sans caches) : **rien n'est supprimé**. L'app continue sur l'ancien stockage et affiche « Chiffrement local non terminé : tes données restent intactes… ».

Autres sources de migration :
- **Ancien coffre v1** (`twrc.device.vault.v1`, ancien « Verrouiller ») : converti en coffre v2 au déverrouillage, puis retiré.
- **Copies lisibles égarées** (ancienne version ouverte ailleurs) : absorbées si elles manquent au coffre, chiffrées, puis retirées.

**Sauvegardes** : format et code inchangés. Les anciennes sauvegardes V1 et V2 se restaurent comme avant (tests `e2e58`, `test_backup`).

## 4. Origine dédiée (Cloudflare Pages) — préparée, non activée

Le stockage d'une origine **ne peut pas** être lu depuis une autre. Aucune migration automatique entre domaines n'est donc possible ni tentée.

**Préparé dans le code** :
- `RC_DATA_BASE` (variable de construction) : sur une autre origine, les données du relais (`obs.json`, `calendar.sealed.json`, `road-datex.json`) sont lues depuis GitHub Pages, que le relais continue d'alimenter. La CSP l'ajoute automatiquement.
- `_headers` est généré avec le build : CSP complète plus `frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (géolocalisation sur cette origine uniquement), `COOP`, pas de cache pour `sw.js` et `index.html`.
- La CSP en `<meta>` est déjà active sur GitHub Pages : scripts autorisés uniquement par empreinte SHA-256, plus Leaflet (SRI).

**Opérations manuelles (propriétaire)** :
1. Cloudflare → Workers & Pages → créer un projet Pages en « Direct Upload », nommé par exemple `race-control` → `race-control.pages.dev` (selon disponibilité).
2. Publier le build : `RC_DATA_BASE=https://ipoower.github.io/iPoower/race-control/ node tools/build.js`, puis `npx wrangler pages deploy dist --project-name race-control`.
   - Le relais pousse `gh-pages` environ toutes les 10 minutes : **ne pas** brancher Cloudflare sur `gh-pages` (quota de constructions dépassé).
   - Déployer l'app seulement à chaque version.
3. Vérifier sur la nouvelle origine : en-têtes présents, données du relais lues (GitHub Pages envoie `Access-Control-Allow-Origin: *`, à confirmer dans l'onglet Réseau), notifications, agenda.
4. **Transfert des données sur chaque appareil** :
   - ancienne adresse → Réglages → Exporter une sauvegarde chiffrée ;
   - nouvelle adresse → Importer → vérifier réglages, voitures, journal ;
   - ajouter la nouvelle adresse à l'écran d'accueil.
5. Garder l'ancienne adresse accessible tant que chaque appareil n'a pas été transféré et vérifié. **Aucune redirection automatique.**

## 5. GitHub

- Actions épinglées par SHA dans **tous** les workflows (relais, watchdog, sources, confidentialité de PR, comme la CI principale).
- Permissions déjà minimales :
  - `contents: read` pour la CI, les sources et la confidentialité de PR ;
  - `contents: write` seulement pour les workflows qui publient sur `gh-pages` (relais, watchdog, DATEX) et pour le déploiement.
- **Protections : prêtes, non appliquées.** Elles s'appliquent avec `tools/github/protect-branches.sh` après ta revue :
  - `main` :
    - PR obligatoire ;
    - contrôles `unit`, `validation`, `scan` requis et à jour ;
    - historique linéaire ;
    - ni force-push ni suppression ;
    - règles appliquées aussi à l'admin.
  - `gh-pages` (ruleset) : ni réécriture ni suppression. Les publications automatisées en avance rapide restent possibles.
  - Revue humaine obligatoire : impossible à imposer avec un seul compte (l'auteur ne peut pas s'approuver). La règle est donc tenue par la politique de fusion : **les PR de sécurité ne sont jamais fusionnées sans ton accord explicite**.

## 6. Risques résiduels

- JavaScript malveillant exécuté dans une session déverrouillée (limite inhérente au navigateur, atténuée par la CSP).
- La clé de l'onglet est en `sessionStorage` : un navigateur de bureau qui restaure les sessions peut la conserver jusqu'à la fermeture du profil. Utiliser « Verrouiller » sur un poste partagé.
- Mode « sans code » (aucun code saisi) : rien ne permet de chiffrer, les réglages restent en clair comme avant. Conseil : utiliser un code.
- Écriture à moins de quelques millisecondes d'une fermeture brutale : la dernière modification peut ne pas être enregistrée. Une écriture immédiate a lieu à la mise en arrière-plan.
- Origine partagée `ipoower.github.io` tant que la migration Cloudflare n'est pas faite (stockage commun avec les autres applications du domaine, désormais illisible car chiffré).
- La CSP en `<meta>` ne couvre pas `frame-ancestors` sur GitHub Pages (couvert par `_headers` sur Cloudflare).
