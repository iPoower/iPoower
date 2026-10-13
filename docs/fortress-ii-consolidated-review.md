# Forteresse II — Dossier de revue consolidé

> **Brouillon technique — tests et documentation exclusivement.**
> Cette PR réunit les travaux des PR #134 à #139. Elle n'autorise **aucune fusion**, aucun déploiement, aucune migration, aucune lecture du coffre personnel, aucun domaine ni DNS.

## Décision attendue

**GO pour examiner le laboratoire consolidé, seulement lorsque TOUS les contrôles du nouveau commit sont verts. NO GO pour une migration réelle.**

La proposition rassemble **8 scripts de test** et **6 rapports spécialisés**, avec **un seul workflow GitHub Actions** `fortress-ii-consolidated.yml` déclenché exclusivement pour les PR vers `main`. Les **six anciens workflows** ne sont pas inclus : ils auraient refait les mêmes installations Chromium/WebKit et compliqué les validations. Les anciens rapports/tests sont recopiés **à l'octet identique**, à partir de leurs branches déjà vérifiées, sans changer `src/`, `tools/`, `gh-pages`, le relais ou la configuration de Race Control.

## Parcours des preuves

| Phase | Ancienne PR | Fichiers de référence | Limites qui subsistent |
|---|---|---|---|
| 1 — Origine / inventaire | [#134](https://github.com/iPoower/iPoower/pull/134) | [Préparation](fortress-ii-origin-preparation.md) | Inventaire statique ≠ inventaire Safari |
| 2 — Prévol / offline | [#135](https://github.com/iPoower/iPoower/pull/135) | [Règles de refus](fortress-ii-dryrun-acceptance.md) | Cache en VM ; aucune garantie d'hébergement |
| 3 — Isolation/rollback WebKit/Chromium | [#136](https://github.com/iPoower/iPoower/pull/136) | [Deux origines fictives](fortress-ii-browser-rollback.md) | Transaction IDB seule, sans atomicité inter-stockages |
| 4 — Reprise après interruption | [#137](https://github.com/iPoower/iPoower/pull/137) | [Reprise multi-stockages](fortress-ii-recovery-lab.md) | Coupure et quota réels iOS non éprouvés |
| 5 — Vraie app compilée, Backup V2 | [#138](https://github.com/iPoower/iPoower/pull/138) | [Copies de l'application](fortress-ii-app-copy-lab.md) | Backup V2 ignore encore les observations humaines |
| 6 — Export synthétique étendu | [#139](https://github.com/iPoower/iPoower/pull/139) | [Laboratoire exhaustif fictif](fortress-ii-exhaustive-lab.md) | Code de test injecté par Playwright, **non déployable** |

## Règles de couverture et conservation

- Les observations humaines `twrc.reports.v1` et `twrc.shadow.v1` sont **omis par le vrai Backup V2**. Seul le laboratoire de la phase 6 montre leur préservation au cours d'un transfert fictif.
- `twrc.weather.incidents.v1` représente des diagnostics météo bornés ; son exclusion n'est permise par le test que si son schéma connu est respecté. `twrc.trend` reste un arbitrage ouvert lorsque non vide.
- Le coffrage AES-GCM du test a un AAD source/destination/version, mais **ne constitue pas un importeur de production**. Il faut prévoir un manifeste exhaustif, un inventaire de toutes les clés, des stratégies de résolution des conflits et un protocole de reprise chiffré.
- Le Service Worker du futur domaine et ses miroirs `obs.json`, `calendar.sealed.json`, `version.json` et DATEX ne sont pas vérifiés en HTTPS externe.
- Aucun résultat Playwright/Linux n'équivaut à un essai réel sur Safari/iPhone 11 Pro Max installé en PWA.

## Politique CI et sécurité

- **Événement `pull_request` uniquement** ; aucun `push`/cron/`workflow_dispatch`, aucune permission GitHub d'écriture, aucun token applicatif ou secret.
- Exécution Node : inventaire statique, scénario coffre/SW fictif, prévol strict, cache offline fictif.
- Matrice Chromium/WebKit : isolement entre deux ports loopback, interruptions/reprises IndexedDB, puis deux copies réelles **construites exclusivement avec les fixtures de test** via `tests/ci/workspace.prepare()`. Les scripts d'intégration empêchent les accès réseau des navigateurs hors loopback.
- Les installations `npm ci` et Playwright téléchargent des dépendances publiques en CI ; **seuls les scénarios navigateur** sont sans trafic externe.
- Les tests historiques passent également par la matrice générale Race Control existante. Ne pas déclarer « tout vert » tant que cette dernière, le calendrier, la météo, le profilage et la confidentialité n'ont pas tous conclu sur **le SHA consolidé**.

## Processus de fusion (interdit dans cette mission)

1. Terminer la revue exhaustive du diff consolidé et les contrôles du SHA exact.
2. Faire confirmer séparément l'acceptation de la **fusion de tests/documentation uniquement** et du risque éventuel de déploiement de GitHub Pages qu'un commit `main` peut induire, même sans modifications de `src/`.
3. Ne pas traiter cette fusion comme autorisation de migration. Pour migrer un jour, il faudra une nouvelle revue du code applicatif de migration, un profil de test iPhone physique, une cible HTTPS isolée et une procédure de restauration intégrale et retour arrière.

**Statut visé : PR en Draft ; ancien `main` et production inchangés.**
