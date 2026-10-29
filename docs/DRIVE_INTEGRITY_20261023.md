# Drive — intégrité des reprises et des saisies concurrentes — 23/10/2026

Correctif proposé uniquement. Aucune fusion, publication, activation Drive, donnée personnelle ou modification administrative.
Base examinée : `c9c833944f7da45d3a74394c5bcd6040582e302b`.

## Défauts reproduits avant correction

Les nouveaux contrôles dans `tests/test_drive_sync.js` échouent dans les quatre combinaisons première sauvegarde/envoi suivant × chiffrement/envoi asynchrone. L'édition B reste locale mais la file ne la déclare pas encore en attente et le statut peut annoncer « synchronisé » après l'envoi de A. L'ancienne empreinte d'observation permettait normalement de retrouver B au tick suivant ; ce défaut de statut n'est pas une preuve de perte systématique.

Le contrôle renforcé de `tests/test_sync_outbox.js` échoue aussi sur la base : une erreur d'intégrité réinitialise l'identifiant réservé et autorise un nouvel envoi automatique. L'ancien scénario attendait explicitement deux fichiers ; cette attente contredit la reprise idempotente désormais exigée et est remplacée par un contrôle plus strict, sans retirer le scénario de corruption.

## Correction limitée

- L'empreinte de l'instantané réellement scellé devient l'ancre d'observation. Après relecture distante, un nouvel instantané local confirme les modifications encore à transmettre et la file les conserve avant toute annonce de succès.
- Le coffre émet un événement local sans valeur de donnée lors des écritures ; Drive invalide immédiatement son ancien statut pour une modification durable. Le signal ne contient ni clé cryptographique ni contenu, ne quitte jamais l'origine et ne modifie aucun format persistant. Les clés propres à l'appareil sont exclues.
- Le statut passe par la vérification pendant le travail ; un verrou ou refus produit `SYNC_BLOCKED`.
- L'erreur d'intégrité est bloquante. Les octets, la révision et le même identifiant Drive sont conservés. Une action explicite peut demander une nouvelle relecture de cette opération ; aucun nouvel identifiant ne contourne le problème.

Les contrats V1/A1/A2, KDF, clés, enveloppes, schémas de données, limites, copies avant fusion et anciennes sauvegardes ne changent pas. Aucun fichier Twin Garage ou d'une autre application n'est modifié.

## Preuves et reproduction

- `node tests/test_drive_sync.js` : quatre contre-scénarios passent, avec vrais codecs et WebCrypto, réseau/stockage fictifs ; le paquet final est comparé structurellement à toutes les valeurs durables projetées.
- `node tests/test_sync_outbox.js` : huit scénarios, dont coupures, reprise, réponse perdue, corruption et refus de duplication. Même identifiant après relecture explicite ; aucune tentative automatique pendant le blocage.
- `node tests/test_session_vault.js` : suite du coffre et contre-tests conservés.
- `BROWSER=chromium node tests/e2e85-drive-runtime.js`, puis `BROWSER=webkit ...` : coffres, AES-GCM et IndexedDB réels, serveur Google entièrement intercepté. Deux nouveaux parcours couvrent première sauvegarde et envoi suivant, modification pendant l'envoi, file durable, comparaison exhaustive du paquet et invalidation immédiate du statut à la saisie suivante.
- `node tests/run-ci.js --lane unit` et la matrice existante trois Chromium + trois WebKit restent les contrôles complets. Les résultats finaux au SHA exact doivent être lus dans la PR.

Reproduction rouge indépendante : worktree détaché à la base, recopier uniquement les deux tests unitaires modifiés et les exécuter avec le code de production d'origine. Quatre échecs de concurrence et un échec du scénario d'intégrité sont attendus.

## Revue, récupération et limites

Revue humaine requise : ordonnanceur, file persistante et signal du coffre. Retour arrière par PR contrôlée uniquement ; ne supprimer aucun magasin, fichier, ancienne installation ou travail en attente. Un état nouvellement bloqué pour intégrité doit être conservé : un ancien lecteur qui ne connaît pas ce blocage doit refuser sa reprise, jamais le réinitialiser.

La détection automatique reste soumise à l'exécution de l'application ouverte, autorisée et déverrouillée. Les tests HTTP sont simulés, ne prouvent pas les permissions Google ni un iPhone physique. Aucune restauration de données déjà perdues n'est promise. La recette réelle Google et la validation physique restent séparées, et toute activation personnelle exige le GO FINAL.
