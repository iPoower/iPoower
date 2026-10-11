# Race Control — Mobile UX Precision

Référence contrôlée avant intervention : production **prod-92**, SHA `c06596d600c933a89f38424139879bb0bfdc9d62`, build `914cedb6c27b`. Le `version.json` servi correspond à cette version. Appareil prioritaire : iPhone 11 Pro Max, 414 × 896 points ; autres largeurs : 375 et 320 points ; PC : Chromium et WebKit.

## Audit et plan ciblé

| Surface | Encombrement constaté dans le rendu existant | Correction de présentation |
|---|---|---|
| En-tête | Titre haut, raisons de confiance et contexte répétés | Titre mobile plus compact ; raisons détaillées consultables, verdict et confiance toujours visibles |
| Météo | Chronologie, phénomènes et facteurs routiers ouverts successivement | Verdict et prochain trajet conservés ; prévisions et calcul du score repliables |
| Pneus | Pression, DOT et projections avant la recommandation ; voiture active peu repérable | Monte dans la synthèse, badge de voiture active, mesures et historique regroupés |
| Garage | Quatre cases techniques par véhicule, paragraphe d'architecture en tête | Compteur, monte et contrôles d'abord ; fiche pneumatique repliable ; véhicule actif placé en premier |
| Analyse | Fenêtre thermique, freinage, adhérence, aquaplaning et projection ouverts à la suite | Conclusion et confiance conservées ; modèle et projection à la demande ; pression basse toujours directement visible |
| Trajet | Formulaire sans résumé de l'itinéraire au-dessus | Résumé canonique du trajet avant le formulaire ; une commande « Modifier le trajet » |

Les blocs natifs `details/summary` reprennent la palette actuelle. Leurs états de déploiement restent uniquement en mémoire pendant la session. Aucune nouvelle préférence persistante, aucune migration ni modification d'algorithme. La répétition d'un rendu identique conserve les cartes Pneus et leurs commandes ; le focus des nouvelles sections est restauré lors d'une vraie actualisation.

## Périmètre conservé

Les cinq onglets et leurs commandes historiques, les six modules F1 optionnels, les deux fiches véhicule, les mesures et historiques, les règles météo/agenda/GPS/route, le coffre, les sauvegardes, le Service Worker et le relais restent présents. Aucun kilométrage, contrôle ou rendez-vous n'est inventé. Les heures et distances du résumé viennent du contexte et des trajets existants.

## Validation et captures

Les 46 suites unitaires ont réussi pendant le développement. La matrice complète, le build, le relais, la confidentialité, le profilage et la QA Agenda doivent réussir sur le SHA final avant fusion. Le nouveau scénario `e2e72-mobile-ux.js` contrôle les cinq onglets à 414, 375 et 320 points et sur PC : déploiements au toucher, focus, débordements fermés et ouverts, cibles tactiles, source véhicule inchangée, rechargement et consultation hors ligne.

Les régressions métier Météo, Analyse, usure, pression et Garage continuent à contrôler les mêmes données après déploiement des nouvelles sections. Aucun test n'est désactivé. Les captures du nouveau scénario sont publiées par l'artifact `place-qa` existant. Le profilage compare également les cinq premiers écrans avant/après sur des fixtures identiques ; les PNG sont encodés dans `visuals[].pngBase64` de son artifact JSON existant, pour éviter tout changement de workflow ou de permissions.

Les navigateurs ne peuvent pas être lancés dans l'environnement local utilisé pour cette intervention (restriction système sur les sockets). Les résultats de rendu et captures seront donc ceux des runners GitHub ; aucun résultat local de navigateur n'est revendiqué.

## Protections et limites

La lecture de la branche confirme `main` protégée avec les contrôles `unit`, `scan` et `validation`. Le ruleset actif de `gh-pages` interdit suppression et réécriture, sans bypass. La lecture administrative détaillée de `main/protection` renvoie 403 pour l'intégration : la liste administrative complète des exigences n'est pas affirmée. Aucun réglage de protection n'est modifié.

Une simulation WebKit n'est pas un essai sur iPhone physique. Face ID, clavier système, zones sûres réelles, veille/reprise et retour depuis Waze demandent une vérification sur l'appareil. La compréhension « en trois secondes » reste un objectif ergonomique à confirmer par l'utilisateur, pas une mesure de laboratoire.

Fusion et publication ne doivent être annoncées qu'après résultats GitHub confirmés et correspondance entre commit fusionné, métadonnées publiées et build HTTP servi.
