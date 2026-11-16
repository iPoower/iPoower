# Forteresse III — R1 : état vérifié et préparation d'origine dédiée

13 octobre 2026. Base `main` : `5186c7a052b2d1278d9f9b8864c0b7b92adbedd0`.
**Préparation locale uniquement : aucune origine créée, aucun DNS, aucun
hébergement connecté, aucune publication, migration ou donnée réelle exportée.**

## Diagnostic et preuves publiques

Trois pages ont été lues par GET public sans cookie, authentification ou
exécution de script. Les réponses et leurs SHA-256 sont archivés dans
`fortress-iii-origin-http-evidence.json`. Les scripts annoncés par les deux
applications voisines ont été lus comme du texte ; les indicateurs sont dans
`fortress-iii-origin-script-evidence.json`. Aucune valeur de stockage utilisateur
ni clé cryptographique réelle n'a été consultée.

| Application | Réponse observée | Origine |
|---|---|---|
| Race Control : `/iPoower/race-control/` | HTTP 200, 1 165 305 octets | `https://ipoower.github.io` |
| Reconversion Control : `/Reconversion-Control/` | HTTP 200, 3 763 octets | Même origine |
| Control Vault : `/Control-Vault/` | HTTP 200, 1 736 octets | Même origine |
| Weather Desk #140 | Prototype de branche, non publié par cette mission | Aucune origine dédiée validée |

Le HTML Race Control conserve le SHA-256
`c54414500aee0f0ae28a684f57274a305ec0d8fcb8ca75f42fdd0a16213080bf`.
Les trois réponses ont HSTS `max-age=31556952` et cache `max-age=600`.
Aucun header HTTP CSP, Referrer-Policy, Permissions-Policy, X-Frame-Options,
nosniff ou COOP n'a été observé sur ces pages. La CSP meta est présente sur
les trois ; Race Control a aussi la meta `no-referrer`. Un fichier `_headers`
ne démontre pas que GitHub Pages l'applique. Aucun Set-Cookie n'a été observé
sur ces GET, ce qui **ne démontre pas l'absence de cookies d'un profil connecté**.

R1 est confirmé comme faiblesse d'architecture. Une compromission préalable
d'un script d'une autre application de la même origine peut accéder aux
stockages et autorisations de cette origine. Les noms différents de chemins,
préfixes et bases ne créent pas une frontière. L'exploitation réelle n'est
pas démontrée : aucun script hostile n'a été exécuté sur les sites réels.

## Inventaire et limites

| Surface | Preuve statique / protection actuelle | Limite à lever avant migration |
|---|---|---|
| localStorage | Coffre Race Control v2 AES-GCM, données de session en mémoire ; références dans les scripts des trois apps | Origine partagée ; inventaire runtime complet non réalisé |
| sessionStorage | Session v4 enveloppée, sans clé brute ; références dans une ressource de Reconversion | Séparation d'onglet ne protège pas d'un script déjà exécuté sur l'origine |
| IndexedDB | `twrc.remember-device.v1`, CryptoKey non extractibles et autorisations temporaires | Ces clés ne sont pas du matériel attesté ; leur invocation de même origine reste possible |
| Cache Storage | `twrc-static-v12`, `twrc-data-v3` ; indicateurs dans une ressource voisine | Cache Storage est lié à l'origine, pas isolé par nom de cache |
| SW | Race Control sous `/iPoower/race-control/`, registre relatif `sw.js` | Scopes voisins et état actif d'un vrai profil non mesurés ; ne pas élargir un scope |
| Cookies | Aucun Set-Cookie sur les GET publics, pas de `document.cookie` trouvé dans les ressources lues | Les scripts chargés indirectement, sessions cloud et cookies réels restent non vérifiés |
| Messages | SW Race Control renvoie des noms de caches via MessagePort, pas de réglages | Aucune nouvelle passerelle postMessage de données privées vers l'invité |
| Scripts | Race Control inline par empreintes CSP, Leaflet local signé ; ressources voisines de même hôte | Un script compromis de l'app voisine n'est pas soumis à la CSP de Race Control |
| Permissions | GPS/code/session restent propres aux choix de l'appareil ; pas d'accès physique testé | Nouvel enrôlement volontaire GPS/session sur la future origine ; invité sans GPS/caméra/microphone |

