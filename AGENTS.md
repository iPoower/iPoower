# JARVIS — Race Control · GREEN → MERGE

These instructions apply to coding agents working in **iPoower/iPoower (Race Control)**. Do not extend this authority to other repositories or unrelated pull requests.

## Standing instruction from the owner — 9 October 2026

**When a Race Control PR assigned to JARVIS is genuinely all green, merge it immediately without asking for another « go ».** The instruction authorizes the *merge of a proven, ordinary change*; it does not waive required checks, privacy rules, sensitive review, or production safeguards.

## Before any merge — required evidence

- Confirm that the PR is open, ready for review (not draft/WIP), targets `main`, is mergeable and has no unresolved blocking reviews or interference from another agent. Re-read the target branch and current PR head immediately before merging.
- Verify **the exact current head SHA**, not an older revision, has **completed, successful** mandatory GitHub workflows: unit/build and relay smoke; the complete Race Control browser matrix (**3 Chromium + 3 WebKit**); final aggregated CI validation; pull-request privacy scan; any configured profiling, domain-specific QA and regression checks. Respect all GitHub branch rulesets, review requirements and any additional gate introduced later.
- A failed, pending, cancelled, timed-out or missing required check means **STOP**. Re-run an infrastructure-only failure (e.g. Playwright installation) when safe; investigate a functional failure and retest, never ignore it.
- Assess consequences for GPS/position, Google Calendar, route planning, weather, tyres, encrypted storage/backups, offline PWA and other apps sharing `ipoower.github.io`. Do not create another source of truth or lose user choices.
- **Security- or data-sensitive work requires explicit owner review even when tests are green**: authentication, vault/cryptography, secrets, authorization, data deletion/migration/import/export, sensitive persistent storage, Service Workers/cross-origin cache, permissions, CI/ruleset enforcement or deployment protections. Do not merge such changes based solely on this standing instruction.
- For an eligible ordinary PR, **merge directly via the GitHub PR action** (prefer squash) with `expected_head_sha`. If the head, target branch or checks change, stop and inspect before retrying. Never push directly/force to protected `main` or `gh-pages`.

## After merge — no premature « terminé »

- Check the merge commit is really on `main`.
- Require post-merge CI, privacy gates, all browser shards and successful authorized automated GitHub Pages deployment.
- Verify `gh-pages/race-control/version.json` names the exact merged SHA/run **and** the live website serves that build. A successful GitHub merge alone does not prove a production release.
- Report separately: **PR merged**, **post-merge CI successful**, **prod published**, **live verified**, **physical iPhone tested**. Never claim real-device testing from a WebKit simulation.
- Preserve all user data, independent projects and other agents' active work. Stop and report blockers; don't invent a green result.

**Rule: GREEN → MERGE; MERGE → TEST → DEPLOY → VERIFY.**
