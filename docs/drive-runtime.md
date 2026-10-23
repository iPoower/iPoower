# Raccordement Google Drive — 23 octobre 2026

Code proposé à la revue du propriétaire. **Aucune activation réelle n'est attestée par ce document.** Les lots A1/A2/D1/D2/D3 et le contrat V1 restent la référence ; leurs documents datés décrivent leur état historique.

## Parcours préparé

Réglages → Sauvegarde → Google Drive : préparer les bibliothèques officielles, se connecter, puis choisir explicitement le dossier avec Google Picker. Le même client OAuth Web, le même projet Google, le même compte et le même dossier sont nécessaires sur les deux appareils. Race Control fonctionne sans fenêtre Control Vault ouverte.

La sauvegarde locale vérifiée précède le réseau. Le raccord lit le coffre sous son verrou, exclut GPS, lieu, trajet actif, caches, code et sessions ; le contexte transporté ne contient que le journal durable et les clôtures. Les champs inconnus restent conservés dans les copies et toute divergence bloque l'intégration. L'archive cumulative garde les entrées anciennes, leurs champs historiques et les réponses multiples.

`DriveSync` relie les moteurs existants à `SessionVault`, à une file IndexedDB propre à RC (`twrc.drive.sync.v1`) et au transport opaque. Un verrou `navigator.locks` couvre la file. Les octets chiffrés et l'identifiant réservé sont enregistrés avant l'envoi. Après fermeture ou réponse perdue, le même fichier est relu/réessayé ; aucune modification, suppression ou purge de version Drive. Regroupement : 30 secondes de calme, 10 minutes au plus, tant que l'application reste ouverte et autorisée. Aucun fonctionnement permanent en arrière-plan iOS n'est promis.

Chaque révision distante est téléchargée, authentifiée par GCM et comparée aux métadonnées A2 avant d'entrer dans le graphe. Les conflits de réglages, véhicules, clés inconnues, parents manquants et collisions de révision bloquent la fusion. Aucun arbitrage automatique n'est présenté comme une intégration. Les réglages saisis sont horodatés, y compris les photos et les champs historiquement dépourvus de `markEdit`.

Avant une fusion, le coffre local complet, déjà chiffré, est copié dans IndexedDB et relu identique. Quota, saisie concurrente, verrouillage ou échec de vérification interrompent le commit. Le bouton **Exporter la copie avant fusion** permet d'enregistrer la dernière copie hors du navigateur ; toutes les copies antérieures restent dans le magasin, sans purge. Un effacement du navigateur peut aussi effacer ces copies locales : conserver une copie indépendante reste nécessaire.

Les fichiers A2 téléchargés depuis Control Vault sont importables dans Réglages → Sauvegarde de RC. Le code et la version sont contrôlés dans RC, les conflits refusés, une copie avant fusion conservée. Les anciens fichiers de récupération et sauvegardes V1/V2 gardent leur chemin d'import existant. Le raccord ne transforme pas un fichier V1 incomplet en sauvegarde exhaustive.

## Clés et connexion

Le descripteur public A1 est un fichier Drive distinct, immuable et borné à 2 Kio. Deux descripteurs concurrents bloquent la connexion ; aucun sel n'est choisi arbitrairement. La dérivation, le contrôle GCM et la clé AES non extractible restent dans Race Control. Le code est lu uniquement dans la mémoire du coffre local déjà déverrouillé ; aucune nouvelle copie en clair n'est écrite. La clé reprise est liée à la session d'onglet et à son expiration, au plus sept jours. Après fermeture complète, une autorisation d'appareil valide peut rouvrir le coffre existant et permettre la dérivation ; sinon il faut le déverrouiller. Verrouillage/expiration révoquent la clé et arrêtent le raccord.

GIS et Picker sont chargés après une action explicite. Un seul scope : `drive.file`, sans autorisation incrémentale d'autres scopes. Les jetons restent en mémoire, sont renouvelés uniquement par geste utilisateur et ne sont pas échangés entre applications. Une réponse de l'ancien compte est rejetée. Une empreinte locale lie le travail en attente au client, au compte et au dossier ; il n'est pas envoyé ailleurs en cas de changement de destination.

## Configuration et conditions d'activation

