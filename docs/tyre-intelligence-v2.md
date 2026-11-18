# Intelligence pneumatique V2 — lots A, C et D (17/11/2026)

Objectif : distinguer la **performance documentée d'un modèle** de pneu et le **danger météorologique**, sans supposer qu'un
pneu été est automatiquement moins bon sous la pluie, ni qu'un indice de vitesse décrit une gomme. Base : `main` = `98065b5`.

**Hors de cette PR :** le lot B (verdict de `src/engine.js`, utilisé aussi par le relais) — analyse séparée dans
[`tyre-intelligence-v2-lot-b.md`](tyre-intelligence-v2-lot-b.md), sans aucune modification de code.

## Trois couches séparées

| Couche | Où | Ce qu'elle dit | Ce que cette PR change |
|---|---|---|---|
| Risque routier | `src/engine.js` (verdict, alertes, relais) | pluie, eau accumulée, gel, verglas, neige, visibilité, vent, profondeur | **rien** (témoin figé : `test_engine_tyre_golden.js`) |
| Performance du pneu | catalogue `src/app/tyre-evidence.js`, vues Pneus et Analyse | essais publiés, avec dimension, protocole et comparabilité | 4 modèles ajoutés (3 essais ADAC, 1 lacune) ; **affichage seulement** |
| Simulateur Analyse | `src/tyrelab.js` | ordre de grandeur thermique et d'adhérence, par **saison**, non calibré | inférence W/Y/ZR et double comptage du froid **supprimés** |
| État déclaré | relevés de l'utilisateur | profondeur, pression, montage | rien |

## Lot A — simulateur Analyse (`src/tyrelab.js`)

1. **Indice de vitesse sans effet thermique.** Un pneu été en W, Y ou ZR ne voit plus sa fenêtre décalée de +5 °C : la
   fenêtre est celle de la saison (`TL_WIN`). L'indice reste affiché comme « capacité de vitesse homologuée, sans effet sur la
   fenêtre thermique ». Même correction du libellé « profil générique été haute performance » (`src/tyrestate.js`).
2. **Plus de double comptage du froid.** Le facteur « pneu été sous 7 °C » (×0,9) et ses trois modes de combinaison sont
   supprimés : le froid passe une seule fois, par l'état estimé de la gomme. Il n'existe plus aucune marche à 7 °C.
3. **Courbe conservée = hypothèse générique.** Les facteurs d'état de gomme (froid 0,85 / 0,92 / 0,97 ; sous la plage
   0,93 / 0,96 / 0,99 pour été / 4 saisons / hiver) restent, documentés dans le code et à l'écran comme **hypothèse générique
   de saison, non calibrée sur un modèle**. Aucun essai ni étiquette UE ne les remplace ou ne les ajuste.
4. **Eau stagnante dans le niveau global.** Le niveau affiché prend désormais aussi le niveau d'aquaplaning. Auparavant,
   l'eau stagnante (aquaplaning « Critique ») n'était affichée critique que si un malus de gomme abaissait aussi l'adhérence :
   retirer ce malus aurait abaissé l'alerte. Effet : uniquement des **hausses** (eau stagnante 🟠 → 🔴 pour les pneus été V,
   4 saisons et hiver).

### Avant / après (grille de 362 cas : 5 montes × 8 températures × 6 chaussées × garée ou en roulage)

Format : adhérence relative · distance 80 → 0 km/h affichée · état de la gomme · niveau global · niveau d'aquaplaning.

