# FORTRESS 13 — current application recovery proof

Date: 2026-10-28. Baseline: `0f96b8fa70880d491f8fa820f303d0585f2e2bda`, PR #261. No merge or production deployment is authorized.

## Diagnosis

Run 40645183636 used an unconditional `#unlockPw` wait after exporting. Export can activate the cumulative journal and reload the document. SessionVault then resumes a valid session; that document must not display the initial password form. Current `settleApp` checks the authenticated vault and application state instead of forcing another navigation.

Run 40647488426 on the baseline advanced past that issue. WebKit reports `JSON.parse(undefined)` at the destination export assertion. The default settings in S had never been persisted on the destination, so the assertion expected data absent from its source. Chromium also exposed a rejected navigation promise during cleanup, masking the earlier assertion. The test now saves an explicit synthetic destination choice, waits for every download/navigation promise immediately, independently decrypts the actual saved file, and compares all destination settings to the persisted source.

The old assertion that Backup V2 cannot include human weather observations was misleading: it invoked `Backup.make` without its existing `weather` argument. Current production code supports `durable.weather`, and UI export uses the fuller SessionVault V2/V3 format. The tests now check both the complete weather projection and the limitation of a caller omitting it. Valid synthetic observations remain present through the actual UI export/import; both are checked after restoration. The independent codec loads the real JournalArchive and SessionVault sources for V3 compatibility.

The exhaustive LAB prelude is aligned with the same verified UI flow. Its closed key registry now preserves the cumulative archive and edit stamps, rather than rejecting legitimate current keys. Future unknown keys still reject export. Its additional F2X envelope remains a TEST-ONLY fixture and is not an application cloud backup or a migration tool.

## Scope and evidence

Only test files and this explanation change. No production storage, crypto, timeout, retry, workflow, dependency, OAuth permission or deployment code changes. Syntax and diff checks pass locally. Browser binaries cannot be installed in this workspace (invalid/truncated download); both browser jobs and the complete required CI must finish on the new exact commit before any success claim. Existing unrelated successful runs do not validate the new commit.

Real Google OAuth from the final served application, cloud round trip, physical iPhone and production-compatible rollback remain separate required gates. A green LAB or connector-only Drive experiment does not satisfy them.
