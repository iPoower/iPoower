# Intégration ordonnée #40 → #41 — checkpoint du 6 octobre 2026

## #40 terminée

- Branche : `fix/global-user-context` ; HEAD validé `7ae941d9953ad7061772c66e54d860c26f263e9c`.
- CI complète PR : https://github.com/iPoower/iPoower/actions/runs/37457620598 — 90 exécutions vertes.
- Seul échec initial : assertion historique GPS obsolète dans `tests/test_geolocation.js`, corrigée sans changement produit ; 25 scénarios et 5 mutations validés avant la CI complète.
- Fusion main : `1d6109d8e4d81823cb6b7f328f93e0e141809cab`.
- CI/deploy : https://github.com/iPoower/iPoower/actions/runs/37458846046 — verts.
- Production : **prod-35**, build `82854ced8e89`, SW `twrc-static-v11`, SHA public identique au main.
- Contrôle production : https://github.com/iPoower/iPoower/actions/runs/37463191273 — Chromium/WebKit, desktop/iPhone 414×896 @3x, profils jetables.
- Cycle Maison → aller réel → arrivé travail → retour réel → arrivé maison : quatre vues cohérentes, reload, réouverture, zéro erreur JS.

## #41 fusionnée ; déploiement en cours

- Branche : `ui/weather-temperature-card-dark`.
- Mise à jour depuis main : `e89cd7b3ed6e11eff9c7053f9df4dc837da78cb6` ; aucun conflit dans `weather-view.js`.
- HEAD validé : `7c97dedd42cc683725e5481039b22f27d8040ad1` ; arbre `9800f402e4fa41ea0b1f70c422cd7ef4721a626f`.
- Tests ciblés : https://github.com/iPoower/iPoower/actions/runs/37463823086 — `e2e42-meteo.js` et `e2e39-layout.js`, deux moteurs verts.
- 72 cas : −5/0/8/15/25/35 °C × sans alerte/brouillard/vent × desktop/iPhone × Chromium/WebKit.
- Captures et styles identiques à la validation précédente ; contraste minimum valeur 5,1:1, textes secondaires 7,1:1.
- CI complète PR : https://github.com/iPoower/iPoower/actions/runs/37464324484 — 90 exécutions vertes, aucun saut inattendu.
- Diff final : seulement `src/style.css`, `src/app/weather-view.js`, `tests/e2e42-meteo.js`, `tests/lib/temperature-card.js`.
- Contexte #40 et logique météo/brouillard inchangés. Renderer byte-identique à main #40 après retrait de la seule décoration thermique.
- Fusion main : `7cae238751605e7022762bb7c693cb22102fac07` ; arbre identique au HEAD validé.
- CI/deploy main : https://github.com/iPoower/iPoower/actions/runs/37465553416 — EN COURS.
- Build attendu : `badbc423e8ae` ; vérification publique #41 PAS ENCORE ACQUISE.

## Prochaine action exacte

Attendre les six shards, la validation et le déploiement standard du run `37465553416`. En cas d'échec : classifier et arrêter, aucune autre intégration. Si vert : vérifier le SHA/version publics, puis déclencher le contrôle de production préparé sur `verify/production-integration` (workflow et script inclus dans ce checkpoint, `CHECK_DARK_CARD=1`). Il vérifie le document/SW réels, le cycle global et la carte sur 48 cas en profils jetables. Publier le verdict final et arrêter.

## À ne pas faire

Ne jamais fusionner/déployer les branches `verify/production-integration` et `verify/temperature-integration`. Elles ne servent qu'aux contrôles CI. Ne développer aucune fonctionnalité, ne toucher ni DATEX ni Live Road, ne changer aucun comportement pour masquer un test, ne forcer les clics, ne gonfler les délais. Ne modifier aucune des deux PR pour ajouter ce handoff.
