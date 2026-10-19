# Garage Life — audit, laboratoire et contrat d'intégration (19/10/2026)

**Décision : GO uniquement pour le prototype fictif en mémoire ; NO GO pour l'intégration des vraies données, le coffre, les sauvegardes, les factures, la fusion ou le déploiement tant que les verrous décrits ci-dessous ne sont pas levés.**

## 1. Constat sur le dépôt (base contrôlée)

- `main` au démarrage : `532ad91be3c94e4be2faf385c3cf1c0df6ce5004`, Twin Garage Live V1.4 (#187).
- `src/garage.js` : projection pure de `S.cars`, relevés `car.odo`, état pneumatique ; ce **n'est pas** un carnet mécanique.
- `src/app/garage-view.js` : cartes, `uxFold`, focus et scène ; `src/app/garage-scene.js` et `src/app/garage-style.js` : silhouettes et animations. **Aucun de ces fichiers n'est modifié ici.**
- `src/session-vault.js` : `twrc.vault.v2`, enveloppe chiffrée AES-256-GCM, dérivation PBKDF2-SHA256 600 000 itérations, clé enveloppée en session. `twrc.*` non public est destiné au MemStore, et les écritures doivent être vérifiées au niveau du coffre. Un nom de clé n'est cependant pas, à lui seul, une garantie de conservation.
- `src/device-storage.js` : mécanisme de journal et reprise d'import ; ancien verrouillage V1 séparé. Toute modification à cette couche est sensible.
- `src/backup.js` : Backup V2 transmet des réglages et une sélection d'états durables. **Aucune structure Garage Life V1 n'y est enregistrée.** Le rapport `docs/fortress-ii-consolidated-review.md` établit des lacunes sur les observations météo et la couverture exhaustive.
- PR ouvertes pertinentes lors de l'audit : #182 et #184 (protection contre pertes/écrasements lors de restaurations). Ne jamais intégrer Garage Life en ignorant leur issue.
- `AGENTS.md` requiert autorisation explicite pour les chemins et travaux sensibles et vérification CI exacte avant fusion.

## 2. Livrables présents, tous isolés

`garage-life-preview/index.html` et `style.css` : prototype autonome, palette et blocs inspirés de Twin Garage, fiches A/B fictives, thèmes, panneaux natifs comparables à `uxFold`. Il n'est **pas encore raccordé** au véritable `uxFold` : ce raccord nécessite l'intégration coordonnée après fusion des travaux d'animation.

`app.js` : plusieurs opérations fictives, formulaire validé, distinction interventions/échéances, tableau des dépenses réellement saisies, kilométrage du relevé déclaré le plus récent, objectif libre et aucune projection de durée de vie.

`model.js` : API `empty / add / setGoal / summary / validateState / roundTripFixture`, version V1, montants en **centimes entiers**, dates calendaires vérifiées, kilomètres entiers vérifiés, doublons de référence ou de contenu exact refusés, champs futurs inconnus interdits pour éviter une perte silencieuse ; aucune source constructeur artificielle. `schema.v1.json` décrit la structure documentaire.

`tests/test_garage_life_preview.js` : tests de laboratoire autonomes. Leur présence ne prouve ni exécution automatique par la CI existante, ni compatibilité physique iPhone.

**Garde-fous :** pas d'accès aux voitures réelles, profil, clé `twrc.*`, `localStorage`, `sessionStorage`, IndexedDB, import/export, factures, réseau ou permissions. Aucune donnée n'est durable dans le prototype : un rechargement revient aux exemples. Il ne faut jamais y saisir des données réelles.

## 3. Contrat métier versionné

État V1 = `{schemaVersion:1, vehicles:[{id,name,goalKm}], operations:[]}`.
Chaque opération = `{id,vehicleId,date,odometerKm,category,description,amountCents,provider,provenance,evidence:null}`.

- `provenance=DECLARED_DONE` : déclaration d'opération réalisée. Même réalisée, cela **n'atteste ni la qualité des travaux ni l'état général du véhicule**.
- `provenance=USER_ENTERED_DEADLINE` : échéance explicitement fournie ; aucun coût réalisé attribué ; aucune règle d'entretien automatique.
- `MAKER_SOURCED` est **réservé à une phase future** avec identifiant documentaire, véhicule/version, source officielle et validité. Ce type n'est **pas accepté** dans la V1.
- `UNKNOWN` est un état d'affichage, non une intervention inventée.
- `amountCents=null` signifie coût inconnu, différent de zéro euro déclaré. Somme comptable seulement des sommes renseignées.
- Dernier kilométrage = dernier relevé **daté parmi les interventions déclarées**, pas valeur la plus grande ni compteur courant certain. Si deux relevés différents portent la même date la plus récente, afficher un conflit et aucun compteur de référence. En intégration, arbitrer explicitement la relation avec `car.odo` sans créer deux compteurs « actuels » concurrents.
- Objectif kilométrique : facultatif ; aucune durée de vie ni taux de progression temporel calculé.

## 4. Proposition pour une intégration future, NON implémentée

1. Sur dernière base `main` et après coordination animation, ajouter un panneau `uxFold` à chaque carte, via un module isolé. Garder les mêmes `data-act`, focus, styles et mécanismes de rerender, sans régénérer la scène météo. **Pas d'intégration directe de ce prototype autonome en production.**
2. Envisager une clé logique `twrc.garage-life.v1` **dans le MemStore chiffré EXISTANT** et jamais un `localStorage` ou IndexedDB en clair. C'est une hypothèse de conception, pas une clé créée ou activée. Tester relecture/déchiffrement, échec/quota, verrouillage, concurrence et transactions réelles du coffre avant autorisation.
3. Faire évoluer la couverture Backup (version/manifest contrôlés), restauration et `recoveryPlan` : sauvegarde de cette clé, vérification cryptographique, inventaire exhaustif, union sans perte, stratégie de conflits déterministe **non destructive**, rollback et refus sur version inconnue. Toute importation doit bloquer avant écriture si une entrée n'est pas représentable.
4. Tester entièrement l'aller-retour sur **deux profils fictifs** isolés, appareils/origines simulés, restauration après coupure ou quota, code erroné, chiffrement corrompu, source ancienne, deux onglets concurrents, anciens formats V1/V2, et absence de suppression de journaux météo/états pneus existants. Ajouter des tests navigateur Chromium + WebKit et mobile 320/375/414px et PC 1440px.
5. **Pièces justificatives : désactivées.** Étudier à part un conteneur chiffré authentifié, limites de taille, protection des métadonnées, sauvegarde/export, suppression volontaire sûre et restauration vérifiée ; aucune pièce brute en IndexedDB, Cache Storage ou `File` public. Le navigateur peut évincer son stockage ; un coffre local seul ne constitue pas une sauvegarde multiannuelle garantie.
6. Migration explicite, versionnée et réversible, sans réécrire les entrées `car.odo` historiques ni altérer les données réelles. Établir auparavant une sauvegarde chiffrée complète testée et indépendante, ainsi que le plan de reprise. Ne pas faire de promotion silencieuse de V1 en production.

## 5. Validation / preuves et limites

Commandes une fois les fichiers disponibles dans un checkout isolé :

```sh
node tests/test_garage_life_preview.js
node tests/e2e_garage_life_preview.js  # nécessite npm ci et navigateurs Playwright installés
python3 -m http.server 8765 --directory garage-life-preview
# Ouvrir http://127.0.0.1:8765 et essayer les deux fiches, thèmes et tailles d'écran.
```

La suite vérifie données fictives A/B, historique, coûts exacts en euros, dates réelles et bissextiles, kilomètres impossibles, doublons, échéances, objectifs, formes inconnues, aller-retour JSON fictif et refus d'écriture/lecture de stockage en clair dans le prototype.

**Ne pas confondre :** `roundTripFixture()` démontre seulement l'intégrité d'une sérialisation JSON **en mémoire** ; il ne prouve PAS une sauvegarde chiffrée, une reprise après crash, Safari iOS ni la rétention à plusieurs années. Le scénario Playwright dédié couvre Chromium/WebKit sur 320/375/414/1440 px, interactions réelles, réseau externe absent, stockage navigateur vierge et rechargement sans sauvegarde ; **il reste à exécuter** dans un environnement ayant les deux navigateurs. Les tests CI existants, matrices navigateur, analyse confidentialité et test iPhone physique restent à exécuter sur la version intégrée après validation.

## 6. Coordination, acceptation et retour arrière

- Branche **`feat/garage-life`** exclusivement. Aucun push `main`, aucune édition des panneaux `src/app/garage-*`, `src/app.js`, `tools/build.js`, `src/session-vault.js`, `src/backup.js`, `src/device-storage.js`, workflows, SW ou `encrypted/**`.
- Fichiers nouveaux uniquement : `garage-life-preview/**`, `tests/test_garage_life_preview.js` `tests/e2e_garage_life_preview.js` et ce document.
- PR en **DRAFT** tant que le prototype n'est pas validé/branché par une revue UX, que les tests navigateur et la CI exacte ne sont pas conclus. La présence d'un nouveau module expérimental n'autorise pas une fusion de production.
- Pour toute PR future de persistance, sauvegarde, restauration, chiffrement, justificatifs ou migration : **accord écrit distinct du propriétaire avant fusion même si tous les contrôles sont verts**.
- Fusion future non sensible : rebaser sur dernier `main`, détecter conflits multi-agents, rejouer tous les contrôles requis et vérifier le commit exact. Après fusion, vérifier CI et `gh-pages/race-control/version.json` + site servi ; aucune affirmation « livré » avant ces preuves.
- Retour arrière du laboratoire : fermer sa PR et ignorer sa branche, **sans manipuler le coffre**, puisqu'aucune donnée réelle n'a été utilisée.

**Verdict : laboratoire et architecture de référence ; NO GO activation de la conservation et NO GO publication.**
