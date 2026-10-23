# Portfolio case studies · Études de cas

> **Scope:** technical and educational projects. This page summarizes decisions and testable evidence from the public repositories. It is not a claim of production-scale traffic, a certification, real-world Google backup, or entirely unaided coding.

## 01 — Race Control: reliable decision-support PWA

**Problem.** A simple weather report does not account for the route, road-temperature estimates, installed tyres or rapidly changing mobile conditions. Mobile state and offline operation add failure modes.

**Engineering approach.**
- Separate raw weather evidence from estimates and tyre/route decisions; do not present inferred road conditions as measured facts.
- Maintain guarded context for location and active journey so screens do not disagree after refresh.
- Keep encrypted user configuration out of public source; use test fixtures with fictional locations and vehicles.
- Verify changes with GitHub Actions, unit tests and real browser engines (Chromium + WebKit). WebKit simulation is not a physical-device test.

**Trade-offs.** GPS accuracy and weather freshness can be uncertain. Prefer an explicit “unknown/preview” state to a falsely confident answer. Avoid assuming network availability.

**Evidence:** [Technical documentation](RACE_CONTROL_TECHNICAL.md) · [Global context design](global-user-context.md) · [Public CI history](https://github.com/iPoower/iPoower/actions).

**Current limits:** no guarantee of route or driving safety; user data protection and real-device behavior require continuous validation.

## 02 — Control Vault: no-loss encrypted synchronization

**Problem.** Two devices can edit the same data while one is offline. An upload may be interrupted or the client may close before receiving confirmation. Naïve “last write wins” risks silent loss.

**Engineering approach.**
- Encrypt before transport. Control Vault handles only opaque, validated packets; Race Control owns the encryption key and authenticated integration.
- Use immutable versions and explicit parent/revision metadata to avoid overwriting a prior copy.
- Persist an outgoing transfer job before upload; verify the remote bytes, not just an HTTP success response.
- Block ambiguous conflicts instead of silently merging or deleting history; prepare a recoverable local copy before importing.

**Trade-offs.** Strong recovery guarantees add complexity, more storage usage and occasionally require manual conflict decisions. An expired Google authorization may require user action.

**Evidence:** [Race Control integration PR #229](https://github.com/iPoower/iPoower/pull/229) · [Control Vault integration PR #14](https://github.com/iPoower/Control-Vault/pull/14) · [Synchronization guarantees](sync-guarantees.md) · [Drive runtime limitations](drive-runtime.md) · [Control Vault docs](https://github.com/iPoower/Control-Vault/tree/main/docs).

**Current limits:** integration code and simulated tests exist, but actual Google Drive activation, complete end-to-end recovery and a physical iPhone test are not verified by these references. Do not trust a demo as a backup of irreplaceable data.

## 03 — Reconversion Control: learning with traceable evidence

**Problem.** A list of tutorials is not an actionable learning plan. Progress counters can exaggerate real competence unless reading, practice, errors and independent demonstrations are separated.

**Engineering approach.**
- Build a modular learning PWA with guided courses, practical exercises, reviews and an explicit self-assessment trail.
- Keep user study progress local or explicitly exported; prevent private career records from entering public source.
- Preserve existing course IDs and learning records during updates; test cross-version data compatibility.
- Use automated browser checks for navigation and mobile UI, while distinguishing simulated exercises from real independent skill checks.

**Trade-offs.** Curriculum freshness requires ongoing verification; a completed exercise is evidence of practice, not equivalent to work experience or an external certification.

**Evidence:** [Source and README](https://github.com/iPoower/Reconversion-Control) · [Project docs](https://github.com/iPoower/Reconversion-Control/tree/main/docs) · [CI history](https://github.com/iPoower/Reconversion-Control/actions).

**Current limits:** educational tool and personal learning portfolio, not an accredited training provider or guaranteed career outcome.

---

## What these projects demonstrate — and what they do not

| Demonstrated in the repositories | Not established by GitHub activity alone |
| --- | --- |
| Requirement decomposition, use-case design and maintenance decisions | Expert knowledge of every underlying technology |
| CI pipelines and browser-level automated testing | That the real service or physical iPhone passed every test |
| Encryption and conflict-aware recovery *implementation* | A verified, activated Google backup for personal data |
| Structured learning and repeatable practice | Professional certifications or independent production experience |

**Development method:** AI agents assist with implementation and review; decisions, test criteria and explanations remain inspectable. The aim is to build independent technical understanding, not to hide tool usage.

**Last portfolio review:** 23 October 2026. Statuses can change; consult each repository's current README, PRs and release artifacts for the most recent evidence.
