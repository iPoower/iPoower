# Lot D2 — révisions, têtes concurrentes et conflits

Statut : moteur pur non assemblé, revue sensible obligatoire. Empilé sur le lot D1
(`docs/sync-key-resume.md`). Proposition normative : `docs/INTEGRATION_SYNC_A2.md`.

## Contenu

- `src/sync-revisions.js` : métadonnées de révision, contenu chiffré `twrc-sync`
  (valeurs durables du coffre, état d'appareil exclu), propriétés Drive bornées,
  confirmation par égalité avec la copie authentifiée, plan déterministe
  (`up-to-date`, `push`, `integrate`, `blocked`) et décision de publication.
- `src/control-vault-packet.js` : le codec accepte aussi le contenu `twrc-sync` v1,
  toujours soumis au validateur obligatoire du propriétaire.
- `src/sync-merge.js` : `twrc.runtime.v1` (diagnostic), `twrc.cfghash` (lien de
  configuration importé sur cet appareil) et `twrc.sync.*` (état local) classés
  propres à l'appareil. Sans ce classement, ils créaient un conflit permanent.

## Preuves (`tests/test_sync_revisions.js`, vrais modules, catalogue simulé)

Premier envoi et convergence ; exclusion GPS/caches/diagnostic/état local ;
saisies alternées (histoire linéaire) ; vraie concurrence avec deux têtes puis
fusion à deux parents ; convergence finie sans aller-retour ; toutes les versions
ouvrables ; conflit de réglage gardé local et tête distante toujours visible ;
catalogue falsifié refusé (`REVISION_MISMATCH`) ; cycle, doublon, parent manquant,
appareil en avance ; propriétés ≤ 124 octets et formes ambiguës refusées.

## Données durables à arbitrer avant activation

| Clé | Constat | Proposition |
|---|---|---|
| `twrc.editstamps.v1` | Lu par la fusion, jamais écrit par l'application | Écrire l'horodatage à chaque modification de réglage (lot D3), sinon chaque divergence reste un conflit |
| `twrc.tyretherm.v1` | Durable pour Backup V2, propre à l'appareil pour la fusion | Décision du propriétaire : mémoire thermique partagée ou locale |
| `twrc.reports.v1`, `twrc.shadow.v1` | Bornés à 30/200 ; fusion refusée au-delà, sans troncature | Capacité à revoir avant un usage intensif sur deux appareils |
| Clés inconnues | Gardées localement, signalées comme conflit | Adaptation explicite par clé |

## Reste à faire

Raccord dans l'application (après D1), écriture des horodatages, file locale
durable des envois, fournisseur Drive réel, écran de conflit dans l'UX existante,
catalogue Control Vault des têtes multiples, puis recette physique.

## Retour arrière

Revert : module pur et tests retirés, codec et classement revenus à l'état D1.
Aucune donnée créée : rien n'est chargé par la PWA.
