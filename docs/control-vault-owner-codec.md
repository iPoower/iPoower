# Codec propriétaire — préparation du lot C

Statut : code non activé, revue sensible obligatoire. Aucun raccord dans
`tools/build.js`, aucun changement d’écran, coffre, import historique, stockage,
Service Worker, OAuth ou workflow. Le contrat `docs/INTEGRATION.md` reste identique
à celui de Control Vault. Ce lot ne constitue pas une restauration en production.

## Frontière propriétaire

`src/control-vault-packet.js` chiffre et déchiffre exclusivement dans Race Control.
Le contenu reste le métier `app=twrc`, version 1 ou 2. Il ne transporte pas un
nouveau format de coffre brut. Le constructeur exige un validateur métier
synchrone du propriétaire : il doit accepter sans modifier les données. Un
validateur manquant, une normalisation, une structure non JSON, une profondeur
excessive ou un refus métier bloque le paquet entier. Le validateur des tests
utilise les vrais modules Backup, ConfigImport et JournalArchive ; il reste un
harnachement de test, pas le validateur final d’une restauration automatique.

Le codec vérifie UTF-8, doublons même échappés, profondeur, propriétés exactes,
dates, Base64 canonique, tailles, SHA-256, version productrice puis AES-GCM/AAD.
PBKDF2-SHA256 utilise exactement 600000 itérations, un sel aléatoire de 16 octets,
un IV aléatoire de 12 octets et une clé AES-256 non extractible. Les métadonnées
sont liées par l’AAD exacte du contrat. Après chiffrement, les octets sont relus,
authentifiés, déchiffrés et comparés au contenu source avant retour à l’appelant.
Le mot de passe et la clé ne sont jamais sérialisés ni transmis. Les buffers
temporaires accessibles sont effacés ; JavaScript ne garantit pas l’effacement
des chaînes ni des copies internes du moteur.

`loadedVersion(loadedBuild, release)` refuse un `version.json` dont le hash
`build` ne correspond pas au `TWRC_BUILD` effectivement chargé. Le futur raccord
devra obligatoirement utiliser ce résultat, sans substituer la dernière version
trouvée en ligne. Les lecteurs inconnus et les producteurs futurs sont refusés
avant la dérivation. Les anciens fichiers ont toujours leur chemin distinct.

## Conservation et limites des preuves

Les fixtures partent de vrais modules RC, de `JournalArchive.capture(values)`
et du métier Backup V2. L’archive intégrale est placée dans le champ existant
`durable.context.debrief.archive` : 61 puis 120 trajets, entrées de 91 et 365 jours,
plusieurs retours pour une clé et un ancien champ non affichable. Le codec les
restitue sans normalisation. GPS courant et trajet actif restent hors du paquet.

Ces vérifications couvrent la **portion codec** de F01/F02/F03, F06 et les refus
de F07. Elles ne ferment pas ces preuves de bout en bout : un export issu de la
projection Backup seule peut déjà avoir perdu une version source. Le futur
adaptateur doit capturer toutes les sources du journal avant toute projection.
La validation métier doit également refuser les autres données durables non
couvertes, plutôt que les ignorer. Le codec ne certifie pas cette complétude.

Restent à prouver : sauvegarde locale récupérable préalable, plan d’import sans
écrasement de données locales enrichies, application transactionnelle et rollback
sous concurrence/quota/interruption (F04/F05), import historique dans l’UX finale,
passage effectif par l’archive et le fournisseur Control Vault (F08), fermeture et
reprise de la PWA, puis Safari sur iPhone physique (F09). Les tests Chromium/WebKit
du codec utilisent deux profils isolés et ne valent pas une recette physique.

## Dépendances d’activation et retour arrière

Control Vault #7/#8 fournit déjà les lecteurs opaques et le transport préparatoire.
Leur présence ne rend pas Google Drive opérationnel. Les origines dédiées,
la visibilité du même dossier sous un même client OAuth `drive.file`, les preuves
de restauration et une revue explicite restent nécessaires avant raccord.

Revenir sur ce lot supprime seulement un module non assemblé, ses tests et ce
document : aucun état persistant n’a été créé. Ce retour de code n’est pas un
retour de données. Aucun profil existant, autre application ou ancienne PWA
n’est modifié, abandonné ni nettoyé.
