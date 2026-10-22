# Garanties exigées avant toute synchronisation réelle

Exigences du propriétaire (22/10/2026). Ce document les rattache au code et aux
preuves. Une case « à faire » interdit l'activation réelle. Toute nouvelle preuve
doit pointer vers un test ou une recette, jamais vers une intention.

| # | Garantie | Code | Preuve | État |
|---|---|---|---|---|
| 1 | Local d'abord : écrire localement avant tout transfert ; panne réseau/OAuth sans blocage ni perte | Coffre `SessionVault` (écriture vérifiée locale) ; `SyncOutbox` ne lit ni n'écrit les données | `test_sync_outbox` : hors ligne, données complètes et utilisables ; Google expiré sans tentative silencieuse | Moteur prouvé ; raccord à faire |
| 2 | Copies chiffrées immuables, envois séquentiels, reprise, conflits, regroupement | `SyncRevisions` (fichiers immuables, têtes, conflits) ; `SyncOutbox` (un transfert, identifiant réservé avant envoi, 30 s de calme ou 10 min au plus) | `test_sync_revisions`, `test_sync_outbox` : coupure à chaque étape + redémarrage sans doublon, deux déclenchements simultanés = un envoi | Moteur prouvé ; verrou `navigator.locks` à poser au raccord |
| 3 | Stratégie des clés après fermeture, redémarrage, expiration ; jamais de phrase secrète en clair | `SyncKey` (lot D1) | `test_sync_key`, `e2e83-sync-key-resume` | Voir tableau ci-dessous |
| 4 | Migration chiffrée entre origines, intervention utilisateur si nécessaire, ancienne installation conservée | Codec V1 + plan d'import existant | Codec seul | **À faire** (F01–F09 complètes) |
| 5 | « Synchronisé » seulement après relecture des octets distants ; « opérationnel » seulement après restauration complète et essai iPhone physique | `SyncOutbox.status` | `test_sync_outbox` : statuts | Règle codée ; preuves réelles à produire |

## Clés : comportement par situation (garantie 3)

| Situation | Clé de synchronisation | Conséquence visible |
|---|---|---|
| Code saisi (déverrouillage) | Dérivée une fois, contrôlée, conservée non extractible, liée à la session | Aucune |
| Onglet fermé puis rouvert, PWA relancée, appareil redémarré | Reprise depuis IndexedDB si la session mémorisée est valide ; le contrôle GCM est relu | Aucune |
| Session expirée (7 jours au plus) ou verrouillage | Effacée | « Code requis » ; les envois attendent, les données locales restent utilisables |
| Code changé sur un autre appareil | Nouveau descripteur ; l'ancienne clé ne s'applique plus (`CODE_REQUIRED`) | « Code requis » une fois sur cet appareil |
| Navigation privée, IndexedDB refusée | Aucune conservation | Code demandé à chaque ouverture ; jamais de repli en clair |

Jamais stockés : le code, une clé brute, une donnée déchiffrée. Le jeton Google
reste en mémoire seulement ; son expiration donne « reconnexion », sans perte.

## Visibilité sans modifier Twin Garage

Les écrans Twin Garage restent inchangés. Conflits, reconnexion, code requis,
espace insuffisant et état « en attente » seront affichés dans un espace dédié
existant hors Twin Garage (Réglages → Sauvegarde) et dans l'historique de Control
Vault. Libellés produits par `SyncOutbox.status` : `local`, `en attente`, `envoi`,
`vérification`, `à intégrer`, `synchronisé`, `conflit`, `reconnexion`, `code`,
`espace`. « Opérationnel » est un indicateur séparé, faux tant que la restauration
complète et l'essai sur iPhone physique ne sont pas enregistrés.

## Présentation des résultats

Chaque compte rendu sépare : code développé, tests validés, fusion autorisée,
publication vérifiée, synchronisation réelle, recette iPhone.
