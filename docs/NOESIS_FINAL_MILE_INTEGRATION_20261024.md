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