| Monte | Conditions | Avant (main) | Après (V2) |
|---|---|---|---|
| été 94Y | 5 °C · pluie · garée | 0,521 · 61–84 m · ambiant/froid · 🟠 · aqua 1 | 0,579 · 55–76 m · ambiant/froid · 🟠 · aqua 1 |
| été 94V | 5 °C · pluie · garée | 0,521 · 61–84 m · ambiant/froid · 🟠 · aqua 1 | 0,579 · 55–76 m · ambiant/froid · 🟠 · aqua 1 |
| 4 saisons 3PMSF | 5 °C · pluie · garée | 0,626 · 51–70 m · ambiant/froid · 🟠 · aqua 1 | 0,626 · 51–70 m · ambiant/froid · 🟠 · aqua 1 |
| été 94Y | 5 °C · pluie · route 30 min | 0,521 · 61–84 m · Stabilisé/froid · 🟠 · aqua 1 | 0,633 · 50–70 m · Stabilisé/sous la plage favorable · 🟠 · aqua 1 |
| 4 saisons 3PMSF | 5 °C · pluie · route 30 min | 0,654 · 49–68 m · Stabilisé/sous la plage favorable · 🟠 · aqua 1 | 0,654 · 49–68 m · Stabilisé/sous la plage favorable · 🟠 · aqua 1 |
| été 94Y | 6,9 °C · pluie · route 30 min | 0,521 · 61–84 m · Stabilisé/froid · 🟠 · aqua 1 | 0,633 · 50–70 m · Stabilisé/sous la plage favorable · 🟠 · aqua 1 |
| été 94Y | 7,1 °C · pluie · route 30 min | 0,579 · 55–76 m · Stabilisé/froid · 🟠 · aqua 1 | 0,633 · 50–70 m · Stabilisé/sous la plage favorable · 🟠 · aqua 1 |
| été 94Y | 12 °C · pluie · route 30 min | 0,633 · 50–70 m · Stabilisé/sous la plage favorable · 🟠 · aqua 1 | 0,633 · 50–70 m · Stabilisé/sous la plage favorable · 🟠 · aqua 1 |
| été 94Y | 18 °C · sec · garée | 0,85 · 33–42 m · ambiant/froid · 🟠 · aqua 0 | 0,93 · 30–39 m · ambiant · 🟡 · aqua 0 |
| été 94Y | 2 °C · sec · route 30 min | 0,765 · 37–47 m · Stabilisé/froid · 🟠 · aqua 0 | 0,93 · 30–39 m · Stabilisé/sous la plage favorable · 🟡 · aqua 0 |
| été 94V | 18 °C · eau stagnante · route 30 min | 0,5 · aucune distance · Stabilisé/favorable · 🟠 · aqua 3 | 0,5 · aucune distance · Stabilisé/favorable · 🔴 · aqua 3 |
| été 94Y | 18 °C · eau stagnante · route 30 min | 0,465 · aucune distance · Stabilisé/sous la plage favorable · 🔴 · aqua 3 | 0,5 · aucune distance · Stabilisé/favorable · 🔴 · aqua 3 |
| 4 saisons 3PMSF | 18 °C · eau stagnante · route 30 min | 0,5 · aucune distance · Stabilisé/favorable · 🟠 · aqua 3 | 0,5 · aucune distance · Stabilisé/favorable · 🔴 · aqua 3 |
| hiver | 18 °C · eau stagnante · route 30 min | 0,5 · aucune distance · Stabilisé/favorable · 🟠 · aqua 3 | 0,5 · aucune distance · Stabilisé/favorable · 🔴 · aqua 3 |
| été 94Y | -2 °C · neige · garée | 0,153 · aucune distance · ambiant/froid · 🔴 · aqua 0 | 0,17 · aucune distance · ambiant/froid · 🔴 · aqua 0 |
| été 94Y | -2 °C · verglas · route 30 min | 0,115 · aucune distance · Stabilisé/froid · 🔴 · aqua 1 | 0,128 · aucune distance · Stabilisé/froid · 🔴 · aqua 1 |
| été 94Y, 2,5 mm | 5 °C · pluie · garée | 0,482 · 64–90 m ·  · 🔴 · aqua 1 | 0,536 · 58–82 m ·  · 🟠 · aqua 1 |
| été 94Y, 1,4 mm | 5 °C · pluie · garée | 0,453 · aucune distance ·  · 🔴 · aqua 2 · CRITIQUE | 0,503 · aucune distance ·  · 🔴 · aqua 2 · CRITIQUE |

Bilan sur les 362 cas :

- **Changés : 150, tous des pneus été** (4 saisons et hiver : adhérence, distances et états identiques ; seul leur niveau
  global peut monter, sur eau stagnante).
