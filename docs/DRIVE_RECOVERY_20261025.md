# Récupération initiale A2 — 25 octobre 2026

Auteur : Bryan Fiarda. Candidat sensible, non fusionné, non déployé.

Cette correction dépend de #235, qui inclut #234. Les correctifs indépendants
#236 (XSS), #237 (IndexedDB), #238 (preuve V2) et #240 (SW Cloudflare) restent à
revoir/intégrer séparément. #239 et Control Vault #20 sont des preuves
temporaires : ne pas les fusionner. Aucune modification de ces branches.

## Problème et solution

La synchronisation ordinaire exige un profil local avec archive exhaustive.
`SyncMerge.values` refuse légitimement de fusionner un profil absent. Le
téléchargement dans Control Vault et une restauration V2 ne prouvaient donc
pas la récupération initiale d'une révision A2 après perte de l'appareil.

`recovery.html`, sur la même origine dédiée que Race Control, réutilise
GoogleDriveSession, OpaqueDrive, SyncKey, ControlVaultPacket, SyncRevisions,
DriveStore et SessionVault. Elle ne démarre ni le préréglage ni les moteurs
métier, et ne crée pas de seconde source de vérité. La fusion ordinaire et ses
gardes restent inchangées.

## Menaces et invariants bloquants

| Risque | Invariant |
|---|---|
| Mauvais appareil/données existantes | Refuser tout coffre, donnée RC privée, session ou journal d'import existant, même illisible ; aucun reset |
| Mauvais compte/dossier | Compte affiché puis confirmé, dossier dédié contrôlé ; même liaison opaque avant chaque étape |
| Catalogue hostile/rejeu | GCM/AAD et version contrôlées sur toutes les révisions ; égalité métadonnées/contenu ; cycles, collisions, parent manquant et plusieurs têtes refusés |
| Nouvelle version pendant confirmation | Relire toute la lignée et le profil après confirmation ; tout changement exige un nouvel aperçu |
| Écriture concurrente locale | Verrou Drive puis verrou du coffre, contrôle de vacuité répété, CAS avant écriture et relecture exhaustive |
| Coupure/fermeture | Paquet source chiffré et journal durable préparés avant le coffre ; reprise explicite du même paquet ; aucun envoi distant |
| Fausse réussite | `REOPEN_REQUIRED` après installation ; `RESTORED_VERIFIED` seulement dans un autre document, après déchiffrement et égalité de chaque valeur |
| Modification après installation | Toute divergence locale bloque la vérification ; ne jamais remettre automatiquement l'ancien état |
| Vol du code/jeton | Code saisi en mémoire uniquement, effacé à la sortie, au masquage et après succès ; jeton GIS en mémoire ; aucun secret dans URL/log/export |
| XSS | UI nouvelle construite par textContent ; script de récupération autorisé par empreinte exacte ; CSP existante conservée |
| Empoisonnement du cache | Le SW ne transforme pas recovery.html en index.html et n'offre pas de fallback métier sur cette page |
| Mémoire/stockage | 128 révisions et 128 Mio de fichiers au maximum pour cette récupération ; arrêt sans troncature ni purge au-delà |

Le code de chiffrement reste indépendant de Google. Les formats V1/A1/A2 et
PBKDF2-SHA256 600 000 / AES-256-GCM ne changent pas. Les propriétés nouvelles
du journal sont locales ; Drive et Vault ne reçoivent aucun nouveau clair.

Le modèle protège contre les accidents, une réponse altérée, un catalogue
ambigu et les écritures coopératives. Un script autorisé compromis, une XSS
de même origine, une extension malveillante ou un appareil administré peuvent
lire une session déverrouillée. Non-extractible ne signifie pas matériellement
inviolable. Ne pas utiliser cette récupération sur un PC professionnel.

## Transactions et reprise

1. L'aperçu est en mémoire : aucune écriture de progression, aucun upload.
2. Après export indépendant et confirmation, relire profil et lignée.
3. Relire les octets du paquet chiffré dans DriveStore ; écrire et relire le
   journal `recoveryInit.phase=pending` sous `twrc.drive.sync.v1`.
4. SessionVault refuse tout stockage RC existant, écrit une seule enveloppe
   V3, la déchiffre et compare toutes les chaînes. Aucun cache n'est évincé.
