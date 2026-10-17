# Conservation du journal — PR B01–B04

Statut : proposition en brouillon, revue humaine obligatoire. Aucun profil réel migré, aucune activation en production. `docs/INTEGRATION.md` reste strictement inchangé. Ce correctif ne réalise ni le lot 2, ni une liaison Control Vault.

## Garanties et modèle de données

- B01/B02 : toutes les entrées sources sont conservées sans plafond métier ni expiration. L’interface affiche les 60 trajets les plus récents ; le stockage et les exports complets restent exhaustifs.
- B03 : archive cumulative `twrc.debrief.archive.v1`, **à l’intérieur du coffre chiffré uniquement**. Schéma `{v:1, records:[string, ...]}` : chaque chaîne représente le JSON canonique complet d’un instantané source. Les propriétés sont triées récursivement, les tableaux gardent leur ordre. L’identité utilise tous les octets JSON, sans empreinte abrégée. Chaque nouvelle réponse reçoit aussi un identifiant aléatoire de 128 bits, conservé pendant un retry. Deux réponses identiques et simultanées restent donc deux versions ; rejouer la même réponse est idempotent. Les sources historiques strictement identiques, dépourvues d’identifiant, ne permettent pas de déduire deux événements distincts.
- La projection visible choisit un état déterministe par trajet (date de dernière action, arrivée, annulation, présence d’un retour, report, ordre canonique). Les sources concurrentes ne sont jamais remplacées par ce choix. Un départ manquant est retrouvé uniquement parmi les sources de la même arrivée.
- Une annulation d’arrivée ajoute un état annulé ; elle ne détruit pas les états antérieurs. L’effacement du journal est retiré de l’interface. Les versions des retours sont consultables par trajet.
- Les enregistrements anciens non affichables, champs inconnus et sources contradictoires sont gardés dans l’archive. Une archive malformée ou de version inconnue fait refuser l’écriture, sans nettoyage. Un contexte illisible ou de version inconnue ne peut être remplacé par un contexte vide.
- B04 : sous le verrou Web Locks existant, relire et authentifier le dernier coffre, former l’union de ses sources et des changements locaux, chiffrer, publier atomiquement, relire/déchiffrer et comparer. Cette union porte sur le journal contenu dans **la même clé canonique**, pas seulement sur des clés distinctes. Elle est répétée lors de la réception d’une modification distante. Les nouvelles écritures pendant WebCrypto restent en attente.

## Copie indépendante avant activation

Un profil avec un journal historique, ou sans coffre chiffré, reste en lecture seule pour le journal. Hors coffre, les autres fonctions de trajet restent utilisables, mais aucun nouveau débrief n’est annoncé enregistré. Sans coffre, un code d’au moins 8 caractères peut chiffrer une copie indépendante sans modifier la source. L’activation dans l’interface exige aussi un profil de configuration déjà déverrouillé et la vérification en lecture seule de son code existant, afin de prouver que le même code permettra la réouverture. Un code autonome de coffre sans parcours de réouverture est refusé ; la copie et la source restent intactes. La réouverture du fichier et sa concordance exacte avec le profil autorisent ensuite seulement la création du coffre et le nettoyage vérifié des copies lisibles. L’application demande d’exporter le coffre chiffré courant, de l’enregistrer hors du navigateur, puis de sélectionner ce fichier via le sélecteur de fichiers. Le fichier doit être **strictement identique au coffre courant**, puis son authentification AES-GCM doit réussir sous verrou. Une copie périmée, modifiée, incomplète ou un quota insuffisant font refuser l’activation. Aucun clic de confirmation, simple hash ou copie dans le même stockage ne remplace cette preuve.

Après cette preuve seulement, l’archive peut être initialisée à partir des sources originales et des modifications locales en attente. Le résultat est relu et vérifié avant succès. Une interruption laisse soit le coffre précédent, soit un coffre complet publié atomiquement. Une panne de vérification après notre écriture provoque un retour aux octets précédents, uniquement si aucun autre acteur n’a remplacé notre écriture. Un échec de rollback demeure une erreur explicite et requiert la copie indépendante.

Un coffre initialement vide n’a pas de journal à migrer et initialise une archive vide. Sans coffre/Web Locks, les écritures du journal sont refusées ; aucun export/import brut n’est utilisé pour contourner ce refus. Il n’existe pas de migration en arrière-plan d’un journal non vide.

## Coffre et fichier de récupération

