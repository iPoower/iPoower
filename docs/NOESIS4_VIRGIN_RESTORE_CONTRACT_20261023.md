# NOESIS-RC-004 — Contrat de récupération initiale (A2) sans profil local

**23 octobre 2026 — spécification de sécurité, non implémentée, NO-GO production.**
Base du dossier : PR #234 (`8e252aee192a6548412889fd2c9955097c5ed3c3`).
Cette note ne constitue pas une autorisation d'utiliser Google personnel ni de remplacer une sauvegarde.

## Séparation obligatoire
1. **Restauration manuelle V2** : un paquet propriétaire téléchargé, déchiffré par Race Control, passé par `Backup.restorePlan` et importé dans un nouveau `SessionVault` chiffré. Test navigateur ajouté par la PR #238. Le paquet V2 manuel n'est pas une révision A2.
2. **Récupération A2** : reconstruction à partir du descripteur de clé A1 et des révisions distantes authentifiées du graphe A2. Elle doit fonctionner sans présence préalable d'une ancienne clé IndexedDB ou d'un coffre local d'origine et ne doit pas utiliser la fusion normale si le profil n'existe pas. **Ce chemin n'est pas prouvé.**

## Pourquoi une simple relance sync.run(true) ne suffit pas
- `SessionVault.syncSnapshot()` exige `JournalArchive.KEY`.
- `DriveSync.projection()` exige `twrc.settings.v1` et l'archive.
- `SyncMerge.values()` refuse explicitement un profil local absent et signale les véhicules inconnus comme conflits.
Ces protections doivent **rester actives** pour tout profil préexistant ; ne jamais les contourner pour rendre le test vert.

## Contrat proposé pour une future entrée `restoreNewDevice`
- Action utilisateur explicite distincte de « Synchroniser » et confirmation du compte/dossier dédié. Ne pas demander de consentement ni créer de fichier sur Google sans geste de l'utilisateur.
- Préflight sous verrou exclusif : aucune copie locale métier ou coffre existant, aucun envoi en attente ni état `twrc.restore.pending` inconnu. Un appareil **non vierge** passe en procédure de fusion/arbitrage et copie avant fusion, jamais en restauration initiale.
- Récupérer **le même** descripteur A1 vérifié depuis le dossier autorisé ; dériver la clé avec le code saisi, jamais la stocker durablement en clair.
- Lister toutes les pages A2, valider les identités de révision, parents, têtes et empreintes. Refuser têtes multiples contradictoires, parent manquant, paquet incomplet, extension inconnue, version incompatible, mauvaise signature GCM/AAD ou métadonnées discordantes.
- Construire un plan **complet** de données métier, avec état d'appareil explicitement exclu. Comparer la projection canonique et les longueurs/empreintes de chaque sous-structure, pas seulement des décomptes.
- **Sauvegarder localement d'abord** un journal de récupération non destructif et son empreinte, puis effectuer une écriture unique et vérifiée du coffre local. En cas de panne, redémarrer sur l'ancienne version ou une récupération explicite, jamais un état mixte ni une « réussite » en mémoire seulement.
- Confirmer le statut `RESTORED_VERIFIED` uniquement après une fermeture, une nouvelle lecture du coffre, un déchiffrement réussi et la vérification intégrale des données de référence.
- Conserver le descripteur, les révisions, la file et les reçus de sauvegarde nécessaires à la reprise de synchronisation. N'autoriser `SYNCED` qu'après comparaison et preuve de la **nouvelle** révision complète.
- Aucun effacement, purge, migration destructive, suppression de version distante ou `fileId` nouveau pour masquer une divergence.

## Matrice requise avant toute activation
- Premier appareil sans `localStorage`, sans clé IDB ; mauvais code et code correct.
- Un et plusieurs parents A2 ; deux têtes compatibles / incompatibles ; fichier et parent manquants.
- Réponse perdue, corruption d'empreinte, fichier déplacé, réseau coupé, quotas et fermetures à chaque frontière d'écriture.
- Tentative répétée et relance après succès ; conservation du même état et absence de doublon.
- Copie locale présente : refus de chemin vierge et aucun octet utilisateur changé.
- Réseau et données fictifs dans Chromium et WebKit ; ensuite **compte Google de test isolé** et **iPhone physique**, autorisations séparées.

Statut actuel : **RESTORE-A2 = BLOQUÉ / NO-GO**. Une PR de tests V2 réussie ne change pas ce verdict.
