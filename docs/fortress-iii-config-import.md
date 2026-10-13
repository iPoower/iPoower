# Forteresse III — R2 : import de configuration confidentiel

Préparation de revue uniquement. **PR DRAFT ; aucune fusion, publication,
migration de données réelles, modification de secret ou demande de code personnel.**

## Diagnostic avant correction — 13 octobre 2026

Base exacte : `5186c7a052b2d1278d9f9b8864c0b7b92adbedd0`.
Dans `src/app.js`, l'ancien `hashCfg()` décodait du Base64 depuis le fragment,
sans schéma ni limite. `loadSettings()` remplaçait les réglages pour un lien
différent et écrivait la chaîne Base64 entière dans `twrc.cfghash`. L'URL
n'était pas nettoyée après import. Une autre configuration pouvait remplacer
des véhicules ou le journal de saison déjà présents dans les réglages.

Le fragment n'est normalement pas envoyé au serveur HTTP. Il reste néanmoins
lisible dans la barre d'adresse, les copies de liens, la session navigateur et
par le JavaScript de l'origine. Le chiffrement du coffre v2 protège la copie
durable de ses valeurs ; il ne rend pas une URL Base64 confidentielle.
**Aucune divulgation réelle ni compromission d'application n'est démontrée.**

Production lue sans authentification ni test intrusif : HTTP 200,
1 165 305 octets, SHA-256
`c54414500aee0f0ae28a684f57274a305ec0d8fcb8ca75f42fdd0a16213080bf`.
Cette PR ne change aucun octet de la production tant qu'elle n'est pas fusionnée
et qu'un déploiement n'est pas distinctement autorisé.

## Traitement proposé

1. Le boot capture le lien en mémoire et retire ses paramètres `cfg` avec
   `history.replaceState`, puis vérifie le fragment obtenu. Recherche, chemin,
   état `history` et paramètres de fragment légitimes sont conservés. Cela vaut
   aussi pour un import invalide ou refusé ; aucun rechargement n'est nécessaire
   pour ce nettoyage. Un refus de `replaceState` bloque l'import.
2. Base64 historique/URL-safe et UTF-8 sont décodés avec limites : 128 KiB de
   JSON, profondeur 12, 8 192 noeuds, tableaux et textes bornés. Allowlist de
   champs, types, coordonnées, identités uniques, dates calendaires et valeurs
   métier. Les propriétés de prototype, clés de secrets, références inconnues
   et schémas futurs non reconnus sont refusés entièrement, jamais filtrés
   silencieusement. Aucun contenu d'import n'est journalisé.
3. Un coffre authentifié v2 est obligatoire. Pendant un verrouillage, le lien
   validé reste seulement dans la mémoire de l'onglet ; aucun accès aux données
   protégées ni écriture de configuration. Fermeture avant authentification :
   ce lien est abandonné, sans reprise implicite depuis un stockage.
4. `SessionVault.importConfig()` prend le verrou Web Locks déjà utilisé par le
   coffre, termine ses écritures en attente, relit la dernière enveloppe et
   vérifie encore la session. Une seule enveloppe AES-256-GCM contenant les
   réglages et leur identifiant est écrite et déchiffrée/recomparée. Le commit
   en mémoire vient ensuite. Une expiration, capture plus récente, corruption,
   absence du verrou, quota ou échec crypto ferme ce chemin. Un import ne
   sacrifie pas les caches pour contourner un quota.
5. L'identifiant est `sha256:` suivi de SHA-256 du JSON canonique avec un domaine
   fixe `twrc-config-import-v1`. **Il n'est pas dérivé du code personnel et
   n'autorise jamais à lui seul l'accès au coffre.** L'ancienne valeur Base64
   dans le coffre est convertie après authentification ; une valeur héritée
   illisible est retirée, sans changer les réglages. Une copie brute de cette
   seule métadonnée est supprimée après le boot, sans toucher à l'enveloppe.
6. Lien déjà traité : aucune réapplication des champs, même si l'utilisateur a
   changé ses pneus entre-temps. Lien différent sur appareil configuré : refus
   explicite, sans remplacement. Une première configuration peut conserver
   les matins automatiques d'un profil générique, **uniquement si tous ses
   autres réglages égalent exactement `BASE`**, pas sur la seule foi de
   `configured=0`. Toute saisie/historique de véhicule interdit ce cas.

Les formats AES-GCM/PBKDF2, clés de session, sauvegardes V1/V2, réglages courants,
GPS, pneus, météo, trajets, interface métier, Service Worker et permissions
Actions ne sont pas remplacés. Le diagnostic d'import utilise des messages
fixes sans nom de lieu, véhicule, code, URL privée ni contenu décodé.

## Compatibilité et alternatives

Les anciens liens valides restent utilisables pour initialiser un appareil
authentifié, avec les formats Base64 précédents. Les liens identiques sont
idempotents. L'écrasement d'un appareil configuré par un nouveau lien et
l'application en mode sans coffre sont volontairement refusés : les paramètres
et sauvegardes chiffrées restent les chemins prévus pour ces opérations.
Les imports hors schéma ou >128 KiB requièrent la voie de sauvegarde chiffrée.

