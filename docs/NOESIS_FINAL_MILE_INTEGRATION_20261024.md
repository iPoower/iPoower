> Archive de validation historique : ce document décrit les PR temporaires #239/#20, qui restent exclues de fusion et de publication. Il ne définit pas la branche TEST actuelle ; voir DRIVE_REAL_TEST_20261025.md. Aucune archive n’est supprimée.

# NOESIS Final Mile — integration fixture only

This branch is a disposable review and CI target, not a production candidate.
It combines #234 (ancestor of #235), #235, #236, #237 and #238 without modifying any source branch.

The #236/#237 merge had conflicts in `tests/ci/suites.js` and `tests/test_ci_lanes.js`.
Resolution preserves both test additions, 138 unique suites and 201 applicable executions
across one unit lane and Chromium/WebKit. No test is disabled, removed or weakened.
The exact candidate head and GitHub CI conclusions must be recorded after execution.

V1/A1/A2 contracts are unchanged. Manual V2 restoration is not autonomous A2 recovery.
Google API traffic in these suites is simulated. No real Google test, physical iPhone,
merge, deployment, administrative setting or personal activation is authorized here.

Rollback of this validation: leave the branch unused. No data or main branch was changed.
Sensitive source PRs still require individual human approval and post-integration validation.

The validation branch also includes the isolated #240 lifecycle correction. Native IDB
regressions exercise a real transaction abort, manual connection close/reopen, the
versionchange handler and WebCrypto recovery-byte verification inside e2e85.
## Complément de validation — 25 octobre 2026

La combinaison de test inclut désormais le candidat de récupération initiale
A2 de la PR #242 (c87196eb3349c6cafe47179fd6683bc0c1ce09e0), en conservant
#234–#238 et #240 ainsi que toutes les preuves IDB natives. Le conflit d'ajouts
dans e2e85 est réconcilié en gardant le scénario IDB natif ET la récupération
A2, la vraie page construite, la relecture après fermeture et les deux sens.

Cette branche reste une preuve de CI uniquement : NE PAS FUSIONNER NI DÉPLOYER.
La tête historique 739904256b7f72090dd477fe7c372bd5786c2da5 reste dans ses
ancêtres, et aucune PR source n'est réécrite. Vérifier la nouvelle CI sur son
propre SHA. Google reste simulé ; aucune recette physique ni donnée personnelle.

