# PR #44 — livraison thermique

## État sauvegardé (contrôle production en cours)

- PR #44 : fusionnée ; HEAD relu `1f325a96841e047d5da16ac8ad0fb0a275bc2245`.
- Main avant livraison : `292fbe56766598d9ec7bc59cd0be98aff0c91ddd`.
- Merge/main : `5bf3526dd82b7dbccf7ca97a0a40559ffe0873ff`.
- CI complète du HEAD initial : run `37513549724`, SUCCESS.
- CI complète main et déploiement standard : run `37519434718`, SUCCESS.
- Production effectivement servie : prod-38, build `42d6059fe39f`, SW `twrc-static-v11`.

## Revue et garde-fous

Diff initial limité à `src/tyrelab.js`, `tests/test_tyrelab.js`, `tests/e2e43-analyse.js`.
Niveau thermique et tendance distincts ; aucun capteur de gomme prétendu.
Sans historique : « Supposé ambiant ». Arrêt connu : « Au repos · ambiant ».
12 °C / route / 20 min : en chauffe sous la plage favorable.
12 °C / route / 60 min : stabilisé sous la plage favorable, plage estimée 24–41 °C.
18 °C / route / 20 min : en chauffe favorable selon le modèle inchangé.
Froid <7 °C / été : information prudente. Hiver, 4 saisons et UHP couverts.
Incertitude et coefficients inchangés ; 36 scénarios et 16 contre-tests verts.

## Anomalie réellement observée en production

Classification : PRODUCT REGRESSION, rendu mobile.
Run public `37521405020` : WebKit vert ; Chromium iPhone échoue au cas refroidissement,
bas du verdict à 922 px pour un viewport 414×896 @3x.
Le libellé secondaire marginal répète l'avertissement du verdict et provoque quatre lignes.
Le premier essai compact laisse encore 900 px dans WebKit avec police de secours.
L'explication scientifique complète est déjà conservée dans `thermal.why`.

## Correctif minimal séparé (pas encore livré)

- Branche : `fix/pr44-thermal-mobile-label`, issue du main fusionné ci-dessus.
- PR corrective : #46, Draft, diff limité à trois fichiers.
- HEAD sauvegardé : `7bec6b630f1df82b16771e4f4b65304d03a11ae0`.
- Une seule valeur de présentation modifiée : `hero.warm` marginal → « limite ».
- Tous les calculs, plages, tendances, niveaux et explications détaillées sont conservés.
- Régression ajoutée dans E2E43 : domicile confirmé par vrai tap, arrêt de 30 min,
  air 12 °C / route 13 °C / mémoire 45 °C, verdict complet avant 896 px, cibles et largeur.
- Assertions unitaires de prudence inchangées et renforcées pour le libellé marginal.
- Tests unitaires : 36/36 ; contre-tests : 16/16.
- Run ciblé Chromium/WebKit : `37523830814`, SUCCESS, 29/29 scénarios dans chaque moteur.
- Workflow ciblé temporaire retiré ; source applicative identique à la validation ciblée.
- CI standard complète sur le HEAD de #46 en cours : `37524203298`.
- Confidentialité PR : run `37524203286`, SUCCESS.
- Build applicatif attendu du correctif : `d70a17007dbf`.

## Prochaine action exacte

1. Attendre le résultat de la CI complète `37524203298`, conserver/classifier tout échec.
2. Si vert : relire l'état réel de #46 / main / reviews, Ready puis merge sur CI verte.
3. Attendre la CI complète et le déploiement standard du nouveau main.
4. Mettre les SHA/build attendus du probe sur la version effectivement publiée.
5. Exécuter `tests/production-thermal-smoke.js` depuis `verify/pr44-production` :
   public HTML/SW/assets, profils jetables, desktop/iPhone Chromium/WebKit,
   dix références thermiques par device, quatre vues, reload/réouverture,
   ouverture PWA hors ligne Chromium, zéro erreur JavaScript.
6. Enregistrer les preuves finales et arrêter.

## À ne pas faire

- Aucun déploiement manuel contournant la CI standard.
- Pas de coefficient réduit, de verdict favorable forcé, de timeout augmenté,
  de force/skip/reload pour cacher un problème.
- Les quatre anciens textes Analyse sont reportés : zone partagée avec day-context.
- « Bien arrivé → historique thermique » reste reporté après day-context.
- Ne pas reprendre le développement day-context pendant cette livraison.
  PR #45 reste Draft à `9a1da9e311436ff2bb8638d5bace44babbc5fbdc` ;
  son travail supplémentaire est sauvegardé séparément dans
  `verify/day-context-ci-9a1da9e` à `a3f354da7368870592fbf1ccd1f6e0603da88462`.
- Aucun lieu, compte, agenda ou GPS personnel n'est utilisé par les probes ;
  toutes les fixtures et captures sont fictives.