Un simple nettoyage après écriture laisserait un lien invalide, refusé ou
interrompu exposé. Un identifiant Base64, une suppression de réglages, une
nouvelle clé dérivée du secret, un déchiffrement de stockage verrouillé ou une
modification du format du coffre ne sont pas nécessaires. La validation seule
ne protège pas contre un écrasement concurrent : la transaction utilise donc
le verrou et la dernière enveloppe existants.

## Données conservées sur fixtures

Les comparaisons portent sur les valeurs complètes, avant/après/relecture :
réglages, deux véhicules, date/plan d'approvisionnement, profondeur par essieu,
DOT, contrôle de pression, jeux stockés, compteur, journal de saison et
`twrc.context.v1`, `twrc.reports.v1`, `twrc.shadow.v1`, `twrc.tyretherm.v1`,
`twrc.tripcancel`. Une clé d'une autre application reste identique. Aucune
de ces valeurs n'est transférée entre appareils ni empruntée au profil réel.

## Validation effectivement exécutée

| Contrôle | Résultat local |
|---|---|
| `node tests/test_config_import.js` | 21/21 PASS — vrai WebCrypto, stockage/verrous fictifs |
| `node tests/run-ci.js --lane unit` | 51/51 suites PASS, build et agenda fictifs |
| `node tests/test_ci_lanes.js` | 27/27 PASS ; 108 suites et 161 exécutions complètes attendues |
| `node tests/ci/syntax.js` | 229 scripts et hook PASS |
| `node tools/check-secrets.js` | PASS motifs génériques ; aucune clé réelle disponible localement |
| `git diff --check` | PASS |
| `node tests/relay-smoke.js` | 43/43 PASS, relais/réseau/notifications entièrement fictifs |
| `node tests/keys-tools.js` | 3/3 PASS, clés fictives séparées |
| `node tests/pr-privacy.js` | 6/6 PASS, PR/valeurs privées entièrement fictives |
| E2E ciblé `e2e76-config-import.js`, Chromium et WebKit | Lancements FAIL infrastructure : exécutables absents, téléchargement d'archive invalide ; assertions navigateur NON VÉRIFIÉES |
| Chromium/WebKit en CI de la PR | À contrôler sur le SHA exact de la PR |
| PWA offline / ancien SW | Suites historiques inscrites dans la matrice ; résultat CI à vérifier |
| iPhone 11 Pro Max physique | NON TESTÉ |

Le premier passage unitaire a détecté le compteur fixe de couverture (106)
à mettre à jour lors de l'ajout de deux suites. Il a été corrigé à 108, avec
une assertion supplémentaire de présence des deux nouvelles suites et tous
les contrôles d'omission/doublon/faux vert conservés. Nouveau passage complet :
51/51. Aucun contrôle rouge n'est ignoré.

`e2e76-config-import.js` utilise le vrai HTML compilé de la CI, les deux profils
PC/iPhone et exclusivement des fixtures. Il vérifie authentification, URL,
dates/pneus/historiques, idempotence, refus de remplacement, métadonnée héritée,
malformation/taille, rechargement, fermeture/réouverture et verrouillage.
Le registre historique ajoute cette suite à Chromium **et** WebKit ; les
rapports ciblés ne peuvent pas se faire passer pour la matrice complète.

## Limites et retour arrière

- Une URL déjà copiée, synchronisée ou enregistrée avant son ouverture ne peut
  pas être révoquée par `replaceState`. Ne plus fabriquer de liens contenant
  des données privées ; préférer les sauvegardes chiffrées.
- Une ancienne copie offline du code conserve l'ancien comportement jusqu'à
  réception du nouveau shell. Les tests du SW restent requis. Aucun cache de
  l'utilisateur n'a été effacé pour forcer une mise à jour.
- R1, JavaScript de même origine et session ouverte restent des frontières
  séparées : ce correctif ne les clôt pas.
- Une coupure après le commit atomique peut supprimer l'annonce de succès,
  mais conserve une enveloppe complète, sans mélange réglages/identifiant.
  Une corruption externe de l'enveloppe bloque la récupération ; rien n'est
  écrasé par supposition.
- L'empreinte est une métadonnée d'idempotence, pas une authentification ni une
  protection autonome contre un script déjà exécuté sur cette origine.

Avant fusion : fermer la PR suffit, sans donnée à restaurer. Après une future
publication autorisée : préparer une PR de revert du code, sans suppression de
`twrc.settings.v1`, coffre, sauvegardes, sessions ou histories. Une empreinte
héritée n'est pas une sauvegarde. Revenir à l'ancien code réintroduit les risques
URL/écrasement et exige une revue séparée ; aucune action de rollback n'est lancée
par ce dossier.

Sources techniques : [History.replaceState](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState),
[politique de même origine](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy).

**Verdict provisoire : code R2 préparé ; GO revue seulement après preuve des
contrôles Chromium/WebKit, sécurité et non-régression sur le SHA exact. NO GO
fusion, publication, migration réelle. R1 reste ouvert.**

## Blocage de publication

La revue automatique a refusé deux pushes de la branche, en invoquant la
précédente consigne de mise à jour applicative sans GitHub. Le nouveau fichier
de mission a été relu pour établir le mandat DRAFT ; le second refus maintient
le blocage. Aucune API de mutation alternative n'est utilisée. Une autorisation
textuelle explicite de publier les branches et ouvrir les DRAFT est nécessaire
pour poursuivre dans cet environnement, sans fusion ni déploiement.
