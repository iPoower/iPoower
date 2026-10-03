# Tyre Weather Race Control

Application web personnelle : avant chaque trajet (domicile-travail ou agenda), elle croise météo, observations, température de chaussée estimée, pneus montés et itinéraire pour donner un verdict de GO à NO GO.

- **Production** : https://ipoower.github.io/iPoower/race-control/ (branche `gh-pages`, dossier `race-control/`)
- **Relais** : `.github/workflows/race-control.yml` exécute `race-control/relay.js` (observations, agenda chiffré, notifications)

## Structure

| Dossier | Contenu |
|---|---|
| `src/` | Code source : `engine.js` (moteur partagé page + relais), `app.js` (interface), `demo.js`, `style.css`, `shell.html`, `sw.js`, `relay.js`, `widget.js`, `tiredb.json`, `static/` (icônes) |
| `tools/` | `build.js` (assemble `dist/`), `check-secrets.js` (garde-fou de confidentialité), `check-keys.js` (séparation des clés), `keys.js` (chiffrement partagé), `deploy-copy.js` (publication), `pre-commit` |
| `tests/` | Tests Playwright de bout en bout (horloge et réseau simulés) et harnais du relais (`relay-harness/`) |
| `encrypted/` | Réglages **déjà chiffrés** (AES-256-GCM, PBKDF2-SHA256 600 000 itérations) |

## Règles de confidentialité

- Jamais dans Git : code de déverrouillage, configuration du relais ou préréglage en clair, adresse iCal, coordonnées du domicile, captures d'écran.
- Ces éléments vivent dans `private/` (ignoré par Git) sur le poste de travail, ou dans les secrets GitHub (`APP_KEY`, `RC_KEY`, `GCAL_ICS`).
- **Deux clés indépendantes, sans repli de l'une sur l'autre** :

  | Clé | Local | Ouvre | Utilisée par |
  |---|---|---|---|
  | `APP_KEY` (code de déverrouillage) | `private/.passphrase` | préréglage de l'app, agenda chiffré | l'app (code saisi), le relais (chiffre l'agenda) |
  | `RC_KEY` (clé du relais) | `private/.rc_key` | configuration du relais uniquement | le relais |

  Le relais refuse toute clé de relais égale à `APP_KEY`, même si elle ouvrirait la configuration.
  Une fuite de `RC_KEY` n'ouvre ni l'app ni l'agenda. `tools/check-keys.js` vérifie, sans rien afficher, que chaque clé n'ouvre que ses fichiers (CI : job `confidentialite` ; en ligne : « contrôle des sources » lancé à la main).
- `tools/check-secrets.js` compare chaque fichier aux valeurs privées (lues localement ou déchiffrées avec les secrets) et bloque le commit (`tools/pre-commit`) ou le build.

## Frontière des secrets

Les vrais secrets (`APP_KEY`, `RC_KEY`, `GCAL_ICS`) vivent **uniquement dans l'Environment GitHub `production`**, dont la règle
« branches autorisées : `main` » est appliquée par GitHub lui-même (une branche qui modifierait un workflow ne peut pas y entrer).
Les jobs l'utilisent avec `deployment: false` (aucune entrée de déploiement créée). Ils ne sont donnés qu'à du code **déjà fusionné dans `main`** :

| Workflow | Secrets | Quand |
|---|---|---|
| `ci.yml` · `confidentialite` | oui | push sur `main`, retour arrière lancé depuis `main` ; **jamais sur une pull request** |
| `ci.yml` · `tests`, `relay-smoke` | non | partout (données et clés fictives) |
| `pr-privacy.yml` | oui | chaque PR **de ce dépôt** : workflow et scanner de `main`, la PR est lue comme des fichiers et jamais exécutée ; jamais pour un fork (sinon le rouge/vert servirait à deviner une valeur) |
| `env-boundary-proof.yml` | non | branche `preuve/…` poussée à la demande : démontre qu'une branche ne peut ni entrer dans `production` ni lire un secret |
| `race-control.yml` (relais) | oui | uniquement depuis `main` ; exécute le relais publié sur `gh-pages` |
| `sources-check.yml` | oui | uniquement depuis `main` |

## Rotation de `RC_KEY`

Effectuée le 2 octobre 2026 sans coupure du relais (PR #8 et #9) : nouvelle clé générée par le propriétaire, jamais vue hors de GitHub ;
config du relais rechiffrée par un workflow de confiance exécuté depuis `main` ; double lecture temporaire `RC_KEY` / `RC_KEY_NEXT`,
puis bascule et suppression de tout le code transitoire. Pour une future rotation, ce mécanisme est à restaurer depuis l'historique Git.

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
node tests/run-ci.js              # Chromium
BROWSER=webkit node tests/run-ci.js   # WebKit (moteur de Safari), profil iPhone
```

- Moteur (verdicts, chaussée, verglas), widget, puis parcours navigateur avec horloge et réseau simulés : jours de trajet, timeline (avant départ, en cours, après arrivée), lieux, mini-carte.
- Isolement réseau strict : proxy inexistant, service workers bloqués, refus par défaut. Aucun test ne peut joindre le vrai site ni le vrai agenda.
- Les tests n'utilisent **aucun secret ni donnée réelle** : préréglage, configuration du relais, agenda, géographie et clé sont fictifs (`tests/fixtures/`, `tests/relay-harness/mock_tt.js`, clé publique `race-control-ci-test-only`). L'agenda de test est produit par le vrai relais.
- Les vrais secrets ne servent qu'au job `confidentialite` : vérifier qu'aucune donnée réelle n'est publiée, sans navigateur ni build de l'app.
- GitHub Actions (`ci.yml`) lance la suite sur Chromium et WebKit à chaque modification. Les journaux publics ne contiennent que les verdicts, jamais la sortie brute.

## Déploiement (automatique)

Chaque modification poussée sur `main` passe par `ci.yml` : `confidentialite` → `tests (chromium)` + `tests (webkit)` → `deploy`.

- `deploy` ne s'exécute **que si les trois sont verts**. Il construit l'app depuis `encrypted/` (aucun secret), copie le build dans `gh-pages/race-control/` avec `tools/deploy-copy.js`, puis vérifie que la version servie par GitHub Pages est bien celle construite.
- Les fichiers du relais (`obs.json`, `calendar.sealed.json`) ne sont jamais touchés. La base pneus n'est remplacée que par une version plus récente.
- Chaque mise en production reçoit une étiquette `prod-N`, qui sert de point de retour arrière, et un `version.json` affiché dans Réglages → Version.
- Plus aucune publication manuelle sur `gh-pages` : tout passe par `main` et la CI.

## Retour arrière

Actions → **Race Control · tests** → **Run workflow** → `version` = `prod-N` (par exemple `prod-7`).

- L'étiquette est vérifiée, puis l'ancien code repasse **les mêmes contrôles** (confidentialité, Chromium, WebKit) avant d'être redéployé.
- Ce n'est jamais un reset de `gh-pages` : seuls les fichiers de l'app sont remplacés, les données fraîches du relais (`obs.json`, agenda) sont conservées.
- Réglages → Version affiche alors « prod-N · retour arrière ». Pour revenir à la dernière version, relancer avec l'étiquette la plus récente.

## Mises à jour des dépendances

Dependabot (`.github/dependabot.yml`) propose chaque samedi les mises à jour des actions GitHub et de Playwright sous forme de pull request, testées par la CI. Leaflet reste manuel : son empreinte SRI est fixée dans l'app.
