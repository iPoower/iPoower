# Plan — Un seul modèle de liste par identifiant (pleins, profondeurs, compteur)

Statut : **plan écrit, aucun code**. Consigne du propriétaire : **un seul mécanisme générique**, utilisé d'abord par les pleins (PR 1a, option A), puis par les profondeurs (`treads`) et le compteur (`odo`).
Chemins sensibles touchés : `src/sync-merge.js` et `tests/fixtures/sync-merge.prod-173.js` → GO écrit du propriétaire pour chaque PR.

## 1. Constat (état de `main`, `bc1ea10`)

- `odo` et `tire.treads` sont des **tableaux fusionnés par union du contenu** (`src/sync-merge.js:168-188`). Rien n'est perdu, mais :
  - une **correction** du jour fait revenir l'ancienne valeur (6,1 corrigé en 6,0 → deux relevés le même jour, même essieu ; idem pour le compteur), ce qui est **CONFIRMÉ** sur données fictives ;
  - une **suppression** est impossible (aucune pierre tombale).
- **Conflit fantôme** (corrigé à part, PR dédiée) : `markEdit('cars.N.tire.treads')` (`src/app.js:4324`) et `markEdit('cars.N.odo')` (`src/app/season-actions.js:31`) font arbitrer ces listes comme un seul réglage → conflit dès que les listes diffèrent, avec un résultat identique quel que soit le bouton.
- Branche `jarvis/fuel-1a-readings` (`c4ebaa5`) : le carnet de pleins y a **son propre** code (`FUEL_ID`, `fuelWins`, `fuelUnion`, horodatages par plein dans `edits()` et `settings()`). C'est ce code qui devient le modèle générique, au lieu d'être dupliqué.

## 2. Modèle générique (`src/keyed-log.js`, module pur : ni stockage, ni réseau, ni horloge)

- **Stockage** : un objet `{ <id>: entrée }` sous un chemin de voiture déclaré (`cars.N.fuel`, `cars.N.treadLog`, `cars.N.odoLog`). L'identifiant est la clé, donc un chemin de réglage par entrée : deux saisies sur deux appareils ne touchent jamais le même chemin, y compris pour une version antérieure.
- **Identifiant** : préfixe propre au type (`f_`, `t_`, `o_`) + 8 à 40 caractères `[0-9a-z]` ; jamais de point, jamais purement numérique.
- **Entrée** : `rev` (révision, ≥ 1), `at` (modification), champs métier **tous présents** (`null` si vides), `del` (pierre tombale).
- **Pierre tombale** : la clé et tous ses champs restent, `rev + 1`, `del = at`. Une entrée supprimée ne revient jamais.
- **Gagnant d'une fusion** (ordre total, identique sur tous les appareils) : supprimée > révision la plus haute > `at` le plus récent > texte JSON comparé octet par octet (jamais `localeCompare`).
- **Horodatages** : le conteneur porte un horodatage constant (1) ; chaque entrée modifiée reçoit, après fusion, un horodatage strictement supérieur aux deux copies d'origine. Une version antérieure (prod-173) l'adopte donc sans conflit.
- **Clés triées** : le texte chiffré et son empreinte ne dépendent pas de l'appareil (« 0 copie au repos »).
- **Registre unique** : une table `{ chemin, préfixe, champs, validation }` déclare chaque liste. `differences()`, la boucle d'arbitrage et la fusion consultent **ce seul registre** ; le prédicat « liste additive » de la PR « conflit fantôme » y est absorbé.
- **API** : `valid`, `live` (entrées visibles, ordre canonique), `add`, `edit` (`rev + 1`), `remove` (pierre tombale), `merge(a, b)`, `stamps(before, after)`.

## 3. Compatibilité et migration des profondeurs et du compteur

- prod-173 **refuse** une fusion si `odo` ou `treads` n'est pas un tableau (`sync-merge.js:172` et `:181`). Les tableaux existants ne sont donc **jamais convertis sur place**.
- **Nouveaux champs** `treadLog` / `odoLog` (objets), créés une fois avec un contenu identique partout (comme `Fuel.ensure`). Les tableaux hérités restent lisibles et gelés : plus aucune écriture par la nouvelle version. Un appareil encore sur prod-173 peut continuer d'y ajouter ; la lecture les prend en compte.
- **Lecture unique** : `readings(car)` = tableau hérité + entrées vivantes du journal (même règle que `Fuel.readings`), avec suppression d'un doublon même jour, même valeur.
- **Corriger ou supprimer un relevé hérité** : une pierre tombale avec un identifiant **déterministe**, tiré du contenu (`t_` + empreinte), le masque. Les deux appareils calculent le même identifiant, donc aucune divergence.
- Plafond de 30 profondeurs : il porte sur les entrées vivantes. Le compactage des pierres tombales relève de la rétention (règles K1 à K7), pas de ce plan.

## 4. Découpage et ordre

| Ordre | PR | Contenu | Dépend de |
|---|---|---|---|
| 0 | #285 | Fusion déterministe | GO du propriétaire après son test sur les deux appareils |
| 1 | « Conflit fantôme » | Prédicat additif unique + tests + mutation | #285 |
| 2 | PR 1a refondue | `src/keyed-log.js` + type `fuel` ; `fuel.js` réduit au métier | 1 |
| 3 | Profondeurs et compteur | Types `treadLog` et `odoLog`, lecture unique, corrections et suppressions dans l'interface (confirmation avant chaque suppression) | 2 |

`src/keyed-log.js` et `src/fuel.js` sont ajoutés aux chemins sensibles de `AGENTS.md`, dans la PR 2.

## 5. Preuves exigées (par PR)

- Propriétés sur 2 000 paires aléatoires (graine fixe) : même texte dans les deux sens, aucune perte, pierre tombale définitive, idempotence, commutativité, « 0 copie au repos ».
- Scénarios prod-173 (copie figée `tests/fixtures/sync-merge.prod-173.js`) : un appareil ancien fusionne les nouvelles données sans conflit et sans perte, et le cas résiduel connu de transition est documenté.
- Mutations, chacune devant faire échouer au moins un test :
  1. pierre tombale non prioritaire ;
  2. horodatage par entrée retiré (conflit prod-173 attendu) ;
  3. clés non triées (copies au repos > 0) ;
  4. registre non consulté par la boucle d'arbitrage (conflit fantôme).
- Non-régression sur 2 000 profils et aller-retour export → restauration à l'identique.
- Chaque nouveau test E2E passe 10 fois de suite en local avant l'ouverture de la PR.

## 6. Points à trancher par le propriétaire

1. Noms des champs : `treadLog` / `odoLog`, ou autre.
2. Faut-il, à terme, retirer les tableaux hérités ? Proposition : seulement une fois qu'aucun appareil sur prod-173 ne reste en service, avec une PR et une preuve de restauration dédiées.
