# Bryan

**Cloud · DevSecOps · Cybersecurity — learning by building, securing and testing real applications.**

🇫🇷 En reconversion vers les métiers du Cloud et de la cybersécurité, je transforme mon apprentissage en **projets concrets et vérifiables** : applications web, automatisation, CI/CD, tests navigateurs, confidentialité et résilience.

🇬🇧 Transitioning into Cloud and DevSecOps through **hands-on, evidence-driven projects**. My focus: secure engineering, test automation, reproducible delivery and clear documentation.

[LinkedIn](https://www.linkedin.com/in/bryan-fiarda-0x3/) · [Case studies / Études de cas](docs/PORTFOLIO_CASE_STUDIES.md) · [Race Control — technical documentation](docs/RACE_CONTROL_TECHNICAL.md)

---

## 🚀 Featured projects · Projets principaux

### 🏎️ Race Control — weather, journeys & tyre intelligence

**A mobile-first PWA for real-world driving decisions.** Combines weather, estimated road conditions, route context and vehicle/tyre data. Designed to work across desktop and mobile, including offline behavior.

- **Engineering:** JavaScript, Web APIs, GPS, Progressive Web App, Web Crypto, Cloudflare, GitHub Actions and Playwright (Chromium / WebKit).
- **Reliability:** guarded data changes, regression tests, privacy checks and version-verified releases.
- **Current work:** encrypted backup/sync integration. Code and simulated tests exist; **real Google Drive activation and physical iPhone validation must not be assumed**.

**[Application](https://race-control-ipoower.pages.dev/) · [Source / this repository](https://github.com/iPoower/iPoower) · [Technical architecture](docs/RACE_CONTROL_TECHNICAL.md) · [CI runs](https://github.com/iPoower/iPoower/actions)**

### 🔐 Control Vault — encrypted backup & recovery

**A security-oriented PWA exploring reliable data backup and restoration.** Models encrypted packages, immutable revisions, interrupted uploads and conflict-safe recovery.

- **Engineering:** TypeScript, Web Crypto (AES-GCM), IndexedDB, Google Drive integration code, automated unit and browser tests.
- **Security focus:** no plaintext secrets in Git, encryption before transport, explicit errors and recoverable revisions.
- **Current status:** **demonstration / staged integration**. Real Google synchronization and end-to-end recovery on a physical iPhone are **not yet proven**.

**[Demo interface](https://control-vault-ipoower.pages.dev/) · [Source](https://github.com/iPoower/Control-Vault) · [Security documentation](https://github.com/iPoower/Control-Vault/blob/main/SECURITY.md) · [CI runs](https://github.com/iPoower/Control-Vault/actions)**

### 🎓 Reconversion Control — practical IT learning cockpit

**An independent learning PWA for Cloud, Cybersecurity and DevSecOps.** Connects guided lessons, practical labs, review sessions and progress tracking.

- **Engineering:** JavaScript, structured content, PWA/offline behavior, accessible UI and automated checks.
- **Learning design:** separated practice, self-assessment and recorded evidence; progress is **not** a professional certification.
- **Current status:** an evolving learning tool with documented curriculum and test coverage.

**[Application](https://ipoower.github.io/Reconversion-Control/) · [Source](https://github.com/iPoower/Reconversion-Control) · [Project documentation](https://github.com/iPoower/Reconversion-Control#readme)**

---

## 🧪 Engineering approach · Ma méthode

| Principle | How I put it into practice |
| :-- | :-- |
| **Test before release** | Automated checks, Chromium/WebKit test scenarios, reproducible builds and release verification |
| **Privacy by design** | Synthetic fixtures, encrypted local data, scoped permissions and no credentials in public repositories |
| **Preserve user data** | Offline-first behavior, immutable backup revisions, explicit conflicts and restoration planning |
| **Document what is proven** | Distinguish code written, tests passing, PR merged, production published and real-device validation |
| **Learn transparently** | AI-assisted development with human requirements, review, testing and documented limits |

**Hands-on:** JavaScript · TypeScript · Git & GitHub · GitHub Actions · Playwright · PWA / Service Workers · Web Crypto · browser storage · Cloudflare.

**Currently learning:** Linux · networking · AWS & cloud fundamentals · IAM · containerization · DevSecOps · security architecture.

*AI-assisted engineering is part of my workflow. The repositories document how features are specified, tested and reviewed; they are not presented as proof that every line was written unaided.*

## 🔎 Technical evidence · Preuves consultables

- **[Three project case studies](docs/PORTFOLIO_CASE_STUDIES.md):** problem → engineering decisions → tests → limitations.
- **[Race Control integration work](https://github.com/iPoower/iPoower/pull/229):** encrypted synchronization design, interruptions and no-loss verification.
- **[Control Vault integration work](https://github.com/iPoower/Control-Vault/pull/14):** opaque transfer, immutability and explicit activation requirements.
- **[Race Control architecture and safety model](docs/RACE_CONTROL_TECHNICAL.md):** implementation notes and privacy safeguards.

## 🎯 Career direction · Objectif professionnel

Building a foundation for **Cloud / DevSecOps / Cloud Security**, with a long-term interest in secure cloud architecture. I value engineering roles centered on systems, reliability and technical problem-solving.

**Contact / Échanger : [LinkedIn](https://www.linkedin.com/in/bryan-fiarda-0x3/)**

<sub>These are independent learning projects. Demo screens, simulated tests and production integrations are deliberately distinguished; no private customer, vehicle or location data is published in this profile.</sub>
