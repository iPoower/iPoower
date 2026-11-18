# Intelligence pneumatique V2 — analyse du lot B (verdict du moteur), sans modification

Statut : **analyse seulement**. Aucune ligne de `src/engine.js` n'est modifiée et aucune alerte n'est déclassée dans la PR des
lots A, C et D. `src/engine.js` est un chemin sensible (relu par le propriétaire) et il est chargé par le relais : toute
modification change aussi les notifications.

## Ce que fait le moteur aujourd'hui (`main` = `98065b5`)

| Ligne | Règle | Problème |
|---|---|---|
| `engine.js:264` | `SUMMER_COLD` : malus « pneus été et froid » de 70 points (−3 °C) à 0 (12 °C), interpolé | courbe générique de catégorie, non liée au modèle |
| `engine.js:266-268` | `perfFactor` : ×1,07 pour un pneu été en Y ou Z, ×1,04 en W | l'indice de vitesse aggrave le malus froid : même inférence que celle retirée du simulateur par le lot A |
| `engine.js:302` | malus froid ×1,25 sur chaussée mouillée, ×0,75 sur sec | majoration « pneu été + froid + mouillé » non documentée par des essais |
| `engine.js:314` | 4 saisons sous 7 °C : 3 points | seuil fixe de 7 °C, effet faible |
| `engine.js:750` | alerte « < 5 °C avec pneus été » au niveau PRUDENCE | déclenchée par la seule catégorie |
| `engine.js:639-642` | analyse de saison : nuits sous 7 °C → transition hiver | alerte de planification, pas de verdict immédiat |

Règles **hors du périmètre de B** (à ne pas toucher) : gel et verglas (règle gel, `frostCap`), pluie verglaçante, neige,
profondeur sous 1,6 mm, garde-fou de profondeur sous 2 mm en pluie, aquaplaning par intensité de pluie et profondeur,
visibilité, rafales.

## Effet mesuré de trois variantes (en mémoire, grille de 308 verdicts horaires)

Grille : 7 montes (été V, été Y, été Y 2,5 mm, été Y 1,4 mm, 4 saisons, hiver, type inconnu) × températures −4 à 15 °C ×
sec, pluie 2 / 5 / 9 mm/h, neige, pluie verglaçante, verglas estimé.

| Variante | Scores modifiés | Niveaux abaissés | Niveaux relevés | Abaissés sur neige, verglas, < 1,6 mm |
|---|---|---|---|---|
| B1 · retirer le facteur d'indice de vitesse | 30 (au plus +2 points) | 4 | 0 | 0 |
| B2 · retirer la majoration mouillé ×1,25 (→ ×1) | 43 (au plus +7 points) | 5 | 0 | 0 |
| B1 + B2 | 50 (au plus +9 points) | 9 | 0 | 0 |

Niveaux abaissés par B1 + B2 :

- été Y, 5 °C, sec : VIGILANCE → RAS ; idem 2,5 mm et **type inconnu**
- été V et été Y, 5 °C, pluie 5 mm/h : PRUDENCE → VIGILANCE ; idem **type inconnu**
- été Y 2,5 mm, 5 °C, pluie 2 mm/h : PRUDENCE → VIGILANCE
- été Y 2,5 mm, 5 °C, pluie 5 mm/h : DANGER → PRUDENCE
- été Y 2,5 mm, 7 °C, pluie 9 mm/h : DANGER → PRUDENCE

## Risques identifiés avant toute décision

1. **Type de pneu inconnu.** Le moteur l'analyse « comme des pneus été » (`effType`). B adoucirait aussi ce cas, alors qu'une
   monte inconnue doit rester prudente : il faudrait exclure explicitement le type inconnu.
2. **Pneu usé sous forte pluie.** Deux baisses DANGER → PRUDENCE concernent 2,5 mm sous la pluie. Le garde-fou de profondeur
   (< 2 mm) ne les couvre pas : il faudrait décider si l'usure entre 2 et 3 mm justifie un plancher.
3. **Relais.** Les verdicts de trajet du relais suivent exactement ces changements (même moteur) : moins de notifications
   PRUDENCE par temps froid et pluvieux pour les pneus été.
4. **Preuves.** Aucune mesure primaire vérifiée ne compare un pneu été premium et un 4 saisons à 5–10 °C ; les indices relayés
   (non vérifiés) suggèrent même un avantage des 4 saisons près de 0 °C. Retirer la majoration mouillé n'est donc pas « prouvé » :
   c'est le retrait d'une hypothèse non documentée, comme le lot A.

## Proposition pour une PR séparée (si le propriétaire le décide)

- **B1 seul** (indice de vitesse) : cohérent avec le lot A, effet faible (4 niveaux, tous VIGILANCE → RAS sur sec ou un cas
  2,5 mm), à condition d'**exclure le type inconnu**.
- **B2** à reporter tant qu'aucune mesure ne documente l'effet du froid sur mouillé, ou à n'appliquer qu'avec un plancher
  pour une profondeur < 3 mm sous la pluie.
- Mettre à jour le témoin `tests/test_engine_tyre_golden.js` (`--write`) **dans cette PR seulement**, avec le diff des verdicts
  joint pour relecture.

Reproduction : le script d'analyse applique les variantes au texte de `engine.js` en mémoire (aucune écriture) et compare les
verdicts de `hourVerdict` sur la grille ci-dessus.
