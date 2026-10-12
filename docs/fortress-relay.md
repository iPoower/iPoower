# Forteresse — frontière du relais

## Défaut confirmé

Sur la base `ed5f14b34a1be46723e8b07197bc153637512367`, les workflows météo et watchdog exécutent `gh-pages/race-control/relay.js` avec `RC_KEY`, `APP_KEY` et `GCAL_ICS`. Ce script charge aussi les moteurs JavaScript de cette branche. La règle publique de gh-pages interdit suppression et non-fast-forward, mais n'interdit pas une modification ordinaire de ces fichiers. Un écrivain de cette branche pourrait donc exécuter du code avec les secrets. L'audit ne démontre aucune exfiltration réelle.

## Frontière proposée

1. Un job sans Environment et avec `contents: read` / `actions: read` exige une CI complète réussie sur le **SHA exact** de main. Un ancien run vert ne masque pas un run plus récent en échec ou en cours.
2. Le job privilégié utilise ce même SHA immuable, sans credentials persistants. Les moteurs et la configuration chiffrée proviennent de main.
3. gh-pages est un checkout distinct, jamais une racine d'exécution. Seuls `obs.json` et `calendar.sealed.json` passent par un lecteur JSON borné, sans suivre de liens.
4. Le relais écrit dans un dossier de données distinct. L'agenda existant reste disponible en cas d'échec de synchronisation. L'état anti-doublon est transporté.
5. Seule l'étape du relais reçoit les secrets applicatifs. Le token de publication est injecté à la dernière étape, sans écriture dans les checkouts. Le staging Git est limité aux deux sorties JSON.
6. Le scanner de confidentialité des retours arrière vient du SHA main du workflow ; l'ancien tag est seulement lu comme des données. Un tag de retour arrière doit désigner un ancêtre de main. Une exécution manuelle hors main ne peut pas publier.

Les contrôles des PR utilisent toujours des clés et données fictives. Le scanner `pull_request_target` lit le SHA exact de la PR sans l'exécuter, uniquement pour les PR internes visant main.

## Validation

`node tests/relay-trust.js` : code hostile de production, faux succès CI, date future, JSON malformé, grande entrée, métadonnées hostiles, liens de fichiers et de dossiers, publication limitée et mutation des workflows.

`node tests/relay-smoke.js` : observations, notifications, absence de doublons, télétravail, agenda chiffré, géocodage, séparation des clés et erreurs réseau privées.

Conserver les 49 suites unitaires, les six lots Chromium/WebKit, la validation agrégée, la confidentialité, le profilage et les QA existantes. Ne pas fusionner avant leurs résultats sur le head exact et la revue explicite du propriétaire.

## Limites et mise en service

- Une révision main dont la CI complète n'est pas encore terminée échoue **avant** l'accès aux secrets. Les données précédentes restent intactes ; un prochain cron reprend après validation. Prévoir ce délai lors de la première fusion et de chaque nouvelle modification de main. C'est un choix de confinement, pas une garantie de notifications pendant cette attente.
- Les données publiques d'observation et d'anti-doublon ne deviennent pas authentifiées par ce changement. Un écrivain de gh-pages peut encore les altérer, avec un impact sur disponibilité et fraîcheur ; il ne peut plus fournir du code au relais privilégié.
- Un administrateur capable de modifier main, les règles, les Environment ou les actions approuvées reste une frontière de confiance. Les paramètres administratifs non accessibles ne sont pas présumés sûrs.
- Les runners restent hébergés par GitHub ; aucune dépendance npm ou code d'une PR n'est installé dans le job avec secrets. Les actions restent épinglées au SHA complet existant.
- Aucun secret, Environment, domaine ou stockage utilisateur n'est modifié par cette PR. Aucun lancement de relais réel ni déploiement n'est effectué pendant cette préparation.

## Retour arrière

Avant fusion, fermer la PR suffit. Après une éventuelle fusion autorisée, préférer un correctif sur cette frontière ; rétablir l'ancien checkout gh-pages réintroduirait la faille critique. Si un incident impose une suspension, arrêter temporairement les deux workflows privilégiés sur accord du propriétaire, garder les JSON existants et laisser le client utiliser sa météo/cache. Réactiver après réparation et CI complète. Ne jamais réinitialiser gh-pages ni le coffre.