Les signaux publics ne sont pas un inventaire exhaustif des clés. Les références
directes de stockage peuvent être indirectes (`KEY`, wrappers, modules, noms
dynamiques). Les littéraux SW sont archivés **sans prétendre mesurer leur scope
actif** ; ils se résolvent relativement au document, pas nécessairement au
fichier JavaScript. Aucun profil navigateur réel n'est analysé dans ce dossier.

Le registre existant de #134 examine 48 JS et classe 43 références `twrc.*`.
Quatre catégories restent à arbitrer. La séparation réelle des stockages et
l'usage possible d'une clé non extractible par un voisin sont couverts par les
laboratoires existants ; leur ancienne CI ne prouve pas les nouveaux fichiers
de cette branche ou un iPhone physique.

## Blocages PWA et restauration confirmés

1. **Enregistrement SW limité au hostname `github.io`** : le vrai
   `registerSW()` de `src/app/lifecycle.js` est exécuté en VM avec un API
   navigateur fictif. Il enregistre sur `fixture.github.io`, pas sur
   `fixture.pages.dev` ni un domaine dédié. Avant toute bascule, préparer une
   correction séparée avec l'origine canonique autorisée et le scope exact.
   Le code PWA de production n'est pas changé ici.
2. Le vrai SW v12 ignore les requêtes cross-origin. Un `RC_DATA_BASE` distant
   peut donc empêcher la conservation offline du calendrier scellé et des JSON
   du relais. Préférer une copie contrôlée sur l'origine personnelle ; sinon
   prouver CORS, cache, intégrité, fraîcheur et offline froid avec le code réel.
3. Le vrai `Backup.make()` V2 ne couvre pas `twrc.reports.v1` et
   `twrc.shadow.v1`. Le préflight détecte cette absence ; un « export réussi »
   n'est pas une preuve de restauration exhaustive. Les harnais de #138/#139
   demeurent expérimentaux et ne sont pas importés dans `src/`.
4. HTTPS, en-têtes réels, permissions, installation/coexistence PWA, stockage
   après fermeture iOS, quota physique et restauration iPhone restent à tester.
   Le modèle d'en-têtes produit par le build fictif a une ligne CSP de **1 172
   octets**, sous 2 000. Cela ne prouve aucun en-tête sur un futur serveur.

## Cible et décisions futures

Réutiliser `fortress-ii-origin-preparation.md` et l'emballage public de #140.
Une origine HTTPS exclusivement personnelle, une autre origine HTTPS pour
Weather Desk, hôtes distincts et aucune application voisine sur l'hôte privé.
Un simple nouveau sous-chemin sous `ipoower.github.io` est refusé.

Cloudflare Pages Direct Upload est une option statique déjà préparée dans
#140 ; aucun compte ni projet n'est présumé disponible. Un sous-domaine
personnel dédié est une alternative. Ne pas activer Git integration ou les
publications de previews : ils pourraient publier les branches sans la revue
attendue. Toute création de compte/projet, coût, domaine, secret de publication,
DNS ou migration exige une décision explicite distincte.

| Contrôle futur | Personnel | Invité |
|---|---|---|
| CSP HTTP | Scripts par empreintes, pas d'eval/inline non approuvé, frame-ancestors/object/base stricts | Ressources publiques propres uniquement ; aucun script du coffre |
| Referrer / framing / COOP | no-referrer, DENY, same-origin | Idem, origine différente |
| Permissions-Policy | GPS self après consentement ; autres capacités inutiles bloquées | GPS, caméra, microphone bloqués |
| Cookies | Aucun partage parent Domain, aucune clé/code transmis au serveur | Aucun état d'authentification personnelle |
| Données | Relais public + calendrier AES-GCM scellé pour le personnel, jamais de code/iCal/GPS en clair | Seulement météo publique ; pas de calendrier, presets, clés, caches ou traces privées |
| CORS | Minimum nécessaire, URLs approuvées, sans credentials de tiers | Aucun accès au service/personnel ; connect-src de son hôte public |
| SW / cache | Scope strict, shell/version et JSON vérifiés, tests offline | Pas de SW personnel ni copie de son manifest |

