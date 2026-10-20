# Twin Garage Live V1.4.1 — silhouettes illustrées

## Périmètre

Amélioration **purement visuelle** des SVG intégrés au Garage V1.4 :
- `sport` : profil compact Hyundai i20 N inspiré des proportions du modèle, pavillon bas, becquet arrière, optiques effilées, prises d'air et liseré de bas de caisse ;
- `touring` : profil Peugeot 308 première génération, pavillon plus arrondi, grande surface vitrée, capot et optiques plus doux, traitement discret des baguettes ;
- `generic` : gabarit générique conservé lorsque les données ne permettent pas d'identifier une silhouette.

Les véhicules sont des **interprétations graphiques**, pas des silhouettes industrielles exactes ni des photographies. Leur teinte reste illustrative, pilotée par les variables de thème existantes.

## Invariants techniques

- `garageCarSvg(kind, scene)` conserve la signature et le viewBox `264 × 100`. Les deux utilisations (fiche et scène de trajet) partagent exactement le même dessin.
- SVG en ligne uniquement : aucune ressource externe, requête, dépendance, événement, état ou persistance supplémentaire.
- Pas de modification de `Garage.overview`, des calculs pneumatiques, des diagnostics, de la météo, des garde-fous de confiance, du stockage ou de `renderAll()`.
- Le CSS est borné à `#secGarage`, utilise exclusivement les variables de palette existantes, et les détails du dessin sont **statiques**. L'animation existante reste gouvernée par son observateur, le choix utilisateur et `prefers-reduced-motion`.
- Pas de changement de workflow, coffre, sauvegarde/restauration, Service Worker, secrets, module externe ou branche de déploiement.

## Validation

L'extension de `test_garage.js` vérifie les silhouettes distinctes, les deux roues, le SVG autonome et groupé, l'absence d'images/ressources distantes et le fallback générique.

L'extension de `e2e71-garage.js` vérifie les profils dans les deux fiches et la scène. La suite existante couvre déjà les résolutions 320/375/414/1440 px, les modes clair/sombre, Chromium/WebKit, focus, pause, mouvement réduit, suspend/reprise, absence de débordement et conservation des données.

Les captures d'acceptation de la suite navigateur sont produites sur des **fixtures fictives** et doivent être comparées avec les captures V1.4 de `docs/twin-garage-v14/`. L'achèvement exige les contrôles obligatoires complets sur le **SHA final**, l'absence de revue bloquante et la vérification après fusion du SHA effectivement publié.

**Limites :** aucun essai déclaré sur iPhone physique ni mesure matérielle de consommation tant qu'ils n'ont pas été effectués. L'existence des tests n'atteste pas leur réussite avant résultats CI vérifiés.

## Retour arrière

Revert du seul commit de fusion après revue si besoin. Aucun format de données modifié, aucune migration ni restauration à conduire.
