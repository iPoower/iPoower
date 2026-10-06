# Checkpoint livraison PR #43 — 2026-10-06

## État sauvegardé
- PR : https://github.com/iPoower/iPoower/pull/43 — fusionnée.
- HEAD validé : dc72b9e6f39f7f69cb2d711609d5dbc181b03253.
- Commit main : 292fbe56766598d9ec7bc59cd0be98aff0c91ddd.
- CI complète main : https://github.com/iPoower/iPoower/actions/runs/37503925633 — verte.
- Unitaires : 26 tests verts, dont les 18 scénarios du backend DATEX.
- Chromium et WebKit : six shards verts ; agrégation de 90 exécutions validée.
- Confidentialité, relay-smoke et validation : verts.

## Déploiement : absence de modification des assets, comportement prévu
Le job deploy est vert mais n'a effectué aucune publication : « Aucun changement à publier », puis « Production déjà à jour ».
La comparaison de src/ et tools/deploy-copy.js entre le main précédent d17c3aabe9771f24284666f1c87ddbe2cebb5803 et le nouveau main est vide.
tools/deploy-copy.js ne renouvelle version.json que si un asset change.
Ce résultat est une publication sans changement, pas une régression produit ni un problème de propagation.
Ne pas forcer prod-38 et ne pas affirmer que le SHA 292fbe5 est publié dans version.json.

Version publique vérifiée directement :
- prod-37 ;
- SHA d17c3aabe9771f24284666f1c87ddbe2cebb5803 ;
- build inchangé 350a607adb8b ;
- Service Worker inchangé twrc-static-v11.
La validation navigateur réelle de cette même version est conservée dans le checkpoint PR #42 :
https://github.com/iPoower/iPoower/blob/9eb6e734dd4508ac2c0ba0103fbb159df11bcb8a/docs/handoff-pr42-production.md
Aucune nouvelle validation navigateur de production n'a été exécutée pour #43 ; ne pas la présenter comme nouvelle.

## Changements opérationnels actifs sur main
- DATEX : https://github.com/iPoower/iPoower/actions/runs/37503925749 — vert.
- DATEX : https://github.com/iPoower/iPoower/actions/runs/37503960392 — vert.
- Contrôle des sources : https://github.com/iPoower/iPoower/actions/runs/37503925589 — vert.
- Watchdog relais : https://github.com/iPoower/iPoower/actions/runs/37503925748 — vert.
Les nouveaux workflows et correctifs backend s'exécutent depuis le nouveau main, indépendamment de la version des assets frontend.

## Confidentialité : chantier séparé, non terminé
1. Réduire les métadonnées publiées dans obs.json.
2. Auditer les secrets et les mécanismes de chiffrement sans publier les secrets.
3. Inventorier les anciennes données personnelles présentes dans l'historique.
4. Décider ensuite d'une éventuelle réécriture d'historique ; aucune réécriture n'est autorisée ni effectuée ici.
La suppression actuelle des anciennes coordonnées de test ne les efface pas des commits historiques.
Ne pas conclure à un audit de sécurité complet ou à un historique nettoyé.

## Reprise
Livraison #43 terminée : fusion et CI main validées ; déploiement frontend sans changement attendu.
Aucun correctif produit supplémentaire effectué.
Cette branche de checkpoint ne doit être ni fusionnée ni déployée.
Prochaine action distincte : réduction de obs.json, après observation des consommateurs et des métadonnées réellement nécessaires.