L’archive utilise le stockage chiffré existant. Le coffre passe de **v2 à v3** quand il contient l’archive ; la clé de stockage et le verrou restent `twrc.vault.v2`, afin de conserver la même exclusion entre versions. Le lecteur actuel accepte v2/v3, authentifie la concordance de la version entre en-tête et corps, et refuse les autres versions. Le code précédent accepte seulement v2 : il refuse alors de réécrire un coffre v3. Une réapparition de v2 après v3 bloque les nouvelles écritures. **Revenir à l’ancien code après activation ne rend pas ce coffre lisible** : cette barrière évite une reprise destructive.

PBKDF2-SHA256, 600 000 itérations, sel 16 octets, AES-256-GCM, IV aléatoire neuf 12 octets et tag GCM restent ceux du coffre existant. Aucune introduction d’AAD, aucun nouveau mécanisme de clés. La version, l’ordre et la date sont dans le corps authentifié et contrôlés à la lecture. Les vecteurs AAD du futur contrat restent un jalon distinct.

Le bouton Exporter produit une **copie de récupération complète du coffre**, avec le code actuel de l’appareil. Le champ code de l’interface sert à l’import. Cette copie inclut l’état local chiffré, donc aussi le code et les données de session que le coffre contenait déjà, sans jamais les exposer en clair. Elle n’est **pas** l’enveloppe `race-control-backup` du futur contrat et n’est pas envoyée à Control Vault. Ne pas la présenter comme un ancien export V2 : un ancien lecteur la refuse au lieu de tronquer silencieusement le journal.

La restauration est décidée par Race Control : authentifier le fichier, extraire les champs métier, conserver séparément les sources intégrales du journal, former l’union avec le journal local, puis utiliser le plan d’import vérifié existant (`DeviceStorage.apply` et vérification durable du coffre, rollback en cas d’échec). Aucun remplacement brut du coffre source, aucune réinstallation de clé ou de session transportée, aucun GPS actif restauré. Le code/les clés du destinataire ne sont pas remplacés. Les sauvegardes historiques `twrc-backup` V1/V2 restent importables et leur journal est fusionné sans plafond. Une version future est refusée.

Fichiers : maximum 68 Mio de JSON, Base64 limité à 64 Mio pour le contenu chiffré ; sel et IV ont leurs tailles exactes, KDF et coût doivent correspondre. Les fichiers illisibles, tronqués, inconnus ou non authentifiables sont refusés avant tout plan d’écriture. Aucune troncature pour rentrer dans la taille autorisée. Une archive cumulative peut atteindre le quota : refus visible et copie complète requise, jamais suppression de sources. Les évictions existantes restent limitées aux caches recalculables.

## Preuves automatisées prévues dans cette PR

`tests/test_journal_preservation.js` est exécuté par la suite sauvegarde existante. Il compare les enregistrements **avant toute projection**, teste 120 trajets, 91/365 jours, versions concurrentes, sources non affichables, union commutative/associative/idempotente, import historique V1/V2, versions inconnues, copie exacte, quota avant activation, deux contextes sur la même clé, récupération complète, erreur après écriture et rollback exact.

`tests/lib/journal-preservation-browser.js` est exécuté par `e2e58-import-journal.js` dans les lanes Chromium et WebKit existantes, avec le profil **iPhone 11 Pro Max** (414 × 896, échelle 3, tactile). Il utilise deux vrais onglets, bloque leurs notifications storage, teste les ajouts et réponses concurrents, la sélection d’un fichier exporté, un quota pendant l’activation puis l’écriture, une fermeture pendant WebCrypto, le rechargement et l’export/import dans un nouveau profil. Les sources intégrales et toutes les versions sont comparées ; l’affichage limité à 60 est vérifié séparément. Les suites existantes d’import, débrief, coffre, configuration et stockage restent exécutées.

Aucune modification du registre CI, des workflows, du service worker ou du contrat d’intégration. Les résultats doivent être établis sur le SHA exact de la PR. Une simulation WebKit ne constitue pas un essai sur iPhone physique.

## Limites et conditions avant activation réelle

