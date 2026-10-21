# Sauvegarde automatique et synchronisation PC ↔ iPhone

Statut : **étape 1 seulement** (moteur de fusion pur, testé sur données fictives). Rien n'est branché dans l'application, aucune donnée ne quitte l'appareil.

## Décisions du propriétaire (21/10/2026)

- Stockage : **Google Drive**, dossier caché propre à l'application, copies **chiffrées sur l'appareil** avant tout envoi.
- Même code de déverrouillage sur le PC et l'iPhone : les deux appareils lisent la même copie chiffrée.
- Control Vault sert de tableau de bord (versions, restauration, intégrité). Il transporte des paquets opaques et ne voit jamais le code (contrat d'intégration V1).

## Règles de fusion (`src/sync-merge.js`)

| Donnée | Règle |
|---|---|
| Journal des trajets | Union cumulative (`JournalArchive`). Deux réponses au même trajet restent toutes les deux. Une fusion qui ferait baisser le nombre d'enregistrements est refusée. |
| Trajets clos, annulations | Par identifiant, l'enregistrement le plus récent. Aucun n'est perdu. |
| Relevés de compteur et de profondeur, retours terrain, jours du journal météo | Union, voiture par voiture (identité = `id`, jamais la position). |
| Réglages modifiés | Chemin par chemin, la modification la plus récente selon `twrc.editstamps.v1`. Sans horodatage, ou à égalité, la valeur de cet appareil reste et le chemin est signalé comme conflit. |
| Lieu, GPS, trajet en cours, caches, clés de session | Jamais importés. Ils restent propres à chaque appareil. |
| Donnée durable inconnue | Ajoutée si absente ici. Si elle diffère, la valeur locale reste et la clé est signalée. |

Limite volontaire : une suppression (relevé effacé, réinitialisation) n'est pas propagée. L'union la fait réapparaître. En cas de doute, on conserve plutôt que de perdre.

## Étapes

1. **Moteur de fusion pur** (cette étape) : tests unitaires fictifs, aucun effet sur l'application en ligne.
2. **Origine dédiée** (Cloudflare Pages) avant tout jeton Google. Sur `ipoower.github.io`, un jeton serait lisible par les autres applications de l'origine. Transfert chiffré volontaire, réinstallation de la PWA sur iPhone, test sur appareil physique.
3. **Horodatage des modifications et envoi automatique** de la copie chiffrée vers Drive : à l'ouverture et après chaque changement important. Pas d'arrière-plan sur iPhone.
4. **Récupération et fusion automatiques** sur l'autre appareil, avec rapport visible (ajouts, conflits).
5. **Branchement de Control Vault** : historique, restauration d'une version, contrôle d'intégrité.

Chaque étape touche des données sensibles (import, fusion, stockage, authentification). Elle exige une relecture explicite du propriétaire, sans fusion automatique, même si la CI est verte.
