# Lot D1 — clé de synchronisation disponible après reprise de session

Statut : code non assemblé, revue sensible obligatoire (cryptographie, stockage
persistant). Aucun changement de `tools/build.js`, écran, coffre, Service Worker,
OAuth ou workflow. Le contrat `docs/INTEGRATION.md` est inchangé ; la proposition
normative est `docs/INTEGRATION_SYNC_A1.md`, à copier à l'identique dans Control Vault.

## Problème

`ControlVaultPacket.seal/open` dérivent la clé du code à chaque appel. Une
session mémorisée (`RememberDevice`, sept jours) reprend sans code : sans
autre mécanisme, la synchronisation automatique exigerait de stocker le code.

## Mécanisme

- `src/sync-key.js` : `SyncKey.create(code)` produit un descripteur public
  (sel de compte, `keyId`, contrôle GCM). `SyncKey.derive(descripteur, code)`
  refuse un mauvais code avant toute mémorisation.
- `SyncKey.storage().remember(poignée, liaison, expiration)` conserve la
  CryptoKey non extractible dans la base IndexedDB `twrc.sync-key.v1`, liée à
  `device` ou `tab:<id>`, sept jours au plus. `resume` relit le contrôle avant
  usage et efface une clé périmée, d'un autre compte ou d'un ancien code.
  `revoke()` sert au verrouillage.
- `ControlVaultPacket.create(...).sealWith/openWith` utilisent cette poignée.
  L'enveloppe V1 est identique ; seul le sel est celui du compte. Un paquet
  avec un autre sel donne `CODE_REQUIRED`, sans repli.

Ni le code, ni la clé brute, ni une donnée déchiffrée ne sont stockés.

## Preuves

| Suite | Ce qui est démontré |
|---|---|
| `tests/test_sync_key.js` | PC repris sans code → paquet 120 trajets → iPhone repris sans code, retour, lecture manuelle par code ; enregistrement sans code ni clé exportable ; mauvais code ; expiration, durée maximale, liaison, balayage, verrouillage ; descripteur hostile refusé avant PBKDF2 ; changement de code et paquet manuel → `CODE_REQUIRED` ; module absent du build |
| `tests/e2e83-sync-key-resume.js` | Chromium et WebKit : CryptoKey réellement persistée par IndexedDB, onglets fermés puis rouverts dans deux profils PC/iPhone, aucun `localStorage`/`sessionStorage`, révocation effective après réouverture |

WebKit en CI émule un iPhone ; ce n'est pas une recette Safari physique.

## Raccord futur (non fait ici)

1. Appeler `derive` + `remember` dans le parcours de saisie du code existant,
   après déverrouillage réussi, avec l'expiration de la session ; `revoke()`
   dans `lock()` et à l'expiration. Écran inchangé : la dérivation est de
   l'arrière-plan.
2. Publier et relire le descripteur dans le dossier Drive avant le premier paquet.
3. L'addendum A2 (révisions, parents, conflits) avant toute synchronisation.

## Retour arrière

Retirer le module, les deux méthodes du codec, les tests et les documents.
Aucune donnée n'est créée en production : le module n'est pas chargé. Après un
futur raccord, supprimer la base `twrc.sync-key.v1` ne fait perdre aucune
donnée : le code redonne la clé.