1. Revue humaine/Red Team du diff, du changement de version interne et du fichier de récupération ; CI verte insuffisante. Vérifier particulièrement tous les chemins de fermeture, import, annulation et reprise d’une session expirée.
2. Validation physique Safari et PWA sur iPhone, y compris le partage vers Fichiers, réouverture, quota, veille et interruption. Aucun résultat physique revendiqué dans cette PR.
3. Le navigateur/OS peut supprimer son stockage ou être arrêté avant confirmation. Une écriture refusée ou en attente n’est pas un ajout durable ; l’interface ne doit pas annoncer le contraire et demande de garder la page ouverte. L’avertissement de fermeture dépend du navigateur. Une copie externe vérifiée protège les données déjà présentes avant activation ; elle ne rend pas durables des ajouts futurs non confirmés.
4. La sélection du fichier prouve sa relecture, pas une garantie matérielle de conservation ni une sauvegarde cloud. Conserver des copies indépendantes et tester leur restauration. Un stockage plein n’a pas de capacité infinie.
5. Cette PR ne peut reconstituer les débriefs déjà supprimés avant son installation. Les anciens acteurs qui ignorent entièrement le protocole de coffre ou du code malveillant de même origine ne sont pas une frontière de sécurité. Les deux apps sur `ipoower.github.io` partagent toujours une origine ; aucune communication ni stockage commun n’est ajouté.
6. B01–B04 restent ouverts pour la production jusqu’aux preuves CI, à la contre-revue humaine et à la validation physique. Les lots d’intégration suivants, OAuth, vrai Drive et Phase 2 Cloudflare restent interdits.

## Complément de contre-revue P1

Les trois actions « Enregistrer », « Plus tard » et « Ne plus demander aujourd’hui » utilisent la même barrière de lecture seule et la même confirmation durable. Sur un profil ancien non activé ou sans coffre, elles refusent avant toute mutation et conservent le formulaire. Après une erreur d’écriture, le formulaire reste ouvert et le refus est explicite ; les modifications non confirmées peuvent rester en mémoire pour être retentées. Aucun ancien état mémoire n’est réinstallé par-dessus un autre onglet. Un double clic pendant la vérification n’ajoute pas une seconde transaction.

Les tests unitaires de ces gestionnaires échouent sur le code audité `32df5fdb0898` (mutation `deferred` en lecture seule). Ils couvrent les trois actions, les deux profils en lecture seule, quota, exception, attente de confirmation et doubles clics. Les scénarios Chromium/WebKit vérifient aussi les boutons réels en lecture seule et sous quota, avec comparaison des octets durables.

`tests/fixtures/session-vault.prod-124.js` est une copie **exacte**, sans adaptation, du lecteur `src/session-vault.js` de `main` au commit `77b2f5abf5a2` et de la source `prod-124` (`bb078d1b`). Blob Git : `bf86f81ed99a496bc66e7fed7e4f2867d21d771f` ; SHA-256 : `0ba3aed0a56c01a9310da7dd3df067609cac0da53ec204ad1a28b4f463c5d892`, contrôlé par le helper. Les scénarios exécutent réellement cet ancien lecteur avant et après activation : tentative d’écriture d’un onglet déjà ouvert, démarrage à froid et code correct sur v3. Les refus doivent laisser les octets du coffre identiques. Après retour au candidat v3, toutes les sources restent lisibles.

Le test Chromium `journal-legacy-sw.js`, appelé par la suite SW existante, utilise un vrai service worker sur localhost pour mettre **ce lecteur** en cache. Après activation, il ouvre l’ancien lecteur hors ligne, vérifie son refus et reprend le candidat avec les 120 sources et un ajout créé après activation. Cette fixture teste la frontière entre versions du coffre ; elle ne remplace ni la recette de l’app complète en PWA sur iOS ni ses mécanismes réels de mise à jour.

**Retour arrière logiciel ≠ restauration d’une ancienne copie de données.** L’ancien logiciel reste incapable de lire v3 ; aucun déclassement vers v2 n’est prévu. Ne jamais remplacer le coffre activé par la copie antérieure : les nouveaux retours seraient alors absents. Conserver une copie complète récente et revenir à un lecteur compatible v3. Toute restauration métier utilise le plan vérifié et l’union du journal. La copie antérieure ne contient que les données présentes lors de son export.

## Mesures P2 et limites

`node tools/bench-journal.js` mesure 500 puis 1 000 trajets fictifs, deux versions sources par trajet, 91/365 jours, trois ouvertures et écritures par taille. Le script emploie les vrais modules de projection, archive et coffre ; il vérifie la présence des sources après chaque écriture et n’affiche que des compteurs, tailles et durées. Les médianes incluent le déverrouillage PBKDF2/AES-GCM et l’écriture avec union/relecture. La taille UTF-16 est une estimation du blob localStorage, pas une mesure mémoire du processus.

