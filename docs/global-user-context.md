# Contexte global Race Control

## Observation sur prod-34

Le 6 octobre 2026, profil public fictif, l’arrivée au travail confirmée à 07:43
clôture l’aller dans Pneus. Météo et Analyse proposent le retour ; la confirmation
survit au reload. Tenue conserve pourtant un segment domicile → travail jusqu’à
08:10. Un retour démarré à 07:48 n’y remplace pas non plus l’aller prévu.

## Cause

`PLACE` porte le lieu confirmé, `LIVE` le suivi GPS et le briefing publie ses
trajets pendant son rendu. `buildTenueDay` reconstruit une autre journée depuis
le domicile et les horaires, sans utiliser les arrivées ni les départs effectifs.
Certaines transitions ne rendent que le briefing. Ces chemins permettent deux
interprétations concurrentes du même utilisateur.

## Source canonique

`userContextStore` possède le document local `twrc.context.v1` : confirmation,
dernier lieu, GPS accepté, départ, arrivées clôturées, retour domicile, résumé
de trajet et horodatages. Les anciens noms JS sont des accesseurs sur ce même
document. Les anciennes clés de stockage sont migrées une fois et restent des
miroirs de compatibilité ; elles ne peuvent pas remplacer le document canonique.

Une action publie une transaction. `appRefreshContext` prépare le lieu et le plan
effectif avant le rendu ; `APP_CONTEXT.snapshot` fournit le même contexte à
Pneus, Météo, Tenue, Analyse, Agenda et Road Intelligence. `BRF_SHOWN` et
`BRF_TRIPS` sont des vues de ce plan, pas des états détenus par Pneus.

Le moteur GPS conserve ses règles de précision, fraîcheur, hystérésis et rejet
du mouvement impossible. Ses transitions passent par le contexte global. Une
confirmation récente prime sur un GPS plus ancien. Une arrivée clôture le trajet
et fixe la destination dans la même transaction ; un départ réel reste restorable
après son horaire d’arrivée prévu. Les horaires restent connus même sans météo.

Les chips « Météo affichée » conservent leur fonction de consultation d’un lieu.
Cette consultation n’invente pas un déplacement physique. Toute action de lieu,
départ ou arrivée revient au contexte actuel. « Demain » dans Tenue reste une
projection explicite du planning, distincte des faits actuels.

Les événements `storage` synchronisent les autres fenêtres. Une reprise de page
réévalue la fraîcheur. Le SW v11 remplace les anciens caches de shell, conserve le
cache public v3 et ne stocke ni GPS ni réponses de fournisseurs externes. Aucune
coordonnée n’est ajoutée à la télémétrie ou aux données publiées.

## Régression

- `test_userctx.js` : migration, priorité du document canonique, transaction
  atomique, hydratation, événements retardés, timestamps invalides et quota.
- `e2e53-global-context.js` : vrais boutons, Maison → Travail → Arrivé travail →
  Retour → Arrivé maison, quatre vues, PC/iPhone 414×896, profils public propre et
  configuré fictif, navigation, reload, réouverture, deux fenêtres et première
  ouverture sans météo et départ sans destination connue. Exécuté dans Chromium
  et WebKit.
- `e2e54-context-sw.js` : vrai SW, migration v10/v11, ancien contexte migré,
  réouverture hors ligne au travail, pendant le retour et à la maison.

La CI conserve toutes les suites historiques : 26 unitaires, 34 Chromium et
30 WebKit, soit 90 exécutions. Le viewport et WebKit couvrent le comportement
mobile ; ils ne remplacent pas un essai sur un iPhone physique.
