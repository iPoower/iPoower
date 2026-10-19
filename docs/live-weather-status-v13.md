# Horloge et fraîcheur météo V1.3

## Comportement

Le bandeau distingue l’heure de l’appareil (HH:mm:ss, Europe/Paris), la réception du modèle principal du lieu affiché et l’âge de cette réception. Le détail des sources distingue aussi la validité du modèle et l’heure d’une observation réelle de station, lorsqu’elle existe. Les prévisions ne sont pas présentées comme des mesures en direct.

Le statut suit cette priorité : DÉMO, HORS LIGNE, LIMITÉ, ACTUALISATION, puis LIVE/CACHE/INDISPONIBLE. LIVE requiert un modèle live et un âge connu conforme à `Reliability.liveExpired` ; une horloge reculée ne crée pas un âge de zéro. Le succès d’un autre lieu ne date jamais la réception du lieu sélectionné.

## Temps et réseau

- Un seul minuteur de seconde met à jour le texte et l’attribut datetime du même élément `time`. Les formateurs Intl sont réutilisés. Aucun fetch, enregistrement ou rendu complet dans ce minuteur de seconde.
- Le minuteur est désarmé lorsque la page est masquée ou quittée, et resynchronisé sur l’heure de l’appareil au retour. Il ne garantit pas une surveillance pendant la suspension du navigateur.
- La projection temporelle des modèles existants avance à la minute. Seule la vue active est reprojetée ; les formulaires en cours de saisie ou dont un bouton est focalisé sont différés jusqu’à leur sortie. Les nœuds du bandeau restent en place, y compris le bouton focalisé. Les secondes et l’âge n’alimentent aucune annonce live ; seul le statut météo est annoncé poliment.
- Le heartbeat réseau existant reste à 30 secondes et l’intervalle météo ordinaire à cinq minutes. `weatherCheckAt` est utilisé à la fois par le heartbeat et par le bandeau : dernière réussite/tentative et tolérance d’horloge sont communes. Le bandeau inclut la pause du fournisseur ; le cycle interne garde la lecture du relais et de l’agenda toutes les cinq minutes, tandis que le gestionnaire interdit les seuls appels Open-Meteo pendant leur pause. L’échéance est indicative, jamais une promesse à la seconde.
- Le modèle du lieu affiché, les autres lieux, AROME et le nowcast gardent leurs caches existants. Le rafraîchissement manuel reste disponible hors pause fournisseur. La validation, l’annulation des réponses d’un ancien lieu et le refus des réponses invalides ou plus anciennes restent dans les mécanismes existants.
- Le journal météo automatique conserve son comportement historique ; l’horloge n’ajoute aucune nouvelle persistance.

## Vérification

Les nouvelles suites sont inscrites dans le registre complet : 54 suites unitaires, 60 Chromium et 56 WebKit, soit 170 exécutions attendues dans la validation agrégée. Aucune suite historique n’est retirée. Le contrat de fraîcheur et ses contre-tests suivent désormais le helper partagé, sans supprimer la garde d’horloge reculée.

`test_live_status.js` couvre Paris indépendamment du fuseau hôte, les secondes, minuit, les deux transitions été/hiver, les frontières de fraîcheur, les dates inconnues/futures, les statuts et les échéances réelles.

`e2e79-live-status.js` utilise le vrai HTML avec profil et réseau fictifs : aucune requête ou reconstruction complète à la seconde ; réception indépendante ; focus et panneaux conservés ; cadence de cinq minutes ; changement de lieu pendant un appel ; veille de six heures ; hors ligne et reprise ; HTTP 429 et maintien indépendant du relais ; préférences et entrées du journal conservées. Les deux thèmes et les largeurs 320, 375, 414 et 1440 sont contrôlés. Les captures `place-live-v13-*` sont des fixtures de CI.

Le test fige explicitement l’horloge Playwright avant de mesurer trois secondes, attend le vrai événement toggle avant de focaliser un champ et distingue les préférences du journal météo automatiquement enrichi. Ces distinctions évitent de confondre un effet de la fixture avec un défaut de conservation.

Les suites historiques d’actualisation, de reprise iOS, de fournisseur limité et de station restent requises, ainsi que les six shards, la confidentialité, CodeQL, les QA spécialisées, le profilage et la validation agrégée du SHA exact.

## Périmètre et limites

Aucun changement de format, import/export, chiffrement, stockage sensible, Service Worker, permission, dépendance, workflow ou infrastructure. Aucune activation cloud et aucune modification des PR sensibles indépendantes. Le retour arrière est logiciel, sans migration.

Chromium et WebKit sont des simulations de navigateur. L’absence de débordement dans ces profils ne constitue pas une recette sur iPhone physique. Batterie, suspension réelle Safari/PWA et zones sûres matérielles restent à contrôler sur appareil. Une CI verte ne prouve pas à elle seule la fusion, la publication ni le build réellement servi : ces trois états sont vérifiés séparément après fusion.

## Contre-revue de la QA origine

Une exécution WebKit de la QA origine a échoué sur l’état attendu après une route HTTP 503. Les contrôles du scénario restent inchangés et le diagnostic de cet état est maintenant explicite. La comparaison locale du scénario historique sur main et sur le candidat ne reproduisait pas systématiquement l’échec ; une première passe verte n’a donc pas été retenue comme explication.

Un contre-test déterministe ajouté au même parcours a reproduit un défaut du nouveau minuteur : avec le bouton de validation du véritable éditeur focalisé, une projection forcée produisait deux mutations de ses enfants dans WebKit. Le contrôle pouvait être détaché pendant une interaction. La garde inclut désormais tous les contrôles de cet éditeur et des formulaires, y compris les boutons. Le contre-test exige zéro mutation et la conservation du focus ; les assertions de panne 503, de préférence choisie et de métriques masquées restent requises. L’ancien run ne fournit pas de trace suffisante pour attribuer avec certitude son échec à cet entrelacement ; les nouvelles preuves portent sur la reproduction corrigée et les nouvelles exécutions exactes.

Le statut LIMITÉ garde aussi une mention CACHE lorsque les données reçues sont celles du repli, afin de distinguer état du fournisseur et état des prévisions conservées.

## Contre-revue du saut de session après fusion

La CI post-fusion de la PR #186 a bloqué le déploiement : le parcours PC WebKit de `e2e73-weekly-login.js` attendait `pendingRecovery === false` après un saut artificiel de huit jours, mais une écriture restait en attente. Le test supposait le coffre durable après les rendus, sans attendre la confirmation asynchrone de WebCrypto. La protection de récupération a donc conservé les données en mémoire comme prévu ; le journal du run ne permet pas d'identifier laquelle des écritures de la fixture était en vol.

La préparation de ce seul parcours attend désormais l'API existante `flush()`, exige l'absence d'erreur et d'écriture en attente, puis capture le coffre chiffré avant d'avancer la date. Le scénario d'expiration conserve les assertions de récupération, de code obligatoire, de coffre inchangé, de clé non extractible et de données récupérées. Aucun code de stockage, chiffrement ou authentification n'est modifié.

Un contre-test retarde un vrai chiffrement de la fixture, sans changer ses valeurs ni l'algorithme : la date doit rester inchangée tant que cette écriture n'est pas confirmée. Il échoue sous WebKit lorsque l'attente de durabilité est retirée, puis réussit avec elle. Le chiffrement original est restauré et libéré même en cas d'échec de cette assertion. Cette preuve vérifie l'ordre de préparation ; elle n'attribue pas rétroactivement une écriture précise à l'ancien échec.
