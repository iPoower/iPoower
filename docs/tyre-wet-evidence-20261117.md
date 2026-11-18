# Essais indépendants sur sol mouillé — archive des sources (17/11/2026)

Archive du lot C de l'Intelligence pneumatique V2. Elle documente **d'où viennent** les chiffres du catalogue
`src/app/tyre-evidence.js` (révision 2) et **pourquoi les autres n'y sont pas**.

## Ce qui entre dans le catalogue, et ce qui n'y entre pas

| Pneu | Essai | Statut dans le catalogue | Vérification |
|---|---|---|---|
| Continental PremiumContact 7 | ADAC été 2026, 225/50 R17 98Y, 16 pneus | **Intégré** : freinage sec, freinage mouillé asphalte et béton, aquaplaning longitudinal et transversal, avec la plage meilleur–pire de l'essai | Fiche ADAC relue le 17/11/2026 (valeurs et plages) |
| Goodyear Eagle F1 Asymmetric 6 | ADAC été 2025, 225/40 R18 92Y | **Intégré** : mêmes mesures et plages ; véhicule et nombre de pneus non indiqués sur la fiche, donc `null` | Fiche ADAC relue le 17/11/2026 |
| Pirelli Cinturato All Season SF3 | ADAC 4 saisons 2025, 225/45 R17 94W, VW Golf, 16 pneus | **Intégré** : freinage mouillé asphalte et béton, aquaplaning longitudinal et transversal, avec plages | Fiche et page du test ADAC relues le 17/11/2026 |
| Goodyear Vector All Season 4 | Auto Bild 2026 (deux articles), TÜV SÜD (commandé par Goodyear) | **Non intégré** : lacune explicite (`gap`) | Valeurs Auto Bild non attribuables avec certitude (lignes de mesure sans nom de pneu), test soutenu en partie par Goodyear ; TÜV en % seulement |
| Rovelo RPX-988 | Aucun | **Non intégré** (lacune inchangée) | Rien de mesuré et vérifiable |
| Auto Bild (tous les pneus) | voir ci-dessous | **Non intégré** | Lu par extraction automatique ; ambiguïté « 100 » contre « 80 » km/h non levée |

Règles appliquées :

- **Aucune conversion** d'un résultat d'essai ou d'une étiquette UE en coefficient : le catalogue est affiché avec sa
  comparabilité, il ne modifie aucun calcul d'adhérence, de distance, de verdict ni d'alerte (seules les vues le lisent).
- **Aucune comparaison entre essais** : chaque valeur reste attachée à son essai, sa dimension, son année et son protocole.
- **Aucune température** n'est publiée par l'ADAC (dérives corrigées par pneus de référence) : rien n'en est déduit sur le froid.
- Les notes et classements ADAC ne sont pas repris : seules les mesures, avec la plage meilleur–pire de l'essai.

## Question « pneu été premium contre 4 saisons, mouillé, 5–10 °C »

**Non tranchée.** Aucune mesure primaire vérifiée (voir section 6). Conséquence pour le code : le lot A **retire** les
malus arbitraires (marche à 7 °C, indice de vitesse) mais **n'ajoute aucun bonus** au pneu été. La différence générique
de saison qui subsiste reste affichée comme hypothèse non calibrée.

---

## Notes de recherche détaillées

Recherche initiale faite par extraction automatique (outil WebFetch), puis chiffres du catalogue relus page par page.
Les mentions [RELAYÉ – non vérifié] ne sont **jamais** utilisées dans l'application.


Recherche faite le 17/11/2026 (lecture seule).

## Conventions

- **[SOURCE PRIMAIRE]** : chiffre lu sur la page de l'éditeur du test (ADAC, ÖAMTC, ANWB, Auto Bild, rapport TÜV SÜD). Les pages ont été lues avec un outil d'extraction automatique (WebFetch). Avant d'intégrer un chiffre dans l'app, il faut le recontrôler à l'œil sur la page.
- **[RELAYÉ – non vérifié en source primaire]** : chiffre vu seulement dans un extrait de moteur de recherche, un agrégateur (Tyre Reviews, WhatTyre, Netzwelt…) ou un communiqué de fabricant.
- **Tyre Reviews** (tyrereviews.com, tire-reviews.com, reviews.tyrereviews.com) a répondu HTTP 403 à 4 tentatives sur 3 domaines. Je n'ai lu aucune page Tyre Reviews. Tout ce qui leur est attribué ici vient d'extraits de recherche.
- **Aucun chiffre n'a été converti** vers une autre vitesse, un autre véhicule ou une autre taille. Les comparaisons ne valent qu'à l'intérieur d'un même test.
- **ADAC, ÖAMTC, TCS et ANWB publient le même test commun.** Ils ne comptent donc pas comme des sources indépendantes les unes des autres.

