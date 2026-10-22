# Origine dédiée Race Control — Cloudflare Pages (préparation, inactive)

Statut : code prêt, **publication inactive** tant que la variable `CLOUDFLARE_RC_PROJECT`
n'existe pas. Revue sensible obligatoire (workflow, Service Worker, build). Complète
`fortress-origin-plan.md`, `fortress-ii-origin-preparation.md` et `origin-corp-preparation.md`.

## Ce qui est prêt

- `tools/build.js` : avec `RC_DATA_BASE`, la CSP `connect-src` et le Service Worker
  reçoivent l'unique base de données externe autorisée. Sans elle, `sw.js` reste
  octet pour octet identique à la source (hébergement historique inchangé).
- `src/sw.js` : sur l'origine dédiée, seuls `obs.json`, `calendar.sealed.json`
  (chiffré) et `road-datex.json`, directement sous la base, sont gardés hors ligne.
  Aucune réponse opaque, aucun sous-chemin, aucune URL à coordonnées.
- `.github/workflows/ci.yml`, job `deploy-cloudflare` : après la publication gh-pages
  vérifiée du **même** commit, build dédié, `version.json` (run, sha, build), envoi
  direct `wrangler@4.137.0` (aucune connexion Git), puis contrôle **en ligne** :
  commit servi, octets de `index.html`/`sw.js`/manifest identiques au build,
  en-têtes CSP (`frame-ancestors 'none'`), XFO, nosniff, Referrer, HSTS, COOP, CORP,
  `geolocation=(self)` sur trois chemins, absence de cookie, CORS des données gh-pages.

Les données du relais restent publiées sur gh-pages : aucun secret ni relais déplacé,
aucune redirection de l'ancienne PWA, aucune donnée migrée.

## Action minimale du propriétaire (aucun secret dans le chat)

1. Cloudflare → *My Profile → API Tokens → Create Token → Custom* : permission
   **Account › Cloudflare Pages › Edit** uniquement, ressource : ton compte.
2. GitHub `iPoower/iPoower` → *Settings → Environments → production* : secrets
   `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`, *Deployment branches* = `main`.
   **Ne jamais cocher « Required reviewers » sur `production`** : le relais, le watchdog
   et la confidentialité l'utilisent sans intervention (incident du 22/10 : relais arrêté
   environ 25 minutes). La publication est automatique après CI verte, comme gh-pages.
3. *Settings → Secrets and variables → Actions → Variables* : `CLOUDFLARE_RC_PROJECT` =
   nom libre et exclusif, par exemple `race-control-<suffixe>` (adresse
   `https://<nom>.pages.dev`). Ne pas créer le projet « Connect to Git ».
4. Même chose dans `iPoower/Control-Vault` avec sa variable `CLOUDFLARE_PROJECT`
   (déjà prévue par son pipeline) et un nom distinct.

Au déploiement suivant de `main`, le job publie puis vérifie lui-même ce qui est servi. Un nom de projet n'est utilisé que par une application.

## Preuves

`tests/test_origin_build.js` (base injectée une seule fois, SW identique sans base,
CSP < 2000 caractères, en-têtes complets, bases invalides refusées, invariants du job)
et `tests/e2e84-sw-data-origin.js` (Chromium, vrai SW sur deux origines locales :
mise en cache canonique, 503, hors ligne, réponse opaque, CORS refusé, fraîcheur).

## Encore à prouver après activation

Isolation des stockages/sessions/caches entre les deux hôtes réels (test navigateur
sur les vraies URL) ; météo, agenda, cartes, relais et hors ligne sur l'origine
servie ; migration chiffrée depuis l'ancienne PWA conservée ; revue CSP/COOP du
futur parcours Google (GIS/Picker peuvent exiger `same-origin-allow-popups` et
de nouvelles sources : PR sensible distincte) ; iPhone physique.

## Retour arrière

Supprimer la variable `CLOUDFLARE_RC_PROJECT` désactive le job sans toucher gh-pages.
Le projet Cloudflare peut rester ou être supprimé par le propriétaire ; aucune donnée
utilisateur n'y est stockée côté serveur. Revert du code : SW et build reviennent à
l'identique de l'hébergement historique.
