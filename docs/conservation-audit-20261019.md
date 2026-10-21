# Conservation — audit du 19 octobre 2026

Base examinée : `ea66982c1583f8c7c873cb3b7bb8d2b0e6ea4bd1`.
La PR #176 est fusionnée (`351454c8c8953f46fb900b24429852b06717d98e`).
Essais exclusivement fictifs, aucun profil ou fichier personnel consulté.

| Périmètre | Constat et preuve |
| --- | --- |
| Véhicules, montes, mesures et préférences | Les réglages sont clonés par l'export métier ; aucune nouvelle liste de champs ni migration ajoutée. |
| Historique des trajets | L'archive cumulative est distincte de la projection visible à 60. `test_journal_preservation.js` couvre 120 sources, anciennes entrées, champs inconnus, versions concurrentes, union et récupération. |
| Anciens formats et chiffrement | V1/V2 restent lus via le plan métier ; récupération du coffre v2/v3 authentifiée. Versions inconnues refusées ; clés/session du destinataire conservées. Aucun format ni KDF modifié. |
| GPS et contexte | Le contexte métier se restaure ; GPS, trajet actif et caches recalculables ne sont pas des observations durables à transporter. Tests dans `test_backup.js`. |
| Interruptions et concurrence | Tests existants du coffre et de DeviceStorage : relecture, union sous verrou, refus de quota et rollback conditionné. Recette réelle Safari/PWA toujours non exécutée. |
| Signalements météo et journal de validation | **Défaut reproduit** : union de 30+1 signalements, ou 200+1 validations, tronquée silencieusement par `slice(-limit)`. Le nouveau contre-test échoue sur la base ci-dessus. |

## Correctif ciblé sensible

La fusion météo déduplique d'abord les sources identiques puis refuse **tout le
plan** si leur union dépasse la capacité existante. Aucun plan partiel, aucune
écriture, aucune purge, aucune modification des deux sources. L'interface
d'import existante affiche son refus lorsque le plan est absent.

Les limites 30/200 ne sont pas augmentées : leur évolution et la rétention des
signalements pendant l'usage ordinaire restent à étudier séparément. Ce correctif
ne récupère pas des observations déjà supprimées par une ancienne version.
Une restauration dépassant ces limites reste volontairement bloquée ; conserver
ses deux fichiers/profils sources. Aucun contournement par import brut.

## Validation et limites

Le nouveau test couvre dépassement, déduplication à la capacité exacte et
immuabilité des sources pour les deux collections. La suite sauvegarde existante
inclut les oracles de conservation du journal et de compatibilité. CI complète
Chromium/WebKit requise sur la tête exacte avant décision humaine.

`src/backup.js` est sensible selon AGENTS.md : **ne pas fusionner automatiquement**.
Retour arrière : annuler le changement logiciel avant activation ; aucune donnée
ni migration n'est appliquée par cette PR. Un retour logiciel ne récupère jamais
des sources supprimées auparavant. Drive et Control Vault restent indépendants.

Safari/PWA physique, purge réelle iOS, quotas matériels et performances des
grandes archives : **NON TESTÉS**. Voir `JOURNAL_PRESERVATION.md` pour la recette.
