# Débrief d'arrivée — spécification

Statut : **intégré sur la branche `claude/debrief`** (Draft PR, non fusionnée). Module pur `src/debrief.js`, clôture et rendu `src/app/debrief-view.js`.

Un trajet clos produit un **instantané immuable** (prévu, mesuré, thermique, observation météo), auquel le conducteur
ajoute son ressenti en deux gestes au maximum. Résultat : Race Control mesure la fiabilité de ses propres verdicts.

## Invariants (non négociables)

| # | Invariant | Garanti par |
|---|---|---|
| I1 | **Une clôture unique** : `closeTrip()` est le seul à écrire `done[key]` pour une arrivée. Les appelants ne l'écrivent plus avant lui | `e2e56-debrief.js` |
| I2 | **Un trajet = un débrief**, durablement : `Debrief.create()` est idempotent par `tripKey`, même après l'expiration de `done[key]` (24 h) | `test_debrief.js` |
| I3 | **Annuler l'arrivée annule le débrief** dans la même fenêtre de 10 min (`trip-undo`) | `test_debrief.js` |
| I4 | **Rien n'est inventé** : une mesure absente reste `null` (« Je suis déjà rentré » n'a ni durée, ni distance, ni météo observée) | `test_debrief.js` |
| I5 | **Aucune donnée personnelle persistée** : ni coordonnées, ni titre, ni adresse. Lieux = identifiants logiques (`home`, `work`, `cal`…) | `test_debrief.js` + `check-secrets.js` |
| I6 | **Pas de confiance globale** : `thermal.confidence` est la confiance du modèle thermique ; aucun champ `planned.confidence` (le score pneus n'est pas une confiance, cf. post-mortem du 5 octobre) | `test_debrief.js` |
| I7 | **Une réponse ≠ une règle** : les motifs sont un rapport. Aucun seuil ne change automatiquement | `test_debrief.js` |

## Architecture

```
twrc.context.v1 (userctx.js) — source canonique de l'état courant, inchangée
        │
  liveArrive()  ·  returnHomeDone()  ·  placeConfirm() (arrivée sur un lieu connu)
        │                │                    │
        └────────────────┴─────────┬──────────┘
                                   ▼
                     closeTrip(t, how, evidence)
                                   │
                USER_STORE.transaction : done[key] absent ? → écrit done[key]
                                   │                    sinon → stop (I1)
                     ┌─────────────┴──────────────┐
                     ▼                            ▼
              appArrival() (inchangé)     Debrief.create(snapshot) → twrc.debrief.v1
                                                  │
                                       ┌──────────┴──────────┐
                                       ▼                     ▼
                                carte Pneus (2 h)     Journal de saison
```

Les **trois** chemins d'arrivée (quatre sites d'écriture : `placeConfirm` en a deux, plus `liveArrive` et `returnHomeDone`)
passent tous par `closeTrip()`. `trip-undo` reste le seul à effacer `done[key]` et appelle `debriefRevoke()` (sans effet si le débrief n'existe plus).

`closeTrip()` ne bloque jamais les effets propres à chaque chemin (mémoire thermique, `appArrival`, `liveReset`) : il ne décide que
de `done[key]` et du débrief. Quand `placeConfirm()` clôt le trajet vivant avant `liveArrive()`, `closeTrip()` lit lui-même les
mesures du trajet vivant, sans effet de bord (`liveTripEvidence`) : le débrief unique garde ses mesures quel que soit l'ordre.
En mode démo, aucun débrief n'est créé.

`closeTrip()` reçoit ce que l'appelant a **mesuré** et ne reconstruit rien :

| Appelant | `evidence` transmis |
|---|---|
| `liveArrive()` | `labThermTick(true)` : km, durée, plage et indice thermiques, confiance thermique |
| `returnHomeDone()` | rien (confirmation a posteriori) |
| `placeConfirm()` | les mesures du trajet vivant s'il s'agit de lui (lecture pure), sinon rien |

## API (`src/debrief.js`, pur : ni DOM, ni réseau, ni horloge, ni stockage direct)

| Fonction | Rôle |
|---|---|
| `load(raw, now)` / `serialize(state)` | Lecture tolérante (corrompu → vide), purge > 365 jours, 200 débriefs max |
| `create(state, snapshot, now)` | `{ state, record, created }`. Liste blanche stricte ; renvoie l'existant si `tripKey` connu |
| `revoke(state, tripKey, now)` | Supprime si créé il y a 10 min ou moins |
| `answer(state, tripKey, verdict, causes, now)` | `better` · `expected` · `worse`. `worse` exige au moins une cause. Ne modifie que `feedback` ; une réponse peut être corrigée |
| `card(state, now)` | Débrief non répondu le plus récent de moins de 2 h, sinon `null` |
| `journal(state, now)` | Liste, du plus récent au plus ancien, avec `status` : `pending` · `toComplete` · `answered` |
| `patterns(state)` | Causes des « pire » : 1 observation · 2 motif · 3–4 signal · 5+ suggestion |
| `summary(state)` | Compteurs et taux de conformité (`expected` ÷ réponses) |

Causes : `fog` · `rain` · `wet` · `slippery` · `wind` · `traffic` · `temperature` · `other`.

## Enregistrement (`twrc.debrief.v1`)

```
{ tripKey, src: work|cal, leg: go|ret, origin, destination, how: auto|confirmé,
  startedAt, endedAt, createdAt,
  planned:  { min, km, tyreScore, level }            | null
  observed: { min, km, kmSrc: route|estimate|time }  | null
  thermal:  { range:[min,max], s: 0–4, confidence }  | null
  evidence: { source: metar|synop|model, at, distKm, visM, spreadC, flags[] } | null
  feedback: { verdict, causes[], at }                | null }
```

`tripKey` suit les formats existants (`commute|…`, `leg|…`) : horaires et identifiant d'occurrence haché, jamais de titre.
L'observation sans source, heure ou distance est écartée : l'interface dit « Observations disponibles », jamais « observé sur ta route ».

## Interface

- **Onglet Pneus**, en tête : carte du débrief pendant 2 h, puis disparition. Pas de nouvel onglet.
- **Journal de saison** : historique, « À compléter » pour les non-répondus, motifs avec leur niveau.
- Deux gestes au maximum : *Mieux* / *Comme prévu* (enregistre), *Pire* → causes → Enregistrer.
- Rien n'est affiché pendant la phase « en cours » : le débrief n'apparaît qu'à l'arrêt.

## Intégration (cette PR)

1. `tools/build.js` : `src/debrief.js` ajouté avant `app-source`.
2. `src/app.js` : inclusion de `app/debrief-view.js`, quatre écritures de `done` remplacées par `closeTrip()`, `debriefRevoke()` dans `trip-undo`,
   section `secDbf` en tête de l'onglet Pneus, bloc dans le Journal de saison, actions `dbf-*`.
3. `tests/ci/suites.js`, `tests/test_ci_lanes.js`, `tests/interaction-audit.json` : nouvelles suites et nouvelles commandes déclarées.

Hors périmètre : observation météo de station dans l'instantané (`evidence` reste `null`), jauge de certitude.
Un trajet rouvert par `appReopenReturn()` puis clos à nouveau garde son premier débrief (un `tripKey` = un débrief).

## Tests

- `tests/test_debrief.js` : 16 scénarios (idempotence, annulation, confidentialité, aucune donnée inventée, bornes).
- `tests/debrief-countertests.js` : 9 mutations métier, chacune rejetée par au moins un scénario.
- `tests/e2e56-debrief.js` : 10 contrôles × iPhone et PC. Vrais taps pour l’interface (confirmation du lieu, carte, causes, undo) ;
  appels directs aux vraies fonctions de l’app pour ce qu’un tap ne peut pas produire (GPS auto, expiration de `done`) : doublons, nouvelle arrivée,
  expiration de `done`, trajet vivant GPS + clic avec mesures thermiques, retour sans télémétrie, stockage sans coordonnée).