### Piège Auto Bild : la ligne « Tempo 100 »

Dans les tableaux Auto Bild, la ligne du freinage sur mouillé est intitulée « aus Tempo 100 ».

Dans le test été 2025 (225/40 R18), un second tableau indique pourtant un freinage mouillé « nass aus 80 km/h ». Par exemple :
- Goodyear : 28,3 m dans le tableau 80-0, contre 44,2 m sur la ligne « Tempo 100 ».
- Or 28,3 × (100/80)² ≈ 44,2.

La ligne « 100 » ressemble donc à une extrapolation de mesures faites depuis 80 km/h. C'est une hypothèse : Auto Bild ne l'écrit pas.

Pour les tests toutes-saisons Auto Bild 2026, je n'ai pas vérifié s'il existe le même double tableau. Leurs valeurs « 100-0 » sont donc reprises **telles qu'affichées**. Elles ne sont comparables qu'entre pneus du même article.

Dans les tableaux de mesures Auto Bild, les lignes ne portent pas le nom du pneu. L'outil d'extraction a attribué les valeurs selon l'ordre du classement. Des recoupements le confirment (freinage sec cohérent avec le tableau de qualification), mais il faut le contrôler à l'œil.

---

## 1. Continental PremiumContact 7 (été)

### 1a. ADAC Sommerreifentest 2026 – 225/50 R17 [SOURCE PRIMAIRE]

- **URL :**
  - Fiche pneu : https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/sommerreifen/225-50-r17-2026/continental-premiumcontact-7-id-5128/
  - Page du test : https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/sommerreifen/225-50-r17-2026/
- **Date :** test 2026. La date exacte n'apparaît pas sur la fiche ; le communiqué Continental est daté du 24/02/2026.
- **Pneu testé :** 225/50 R17 **98 Y**. 16 pneus dans le test.
- **Véhicule :** non indiqué sur la fiche (seulement « Testwagen »).
- **Température :** non indiquée.
- **Résultat :** note globale **1,9 (gut)**, 1re place. Sécurité de conduite 1,7 ; sec 1,6 ; **mouillé 1,7**.
- **Mesures** (entre parenthèses : meilleur–pire du test) :
  - Freinage **80-0 km/h, asphalte mouillé : 30,1 m** (30,1–37,9). C'est le meilleur du test.
  - Freinage **80-0 km/h, béton mouillé : 34,9 m** (32,3–44,5).
  - **Aquaplaning longitudinal : 79,7 km/h** (79,7–72,9). Meilleur du test.
  - **Aquaplaning en courbe : 3,7 m/s²** (3,7–2,9). Meilleur du test.
  - Freinage sec 100-0 : 35,0 m (33,9–36,7).
  - Handling mouillé : aucune valeur chiffrée, seulement le texte « sehr gut ».
- **Étiquette UE :** C / **A** / B, 72 dB.
- **Limites :** taille 225/50 R17, pas 225/45 R17. Test d'été, température non publiée.
- **ÖAMTC et TCS :** ils publient ce même test (communiqués Continental AT/CH du 24/02/2026). Ce n'est pas une seconde source indépendante.

### 1b. Auto Bild Sommerreifen-Test 2025 – 225/40 R18 [SOURCE PRIMAIRE]

- **URL :** https://www.autobild.de/produkttests/sommerreifen-225-40-r-18-test-1582153.html
- **Date :** mise en ligne le 25/05/2026, année de test 2025.
- **Pneu testé :** 225/40 R18 **92 Y** XL.
- **Véhicule :** **BMW Série 1**.
- **Température :** non indiquée.
- **Résultat :** 4e sur 20 finalistes, note **1,4**.
- **Freinage mouillé :**
  - Tableau 80-0 km/h : **28,3 m**.
  - Ligne « Tempo 100 » : 44,2 m (voir le piège Auto Bild plus haut).
  - Meilleurs du tableau 80-0 : 27,4 m (Hankook, Kumho, Linglong).
- **Autres mesures sur mouillé :**
  - Handling mouillé : **73,2 km/h** de vitesse moyenne.
  - Cercle mouillé : **14,94 s**.
  - Aquaplaning longitudinal : **81,1 km/h**.
  - Aquaplaning en courbe : non publié (« - »).
- **Limites :** taille, véhicule et protocole différents de l'ADAC. On ne peut pas comparer avec 1a.
- **Point utile :** le **Goodyear Eagle F1 Asymmetric 6** est dans **ce même test** (voir 2b).

