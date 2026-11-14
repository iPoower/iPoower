# Boîte de dépôt · format `rc-depot-v1`

Saisies préparées par Claude (à partir de photos : ticket de carburant, compteur, manomètre, jauge de profondeur, facture d'entretien),
**collées par Bryan** dans Race Control (Garage → « 📥 Saisies préparées par Claude »), puis **validées ou rejetées une par une**.
Rien n'est enregistré sans un clic sur « Valider ». Aucun code de déverrouillage, aucun accès Drive : un simple copier-coller.

## Consigne à donner à Claude

> Prépare un bloc JSON `rc-depot-v1` pour Race Control à partir de ces photos. Respecte strictement le format de `docs/BOITE_DE_DEPOT.md`
> (aucun champ en plus). Une saisie par mesure. Statut `measured` pour une valeur lue, `estimated` seulement pour une profondeur estimée.
> Si une valeur est illisible, ne l'invente pas : laisse le champ facultatif de côté ou ne crée pas la saisie, et dis-le.

## Enveloppe

```json
{
  "format": "rc-depot-v1",
  "source": "claude",
  "createdAt": "2026-04-01T07:00:00Z",
  "entries": [ ... ]
}
```

- `format`, `source` et `entries` obligatoires ; `createdAt` facultatif. **Tout autre champ fait refuser le bloc.**
- 1 à 50 saisies, 32 Ko au plus. Le bloc peut être entouré de ```` ```json ```` (copié tel quel depuis la conversation).

## Saisie

| Champ | Règle |
|---|---|
| `id` | unique, `dep-` puis 4 à 36 caractères `a-z 0-9 -` (ex. `dep-plein-20260328-a`) ; sert aussi à éviter les doublons |
| `date` | `AAAA-MM-JJ`, jamais dans le futur |
| `car` | nom court ou nom de la voiture dans Race Control (sans tenir compte des majuscules) ; inconnu → Bryan choisit |
| `type` | `fuel`, `odometer`, `pressure`, `tread`, `tireMount`, `maintenance` |
| `status` | `measured` ; `estimated` accepté **uniquement** pour `tread` |
| `values` | selon le type (tableau ci-dessous), liste fermée |
| `note` | facultative, 80 caractères au plus, sans `<` ni `>` |

## Valeurs par type

| Type | Champs (`*` obligatoire) | Effet après « Valider » |
|---|---|---|
| `fuel` | `amountCents`* (entier, 6050 = 60,50 €), `litres` (≤ 3 décimales), `km`, `fullTank` (vrai : litres et km requis), `fuelType` (`diesel`, `diesel-premium`, `sp98`, `sp95-e5`, `sp95-e10`, `e85`, `other`, `unknown`) | ligne du budget « Coût & rentabilité » |
| `odometer` | `km`* | relevé du compteur (refusé s'il contredit la chronologie ou un autre relevé du même jour) |
| `pressure` | `av` et/ou `ar` (bar, 0,8 à 5), `T` (°C) | contrôle des pressions mesurées (refusé si un contrôle plus récent existe ou s'il précède le montage actuel) |
| `tread` | `mm`* (0 à 12, 1 décimale), `ax`* (`av`, `ar`, `both`) | relevé de profondeur (un relevé ancien entre dans l'historique sans remplacer la valeur actuelle) |
| `tireMount` | `type`* (`summer`, `winter`, `allseason`), `brand`, `model`, `size`, `dot` (4 chiffres), `km` | pneus montés à cette date ; l'ancien jeu est rangé avec ses mesures |
| `maintenance` | `kind`* (`revision`, `ct`), `km`, `amountCents` | dernière révision ou dernier contrôle technique ; dépense ajoutée au budget si un montant est donné |

## Exemple (données fictives)

```json
{"format":"rc-depot-v1","source":"claude","entries":[
 {"id":"dep-plein-0001","date":"2026-03-28","car":"Test A","type":"fuel","status":"measured","values":{"amountCents":6050,"litres":35.5,"km":12000,"fullTank":true,"fuelType":"diesel"},"note":"Station fictive"},
 {"id":"dep-odo-0001","date":"2026-03-29","car":"Test A","type":"odometer","status":"measured","values":{"km":12100}},
 {"id":"dep-prof-0001","date":"2026-03-30","car":"Test A","type":"tread","status":"estimated","values":{"mm":6.2,"ax":"av"}}
]}
```

## Garanties

- Texte collé traité comme une donnée **non fiable** : JSON strict, champs inconnus refusés, `__proto__` / `constructor` / `prototype` refusés, bornes physiques, aucun texte interprété comme du HTML.
- Une saisie invalide est affichée avec la raison et n'empêche pas les autres.
- Chaque saisie montre « avant → après » ; seule la voiture désignée change, par les mêmes chemins qu'une saisie à la main (coffre chiffré, synchronisation PC ↔ iPhone).
- Le journal des trajets n'est jamais lu ni modifié.
- Recoller un bloc : les saisies déjà enregistrées sont reconnues et ignorées.
- La liste en attente vit en mémoire seulement : fermer l'app la vide, sans rien enregistrer.
