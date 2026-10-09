# Race Control — Départ personnalisé par rendez-vous (conception avant code)

**Statut : STABILITY FIRST · contrat de correction · lecture seule du code de référence.**

Base observée : `main` @ `9db92a01ed707ea3270533e9f20fd6f9e6c66683` (fusion #91). Cette branche ne présume pas que le déploiement associé est terminé. **Ne pas fusionner une implémentation avant CI post-fusion verte, protection GitHub vérifiée ou exception explicite, et tests iPhone physique.**

## Besoin fonctionnel

L'onglet **Météo → Prochain trajet** affiche actuellement l'origine d'un trajet calendrier, souvent `Domicile`, sans pouvoir l'éditer. Le formulaire de l'onglet Trajet sait choisir domicile / lieux enregistrés / GPS / recherche manuelle, mais enregistre **un nouveau trajet manuel** et ne modifie pas l'occurrence Agenda.

La commande discrète `Modifier le départ` doit permettre d'indiquer **l'origine de cette seule jambe ALLER**. Elle doit conserver à l'identique les cinq onglets, le cockpit, les couleurs, les priorités du DOM, les cartes, le scroll et les commandes principales. Aucun changement à Google Agenda/ICS ou au lieu météo affiché.

## Architecture actuelle vérifiée

- `src/app/weather-view.js :: renderWx` : bloc `wx-trip` rendu à partir de `wxDesk(...).trip`. Pas de bouton de départ.
- `src/app/trip-view.js :: tripRecommendedOrigin, tripOriginValue, tripProgram` : choix disponibles, mais planificateur manuel.
- `src/app/day-context.js :: appAgendaLeg` : adapte ponctuellement une origine confirmée aujourd'hui ; exclut explicitement les trajets futurs / `#maison`.
- `src/userctx.js :: DayContext.rebaseAgendaOrigin` : invalide la géométrie, la durée, les points météo ; maintient `originPlannedDep` et `targetArr`, sans muter le relais.
- `src/app.js :: effLegs` : restitue `appAgendaLeg` et `tripCancelRouteLeg` ; `appBuildTrips` partage ensuite la même timeline avec Météo, Pneus, Tenue et Analyse.
- `src/app.js :: tripCancelRouteLeg, tripCancelRouteKey` : recalcul OSRM, météo et génération de requête ; empêche l'affichage d'une route obsolète pendant la préparation.
- `src/trip-cancel.js :: TripCancel.eventId, identifiable, rebuild` : identité d'occurrence et annulations. Deux occurrences techniques indiscernables doivent empêcher une édition ambiguë.
- `src/app.js :: S.calDirect` : choix d'enchaînement existant. Ne pas le remplacer par un nouveau mécanisme parallèle.

## Contrat de données proposé — à valider par tests

**Une seule projection canonique** : un override local explicite, normalisé et borné, associé à `TripCancel.eventId(event)` et à la jambe `go`. La source de vérité des trajets reste le moteur Agenda / `appBuildTrips`, non l'éditeur.

Proposition `dayContext.agendaOrigins[eventOccurrenceKey]` (à préférer à une seconde clé de stockage) :

```ts
type AgendaOriginOverride = {
  eventStart: string;             // heure d'occurrence locale valide
  originId: string | null;        // lieu enregistré, résolu au calcul
  originPoint: Point | null;      // point choisi explicitement (GPS / adresse)
  source: "saved" | "manual" | "gps";
  confirmedAt: number;
  updatedAt: number;
  expiresAt: number;
};
```

Règles : une entrée par occurrence identifiable, au plus 32 entrées, expiration limitée à l'événement + 24 h ; une modification ou annulation n'affecte pas les autres occurrences. Pour un point privé, ne jamais utiliser une donnée non chiffrée. Le GPS **d'aujourd'hui** ne vaut pas origine de demain sauf si l'utilisateur confirme explicitement un point comme futur départ. Suppression de l'override = retour à la planification automatique.

**Persistance :** projeter l'objet dans `DayContext.clean`, `userContextStore` et `Backup.dayContext` (export V2 si possible sans rupture). Valider lors du restore, gérer les clés ambiguës, la durabilité du coffre et les conflits. Le schéma doit être démontré par tests import ancien/nouveau, mode hors ligne et verrouillage. Vérifier la protection réelle du mode coffre avant toute saisie d'adresse privée ; pas de fallback en clair.

## Règles de priorité

1. Si événement annulé / exclu / terminé : aucun trajet recréé.
2. Si trajet déjà démarré : préserver le départ réel, interdire l'édition rétroactive.
3. Si origine manuelle confirmée pour l'occurrence : elle prime sur l'origine prévue du relais pour **l'aller seulement**, et ce remplacement est affiché explicitement même si l'agenda porte `#direct` ou `#maison`.
4. Sinon : conserver exactement `appAgendaLeg` / `TripCancel.rebuild` / règles `#direct`, `#maison` et enchaînements de la base.
5. Retour et rendez-vous suivants : aucun changement de départ par propagation implicite.
6. Tout nouveau point invalide route, kilométrage, horaires et météo de l'ancienne origine, mais conserve la cible d'arrivée lorsque connue. Si le nouveau calcul échoue : statut indisponible/à recalculer, sans réutiliser des chiffres obsolètes comme s'ils étaient nouveaux.

## UX

- Une commande textuelle `Modifier le départ` **dans** la carte `wx-trip`, sans nouvel onglet / aucune modification de la hiérarchie primaire.
- Au clic : détail compact, repliable, utilisant les composants `.btn`, `.chip` et les champs existants. Domicile, lieux connus, adresse libre résolue par `GeoSearch`, GPS uniquement si autorisé et actuel.
- `Valider` / `Annuler` / `Réinitialiser pour ce rendez-vous`. Aucune mutation en cours de saisie.
- Préserver brouillon, focus, détails ouverts et scroll pendant `renderAll` / actualisation météo.
- `aria-label` explicites, IDs uniques par occurrence, tabulation et VoiceOver.
- Pour un départ futur sans GPS pertinent, présenter clairement `Position actuelle — non utilisée automatiquement pour demain`.

## Phasage pour une PR d'implémentation indépendante

- **ORI-00** : tests rouges ciblés + contrat d'identité / stockage / priorités. Vérifier la CI post-fusion #91 avant tout changement applicatif.
- **ORI-01** : normalisation persistante et migration sauvegardes, pur/transactionnel, fixtures sans adresses réelles.
- **ORI-02** : appliquer l'override dans `appAgendaLeg` avant les réévaluations de trajet, dans les deux chemins normal et annulation. Recalcul unique via les mécanismes existants.
- **ORI-03** : intégration UX minimale dans `renderWx`, recherche sans doublons et actions déléguées.
- **ORI-04** : tests Chromium/WebKit, GPS, offline, SCHEMA, SW, import, #direct/#maison, multiples RDV, changement de jour, restauration puis recette iPhone 11 Pro Max physique.
- **ORI-05** : PR brouillon soumise à revue avec captures avant/après, aucun merge ni déploiement automatique.

## Critères GO

- Zéro nouveau calcul météo/pneus et zéro deuxième source de vérité pour les trajets.
- Même cinq onglets et cockpit avec ou sans édition.
- Même agenda, autre origine **uniquement** sur l'occurrence choisie ; coordonnées privées jamais persistées en clair.
- Nouvelle route/ETA/heure de départ/météo affichées atomiquement ou statut `en recalcul`; aucune valeur périmée estampillée actuelle.
- Build + CI complète verts sur SHA exact, tests retour arrière, recette iPhone physique, et contrôle des conflits avec d'autres agents.

**Aucune garantie de cette liste ne vaut validation tant que le code et les tests correspondants n'existent pas.**
