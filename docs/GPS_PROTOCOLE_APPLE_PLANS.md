# Protocole · comparaison Race Control / Apple Plans sur le même trajet

**But :** mesurer, sur de vrais trajets, ce que le mode EN DIRECT de Race Control fait moins bien (ou mieux) qu'Apple Plans. Ce protocole alimente les critères de `docs/GPS_ASSEZ_BON.md`. Il ne sert à concevoir aucune nouvelle fonction tant que le gel n'est pas levé.

## Règles de sécurité (non négociables)
- **Le conducteur ne touche à rien et ne lit aucune fiche.** Tout est noté par **le passager**. Sans passager, pas de relevé : on roule normalement.
- **Deux téléphones sur supports**, visibles du passager :
  - A : iPhone de référence, Race Control EN DIRECT, son coupé ;
  - B : un autre téléphone, Apple Plans, voix active.
- **Le conducteur suit la signalisation et Apple Plans.** Race Control est observé, jamais suivi en cas de doute.

## Préparation (5 min, à l'arrêt)
1. Choisir un trajet de 10 à 40 min, avec au moins un rond-point et une portion hors agglomération.
2. Dans Race Control, programmer le trajet (onglet Trajet), puis l'ouvrir depuis l'onglet GPS → « Démarrer ».
3. Dans Apple Plans, saisir la même destination et choisir le même itinéraire si plusieurs sont proposés. Sinon, noter « itinéraires différents ».
4. Noter : la batterie des deux téléphones, l'heure de départ, le mode de carte de Race Control (3D ou plat), la météo (sec ou pluie, jour ou nuit).
5. Lancer un chronomètre (montre du passager).

## Pendant le trajet : quoi noter
Une ligne par manœuvre annoncée par l'un ou l'autre.

| Colonne | Contenu |
|---|---|
| h | Heure ou temps du chronomètre |
| Plans | Consigne d'Apple Plans, en résumé (ex. « à droite, 200 m ») |
| RC | Consigne de Race Control au même moment (bandeau principal) |
| Écart | `=` identique · `≠` différente · `RC seul` · `Plans seul` |
| Faux ? | Consigne RC fausse : oui / non (définition dans GPS_ASSEZ_BON, C1) |
| Tard ? | Palier « 200 m » de RC apparu trop tard pour freiner calmement : oui / non |
| ± m | Valeur « GPS ± N m » affichée par RC |
| Flèche | Flèche RC sur la bonne route : oui / non |

**Événements à noter à part, avec l'heure :**
- **Sortie d'itinéraire** (volontaire pour C2, ou erreur du conducteur) : chronométrer jusqu'aux nouvelles consignes de RC, puis jusqu'à celles de Plans.
- **Perte du GPS** (« Recherche du GPS… » ou flèche figée) : début, fin, lieu type (tunnel, parking, rue étroite), sans adresse.
- **Recalcul impossible** (« itinéraire précédent conservé ») : heure.
- **Bascule à plat** (« carte 3D trop lente ») : heure.

## À l'arrivée (3 min, à l'arrêt)
1. Batterie des deux téléphones, heure d'arrivée.
2. Heure d'arrivée prévue au départ par chaque app, comparée à l'heure réelle.
3. Dans Race Control, ouvrir le journal du trajet et remplir le **relevé terrain** : consignes fausses, annonces trop tardives, pertes du GPS, batterie au départ et à l'arrivée. C'est la seule copie qui compte : elle reste chiffrée dans l'app.
4. Recopier la fiche manuscrite dans le relevé (commentaire), puis la détruire si elle contient des lieux.

## Synthèse par trajet (une ligne)
`date · durée · km · manœuvres comparées · ≠ · fausses RC · tardives RC · recalcul RC (s) / Plans (s) · pertes GPS · batterie RC (%/h) · ± moyen (m) · flèche fausse (n)`

- **Seuils** : ceux de `docs/GPS_ASSEZ_BON.md`.
- **Accord** : un trajet est « conforme » si aucune consigne RC n'est fausse et si RC n'a pas plus de manœuvres en `RC seul` ou `≠` qu'en `=`.

## Ce que ce protocole ne fait pas
- Il ne compare pas la qualité de la carte, les limitations de vitesse ni le trafic. Race Control n'affiche ni limitations ni trafic : rien à comparer.
- Il ne mesure pas une erreur de position réelle : sans récepteur de référence, on note la précision **annoncée** et la flèche « sur la route ou non ».
- Il ne s'enregistre nulle part en dehors de l'app : aucune trace, aucun lieu réel dans le dépôt public.
