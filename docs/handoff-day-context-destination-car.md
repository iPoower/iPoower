# Contexte réel du jour — PR #45

Branche : `feat/day-context-destination-car`. État et CI finale : https://github.com/iPoower/iPoower/pull/45. Fusion et déploiement après validation complète.
Base de livraison : `8b9c7958554595549045d3ca5ca38446c3c3347e` (#44 thermique, #46 iPhone et #47 profil intégrées).

## État canonique

`USER_STORE` / `twrc.context.v1` conserve les faits de lieu, GPS et trajet existants, et reçoit `dayContext` : destination choisie, dernier lieu confirmé, départ/arrivée, journée datée, voiture active et occasion Tenue datée. `APP_CONTEXT.snapshot` projette ce document pour les quatre vues. Aucun store concurrent ; transactions et événements storage existants conservés.

Planning et Agenda = prédictions ; GPS = observation ; confirmation utilisateur = fait. Le lieu courant, la destination, la journée et la voiture restent indépendants. La destination explicite du trajet courant gagne sur Agenda/planning ; « Autre » conserve une destination inconnue sans ETA inventé. Les routes Agenda remplacées perdent leur ancienne géométrie et repassent par le calcul existant. L'origine réelle ne remplace que celle du prochain trajet domicile-travail ; le retour futur garde son origine prévue au travail. Une origine de départ déjà enregistrée reste prioritaire.

## Durées et fallbacks

- Destination : arrivée confirmée ou GPS validé par l’automate existant, remplacement manuel, ou 04:00 Paris le lendemain (DST testé).
- Origine du matin : confirmation aujourd’hui ou après 16:00 la veille, plafond 20 h, aucun départ ultérieur ni observation cohérente contradictoire. Sinon origine du planning, prévue.
- Journée : choix pour une seule date Paris ; aucun changement de `S.work`. Congé neutralise le commute local et reconstruit les anciennes routes Agenda via une projection éphémère des annulations. Aucune écriture de cette projection dans `twrc.tripcancel`.
- Voiture : ID configuré volontairement persistant ; suppression/invalidation nettoie l’ID. Sans choix, comparaison/fallback historique. Sans monte connue, voiture conservée, verdict pneus inconnu, météo route conservée. Aucun autre véhicule analysé à sa place.
- Tenue : choix manuel lié au jour affiché, prioritaire sur Bureau proposé par la journée/destination. Ancienne clé `twrc.outfit.occasion` migrée une fois au jour de migration puis supprimée ; les choix expirent à leur date.

## Commits fonctionnels

A — `3c0284734473904569b5ef091dde4fa25fac239d` : destination et origine réelles.
B — `d4cdd90672cc94020337d06fdf4a70102cd6f9fc` : journée, voiture active et Tenue.
Les correctifs suivants ferment les régressions observées ; ne pas reprendre les anciens HEAD intermédiaires.

## Validation

53 scénarios déterministes du contexte du jour ; registre complet de 27 suites unitaires. La CI finale couvre 35 suites Chromium et 31 WebKit, soit 93 validations en six shards navigateur et une lane unitaire.

E2E55 : vrais taps iPhone 414 × 896 @3x et clics desktop, profils propre/configuré, quatre vues, destinations connues/inconnues, voitures A/B/fallback/suppression, voiture sans monte, reload/réouverture, jour suivant et expiration des préférences. E2E53 vérifie aussi que confirmer le domicile ne transforme pas le retour futur en domicile → domicile. E2E43 conserve le verdict entièrement visible à 414 × 896 ; les confirmations restent accessibles dans Analyse, en deux colonnes et avec des cibles d'au moins 44 px. E2E54 couvre le vrai SW et la réouverture hors ligne sur Chromium.

Les tests historiques E2E31 et 53 gardent leurs assertions : occasion appliquée à sa date et destination Maison choisie avant départ. La fixture PWA réutilise le second emplacement de voiture configuré. Les fixtures/captures sont synthétiques ; aucune donnée personnelle ni secret ajouté.

La CI standard de PR est le gate final (27 suites unitaires et 66 exécutions navigateur, soit 93 validations, en six shards). Son résultat final et le HEAD exact sont conservés dans les checks et le compte rendu de la PR, ainsi que dans la branche distante. Le workflow de ciblage temporaire est retiré avant ouverture de la PR.
PR et état actuel : https://github.com/iPoower/iPoower/pulls?q=is%3Apr+head%3Afeat%2Fday-context-destination-car

## Fichiers et reprise

Modèle/migration : `src/userctx.js`. Adaptateurs : `src/app/day-context.js`, `src/app/user-context.js`, `src/app.js`. Consommateurs : `src/app/analysis-view.js` (voiture active), `src/app/weather-view.js` (destination inconnue sans ETA). UI : `src/shell.html`, `src/style.css`. Tests/registre/audit : fichiers correspondants sous `tests/`.

Le gate de livraison est le verdict complet de la CI sur le HEAD courant de #45, suivi des contrôles de production et de la vérification de la version en ligne. Les préférences du jour restent locales à l'application ; le relais de notifications conserve son planning. Le SW conserve sa stratégie HTML network-first.

RELAY MODIFIED : NO. RELAY SYNC : NOT INCLUDED.
