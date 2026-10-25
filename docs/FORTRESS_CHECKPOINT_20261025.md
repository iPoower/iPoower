# FORTRESS DRIVE — référence indépendante de récupération

Le paquet AES-GCM authentifie son contenu et sa lignée, pas la complétude du catalogue retourné par Drive. Sur un appareil vierge, un ancien préfixe authentique peut rester une lignée valide si toutes les révisions suivantes sont masquées ou manquantes. `RESTORED_VERIFIED` signifie égalité complète avec la copie sélectionnée après réouverture ; ce statut ne prouve pas que cette copie est la dernière produite.

## Limite reproduite avant correction

Deux révisions synthétiques authentiques sont produites par les moteurs existants. Le fournisseur simulé ne liste que la première. Sans référence externe, `prepare`, `install` puis `verify` acceptent cette ancienne copie. Les tags GCM et les empreintes sont corrects : ce n'est pas un contournement du chiffrement. Aucun appel Google réel n'est utilisé dans ce contre-test.

## Protection ajoutée, formats inchangés

`DriveRecovery.prepare(pass, { revision, sha256 })` accepte une référence facultative conservée auparavant hors du stockage Drive concerné. Les deux champs exacts doivent apparaître ensemble dans les révisions authentifiées ; sinon l'aperçu est bloqué avant toute écriture. La référence est copiée et figée en mémoire, puis revalidée lors de l'installation. Une descendante authentique reste acceptable lorsque l'ancêtre référencé est présent avec la même empreinte. Aucune version, journal ou copie n'est supprimé.

La page de récupération permet de saisir ces deux champs, affiche l'empreinte complète de la copie proposée et explique l'absence de preuve de fraîcheur absolue. Modifier un champ invalide l'aperçu. Ne pas utiliser comme référence une valeur obtenue du seul catalogue dont la complétude est à vérifier.

Cette protection prouve un plancher connu, pas l'absence de révisions inconnues ultérieures. Sans référence, la récupération reste possible avec un avertissement visible pour ne pas condamner une sauvegarde authentique dont c'est la seule copie disponible. Une référence perdue, ancienne ou fournie par un appareil compromis ne garantit pas la fraîcheur. La phrase de déchiffrement reste réservée à Race Control.

## Tests et périmètre

La suite historique ajoute trois groupes WebCrypto : suffixe récent masqué/refus grâce à la référence puis acceptation d'une descendante ; références invalides ou divergentes sans écriture ; mutation de l'objet appelant et perte du suffixe entre aperçu et installation. Le parcours Chromium/WebKit contrôle également le refus sans écriture d'une référence inconnue, une référence valide et les champs/avertissement de la page réellement construite. Toutes les assertions historiques sont conservées.

Cette branche dépend du candidat TEST #243 et de ses PR sources. Aucune fusion main ni publication production. #239 reste exclusivement une preuve et n'est pas un parent de cette branche. Les tests Google sont simulés ; la recette réelle exige OAuth TEST, upload, relecture, restauration indépendante et nouvelle révision.

## Reprise et retour arrière

Conserver le reçu de la dernière révision vérifiée (identifiant et SHA-256 du fichier complet) et une copie chiffrée sur un support indépendant accessible sans l'appareil perdu. Comparer cette référence pendant la récupération. Ne pas enregistrer la phrase ou le jeton dans le reçu public.

Le retrait du code de référence n'efface aucune donnée mais retire cette protection contre un catalogue amputé. Préférer conserver le code compatible pendant une récupération en cours. Ne supprimer ni coffre, IndexedDB, outbox, journal `recoveryInit`, copies ou archives Drive pour revenir à une version logicielle.
