# Checkpoint — contexte réel du jour, lots A + B

Branche : `feat/day-context-destination-car`. PR à conserver en Draft, sans fusion ni déploiement.
Base main vérifiée : `292fbe56766598d9ec7bc59cd0be98aff0c91ddd` (#40 à #43 présentes).

## État canonique

`USER_STORE` / `twrc.context.v1` conserve les faits de lieu, GPS et trajet existants, et reçoit `dayContext` : destination choisie, dernier lieu confirmé, départ/arrivée, journée datée, voiture active et occasion Tenue datée. `APP_CONTEXT.snapshot` projette ce document pour les quatre vues. Aucun store concurrent ; transactions et événements storage existants conservés.

Planning et Agenda = prédictions ; GPS = observation ; confirmation utilisateur = fait. Le lieu courant, la destination, la journée et la voiture restent indépendants. La destination explicite du trajet courant gagne sur Agenda/planning ; « Autre » conserve une destination inconnue sans ETA inventé. Les routes Agenda remplacées perdent leur ancienne géométrie et repassent par le calcul existant. Les futurs retours Maison restent normaux après arrivée/expiration.

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

HEAD de validation ciblée : `843ecfc5a23614fd8272fc50b8b3adf5cf373421`.
Run ciblé : https://github.com/iPoower/iPoower/actions/runs/37514917704
Statut ciblé : entièrement vert — 7 suites sur Chromium et WebKit, plus E2E54/PWA sur Chromium.

49 scénarios déterministes du contexte du jour ; registre complet de 27 suites unitaires. E2E55 : vrais taps iPhone 414 × 896 @3x et clics desktop, profils propre/configuré, quatre vues, destinations connues/inconnues, voitures A/B/fallback/suppression, voiture sans monte, reload/réouverture, jour suivant et expiration des préférences. Régressions ciblées : E2E50, 53, 31, 32, 39, 42 et E2E54 avec vrai SW/offline Chromium.

Les tests historiques E2E31 et 53 gardent leurs assertions : occasion appliquée à sa date et destination Maison choisie avant départ. La fixture PWA réutilise le second emplacement de voiture configuré. Les fixtures/captures sont synthétiques ; aucune donnée personnelle ni secret ajouté.

La CI standard de PR est le gate final (27 suites unitaires et 66 exécutions navigateur, soit 93 validations, en six shards). Son résultat final et le HEAD exact sont conservés dans les checks et le compte rendu de la PR, ainsi que dans la branche distante. Le workflow de ciblage temporaire est retiré avant ouverture de la PR.
PR et état actuel : https://github.com/iPoower/iPoower/pulls?q=is%3Apr+head%3Afeat%2Fday-context-destination-car

## Fichiers et reprise

Modèle/migration : `src/userctx.js`. Adaptateurs : `src/app/day-context.js`, `src/app/user-context.js`, `src/app.js`. Consommateurs : `src/app/analysis-view.js` (voiture active), `src/app/weather-view.js` (destination inconnue sans ETA). UI : `src/shell.html`, `src/style.css`. Tests/registre/audit : fichiers correspondants sous `tests/`.

Ne pas modifier relais, DATEX, Live Road, physique pneus, calculs météo, brouillard, couleurs température, chiffrement ou secrets. SW inchangé : HTML network-first existant ; persistance vérifiée avec le vrai cache et réouverture hors ligne. Ne pas fusionner/déployer cette PR ; ne pas toucher à la PR Analyse indépendante.

RELAY MODIFIED : NO. RELAY SYNC : NOT INCLUDED.