La variable Actions **publique** `GOOGLE_DRIVE_CONFIG`, identique dans les deux dépôts, alimente uniquement les builds Cloudflare. Elle contient exactement :

| Champ | Valeur attendue |
|---|---|
| `approved` | `true`, seulement après revue et recette ci-dessous |
| `clientId` | Identifiant public du client OAuth Web |
| `apiKey` | Clé navigateur Google Picker, restreinte par API et référents selon Google |
| `appId` | Numéro du même projet Google que le client OAuth |
| `raceOrigin` | Origine HTTPS dédiée de Race Control, sans chemin |
| `vaultOrigin` | Origine HTTPS dédiée de Control Vault, distincte |

Aucun secret client OAuth, jeton, code, compte ou identifiant de dossier dans cette variable, les sources, PR ou journaux. Le fichier public `drive-config.json` est validé strictement et servi sans cache. La configuration absente/invalide laisse Drive désactivé. `github.io` est toujours refusé, même ajouté à une configuration. Les bibliothèques et les origines réseau Google ne sont autorisées par CSP que dans le profil isolé configuré ; COOP y devient `same-origin-allow-popups`.

**Avant `approved: true` :** revue explicite de cette PR sensible et de celle de Control Vault ; OAuth/Drive/Picker configurés côté Google ; preuve du même client et de la visibilité des `appProperties` depuis les deux origines ; en-têtes et isolation des stockages/SW sur les hôtes réels ; transfert chiffré depuis l'ancienne installation conservée ; récupération complète F01–F09 et Safari sur iPhone physique. Ces preuves réelles ne sont pas fournies par les simulations. Aucun identifiant Google privé ou secret n'est demandé dans le chat.

## Preuves automatisées et limites

- `test_drive_sync.js` : vrais moteurs/codecs et WebCrypto, réseau/stockage simulés, convergence de deux appareils, réponse perdue, conflit non horodaté, mauvaise destination et stockage refusé.
- `e2e85-drive-runtime.js` : vrais coffres `SessionVault`, IndexedDB, clés non extractibles, transport HTTP B2 et reprise après fermeture, données entièrement fictives. Les tests conservent 120/61 trajets, 91/365 jours, les champs historiques et les réponses multiples ; la copie avant fusion est déchiffrée par RC.
- `test_google_drive_session.js` : scopes, origine partagée, annulation et réponse tardive d'un ancien compte.
- `test_drive_build.js` : configuration publique bornée, profils CSP et refus sur le build historique.
- Les suites de coffre, sauvegarde, révisions, file, origine, confidentialité et navigateurs restent obligatoires. « Synchronisé » exige une relecture des octets ; aucun indicateur « opérationnel » n'est activé sans preuve réelle de restauration et d'iPhone physique.

Ces tests n'utilisent ni compte ni jeton Google réel. Ils ne prouvent pas l'écran de consentement, les restrictions effectives de la clé Picker, le CSP/COOP des bibliothèques Google actuelles en situation réelle ni Safari physique. Les divergences inconnues exigent encore un traitement explicite ; elles ne sont pas écrasées.

## Provenance du transport et retour arrière

`src/drive-transport.js` est une compilation des modules opaques de Control Vault, autonome sur l'origine RC. Les SHA-256 des sources sont dans son en-tête. Reproduction, depuis un clone Vault vérifié après `npm ci` : `node tools/vendor-vault-drive.js /chemin/Control-Vault`. Aucun code RC de dérivation/déchiffrement n'est copié dans Vault.

Retour arrière : retirer la variable `GOOGLE_DRIVE_CONFIG` désactive les futures connexions au prochain déploiement vérifié ; les sessions déjà ouvertes doivent être déconnectées/fermées. Revert par PR avec CI normale. Ne supprimer ni anciennes installations, ni magasins IDB, ni fichiers Drive. Un revert de code ne restaure pas des données : utiliser une copie chiffrée vérifiée et le chemin d'import du propriétaire.

Sources officielles consultées le **23/10/2026** : [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [configuration Google, CSP et COOP](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Google Picker Web](https://developers.google.com/workspace/drive/picker/guides/web-picker), [scope drive.file](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [propriétés privées de fichier](https://developers.google.com/workspace/drive/api/guides/properties), [envois](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [téléchargements](https://developers.google.com/workspace/drive/api/guides/manage-downloads).
