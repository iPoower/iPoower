# Sauvegarde automatique et synchronisation PC ↔ iPhone

**Raccord proposé le 23/10/2026 :** voir [drive-runtime.md](drive-runtime.md). Code à relire, activation réelle soumise aux preuves et à la revue sensible.

État historique du lot A : **étape 1 seulement** (moteur de fusion pur, testé sur données fictives). Rien n'est branché dans l'application, aucune donnée ne quitte l'appareil.

## Décisions du propriétaire (21/10/2026)

- Cible initiale, précisée par la mission écosystème du 21/10 : **Google Drive**, copies **chiffrées sur l'appareil** avant tout envoi.
- Même code de déverrouillage sur le PC et l'iPhone : les deux appareils lisent la même copie chiffrée.
- Control Vault sert de tableau de bord (versions, restauration, intégrité). Il transporte des paquets opaques et ne voit jamais le code (contrat d'intégration V1).

Le fournisseur retenu pour la suite utilisera `drive.file`, conformément à `Control-Vault/SECURITY.md`. Aucun accès à `appDataFolder` d’une autre application ne sera supposé. Cette décision ne configure ni OAuth ni un service réel.

## Règles de fusion (`src/sync-merge.js`)

| Donnée | Règle |
|---|---|
| Journal des trajets | Union cumulative (`JournalArchive`). Deux réponses au même trajet restent toutes les deux. Une fusion qui ferait baisser le nombre d'enregistrements est refusée. |
| Trajets clos, annulations | Par identifiant, l'enregistrement le plus récent. Aucun n'est perdu. |
| Relevés de compteur et de profondeur, retours terrain, jours du journal météo | Union, voiture par voiture (identité = `id`, jamais la position). |
| Réglages modifiés | Chemin par chemin, la modification la plus récente selon `twrc.editstamps.v1`. Sans horodatage, ou à égalité, la valeur de cet appareil reste et le chemin est signalé comme conflit. |
| Lieu, GPS, trajet en cours, caches, clés de session | Jamais importés. Ils restent propres à chaque appareil. |
| Clé inconnue | Jamais importée automatiquement ; écart signalé, adaptation dédiée requise. |

Limite volontaire : une suppression (relevé effacé, réinitialisation) n'est pas propagée. L'union la fait réapparaître. En cas de doute, on conserve plutôt que de perdre.

## Étapes

1. **Moteur de fusion pur** (cette étape) : tests unitaires fictifs, aucun effet sur l'application en ligne.
2. **Origine dédiée** (Cloudflare Pages) avant tout jeton Google. Sur `ipoower.github.io`, un jeton serait lisible par les autres applications de l'origine. Transfert chiffré volontaire, réinstallation de la PWA sur iPhone, test sur appareil physique.
3. **Horodatage des modifications et envoi automatique** de la copie chiffrée vers Drive : à l'ouverture et après chaque changement important. Pas d'arrière-plan sur iPhone.
4. **Récupération et fusion automatiques** sur l'autre appareil, avec rapport visible (ajouts, conflits).
5. **Branchement de Control Vault** : historique, restauration d'une version, contrôle d'intégrité.

Les observations météo dépassant 30/200 entrées font refuser la fusion entière : aucune troncature. Les conflits de voiture ne reprennent pas l’horodatage distant refusé. Les véhicules inconnus et les remplacements de listes sont signalés pour arbitrage, sans suppression locale. Le module reste non branché : il ne constitue ni un protocole de révision distante ni une synchronisation opérationnelle.

Chaque étape touche des données sensibles (import, fusion, stockage, authentification). Elle exige une relecture explicite du propriétaire, sans fusion automatique, même si la CI est verte.
