# Départ choisi depuis le prochain trajet Météo

Branche indépendante de la PR #91, initialement basée sur `main` e9f16ff, puis rebasée sur 9db92a0 après la fusion indépendante de #91. Aucun déploiement ni fusion inclus.

Le bloc Météo propose « Modifier le départ » pour un trajet calendrier non commencé. Le sélecteur offre départ automatique, domicile, lieux enregistrés, adresse et GPS ponctuel. Le choix concerne une occurrence et un sens (`go` ou `ret`). Retour abandonne le brouillon ; Départ automatique restaure les règles existantes.

## Calcul canonique

`TripCancel.rebuild` sélectionne d'abord les jambes selon les tags, alternatives et annulations. Le dernier adaptateur applique l'origine explicite à la seule jambe ciblée. Il ne reconstruit pas la chaîne à cause de cette préférence : le retour précédent et les rendez-vous suivants conservent leur comportement.

`effLegs` utilise cette même projection, partagée en mémoire pendant un rendu. Les nouvelles extrémités passent dans `tripCancelRouteLeg` : anciennes géométrie, distance, durée et météo sont invalidées ; OSRM puis `legEval` produisent une route et une météo cohérentes avant publication. L'aller conserve l'arrivée prévue dix minutes avant le rendez-vous ; la marge routière existante reste inchangée. Le retour conserve son départ prévu.

`appAgendaLeg` ne remplace plus un départ explicitement choisi par le lieu confirmé. `liveTrip` conserve ce départ tant que le trajet n'est pas actif. Le mouvement réel ou « Je pars maintenant » rendent ensuite la main à l'automate vivant. Un GPS pré-départ n'est pas une preuve d'arrivée pour cette préférence.

`renderWx` retrouve la cible par la clé du trajet issu d'`APP_CONTEXT`. L'origine en cours de recalcul reste sur le même rendez-vous, sans anciennes métriques, horaires conseillés ou marqueurs de chronologie. Le formulaire conserve sa saisie et son focus pendant les actualisations. Les autres blocs, onglets et le lieu météo ne changent pas.

## Persistance

Une seule carte de préférences : `S.calOrigins` dans `twrc.settings.v1`, déjà couvert par le coffre de session. Sa clé est `TripCancel.eventId(e)`, sans titre ni adresse, puis le sens. Domicile et lieux enregistrés conservent un ID ; adresse et GPS conservent uniquement le point explicitement choisi. Aucune route, météo, observation GPS brute ou état vivant n'est enregistré dans cette carte.

Chaque entrée a une date de modification et une expiration liée au rendez-vous. Le retour automatique utilise un tombstone daté afin qu'une ancienne sauvegarde ne rétablisse pas l'origine supprimée. Les entrées expirées sont nettoyées. Les rendez-vous simultanés d'un ancien agenda sans UID ne sont pas éditables séparément.

Le succès n'est affiché qu'après `TWRC_VAULT.flush` et vérification de l'absence d'erreur. Un refus de stockage conserve le choix en mémoire et affiche explicitement l'échec. Aucun repli en clair. Les sauvegardes V1/V2 restent compatibles : nettoyage et fusion par occurrence/sens, choix le plus récent conservé, import sans carte préservant les choix valides du téléphone.

Les modifications provenant d'un autre onglet récent sont fusionnées sans réinitialiser le lieu réel. Limite historique : un onglet exécutant une ancienne version peut réécrire tout son ancien document de réglages ; il faut fermer/recharger ces anciens onglets lors de la mise à jour. La correction ne change pas le format ou la cryptographie du coffre.

## Réseau et confidentialité

Le GPS est une demande ponctuelle avec `maximumAge: 0`, précision et âge contrôlés. Il ne passe pas par `locate`/`receivePosition` et ne crée aucun watch. Les réponses tardives de recherche ou GPS sont rejetées si le brouillon change.

Hors ligne, les lieux connus restent sélectionnables et le choix reste chiffré. Sans route/météo correspondant aux nouvelles extrémités, l'état reste en attente ; la reconnexion relance aussi les routes précédemment en erreur. Le cache réseau existant reste dérivé. Aucune nouvelle clé de trajet, aucun cache de service worker externe, aucun appel d'écriture à Google Agenda.

## Validation

- 30 scénarios métier dédiés : identité, aller/retour, portée, routes invalidées, tags, alternatives, chaînes, annulation/undo, ambiguïté, expiration, import V1/V2 et tombstones.
- Parcours navigateur dédiés PC et iPhone simulé : vrais clics, sélecteur, recalcul, focus, GPS/refus/réponse tardive, coffre, offline/reload/reconnexion, route 503, quota, retour automatique, annulation/undo, import chiffré V1, cibles 44 pt, onglets, départ réel et changement de jour.
- Suites historiques de calendrier, contexte du jour, sauvegarde, météo et coffre incluses dans la validation générale.

Les résultats définitifs des navigateurs et des contrôles généraux sont reportés dans la description de la PR après exécution. Les fixtures sont fictives et le harnais bloque tout accès au vrai site ou compte.
