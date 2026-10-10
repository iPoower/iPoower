# Race Control — audit de stabilité du 10 octobre 2026

## État vérifié avant toute modification

- `main` : `d222601067f4bd009f164ae610a4c689363c1bee` (PR #95, documentation GREEN → MERGE déjà intégrée).
- Site public : `prod-77`, `cf000abbf8a60386f3757c48592b2dc02e9872e8`, build `74e68bcb505a`.
- SHA-256 du HTML public et du build de `main` : `57fcaf018e96c79ca28d9b2f476aece95950f421c2653413bd9adb32213ba69e`.
- La seule différence entre le commit publié et `main` est `AGENTS.md`. Le filtre `push.paths` de la CI ne déclenche pas de publication pour ce fichier : l'écart documentaire est attendu.
- Dernière CI applicative sur `main` : run `37965235555`, succès (unit, relais, confidentialité, 3 Chromium + 3 WebKit, validation, déploiement et vérification HTTP). Le job de rollback est sauté conformément à sa condition.
- Baseline locale : 41 suites unitaires réussies et build public réussi. Navigateurs locaux non installables (archive de téléchargement invalide) : aucune validation navigateur locale revendiquée.

## PR #86 à #95

| PR | État actuel et décision d'audit |
| --- | --- |
| #86 | Fermée sans fusion après audit. Préparation des protections reprise et renforcée par #91. Aucun besoin de rejouer ses modifications. |
| #87 | Fermée sans fusion après audit. Ses quatre fichiers corrigés sont identiques à `main`, après reprise par #91. Obsolète. |
| #88 | Fusionnée : coffre et profil générique. Ne pas réintroduire la branche. |
| #89 | Fusionnée : optimisations et profilage. Ne pas réintroduire la branche. |
| #90 | Brouillon de diagnostic fermé sans fusion après audit. Doublons de champs corrigés par #91, vérifiés plus strictement par `e2e67`; navigation/layout couverts aussi par `e2e49`, `e2e39` et `e2e65`. |
| #91 | Fusionnée : contrôles, adresses, incidents météo, confirmations et préparation des protections. |
| #92 | Fusionnée : origine par occurrence Agenda, routes, reconnectivité, sauvegardes. |
| #93 | Fermée sans fusion : doublon explicite de #92. Ne pas combiner ses modèles de persistance. |
| #94 | Fusionnée : distinction GPS / lieu météo dans PRUDENCE. |
| #95 | Fusionnée au SHA annoncé. Instructions appliquées, aucune correction à refaire. |

Les autres PR ouvertes sont des travaux de documentation/profil ou projets Python indépendants. Elles ne sont pas candidates à une fusion dans cette mission.

## Protections et workflows

`main.protected=true`; les contrôles publics requis sont `unit`, `scan`, `validation` (application GitHub Actions). `gh-pages.protected=true`; ruleset `24790055` actif, ciblant exactement `refs/heads/gh-pages`, sans bypass, interdit suppression et réécriture. La lecture administrative détaillée des protections classiques retourne HTTP 403 avec l'intégration : PR obligatoire, mode strict et approbations ne peuvent pas être certifiés par cet accès. Aucune protection n'est modifiée.

Les workflows de CI, confidentialité PR, profilage, QA d'origine, relais, watchdog, DATEX et contrôle des sources ont été lus. La validation agrégée refuse les échecs et rapports incomplets. Le déploiement exige les contrôles de production et vérifie le hash du HTML public. Les jobs de production non applicables à une PR et ceux de rollback restent soumis à leurs conditions existantes. Aucun workflow ni Service Worker n'est modifié.

## Anomalies reproduites et correction minimale

| Anomalie | Preuve sur le code initial | Correction |
| --- | --- | --- |
| Projection prématurée | 6,4 → 6,3 mm en 100 km : domaine `rate=null`, carte `rate≈1`. À kilométrage égal la carte calculait même `rate≈100`. | `treadHistory` commun, minimum historique de 1 000 km conservé. |
| Fraîcheur et profondeur du mauvais essieu | Avant 5 mm mesuré en février, arrière 7 mm en octobre : avant déclaré frais et carte affichant 7 mm. | Dernier relevé limité à l'essieu le plus usé, utilisé pour date et affichage. |
| Pente entre deux essieux | Deux essieux actuels à 6 mm, ancien AV 7 mm puis AR 6 mm à +2 000 km : faux taux 0,5. | Aucune tendance quand plusieurs essieux explicites sont mélangés sans essieu le plus usé identifié. |
| Anciennes valeurs textuelles | Relevés `km='20000'/'22000'`, `mm='7,0'/'6,0'` : taux `NaN` dans le domaine. | Nombres normalisés en lecture avant tri, différence et projection ; stockage inchangé. |

La tendance reste une estimation à partir des mesures de l'utilisateur. Les seuils de projection restent 3 mm en été/4 saisons et 4 mm en hiver. Aucune modification du chiffrement, de la persistance, des sauvegardes, des seuils météo, de la localisation ou du modèle de trajets. Aucun effacement ni migration.

## Tests de non-régression

- `test_wear_consistency.js` : huit scénarios, quatre mutations rejetées (distance trop courte, mauvaise fraîcheur, mélange d'essieux, chaînes non normalisées).
- `test_tyrestate.js` : 22 scénarios et huit mutations historiques maintenus.
- `e2e69-wear.js` : compteur et profondeur saisis via les vrais contrôles, PC/iPhone simulé, taux partagé, affichage, rechargement, coffre et hors ligne.
- CI complète, confidentialité PR, QA origine et profilage comparatif obligatoires au HEAD final avant fusion. Puis CI de production, déploiement, version sur `gh-pages` et HTML public exact.

Une simulation WebKit ne constitue pas un test d'iPhone physique. L'essai matériel de cette nouvelle version reste à effectuer après sa publication.
