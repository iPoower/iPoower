# 👋 iPoower

### Cloud · DevSecOps · Cybersecurity — learning by building

Je construis des projets concrets pour apprendre l’automatisation, la fiabilité et la sécurité des systèmes modernes.  
Mon objectif : transformer chaque notion apprise en quelque chose de **déployé, testé, observable et explicable**.

[![Race Control CI](https://github.com/iPoower/iPoower/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/iPoower/iPoower/actions/workflows/ci.yml)
[![GitHub Pages](https://img.shields.io/badge/Live-Race%20Control-2ea44f?logo=github)](https://ipoower.github.io/iPoower/race-control/)

## 🏎️ Projet phare — Tyre Weather Race Control

**Race Control** est une PWA personnelle d’aide à la décision avant et pendant un trajet. Elle croise météo, observations, température de chaussée estimée, pneus montés, agenda et itinéraire afin de produire un verdict de risque exploitable.

**→ [Ouvrir l’application](https://ipoower.github.io/iPoower/race-control/)**

| Domaine | Mise en pratique |
|---|---|
| **Frontend / PWA** | JavaScript, interface responsive, Service Worker, fonctionnement mobile |
| **Data & APIs** | météo multi-source, observations, routage, géolocalisation |
| **CI/CD** | GitHub Actions, build automatisé, déploiement contrôlé sur GitHub Pages |
| **Tests** | Playwright sur Chromium + WebKit, données et réseau simulés |
| **Sécurité** | données privées chiffrées, contrôle de secrets, séparation des frontières de confiance |
| **Fiabilité** | fallbacks, cache, versionnement de production et rollback |

### Ce que le projet m’apprend

- concevoir une chaîne **CI/CD** plutôt que publier manuellement ;
- raisonner en **least privilege**, frontières de confiance et réduction du blast radius ;
- écrire des tests reproductibles sans dépendre des données de production ;
- traiter les erreurs, fallbacks et dégradations comme des cas normaux d’exploitation ;
- documenter les choix techniques pour pouvoir les expliquer en entretien.

> Le dépôt est volontairement public : la sécurité ne doit pas dépendre du secret du code. Les données privées et secrets restent hors du code source ou chiffrés.

## 🎯 Focus actuel

**Cloud / DevOps :** Git, GitHub Actions, Linux, automatisation, CI/CD, observabilité, IAM.  
**Cybersécurité :** gestion des secrets, chiffrement, sécurité applicative, durcissement des pipelines.  
**À approfondir :** Docker, Infrastructure as Code, AWS, monitoring avancé et pratiques DevSecOps à plus grande échelle.

---

# Documentation technique — Race Control

- **Production** : https://ipoower.github.io/iPoower/race-control/ (branche `gh-pages`, dossier `race-control/`)
- **Relais** : `.github/workflows/race-control.yml` exécute `race-control/relay.js` (observations, agenda chiffré, notifications)

## Structure

| Dossier | Contenu |
|---|---|
| `src/` | Code source : `engine.js` (moteur partagé page + relais), `app.js` (interface), `demo.js`, `style.css`, `shell.html`, `sw.js`, `relay.js`, `widget.js`, `tiredb.json`, `static/` (icônes) |
| `tools/` | `build.js` (assemble `dist/`), `check-secrets.js` (garde-fou de confidentialité), `deploy-copy.js` (publication), `pre-commit` |
| `tests/` | Tests Playwright de bout en bout (horloge et réseau simulés) et harnais du relais (`relay-harness/`) |
| `encrypted/` | Réglages **déjà chiffrés** (AES-256-GCM, PBKDF2-SHA256 600 000 itérations) |

## Règles de confidentialité

- Jamais dans Git : code de déverrouillage, configuration du relais ou préréglage en clair, adresse iCal, coordonnées du domicile, captures d'écran.
- Ces éléments vivent dans `private/` (ignoré par Git) sur le poste de travail, ou dans les secrets GitHub (`APP_KEY`, `RC_KEY`, `GCAL_ICS`).
- `tools/check-secrets.js` compare chaque fichier aux valeurs privées (lues localement ou déchiffrées avec les secrets) et bloque le commit (`tools/pre-commit`) ou le build.

## Frontière des secrets

Les vrais secrets (`APP_KEY`, `RC_KEY`, `GCAL_ICS`, et `RC_KEY_NEXT` pendant une rotation) ne sont donnés qu'à du code **déjà fusionné dans `main`** :

| Workflow | Secrets | Quand |
|---|---|---|
| `ci.yml` · `confidentialite` | oui | push sur `main`, retour arrière lancé depuis `main` ; **jamais sur une pull request** |
| `ci.yml` · `tests`, `relay-smoke` | non | partout (données et clés fictives) |
| `pr-privacy.yml` | oui | chaque PR **de ce dépôt** : workflow et scanner de `main`, la PR est lue comme des fichiers et jamais exécutée ; jamais pour un fork |
| `race-control.yml` (relais) | oui | uniquement depuis `main` ; exécute le relais publié sur `gh-pages` |
| `sources-check.yml` | oui | uniquement depuis `main` |
| `rc-key-rotation.yml` (transitoire) | oui | lancé à la main depuis `main` ; la branche cible ne reçoit qu'un fichier chiffré, son code n'est jamais exécuté |

## Build

```sh
node tools/build.js
```

- Avec `private/` : les réglages sont rechiffrés dans `encrypted/` s'ils ont changé.
- Sans `private/` (clone public, GitHub Actions) : `encrypted/` est utilisé tel quel. Le résultat est identique, octet pour octet, à la production.

## Tests

```sh
npm ci
node tools/build.js
node tests/run-ci.js
BROWSER=webkit node tests/run-ci.js
```

- Moteur (verdicts, chaussée, verglas), widget, puis parcours navigateur avec horloge et réseau simulés : jours de trajet, timeline, lieux et mini-carte.
- Isolement réseau strict : les tests navigateur n'accèdent ni au vrai site ni au vrai agenda.
- Les tests utilisent des **clés et données fictives**.
- GitHub Actions lance la suite sur Chromium et WebKit à chaque modification.

## Déploiement

Chaque modification pertinente poussée sur `main` passe par la CI avant publication.

- Le build est publié dans `gh-pages/race-control/`.
- `obs.json` et `calendar.sealed.json`, écrits par le relais, ne sont pas écrasés par le déploiement.
- Les versions de production utilisent des tags `prod-N`.
- La version en ligne est vérifiée après publication.

## Retour arrière

Un ancien tag `prod-N` peut être redéployé via **Race Control · tests**.  
L'ancien code repasse les contrôles avant publication et les données fraîches du relais sont conservées.

## Dépendances

Dependabot propose les mises à jour des GitHub Actions et de Playwright sous forme de pull requests testées par la CI. Leaflet reste volontairement épinglé avec SRI.

---

<sub>Projet personnel en développement actif · priorité à la compréhension, aux tests et à la sécurité plutôt qu’à l’accumulation de fonctionnalités.</sub>
