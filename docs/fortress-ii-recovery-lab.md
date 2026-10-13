# Forteresse II — Phase 4 : laboratoire de reprise multi-stockages

**PR non fusionnable par cette mission. Aucun changement sur les données de l'utilisateur.**

## Objectif

Mesurer dans de vrais navigateurs Chromium et WebKit, avec deux origines
`http://127.0.0.1` éphémères à ports distincts, comment un scénario **100 % fictif**
de restauration peut interrompre puis reprendre une écriture qui concerne
**localStorage ET IndexedDB**. La PR ne dépend pas de la fusion de #134, #135 ou #136.

## Protocole

- Profil synthétique créé depuis zéro, avec 5 valeurs locales durables contenant
  voitures, pneus, préférences, historique et **observation humaine fictive**, plus
  2 entrées IndexedDB : profil pneu et trajets clôturés.
- Préparation d'un manifeste entre deux origines : JSON synthétique, liste de
  valeurs explicite, empreinte SHA-256, origine source et destination attachées.
- Exclusion des pseudo-sessions, coordonnées et caches. Arrêt avant import
  lorsqu'une clé future inconnue apparaît, lorsqu'un manifeste est altéré,
  ou lorsque la destination contient déjà des données.
- Étape en **staging** IndexedDB, aucun état actif. Confirmation nécessaire
  pour lancer la restauration.
- Avant écriture, le marqueur local `restoring` empêche **le lecteur du banc
  d'essai** de considérer des clés partielles comme activées.
- Échecs injectés : après la première écriture locale, quota simulé avant
  IndexedDB, vraie annulation de transaction IDB, arrêt après commit IDB.
- Rechargement de page et reprise idempotente. Chaque valeur locale et chaque
  enregistrement IndexedDB est ensuite comparé **à l'identique** à l'instantané
  initial. Le lecteur n'accepte que le marqueur `ready` après comparaison.
- Test de retour inverse : une nouvelle observation humaine côté « nouvelle »
  origine entraîne un **conflit visible**, sans écrasement de l'ancienne origine.

## Limites critiques

1. **Ce n'est pas le format de sauvegarde réel** de Race Control et le code
   ne doit jamais être connecté au coffre `twrc.vault.v2`. Les clés commencent
   par `f2v4.`, aucune URL utilisateur ni secret n'est consulté.
2. L'empreinte SHA-256 de ce manifeste purement fictif vérifie seulement une
   modification accidentelle. **Elle n'est pas une authentification** ;
   le transfert chiffré réel devra avoir une authentification cryptographique
   et une politique de version/dérivation revue séparément.
3. Les données locales partielles **existent temporairement** entre deux écritures.
   Le marqueur protège seulement les chemins applicatifs qui le vérifient.
   La transaction globale localStorage + IndexedDB n'existe pas.
4. Le quota est **simulé**, pas une mesure de stockage Safari. Le redémarrage
   de page n'est pas une coupure physique d'iPhone ; WebKit Playwright n'est
   pas Safari iOS installé comme PWA.
5. Les paramètres, champs et chemins réel de l'application, les en-têtes
   HTTPS/CSP/CORS, le cache hors ligne, les permissions GPS et les mises à jour
   de Service Worker ne sont **pas** validés par ce banc.
6. La conservation des observations durables réelles et le traitement
   des champs dynamiques restent des **conditions de blocage** de migration.

**GO** si le banc fictif et la CI du SHA exact sont verts.
**NO GO** pour fusion, déploiement, domaine/DNS, migration du coffre ou
manipulation de données iPhone sans nouvel accord explicite.
