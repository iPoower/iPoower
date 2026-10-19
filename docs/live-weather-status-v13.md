# Horloge et fraîcheur météo V1.3

## Comportement

Le bandeau distingue l’heure de l’appareil (HH:mm:ss, Europe/Paris), la réception du modèle principal du lieu affiché et l’âge de cette réception. Le détail des sources distingue aussi la validité du modèle et l’heure d’une observation réelle de station, lorsqu’elle existe. Les prévisions ne sont pas présentées comme des mesures en direct.

Le statut suit cette priorité : DÉMO, HORS LIGNE, LIMITÉ, ACTUALISATION, puis LIVE/CACHE/INDISPONIBLE. LIVE requiert un modèle live et un âge connu conforme à `Reliability.liveExpired` ; une horloge reculée ne crée pas un âge de zéro. Le succès d’un autre lieu ne date jamais la réception du lieu sélectionné.

## Temps et réseau

- Un seul minuteur de seconde met à jour le texte et l’attribut datetime du même élément `time`. Les formateurs Intl sont réutilisés. Aucun fetch, enregistrement ou rendu complet dans ce minuteur de seconde.
- Le minuteur est désarmé lorsque la page est masquée ou quittée, et resynchronisé sur l’heure de l’appareil au retour. Il ne garantit pas une surveillance pendant la suspension du navigateur.
- La projection temporelle des modèles existants avance à la minute. Seule la vue active est reprojetée ; les formulaires en cours de saisie sont différés jusqu’à leur sortie. Les nœuds du bandeau restent en place, y compris le bouton focalisé. Les secondes et l’âge n’alimentent aucune annonce live ; seul le statut météo est annoncé poliment.
- Le heartbeat réseau existant reste à 30 secondes et l’intervalle météo ordinaire à cinq minutes. `weatherCheckAt` est utilisé à la fois par le heartbeat et par le bandeau : dernière réussite/tentative, tolérance d’horloge et pause fournisseur sont communes. L’échéance est indicative, jamais une promesse à la seconde.
- Le modèle du lieu affiché, les autres lieux, AROME et le nowcast gardent leurs caches existants. Le rafraîchissement manuel reste disponible hors pause fournisseur. La validation, l’annulation des réponses d’un ancien lieu et le refus des réponses invalides ou plus anciennes restent dans les mécanismes existants.
- Le journal météo automatique conserve son comportement historique ; l’horloge n’ajoute aucune nouvelle persistance.

## Vérification

Les nouvelles suites sont inscrites dans le registre complet : 54 suites unitaires, 60 Chromium et 56 WebKit, soit 170 exécutions attendues dans la validation agrégée. Aucune suite historique n’est retirée. Le contrat de fraîcheur et ses contre-tests suivent désormais le helper partagé, sans supprimer la garde d’horloge reculée.

`test_live_status.js` couvre Paris indépendamment du fuseau hôte, les secondes, minuit, les deux transitions été/hiver, les frontières de fraîcheur, les dates inconnues/futures, les statuts et les échéances réelles.

`e2e79-live-status.js` utilise le vrai HTML avec profil et réseau fictifs : aucune requête ou reconstruction complète à la seconde ; réception indépendante ; focus et panneaux conservés ; cadence de cinq minutes ; changement de lieu pendant un appel ; veille de six heures ; hors ligne et reprise ; HTTP 429 ; préférences et entrées du journal conservées. Les deux thèmes et les largeurs 320, 375, 414 et 1440 sont contrôlés. Les captures `place-live-v13-*` sont des fixtures de CI.

Le test fige explicitement l’horloge Playwright avant de mesurer trois secondes, attend le vrai événement toggle avant de focaliser un champ et distingue les préférences du journal météo automatiquement enrichi. Ces distinctions évitent de confondre un effet de la fixture avec un défaut de conservation.

Les suites historiques d’actualisation, de reprise iOS, de fournisseur limité et de station restent requises, ainsi que les six shards, la confidentialité, CodeQL, les QA spécialisées, le profilage et la validation agrégée du SHA exact.

## Périmètre et limites

Aucun changement de format, import/export, chiffrement, stockage sensible, Service Worker, permission, dépendance, workflow ou infrastructure. Aucune activation cloud et aucune modification des PR sensibles indépendantes. Le retour arrière est logiciel, sans migration.

Chromium et WebKit sont des simulations de navigateur. L’absence de débordement dans ces profils ne constitue pas une recette sur iPhone physique. Batterie, suspension réelle Safari/PWA et zones sûres matérielles restent à contrôler sur appareil. Une CI verte ne prouve pas à elle seule la fusion, la publication ni le build réellement servi : ces trois états sont vérifiés séparément après fusion.
