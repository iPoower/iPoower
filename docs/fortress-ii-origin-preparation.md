# Forteresse II — dossier préparatoire d'isolation d'origine (13/10/2026)

> **NON ACTIF / NO GO MIGRATION.** Complément à [fortress-origin-plan.md](fortress-origin-plan.md), [fortress-vault.md](fortress-vault.md), [fortress-web.md](fortress-web.md), [fortress-relay.md](fortress-relay.md) et [fortress-ci-coverage.md](fortress-ci-coverage.md). Les documents précédents restent normatifs. Cette branche ne contient aucun changement du build, de la PWA, du coffre, des workflows existants, des DNS, du relais, des secrets ou de la production.

## A. Base d'audit et classification des preuves

- `main` vérifié à `8f3e689f3d532ff61a24480d39b2cb45f9a105f9` (squash #133); #128, #129, #130, #131 et #133 fusionnées. `gh-pages/race-control/version.json` indique `prod-103`, source `af8a2fc0e5f2b3da91d7fa984787d5e99c0be2ad` (#131). La divergence est **attendue** pour une fusion purement documentaire/CI, mais l'égalité des octets HTML déployés et les vrais en-têtes réseau exigent une vérification séparée. Aucun essai HTTP de l'application n'est considéré réussi ici.
- **Architecture démontrée (code + test fictif)** : `ipoower.github.io` est la même origine pour les deux applications; préfixes, sous-chemins, noms de bases et SW ne cloisonnent pas localStorage, IndexedDB, Cache Storage ni l'invocation de CryptoKey non extractibles. `tests/e2e75-fortress-web.js` montre l'accès inter-application avec un document *simulé*; il ne démontre aucune attaque réelle.
- **Mitigations vérifiables dans le code** : `src/session-vault.js` chiffre le coffre v2 AES-256-GCM / PBKDF2-SHA256 600 000, fait des relectures et protège les écritures avec Web Locks; `src/remember-device.js` range des CryptoKey non extractibles dans IndexedDB `twrc.remember-device.v1`; session v4 enveloppée. `src/sw.js` v12, caches `twrc-static-v12` / `twrc-data-v3`, scope limité à son sous-dossier. Leaflet est auto-hébergé, CSP script-src par empreinte, sans JS global de CDN.
- **Limite HTTP confirmée par la construction** : `tools/build.js` génère `dist/_headers` + CSP meta; GitHub Pages ne fait pas appliquer ce fichier `_headers`. La réponse d'hébergement dédiée doit être observée en HTTP (dont `frame-ancestors` non applicable via meta). **Vérifier la longueur de la directive CSP : Cloudflare Pages limite chaque ligne d'en-tête à 2 000 caractères.** Ne pas tronquer la politique pour franchir cette limite.
- **Limite fonctionnelle confirmée dans le code** : `RC_DATA_BASE` configuré à la construction peut pointer vers une autre origine, et `connect-src` l'autorise; pourtant le SW v12 ignore toute requête dont `u.origin !== self.location.origin`. En cas de JSON servis ailleurs, le cache SW `twrc-data-v3` ne sera plus alimenté par ces requêtes : l'offline ne doit pas être déclaré validé. `dataUrl` dans `src/app.js` concerne les ressources de relais, pas les scripts externes.
- **Non démontrés / interdits à présumer** : compromission de l'application voisine, exposition effective de secret, réglages administratifs d'Environment, contrôle HTTPS en direct, permissions Safari physiques, intégrité des quatre JSON publics, accessibilité CORS actuelle, disponibilité d'un compte Cloudflare.

## B. Architecture recommandée et choix

```text
iPhone Safari / PWA ANCIENNE                 iPhone Safari / PWA FUTURE
  https://ipoower.github.io/                  https://<projet-réservé>.pages.dev/
    /iPoower/race-control/                      stockage et SW propres à cet hôte
    /Reconversion-Control/                     aucune autre application
    stockage partagé sur ancien hôte             pas de partage de cookies/IDB/Cache
           |                                          |
       RESTE EN PLACE                          HTTPS + CSP HTTP stricte
           |                                          |
GitHub Actions : main SHA approuvé + CI exacte -> relais avec secrets ENV production
           |                               aucune APP_KEY / RC_KEY / iCal au navigateur
           v
gh-pages : obs.json, road-datex.json, version.json (PUBLICS)
           calendar.sealed.json (CHIFFRÉ, contenu non public en clair)
           |
       [FUTUR SEULEMENT : livraison contrôlée des JSON, même origine ou CORS prouvé]
           |
       HTTPS du futur site; schéma/fraîcheur validés; offline testé
```

| Option | Isolation | CSP/HTTP | Coût / maintenance | iOS, offline, rollback | Choix |
|---|---|---|---|---|---|
| A. Projet Cloudflare Pages autonome sur `*.pages.dev` | Oui, si hôte exclusivement Race Control | `_headers` sur assets statiques, pas automatiquement sur Pages Functions | Statique gratuit selon quota; une chaîne de publication nouvelle à auditer | Nouveau SW/permissions; ancienne PWA conservée; data bridge à prouver | **Cible privilégiée** si compte disponible plus tard |
| B. Sous-domaine personnalisé exclusivement dédié | Oui, à condition de ne pas héberger d'autres applications et de limiter les autres hôtes accessibles | Identique selon hébergeur | Domaine éventuellement payant, DNS/TLS et renouvellements à gérer | Même migration de coffre; rollback sans redirection; davantage de DNS à maintenir | Alternative future si domaine déjà possédé |
| C. GitHub Pages actuel | Non, reste origine partagée | Meta CSP seulement, manque headers HTTP personnalisés fiables | Aucun nouveau compte/flux | Fonctionnel actuellement; aucune migration nécessaire | **Situation à maintenir jusqu'à décision distincte** |

Ne choisir ni nom concret de domaine ni compte présumé. HTTPS/TLS géré par Pages *après* configuration autorisée. Si un jour domaine personnalisé et `pages.dev` sont tous deux actifs, ce sont **deux origines distinctes**, donc il faudra un canonique choisi, sans redirection de l'ancienne PWA sans consentement. Préférer un miroir statique, borné et en lecture seule des quatre JSON sur la **future même origine**; ne pas déplacer l'exécution des relais/secrets vers le client, ne pas exécuter le code `gh-pages` avec des secrets. Si le miroir n'est pas possible : tester exactement les réponses CORS avant tout changement; les réponses opaque `no-cors` et les fetch bloqués sont refusés. Pour le calendrier scellé, contenu AES-GCM seulement, cache et rétention à définir; aucune URL iCal, clé, titre en clair ni donnée GPS en URL de télémétrie.

**Intégrité** : TLS protège le transport du serveur choisi, pas l'altération par un écrivain `gh-pages`. Pour `obs.json`, `road-datex.json`, `version.json`, vérifier schémas, limites, dates, expiration; un futur système de signature avec vérificateur public (clé privée jamais côté client) peut fournir une authenticité indépendante. Le `calendar.sealed.json` dispose d'une authentification AES-GCM à contrôler au déchiffrement, pas d'une garantie automatique de fraîcheur. Ne pas assimiler SHA non signé, no-cache ou CORS à une preuve d'origine approuvée.

**HTTP à accepter seulement avec mesure sur réponse réelle** : CSP script-src par empreintes (pas `unsafe-inline` ni `unsafe-eval`), `frame-ancestors 'none'`, no-referrer, nosniff, Permissions-Policy GPS self, HSTS **scopé prudemment** (ne pas imposer `includeSubDomains` sans analyse du domaine), COOP same-origin, Cache-Control spécifique index/SW, images/cartes et API autorisées. Une Pages Function requiert ses propres headers. Contrôler `Content-Security-Policy` **sans dépassement des 2 000 caractères par ligne** et surveiller les rapports de violation.

## C. Inventaire de stockage : code connu et obligation de mesure exhaustive

L'inventaire suivant résulte des constantes lues dans `src/session-vault.js`, `src/backup.js`, `src/app.js`, `src/userctx.js`, `src/device-storage.js`, `src/remember-device.js`, `src/sw.js`. **Ce n'est pas une preuve de couverture exhaustive des clés dynamiques ou futures.** L'outil futur devra parcourir toutes les clés réellement présentes **après déverrouillage** avec un manifeste versionné et refuser chaque clé inconnue jusqu'à classification explicite.

| Clés/niveaux | Traitement envisagé |
|---|---|
| `twrc.settings.v1` | Durable : voitures/monte/jeux/profondeur/DOT/plan/lieux/agenda manuel/calibrations/journal applicatif; comparer chaque valeur structurée |
| `twrc.context.v1` | **Mixte** : projeter les sous-champs durables (jour, voiture active, débriefs clos, arrivées, contextes et confirmations manuels). GPS courant, départ actif, observation runtime, estimation éphémère exclus. Comparer projection durable, pas le JSON brut |
| `twrc.tyretherm.v1`, `twrc.tripcancel` | Durable métier après revue des règles d'expiration et du consentement; comparer exactement |
| `twrc.view`, `twrc.outfit.occasion` | Préférences d'interface non sensibles, transfert optionnel explicite |
| `twrc.weather.incidents.v1`, `twrc.trend` | À arbitrer **avant migration** : incidents de requêtes ou premières prévisions par trajet, historique temporaire. Backup V2 ne les transporte pas tels quels |
| `twrc.reports.v1`, `twrc.shadow.v1` | **Observation humaine / journal météo à examiner impérativement** : `reports` contient les signalements terrain (conservés 6 h au maximum), `shadow` contient jusqu'à 200 comparaisons dont des observations utilisateur. Aujourd'hui absents de Backup V2. Ne jamais les effacer silencieusement : décision explicite sur historique, conservation, consentement et coordonnées arrondies |
| `twrc.runtime.v1` | Diagnostic et journal d'exécution : classer comme état runtime, vérifier l'absence d'annotation humaine pérenne avant exclusion |
| `twrc.reload.*`, `twrc.road.*`, Web Lock `twrc.weather.station.*` | Méta transitoire / cache réseau / nom de verrou : exclure du transfert; le verrou Web Locks n'est pas une clé localStorage |
| `twrc.gps`, `twrc.place.v1`, `twrc.tripstart.v1`, `twrc.tripend.v1`, `twrc.returnhome.v1`, `twrc.tripdone`, `twrc.debrief.v1` | Clés historiques/legacy : vérifier si une information durable n'a pas déjà été absorbée dans le contexte; ne pas transporter GPS/session actif |
| `twrc.cache.*`, `twrc.croute*`, `twrc.calendar.sealed.v1`, `twrc.weather.limit.v1`, `twrc.decision.latest.v1`, `twrc.tripmap`, `twrc.presetv`, `twrc.cfghash`, `twrc.lastbackup` | Dérivés / versionnage / temporaires : classer, régénérer ou recalculer sans perdre un historique humain |
| `twrc.vault.v2`, `twrc.session.v2`, `twrc.device.vault.v1`, `twrc.restore.pending.v1`, `twrc.lock.signal` | Structures cryptographiques / journal / révocation : ne jamais traiter comme simples réglages |
| IndexedDB `twrc.remember-device.v1` (records/slots), autres éventuelles DB | Ne pas exporter de `CryptoKey`, token, descripteur de session, autorisation mémorisée; nouvel enrôlement sur la nouvelle origine |
| Cache Storage `twrc-static-v12`, `twrc-data-v3`, SW/permissions GPS/notification | Pas de migration; nouveau cache sur future origine, première requête réseau obligatoire, contrôle offline, accord GPS distinct |

Le transfert complet ne peut **pas** être obtenu en se limitant à `Backup.make()` V2 : ce dernier réécrit/nettoie le contexte, filtre des entrées et limite le nombre de débriefs. Conserver le fichier V2 pour la restauration métier prévue, **plus** un instantané versionné **durable et strictement classifié**, avec preuve d'absence de clés inconnues, sans exporter les secrets. Toutes les valeurs applicatives durables devront être comparées à leur **projection canonique** pour ne pas confondre réinitialisation GPS volontaire et perte.

## D. Protocole volontaire de transfert — non implémenté en production

1. Sur **l'ancienne** PWA de confiance, code correct, aucun verrouillage en attente, `flush` + Web Lock + relecture du coffre. Bloquer si écriture non confirmée / changement concurrent.
2. Construire un manifeste `app/schema/sourceOrigin/createdAt/categories/keyNames/count/digests`, signé cryptographiquement par **authentification GCM** avec l'enveloppe, version et limites strictes. AAD inclut origine source, future origine attendue et version. Aléa cryptographique pour sel (16 o) et IV (12 o). PBKDF2-SHA256 à coût fixé documenté, AES-256-GCM; jamais identifiants dans l'URL.
3. Chiffrer l'ensemble localement et réouvrir immédiatement avec le mot de passe; ne proposer le fichier qu'après comparaison exacte. Ne jamais copier sur serveur, presse-papiers ou postMessage transversal. Ne pas exfiltrer le mot de passe ni réutiliser des CryptoKey d'appareil.
4. Sur la **nouvelle** origine, sélectionner volontairement le fichier. Refuser taille, version, KDF, sel, IV, schéma, origine incompatible, clé inconnue ou authentification GCM invalide **avant toute écriture**. Produire un aperçu du nombre de clés et un diff lisible.
5. Restaurer dans une zone temporaire de test vide, comparer chaque valeur durable et ses sous-champs. Prévoir quota/refus IDB, délai et interruption : journal non sensible et atomique dans la mesure du possible; restauration du dernier coffre sain, sinon arrêt sans suppression.
6. Relecture/déchiffrement du résultat + validation forte; autorisation explicite avant activation de l'état sur la future origine. Réenrôlement session, GPS, permissions, notification/Scriptable ensuite. Ancienne PWA, fichier de sauvegarde et stockage conservés.
7. **Rollback bidirectionnel** : avant tout retour vers l'ancien site, exporter les modifications durables post-migration dans un nouveau paquet chiffré; comparer avec l'ancienne copie, arbitrer les conflits (ne jamais écraser silencieusement), tester le retour inverse; aucune redirection ni suppression automatisée.

Une revue statique complémentaire des modules `src/app/weather-view.js`, `src/reliability.js` et `src/app/weather-station.js` a identifié les clés `reports`, `shadow` et `runtime` et la convention de verrou `weather.station`. Ce relevé n'est pas une inspection du stockage réel de l'iPhone; aucune donnée utilisateur n'a été lue. Le futur manifeste d'import doit utiliser une **allowlist explicite**, signaler le nombre de clés inconnues, produire une erreur bloquante dès qu'une clé non classifiée est présente et garantir la comparaison des observations humaines retenues. Aucun import générique `twrc.*` en bloc.\n\nLe harnais fictif est isolé dans \`tests/fortress-origin-fixture.js\` avec une preuve VM du Service Worker v12 : un JSON distant est laissé hors interception, tandis qu'un JSON de même origine sous le scope est mis en cache; et avec une vérification PR non privilégiée, \`.github/workflows/fortress-origin-prep.yml\`, sans Environment ni secret. Il modélise l'enveloppe et une écriture simulée atomique **mais n'est pas intégré à l'import réel**, ne prouve pas le comportement de Safari ni un transactionnel multi-stores navigateur.\n\n## E. Matrice d'acceptation

| Volet | Contrôles | Blocage si |
|---|---|---|
| Unitaires / cryptographie fictive | exactitude manifeste, AES-GCM, mauvais code, corruption, version v0/vfuture, substitution d'origine, limitation de taille, clés rejetées | valeur manquante, erreur non bloquante |
| Quota / interruption / rollback fictifs | destination initialement vide, échec en staging, refus quota, interruption, rollback puis restauration inverse après ajout | source altérée, restauration partielle acceptée |
| Réseau / CORS / CSP futurs | vrai GET JSON, CORS, 429/503, JSON invalide, HTTP headers, frame-ancestors, script XSS rejeté, limite 2 000 caractères | JSON illisible ou CSP incompatible |
| Chromium + WebKit automatiques | 5 onglets, pneus/garage, météo LIVE/CACHE, contexte, Waze, calendrier scellé, offline, SW/manifest | tout test existant absent ou rouge |
| iPhone 11 Pro Max **physique** | installation nouvelle PWA, coexistence, code + réauth après veille, GPS refusé/accordé, Wi-Fi/4G, redémarrage, offline froid, notifications, Scriptable | écart d'UX, perte, clé/permission présumée migrée |

Les tests simulés Chromium/WebKit **ne prouvent jamais** une session Safari physique. Une démo locale/fixture ne prouve pas l'application des headers en production Cloudflare.

## F. Registre des risques — S = gravité, P = probabilité (1–5, estimation)

| Risque | S/P | Maîtrise proposée | Résiduel visé |
|---|---|---|---|
| Même origine et script voisin | 5/3 | origine dédiée exclusive + CSP/headers | 2/2 (script de l'origine elle-même) |
| Perte de données / clés inconnues, notamment observations `reports/shadow` | 5/3 | inventaire runtime fail-closed + restore éprouvé + ancienne source intacte | 5/1 |
| JSON distants sans offline | 4/4 | miroir same-origin ou SW CORS explicite + test froid (limite SW confirmée par VM) | 3/1 |
| CORS absent / blocage météo-agenda | 4/3 | test réel avant bascule, chemin de repli explicite | 2/1 |
| En-tête CSP trop long / non appliqué | 5/3 | mesure _headers et GET réel (Pages 2 000 caractères/ligne) | 3/1 |
| JSON `gh-pages` modifié sans signature | 4/3 | contrôle d'intégrité/fraîcheur, signature future, pas d'exécution | 3/2 |
| Code faible, XSS sur future origine | 5/2 | code robuste, script hash, review, pas de CDN JS | 4/1 |
| Session/permission GPS non reprise | 3/4 | nouvelle autorisation/enrôlement consentis | 2/1 |
| Modifications après bascule non rapatriées | 5/3 | export inverse chiffré, diff conflit, ancien coffre préservé | 4/1 |
| Double domaine futur, mauvais raccourci | 3/3 | origine canonique unique, coexistence gérée | 2/1 |

## G. Lecture pédagogique et décisions (Why / Impacts / Proof / Recovery / Lesson)

1. **Séparer l'origine** : *Pourquoi* — frontière navigateur insuffisante aujourd'hui; *Impact* — URLs, PWA, permissions et stockage nouveau; *Preuve* — attaque simulée inter-origines + essais physiques; *Récupération* — garder ancienne PWA intacte; *Leçon* — un chemin URL n'est pas une sandbox.
2. **Servir les JSON sans secret** : *Pourquoi* — données LIVE et offline; *Impact* — cache, CORS, fraîcheur, relais inchangé; *Preuve* — network/429/offline froid sur origine neuve; *Récupération* — réouverture ancien site; *Leçon* — stockage et SW sont par origine.
3. **Transfert chiffré à manifest complet** : *Pourquoi* — stockage non portable; *Impact* — Backup V2 et contexte mixte; *Preuve* — égalité de toutes les projections durables et échecs simulés; *Récupération* — non destructive + paquet inverse; *Leçon* — export réussi ≠ restauration réussie.
4. **En-têtes réellement appliqués** : *Pourquoi* — GitHub Pages limite les contrôles HTTP; *Impact* — CSP, cartes, iframe, CORS; *Preuve* — tests navigateur sur vraie réponse + limite fournisseur; *Récupération* — blocage bascule, ancien site intact; *Leçon* — un fichier config n'est pas une preuve d'application.

## Verdict à la date de préparation

- **GO pour étude, documentation et harnais fictif**, sur PR non fusionnée; aucune activation.
- **NO GO pour migration réelle** tant que : inventaire runtime exhaustif, restore réel de fixtures via le chemin applicatif, CORS + offline des quatre JSON, audit CSP/headers réels, rollback bidirectionnel et validation iPhone physique ne sont pas prouvés.
- Toute création de projet Cloudflare, DNS, secret, changement relais, déploiement, fusion ou transfert réel nécessite une **autorisation nouvelle et distincte**.

Sources : [MDN same-origin](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy), [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/), [limites Pages](https://developers.cloudflare.com/pages/platform/limits/), [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/).