Il s’agit d’un socle Node, sans DOM ni quota matériel. Le coût réel sur un appareil contraint reste **À VÉRIFIER** : temps d’ouverture de l’app, saisie du retour, confirmation durable, export, mémoire et marge de stockage doivent être mesurés sur l’iPhone avec 500 puis 1 000 trajets avant activation sensible. Aucune limite d’archive ni suppression ne sera ajoutée pour améliorer ces mesures.

Premier relevé du 16 octobre 2026, Node v24.19.0, espace de travail aussi occupé par les tests unitaires (trois échantillons par taille, aucun appareil mobile) :

| Trajets / versions sources | Ouverture médiane du coffre | Écriture médiane avec union | Fichier chiffré | Estimation UTF-16 du coffre |
| --- | --- | --- | --- | --- |
| 500 / 1 000 | 6,09 s | 4,66 s | 2 997 754 octets | 5 995 534 octets |
| 1 000 / 2 000 | 10,70 s | 12,45 s | 5 992 422 octets | 11 984 870 octets |

Toutes les sources étaient encore présentes après chaque écriture. Ces tailles concernent cette fixture, incluent la duplication actuelle et peuvent rencontrer un quota navigateur bien avant la limite de fichier de 68 Mio. **P2 reste ouvert** : aucune capacité mobile, latence acceptable ou marge de stockage n’est démontrée par ce relevé ; le refus sans perte reste obligatoire.

## Recette Safari / PWA isolée à autoriser

Statut : **préparation uniquement ; aucune préversion publiée par cette PR**. La publication de cet environnement demande une autorisation distincte. Ne pas utiliser la production `prod-124` pour valider le candidat.

La préversion devra servir le SHA exact qui a passé la CI et sera relu humainement. Après une correction, `32df5fdb0898` ne convient plus. Employer une origine HTTPS dédiée, différente de `ipoower.github.io` et des origines des autres apps, un build avec le preset et les clés publiques de test, aucun OAuth/Drive et exclusivement des fichiers fictifs. Le site doit afficher sa provenance (SHA/build) et permettre de vérifier la version servie avant d’installer la PWA. Ne jamais y importer un profil réel ni une sauvegarde personnelle.

Préparer un état source de 120 trajets, dont 91/365 jours, plusieurs retours pour un même trajet et une source non affichable. Garder un oracle indépendant avant projection et noter ses compteurs/empreintes. Les essais d’ancienne version se font sur cette même origine de recette et ces mêmes données fictives ; ils ne chargent jamais l’origine du profil réel.

| Contrôle physique iPhone 11 Pro Max | Preuve attendue |
| --- | --- |
| Version réellement servie et installation Safari/PWA | SHA/build identiques au candidat validé ; stockage fictif isolé |
| Ancien journal, puis « Plus tard » / silence quotidien / Enregistrer | Refus explicite avant activation ; formulaire et données inchangés |
| Export puis enregistrement dans Fichiers | Fichier retrouvé et sélectionné à nouveau ; mauvaise copie/code refusés |
| Activation puis 120 trajets et toutes les versions | Égalité avec les sources intégrales ; 60 lignes seulement à l’affichage |
| Export/import dans un second profil fictif | Import vérifié, union exhaustive et même journal après déchiffrement |
| Fermeture complète, veille et réouverture hors ligne | Sources et retours confirmés intacts dans Safari et PWA |
| Verrouillage, mauvais code, interruption avant confirmation | Refus visible ; aucun état partiel ; reprise des données durables |
| Deux onglets, ancienne PWA en cache et retour au candidat | Ancien lecteur bloqué sur v3 ; aucun déclassement ; ajouts post-activation conservés |
| Quota et actions de formulaire | Aucune confirmation trompeuse ; fichier de récupération et coffre précédents récupérables |
| 500 puis 1 000 trajets, deux versions chacun | Durées ouverture/confirmation/export, tailles, marge de stockage et stabilité consignées |

Pour chaque ligne : noter appareil, iOS, mode Safari/PWA, SHA/build, résultat observé et preuve fictive ; laisser « non testé » si la preuve manque. Un échec d’intégrité, un refus sans explication ou une divergence avec l’oracle arrête la recette. Ne pas tester une libération d’espace en supprimant le coffre, le profil ou des sources. L’exécution et la publication de cette recette ne sont pas autorisées par la préparation du document.