- **Aquaplaning, état critique de profondeur, nature de la chaussée, refus de chiffrer une distance : 0 changement.**
- **Niveau global abaissé sur neige, verglas, pluie forte ou eau stagnante : 0.** Relevé : 24 cas (eau stagnante).
- Niveau global abaissé ailleurs : 11 cas, tous des pneus été — 10 par la fin de l'inférence W/Y/ZR (un 94Y se comporte
  comme un 94V, sur sec) et 1 par la fin du double comptage (2,5 mm, 5 °C, pluie : 🔴 → 🟠 ; la profondeur critique
  sous 1,6 mm reste 🔴 et CRITIQUE).
- **Écart générique résiduel** : à 5 °C sous la pluie, voiture garée, un pneu été reste à 0,579 contre 0,626 pour un 4 saisons
  (hypothèse de saison sur une gomme froide). Les essais disponibles ne permettent ni de le confirmer ni de le retirer
  (voir l'archive des sources) : il reste affiché comme hypothèse non calibrée.

## Lot C — catalogue d'essais (`src/app/tyre-evidence.js`, révision 2)

Ajouts, chiffres relus page par page le 17/11/2026 — sources, protocoles et limites dans
[`tyre-wet-evidence-20261117.md`](tyre-wet-evidence-20261117.md) :

| Modèle | Essai | Contenu |
|---|---|---|
| Continental PremiumContact 7 | ADAC été 2026, 225/50 R17 98Y, 16 pneus | freinage sec et mouillé (asphalte, béton), aquaplaning longitudinal et transversal, plage meilleur–pire de l'essai |
| Goodyear Eagle F1 Asymmetric 6 | ADAC été 2025, 225/40 R18 92Y | mêmes mesures et plages |
| Pirelli Cinturato All Season SF3 | ADAC 4 saisons 2025, 225/45 R17 94W, 16 pneus | freinage mouillé, aquaplaning, plages |
| Goodyear Vector All Season 4 | — | **lacune explicite** : aucun essai ADAC ni partenaire ; Auto Bild non attribuable avec certitude |

Le catalogue n'est lu que par les vues (`tyre-intelligence-view.js`, `engineering-cockpit-view.js`). Le moteur, le simulateur,
le relais et `evidence.js` ne le lisent pas (vérifié par `test_tyre_v2.js`). Aucune note ADAC, aucun classement entre essais.

## Lot D — tests

| Suite | Contenu |
|---|---|
| `test_tyre_v2.js` (nouveau) | les 10 scénarios du cahier des charges ; limites thermiques (6,95 / 7,05 °C, fenêtres par saison, un seul facteur de froid) ; V, W, Y, ZR, H identiques ; alertes neige, verglas, eau stagnante jamais abaissées ; isolation de deux voitures ; catalogue jamais converti en coefficient |
| `test_engine_tyre_golden.js` (nouveau) | 576 verdicts horaires et 576 verdicts de trajet de `engine.js` figés au SHA `98065b5` ; relais limité à `engine.js` et `evidence.js` ; train prévu sans effet ; 4 contre-tests |
| `e2e131-pneus-v2.js` (nouveau, Chromium et WebKit) | vrai HTML : essais ADAC affichés avec comparabilité, aucune « haute performance » ni règle des 7 °C, isolation des deux voitures, hors ligne, PC et iPhone |
| `test_tyrelab.js`, `test_tyrestate.js`, `test_tyre_intelligence.js`, `e2e43-analyse.js` (adaptés) | scénarios Y/ZR décalés de −5 °C pour garder les mêmes états ; nouveaux contre-tests : marche à 7 °C, décalage par indice, eau stagnante hors du niveau global |

`test_tyre_v2.js` échoue sur le code de `main` (vérifié) : il prouve donc le changement, pas seulement l'état actuel.

## Limites et validations encore nécessaires

- Les facteurs de gomme restent une hypothèse générique : aucune donnée publiée ne permet de les calibrer par modèle.
- Les 4 saisons gardent un avantage générique sur gomme froide : non confirmé ni infirmé par des mesures primaires.
- La recette iPhone des tests est une émulation WebKit : **un essai sur iPhone réel reste à faire**.