Observer les en-têtes **HTTP réellement reçus**, pas seulement le fichier de
build ou une meta. Cloudflare limite à 2 000 caractères chaque ligne `_headers`,
et les réponses de Pages Functions doivent porter leurs propres en-têtes.
Ne pas tronquer une CSP. `includeSubDomains` requiert une analyse du domaine
choisi ; aucune politique HSTS n'est appliquée à un nouveau domaine ici.

## Protocole de migration et rollback — inactif

Inventaire runtime versionné, aucune clé inconnue ; arbitrage explicite des
observations humaines, contextes mixtes et historiques ; sauvegarde chiffrée
réouverte et comparée ; restauration vers destination vide avec refus de
quota/corruption/collision ; vérification complète avant activation. Les clés
cryptographiques d'appareil et permissions ne sont jamais copiées. Le code
personnel n'est ni demandé durant cette mission ni transmis à un service.

L'ancienne PWA et toutes ses données restent en place. Pas de redirection,
effacement ou reprise automatique de stockage. Avant un éventuel retour,
produire un paquet inverse chiffré des nouvelles données, comparer les conflits
et obtenir un consentement avant activation. Sans ces preuves : arrêt.

## Coordination et validations

#134 : `249ac6e812ef65ade4afaf09f878091d5a4989e2`. Ses trois fichiers de
documentation/fixtures se retrouvent déjà identiques dans `main` via la
consolidation ; son ancien workflow séparé est absent de `main`. Cette branche
complète la préparation consolidée et ajoute un test à son workflow PR-only,
plutôt que de réécrire les branches actives. #134–#140 restent inchangées et
DRAFT ; #140 : `293ea6eb4277a9abc50499ebf498da3b3ff8dba9`.

| Commande exécutée localement | Résultat |
|---|---|
| `node tests/fortress-iii-origin-preflight.js` | 13/13 PASS ; verdict reste NO GO migration |
| `node tests/fortress-origin-fixture.js` | 15/15 PASS crypto / rollback / vrai SW en VM |
| `node tests/fortress-origin-inventory.js` | 48 JS, 43 références classifiées ; aucune donnée réelle |
| `node tests/fortress-ii-readiness.js` | 17/17 PASS conservation, inconnus, consentement, quota et collision fictifs |
| `node tests/fortress-ii-offline-rehearsal.js` | 12/12 PASS avec vrai SW et réseau/cache simulés |
| Syntaxe / scanner local / diff | 227 scripts et hook PASS ; scanner générique PASS sans clé réelle ; diff PASS |
| Chromium/WebKit / PWA navigateur | NON VÉRIFIÉS pour cette révision : installation locale en échec |
| HTTP des origines futures / Safari physique | NON TESTÉS, aucune origine future déployée |

Les 57 scénarios de laboratoire ne ferment pas R1. Le workflow garde
`contents: read`, checkout épinglé sans identifiants persistés, déclenchement
PR seulement, aucun secret/Environment/déploiement. Un seul step est ajouté,
sans deuxième workflow ni pipeline de publication.

## Verdict

**GO préparation et choix d'architecture futur ; NO GO migration/publication.
R1 reste OUVERT.** R2 est une correction indépendante, sur
`fix/fortress-iii-config-import-v1`, dont la matrice navigateur doit être prouvée
avant revue finale. Aucune CI ancienne d'une autre PR n'est reprise comme
preuve des nouveaux commits.

Les PR distantes ne sont pas créées : la revue automatique a refusé les pushes
en invoquant la précédente consigne sans GitHub, malgré le nouveau fichier de
mission demandant des DRAFT. Les commits et dossiers locaux restent consultables
pour une autorisation explicite de publication des branches, sans fusion,
déploiement ou migration.

Références : [même origine](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy),
[en-têtes Pages](https://developers.cloudflare.com/pages/configuration/headers/),
[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).