### 1c. Résultats relayés [non vérifiés en source primaire]

| Test | Taille | Valeur relayée | Vu dans |
|---|---|---|---|
| Auto Zeitung 2024 | **225/45 R17** 94W/Y XL, BMW Série 1 (selon Tyrepress) | « 39,5 m » sur mouillé, 1er au freinage mouillé. Plage de vitesse inconnue. | Extrait de recherche (agrégateur). Page autozeitung.de non trouvée. |
| ADAC 2024 | 215/55 R17 | « 28,5 m » sur mouillé | Extrait de recherche |
| Auto Bild 2023 | 225/45 R18 | « 25,3 m » depuis 80 km/h | Extrait de recherche |
| ACE / Pirelli 2024, piste TRIWO | 225/45 R17 | Victoire du PremiumContact 7, freinages parmi les plus courts. Pas de chiffre. | Communiqué Continental (source fabricant ; test co-organisé avec Pirelli). |

**Statut : CONFIRMÉ.** Deux sources primaires indépendantes : ADAC 2026 et Auto Bild 2025. Aucune des deux n'est en 225/45 R17.

---

## 2. Goodyear Eagle F1 Asymmetric 6 (été UHP)

### 2a. ADAC Sommerreifentest 2025 – 225/40 R18 [SOURCE PRIMAIRE]

- **URL :**
  - Fiche pneu : https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/sommerreifen/225-40-r18/goodyear-eagle-f1-asymmetric-6-id-4971/
  - Page du test : https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/sommerreifen/225-40-r18/
- **Date :** publié le 25/02/2025.
- **Pneu testé :** 225/40 R18 **92 Y**. 18 pneus dans le test.
- **Véhicule :** **VW Golf**.
- **Protocole :**
  - Mouillé sur un site d'essai d'un manufacturier.
  - Sec sur deux autres sites d'essai.
  - Correction des effets de température par des pneus de référence.
- **Température :** aucune valeur publiée.
- **Résultat :** note **1,9**, à égalité avec Michelin et Bridgestone, derrière le SportContact 7 (1,8). Sécurité 1,8 ; sec 1,9 ; **mouillé 1,7**.
- **Mesures** (entre parenthèses : meilleur–pire du test) :
  - Freinage **80-0 km/h, asphalte mouillé : 29,5 m** (28,4–45,1).
  - Freinage **80-0 km/h, béton mouillé : 35,8 m** (34,2–55,2).
  - **Aquaplaning longitudinal : 79,4 km/h** (83,7–69,3).
  - **Aquaplaning en courbe : 3,1 m/s²** (3,5–1,9).
  - Freinage sec 100-0 : 35,5 m (34,8–39,5).
- **Étiquette UE :** C / **A** / B, 70 dB.
- **Le PremiumContact 7 n'est pas dans ce test.** Le seul Continental testé est le SportContact 7.

### 2a-bis. Partenaires du test ADAC 2025 (mêmes données, pas indépendants)

**ÖAMTC** [SOURCE PRIMAIRE] – https://www.oeamtc.at/tests/reifentest/sommerreifentest-2025/goodyear-eagle-f1-asymmetric-6-77509586/print

- 225/40 R18 92Y, note globale 1,9.
- Sous-notes sur mouillé : mouillé 1,7 ; freinage mouillé **1,46** ; aquaplaning longitudinal 2,44 ; aquaplaning transversal 2,47 ; **handling mouillé 0,86** ; cercle 2,4.
- Atout cité : « Bestnote auf nasser Fahrbahn ».
- Pas de mesures brutes.

**ANWB** [SOURCE PRIMAIRE] – https://www.anwb.nl/auto/tests-en-specificaties/bandentests/zomerbandentest/testresultaten-2025-225-40-r18-y/goodyear-eagle-f1-asymmetric-6

- Note 8,1 (« Goed »).
- Sur mouillé : freinage « ++ », tenue de route « ++ », aquaplaning « + ».

### 2b. Auto Bild Sommerreifen-Test 2025 – 225/40 R18 [SOURCE PRIMAIRE]

- **URL :** https://www.autobild.de/produkttests/sommerreifen-225-40-r-18-test-1582153.html
- **Date :** mise en ligne le 25/05/2026, année de test 2025.
- **Pneu testé :** 225/40 R18 **92 Y** XL.
- **Véhicule :** **BMW Série 1**.
- **Température :** non indiquée.
- **Résultat :** **1er sur 20**, note **1,2**. Texte : « kurzen Bremswegen bei Nässe ».
- **Freinage mouillé :**
  - Tableau 80-0 km/h : **28,3 m**, identique au PremiumContact 7.
  - Ligne « Tempo 100 » : 44,2 m.