5. Marquer `installed`. Si ce dernier accusé IDB échoue, la vérification peut
   reprendre le journal `pending` avec le coffre déjà installé.
6. Après fermeture/réouverture, dériver à nouveau la clé depuis le code,
   authentifier la copie indépendante et le coffre local, comparer chaque
   clé/valeur, puis marquer `verified`. La synchronisation ordinaire reste
   bloquée avant cette preuve.
7. Adopter la tête et un nouvel identifiant d'appareil. Reconnecter et
   déverrouiller dans RC ; la relecture distante ordinaire précède le statut
   synchronisé. Une tête identique ne produit pas de nouvelle version.

Si une écriture échoue, conserver l'onglet, la copie source et le journal.
Si le coffre est présent, utiliser la vérification après réouverture ; s'il
est absent, reprendre l'aperçu avec le même compte/dossier/source. Une source
changée ou un stockage étranger exige un diagnostic, jamais une suppression.
Le journal et les paquets opaques ne sont pas nettoyés automatiquement.
La copie source d'une récupération initiale n'est jamais présentée comme une
copie avant fusion. Cet export utilise son pointeur dédié et vérifie à nouveau
l'empreinte de ses octets avant téléchargement.

Un coffre récupéré vérifié, contenant le profil et l'archive, peut être
déverrouillé avec son code même si un ancien préréglage publié utilise un
autre code. Cette exception exige l'authentification du coffre local et le
journal de récupération vérifié ; elle n'ouvre aucun profil vide.

## Configuration et parcours

Les six champs GOOGLE_DRIVE_CONFIG, le client Web commun, les deux origines
Cloudflare exactes et `drive.file` restent ceux du parcours existant. Aucune
activation OAuth, aucun secret, aucune variable Actions et aucune configuration
administrative n'est modifiée par ce candidat. Sur github.io, la page refuse
Google avant lecture des stockages privés.

Sur appareil neuf, ouvrir directement `<origine-RC-autorisée>/recovery.html`
avant de créer des données dans RC. Choisir/confirm­er le compte puis le dossier
existant ; saisir le code uniquement dans RC ; vérifier l'aperçu ; télécharger
une copie et confirmer son enregistrement indépendant ; installer ; fermer et
rouvrir cette page ; saisir à nouveau le code ; vérifier ; ouvrir RC et choisir
le même compte/dossier pour reprendre. Si l'installation n'est plus vierge,
conserver/exporter son état et passer au parcours contrôlé de fusion.

La page requiert le réseau pour confirmer sa version publiée et récupérer
Drive. Elle n'est pas un nouveau shell hors ligne. Après récupération vérifiée,
le coffre reste local et RC conserve son fonctionnement hors ligne habituel.
Une PWA fermée/suspendue ne synchronise pas continuellement.

## Tests et limites de preuve

Les tests ajoutés sont appelés depuis la suite Drive existante ; aucune suite
historique n'est retirée. WebCrypto, SessionVault, les codecs, A2 et les gardes
sont ceux de production. Storage/HTTP Google sont simulés dans Node. Le parcours
e2e85 utilise IndexedDB/localStorage réels, deux contextes indépendants, la vraie
page construite, fermeture/réouverture, égalité exhaustive, reprise sans nouvelle
révision vide, modification hors ligne et aller-retour.

Reproduire : `node tests/test_drive_sync.js`, `node tests/test_session_vault.js`,
`node tests/test_drive_build.js`, puis `node tests/run-ci.js --lane unit` et les
trois shards de chaque moteur Chromium/WebKit de la CI existante. Vérifier le
SHA exact de la PR, pas celui d'une ancienne tête. La disponibilité locale des
binaires n'est pas présumée ; les résultats réellement exécutés figurent au rapport.

À valider séparément : compte Google de test, Picker/scopes/appProperties entre
origines, droits réels, service hébergé et iPhone physique. Aucun test WebKit
automatisé ne devient une preuve d'iPhone physique. Aucune donnée personnelle.

## Retour arrière

Revert logiciel ciblé par PR après GO, sans suppression de Drive, IDB, coffre,
journal ou historique. Ne jamais réintroduire la confusion SW entre la page de
récupération et index.html. Une ancienne version ignorant `recoveryInit` ne doit
pas synchroniser une installation en cours : terminer la vérification avec la
version compatible avant tout retour de code. Le rollback de code ne restaure
pas les données. Une copie chiffrée indépendante reste indispensable.