- **Autres mesures sur mouillé :**
  - Handling mouillé : **73,0 km/h**, contre 73,2 km/h pour le PremiumContact 7.
  - Cercle mouillé : **14,72 s**, contre 14,94 s pour le PremiumContact 7.
  - Aquaplaning longitudinal : **80,3 km/h**, contre 81,1 km/h pour le PremiumContact 7.
  - Aquaplaning en courbe : non publié.
- **Limites :** dans ce test, le PremiumContact 7 et l'Eagle F1 Asymmetric 6 sont dans **la même taille sport (225/40 R18)**. Rien ne dit que l'écart serait le même en 225/45 R17.

### 2c. Résultats relayés [non vérifiés en source primaire]

- **Auto Express 2025 (225/40 R18) :**
  - 6e sur 9 au classement, 6e au freinage mouillé, « +13,7 % » par rapport au meilleur.
  - Source : extraits de recherche (Auto Express et Tyre Reviews).
  - Un résumé Tyre Reviews dit au contraire « longest wet braking ». **Contradiction non résolue.**
  - J'ai ouvert deux URL de fiches Auto Express : elles affichaient d'autres pneus (Nokian, Firestone).
- **Auto Bild 2026 (245/45 R19 102Y) :** 2e, note 1,2. Pas de chiffre sur mouillé visible dans la page de synthèse.
  - URL : https://www.autobild.de/produkttests/sommerreifen-test-2026-245-45-r19-28554007.html (non ouverte).

**Statut : CONFIRMÉ.** Deux sources primaires indépendantes : ADAC 2025 et Auto Bild 2025, toutes deux en 225/40 R18. Le résultat Auto Express, moins favorable, reste à vérifier.

---

## 3. Goodyear Vector All Season 4 (successeur du Vector 4Seasons Gen-3)

### Nom et lancement

- Nom commercial exact : **« Goodyear Vector All Season 4 »**.
- Selon Tyrepress (04/2026), le lancement commercial européen était prévu pour **mai 2026**. Je n'ai pas confirmé la date effective.
- Le rapport TÜV ci-dessous porte sur des essais de **novembre–décembre 2024**.
- Selon Blackcircles, il est vendu **à côté** du Gen-3, et non à sa place.

### 3a. Auto Bild Ganzjahresreifen-Test 2026 – 225/45 R17 [SOURCE PRIMAIRE]

- **URL :** https://www.autobild.de/produkttests/ganzjahresreifen-test-225-45-r-17-15674163.html
- **Date :** 15/10/2026.
- **Pneu testé :** 225/45 R17 **94 W** XL.
- **Véhicules :** **VW Golf et VW Golf GTI**.
- **Température :** non indiquée.
- **Pneus de référence :** un pneu été et un pneu hiver de grande marque, hors classement. Leurs modèles et leurs chiffres ne sont pas donnés sur la page.
- **Sponsors :** la page indique que le test est soutenu par Ceat, Cooper, **Goodyear**, Toyo et Vredestein.
- **Résultat :** **1er**, note **1,3**. Le Pirelli SF3 est 3e (1,4).
- **Mesures** (valeurs attribuées selon l'ordre du classement) :
  - Freinage mouillé, ligne « 100-0 » : **43,4 m**, contre 43,3 m pour le Pirelli.
  - Handling mouillé : **72,4 km/h**, contre 71,7 km/h pour le Pirelli.
  - Cercle mouillé : **10,82 s**, contre 11,13 s pour le Pirelli.
  - Aquaplaning longitudinal : **75,58 km/h**, contre 74,90 km/h pour le Pirelli.
  - Aquaplaning en courbe : **3,01 m/s²**, contre 2,98 m/s² pour le Pirelli.
  - Freinage sec 100-0 : 37,9 m, contre 37,0 m pour le Pirelli.
- **Limites :**
  - Lignes de mesure non nommées (voir le piège Auto Bild).
  - Les décomptes de la page sont incohérents (35, 30 ou 20 candidats selon l'endroit ; le Ceat est absent du classement).

### 3b. Auto Bild SUV Ganzjahresreifen-Test 2026 – 225/55 R18 [SOURCE PRIMAIRE]

- **URL :** https://www.autobild.de/produkttests/ganzjahresreifen-test-225-55-r18-28841901.html
- **Date :** 11/10/2026.
- **Pneu testé :** 225/55 R18 **102 V** XL.
- **Véhicule :** **Mini Countryman (3e génération)**.
- **Température :** non indiquée.
- **Pneus de référence :** un pneu été et un pneu hiver, hors classement, chiffres non relevés.
- **Résultat :** **1er sur 11**, note **1,3**. Le Pirelli SF3 est 5e (1,6).
- **Mesures** (valeurs attribuées selon l'ordre du classement) :
  - Freinage mouillé, ligne « 100 » : **52,2 m**, contre 53,1 m pour le Pirelli.
  - Handling mouillé : **84,5 km/h**, contre 83,3 km/h.
  - Cercle mouillé : **16,04 s**, contre 16,26 s.
  - Aquaplaning longitudinal : **96,47 km/h**, contre 97,68 km/h.
  - Aquaplaning en courbe : **3,03 m/s²**, contre 3,03 m/s².
- **Limites :** les valeurs absolues sont très différentes de 3a (autre piste, autre véhicule, autre taille). Elles ne sont pas comparables entre articles.

### 3c. TÜV SÜD « Premium Tire Mark 2024 », rapport n° 713349044-PM [SOURCE PRIMAIRE, mais commandé par le fabricant]

- **URL du PDF (hébergé par Goodyear) :** https://www.goodyear.eu/content/dam/goodyear/consumer/common/tire-test-reports/tuv-sud-tire-test-2024-713349044-pm-goodyear-vector-all-season-4.pdf
- **Indépendance :** limitée.
  - Les échantillons Goodyear ont été **fournis par le client**.
  - Les pneus concurrents ont été achetés dans le commerce par TÜV SÜD.
  - Le client du rapport est Goodyear, d'après sa présentation (Tyre Reviews le dit explicitement).
- **Pneus testés :** tous en 205/55 R16 **94 V** XL.
  - Goodyear Vector All Season 4.
  - Concurrents : Bridgestone Turanza All Season 6, Continental AllSeasonContact 2, Michelin CrossClimate 2 et **Pirelli Cinturato All Season SF3**.
- **Date :** essais en novembre–décembre 2024 (site d'essai sur mouillé indiqué dans le rapport).
- **Véhicules :** VW Golf VIII 1.5 TSI et Skoda Superb 1.5 TSI.
- **Format des résultats :** **en % uniquement.** Goodyear vaut 100 %. Au-dessus de 100 %, le pneu fait mieux que le Goodyear.
- **Freinage mouillé 80→20 km/h, asphalte à faible adhérence (low µ) :**
  - Goodyear 100 % ; Pirelli SF3 **90,6 %** ; Continental 91,5 % ; Michelin 86,4 % ; Bridgestone 85,6 %.
- **Freinage mouillé 80→20 km/h, asphalte à forte adhérence (high µ)** (« voluntary test », hors périmètre obligatoire) :
  - Goodyear 100 % ; Pirelli **99,7 %** ; Continental 99,8 % ; Michelin 93,3 % ; Bridgestone 95,6 %.
- **Handling mouillé :**
  - Goodyear 100 % ; Pirelli **97,6 %** ; Continental 95,6 % ; Michelin 93,4 % ; Bridgestone 94,1 %.
- **Aquaplaning longitudinal (~7 mm d'eau) :**
  - Goodyear 100 % ; Pirelli **102,3 %** ; Michelin 103,0 % ; Bridgestone 99,6 % ; Continental 96,8 %.
- **Wet Grip Index (R117, remorque) :** Goodyear seul. **1,54** à l'état neuf (air 16,2 °C / sol 12,4 °C) et **1,29** usé.
- **Aucune distance en mètres dans le PDF.**
  - Tyre Reviews relaie « 35,00 m », contre 35,07 et 35,11 m pour les concurrents.
  - Ces mètres ne figurent pas dans le PDF que j'ai lu. **À traiter comme non vérifiés.**

### 3d. Relayé [non vérifié en source primaire]

- **Auto Bild « mini-test » 2026, 5 pneus toutes-saisons premium en 225/40 R18 :**
  - Goodyear 1er sur 5. Il serait 2e au freinage mouillé, 1er en handling mouillé et au cercle mouillé.
  - Il serait 4e au freinage sec et 3e en aquaplaning longitudinal.
  - Source : Tyre Reviews et thetirelab, via extraits de recherche.

### Contexte : prédécesseur Vector 4Seasons Gen-3, ADAC Ganzjahresreifentest 2025 en 225/45 R17 [SOURCE PRIMAIRE]

Ce n'est pas le pneu demandé, mais c'est la même taille et le même test que le Pirelli 4a.

- **URL :** https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/ganzjahresreifen/225-45-r17/goodyear-vector-4seasons-gen-3-id-5035/
- **Pneu testé :** 225/45 R17 **94 W**.
- **Résultat :** note **2,3** (1er ex aequo). Mouillé 2,3.
- **Mesures :**
  - Freinage 80-0 asphalte mouillé : **33,2 m**.
  - Freinage 80-0 béton mouillé : **39,1 m**.
  - Aquaplaning longitudinal : **74,9 km/h**.
  - Aquaplaning en courbe : **2,7 m/s²**.
- **Étiquette UE :** C / **B** / B, 70 dB.
- **Le Vector All Season 4 n'apparaît pas dans ce test ADAC.**

**Statut : À VÉRIFIER.**
- Deux sources Auto Bild primaires, mais du **même éditeur** ; l'une est soutenue en partie par Goodyear.
- Une source TÜV primaire, commandée par Goodyear.
- **Aucun test ADAC, ÖAMTC, TCS ou Stiftung Warentest** trouvé pour le Vector All Season 4.

---

## 4. Pirelli Cinturato All Season SF3

### 4a. ADAC Ganzjahresreifentest 2025 – **225/45 R17** [SOURCE PRIMAIRE]

- **URL :**
  - Fiche pneu : https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/ganzjahresreifen/225-45-r17/pirelli-cinturato-all-season-sf3-id-5036/
  - Page du test : https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/ganzjahresreifen/225-45-r17/
- **Date :** publié le **24/06/2025**.
- **Pneu testé :** 225/45 R17 **94 W**. 16 pneus dans le test.
- **Véhicule :** **VW Golf**.
- **Protocole :**
  - Freinage mouillé ABS depuis 80 km/h, sur asphalte et sur béton.
  - Aquaplaning longitudinal avec 7 mm d'eau, en courbe avec 5 mm.
  - Handling mouillé et cercle.
  - Mouillé sur un site d'essai d'un manufacturier.
  - Correction de température par des pneus de référence.
- **Température :** aucune valeur. Le texte parle seulement de « sommerlichen » et de « niedrigen Temperaturen ».
- **Résultat :** note **2,5 (gut)**, 3e. Sécurité 2,6 ; sec 1,8 ; **mouillé 2,2** ; hiver 2,6.
  - En pondérant les sous-notes, on obtient environ 2,1 et non 2,6. La page n'explique pas cet écart.
- **Mesures** (entre parenthèses : meilleur–pire du test) :
  - Freinage **80-0 km/h, asphalte mouillé : 32,5 m** (31,3–42,6). Le meilleur est le Continental AllSeasonContact 2.
  - Freinage **80-0 km/h, béton mouillé : 38,8 m** (38,4–52,6).
  - **Aquaplaning longitudinal : 78,3 km/h** (78,5–65,6).
  - **Aquaplaning en courbe : 2,8 m/s²** (2,8–1,8). Meilleur du test.
  - Freinage sec 100-0 : 38,0 m. Meilleur du test.
- **Étiquette UE :** C / **A** / B, 71 dB.

### 4b. Auto Bild Ganzjahresreifen-Test 2026 – **225/45 R17** [SOURCE PRIMAIRE]

- Même article que 3a. Le SF3 y est en 94 W XL, version BSW.
- **Résultat :** 3e, note **1,4**.
- **Mesures :**
  - Freinage mouillé, ligne « 100-0 » : **43,3 m**.
  - Handling mouillé : **71,7 km/h**.
  - Cercle mouillé : **11,13 s**.
  - Aquaplaning longitudinal : **74,90 km/h**.
  - Aquaplaning en courbe : **2,98 m/s²**.

### 4c. Auto Bild Ganzjahresreifen-Test « 2025 » – 225/40 R18 [SOURCE PRIMAIRE]

- **URL :** https://www.autobild.de/produkttests/ganzjahresreifen-test-2025-225-40-r-18-25697127.html
- **Date :** mise en ligne le 22/05/2026, test étiqueté 2025.
- **Lieux :** pistes d'essai indiquées dans l'article (mouillé et neige sur deux sites distincts).
- **Véhicule :** non nommé.
- **Pneus de référence :** un pneu été et un pneu hiver, modèles non nommés.
- **Résultat :** **1er**, note **1,1**.
- **Mesures :**
  - Freinage mouillé, ligne « 100 » : **46,3 m**.
  - Handling mouillé : **73,8 km/h**.
  - Cercle mouillé : **12,12 s**.
  - Aquaplaning longitudinal : **77,0 km/h**.
  - Aquaplaning en courbe : **3,25 m/s²**.
- **Limites :** taille 225/40 R18.

### 4d. TÜV SÜD 2024 (205/55 R16) – voir 3c

Commandé par Goodyear. Le SF3 y fait :
- 90,6 % au freinage mouillé low µ ;
- 99,7 % au freinage mouillé high µ ;
- 97,6 % en handling mouillé ;
- 102,3 % en aquaplaning.

La base 100 % est le Goodyear Vector All Season 4.

### 4e. Autres sources

- **ADAC 2026, 185/65 R15 :** note 2,6 [SOURCE PRIMAIRE, lu seulement en extrait de recherche]. Fiche : https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/ganzjahresreifen/185-65-r15-2026/pirelli-cinturato-all-season-sf-3-id-5177/
- **Auto Bild Sportscars 2024 :** SF3 **43,90 m** contre **42,10 m** pour le pneu été de référence au freinage mouillé [RELAYÉ – non vérifié]. Taille, vitesse et température inconnues. Source : extrait Tyre Reviews.

**Statut : CONFIRMÉ.** ADAC et Auto Bild, deux sources primaires indépendantes, toutes deux en 225/45 R17.

---

## 5. Rovelo RPX-988

- **Aucun test indépendant récent trouvé** chez l'ADAC, ses partenaires, Auto Bild, Auto Zeitung, Auto Express ou Evo.
- **WhatTyre** (agrégateur) liste une vingtaine de tailles : https://whattyre.com/products/rovelo-rpx-988/791
  - **Étiquette UE la plus fréquente : D / C / 72 dB**, soit **adhérence sur mouillé de classe C** [RELAYÉ – non vérifié]. Il faut la confirmer dans la base EPREL pour la taille exacte.
  - Le site cite un seul test : **Auto Bild, 09/03/2017**, où le pneu aurait été « éliminé… 44e sur 52 » à cause de ses distances de freinage sur sec et sur mouillé, en « 225/45 R17 94W » [RELAYÉ – non vérifié].
  - **Incohérence :** le PDF Auto Bild 2017 des 52 pneus (download.autobild.de/dl/1825481/Sommerreifentest2017.pdf, non ouvert) est titré **« 225/50 R 17 »**. De plus, WhatTyre recopie la même mention sur des tailles sans rapport avec ce test.
- **Ce test date de 9 ans.** Rien ne garantit que la gomme actuelle soit la même.

**Statut : BLOQUÉ.** Aucune donnée mesurée vérifiable.

---

## 6. Pneu été premium contre toutes-saisons sur mouillé par temps frais (5–10 °C)

**Aucune mesure en source primaire n'a été vérifiée** sur cette question. Tout ce qui suit est **[RELAYÉ – non vérifié en source primaire]**.

1. **UTAC / Aftonbladet 2025, « Summer and All Season Combined Tyre Test »** (225/45 R17, 10 pneus été et 4 toutes-saisons selon un agrégateur). D'après un extrait Tyre Reviews :
   - à **+12 °C**, été et toutes-saisons freinent de façon « comparable » sur mouillé ;
   - à **+2 °C**, les toutes-saisons s'arrêtent « almost 6.5 meters shorter » depuis 80 km/h.

   Je n'ai trouvé ni l'article Aftonbladet, ni la liste exacte des pneus, ni la présence du PremiumContact 7 ou du SF3. Tyre Reviews (403) et tiresvote.com (403) étaient bloqués.
   - https://www.tyrereviews.com/Article/2025-Summer-and-All-Season-Combined-Tyre-Test.htm
2. **Sport Auto, test toutes-saisons 2024** (Tyre Reviews) :
   - mouillé testé « significantly below ten degrees », vers 7 °C pour le freinage ;
   - les toutes-saisons battent souvent les deux pneus de référence (été et hiver) ;
   - mais Tyre Reviews note que **le pneu été de référence n'était pas un modèle récent**.
3. **ACE / ARBÖ / GTÜ 2024, 215/50 R18** (kfz-auskunft.de, extrait) : le pneu été de référence freine en **30,6 m** sur mouillé, et aucun toutes-saisons ne fait mieux. Température non connue.
4. **Auto Bild, tests toutes-saisons 2026** (225/45 R17 et 225/55 R18) : un pneu été de référence a roulé sur mouillé, mais **ni son modèle ni ses chiffres** n'apparaissent dans les extraits obtenus. Il faudrait relire ces deux pages à la main, car c'est la piste la plus directe pour le Vector All Season 4 et le SF3.
5. Les pages ADAC (été 2025 et 2026, toutes-saisons 2025) **ne publient aucune température** et corrigent les dérives de température par des pneus de référence. On ne peut pas en tirer de conclusion « à froid ».

**Conclusion sur cette question :** NON TRANCHÉ.
- Les seuls indices pour « le toutes-saisons bat l'été au froid » sont relayés. Ils portent sur +2 °C (UTAC) et ~7 °C (Sport Auto, avec un pneu été ancien).
- Les tests faits par temps plus doux (ou à température inconnue) montrent en général un pneu été devant.
- **Aucune donnée vérifiée n'oppose le PremiumContact 7 ou l'Eagle F1 Asymmetric 6 au SF3 ou au Vector All Season 4 dans un même test à 5–10 °C.**

---

## Lecture prudente

### Ce que les données permettent de dire

- **Dans un même test**, avec le même véhicule et la même taille :
  - **PremiumContact 7 et Eagle F1 Asymmetric 6** sont à égalité au freinage mouillé 80-0 chez Auto Bild 2025 (28,3 m chacun, 225/40 R18, BMW Série 1). L'Eagle F1 est légèrement plus rapide au cercle mouillé, le Continental légèrement meilleur en aquaplaning longitudinal et en vitesse de handling.
  - **Vector All Season 4 et SF3** sont quasiment à égalité au freinage mouillé chez Auto Bild 2026 en 225/45 R17 (43,4 m contre 43,3 m). Le Goodyear est légèrement devant en handling, cercle et aquaplaning.
  - Chez Auto Bild 2026 en 225/55 R18, le Goodyear freine 0,9 m plus court que le SF3.
  - Dans le rapport TÜV commandé par Goodyear, le SF3 est nettement derrière en freinage low µ (90,6 %) et quasi égal en high µ (99,7 %).
- **Les deux pneus été** sont chacun en tête ou presque sur mouillé chez l'ADAC (note mouillé 1,7 chacun). Mais **pas dans le même test ni dans la même taille** : PremiumContact 7 en 225/50 R17 (2026), Eagle F1 en 225/40 R18 (2025).
- **Le SF3 est le seul des 4 pneus principaux testé par l'ADAC en 225/45 R17** : 32,5 m en 80-0 sur asphalte mouillé, 2,8 m/s² en courbe, meilleur valeur du test.

### Ce que les données ne permettent PAS de dire

- On ne peut pas **comparer des distances entre tests différents.** Exemple : 30,1 m pour le PremiumContact 7 (ADAC été 2026) contre 32,5 m pour le SF3 (ADAC toutes-saisons 2025). Taille, année, campagne et température ne sont pas les mêmes, alors que le site et la méthode sont proches.
- Les valeurs Auto Bild « 100-0 » ne se comparent pas aux 80-0 de l'ADAC.
- On ne peut pas **prédire une distance de freinage pour un autre véhicule** à partir de ces chiffres.
- On ne peut **pas encore répondre** à « un pneu été premium bat-il un bon toutes-saisons sur mouillé à 5–10 °C ? » pour ces modèles. Aucune mesure primaire vérifiée n'existe.
- On ne peut **rien conclure pour le Rovelo RPX-988**, au-delà d'une étiquette UE de classe C (relayée) et d'un test Auto Bild de 2017 relayé, dont la taille est incohérente.
- Les **notes ADAC** sont pondérées différemment selon la saison : mouillé 60 % pour l'été, 45 % pour le toutes-saisons. Une « note mouillé » été et une « note mouillé » toutes-saisons ne sont pas sur la même échelle de pondération.

### Indice de confiance par pneu

| Pneu | Statut | Sources primaires indépendantes | En 225/45 R17 ? |
|---|---|---|---|
| Continental PremiumContact 7 | **CONFIRMÉ** | ADAC 2026 (225/50 R17), Auto Bild 2025 (225/40 R18) | Non (Auto Zeitung 2024 relayé seulement) |
| Goodyear Eagle F1 Asymmetric 6 | **CONFIRMÉ** | ADAC 2025 (225/40 R18), Auto Bild 2025 (225/40 R18) | Non |
| Goodyear Vector All Season 4 | **À VÉRIFIER** | Auto Bild 2026 ×2 (même éditeur, sponsoring Goodyear partiel) + TÜV commandé par Goodyear | Oui (Auto Bild 2026) |
| Pirelli Cinturato All Season SF3 | **CONFIRMÉ** | ADAC 2025 (225/45 R17), Auto Bild 2026 (225/45 R17), Auto Bild 2025 (225/40 R18) | Oui (deux fois) |
| Rovelo RPX-988 | **BLOQUÉ** | Aucune | — |

### Blocages rencontrés

- tyrereviews.com, tire-reviews.com et reviews.tyrereviews.com : HTTP 403 (4 tentatives). Le contournement par curl a été refusé par les règles d'autorisation.
- tiresvote.com : HTTP 403.
- Deux URL de fiches Auto Express affichaient d'autres pneus que celui demandé.
- Pages autozeitung.de et aftonbladet.se non trouvées.
- Rapport TÜV : PDF lisible, mais résultats en % seulement.
