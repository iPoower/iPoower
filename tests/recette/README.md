# Recette testeur Race Control (Phase T)

Recette cliquée comme un utilisateur, rejouable avant et après chaque correctif. Les données sont entièrement fictives : préréglage et clés de test, météo générée, Google Identity et Google Drive simulés en mémoire. Toute requête non simulée est bloquée.

```bash
node tests/run-ci.js --prepare-only                     # agenda chiffré de test (une fois)
BROWSER=chromium node tests/recette/rc-recette.js       # profil PC 1366×900
BROWSER=webkit   node tests/recette/rc-recette.js       # iPhone 13 émulé, affichage autonome
```

Variables :
- `MONKEY_MS` : durée des clics aléatoires, 300000 par défaut.
- `ONLY=parcours,exploration,monkey` : limite les parties lancées.

## Contenu

1. **Parcours (P1 à P9)**
   - P1 : premier lancement, voiture, compteur, entretien et CT.
   - P2 : export et import avec confirmation.
   - P3 : Google Drive (Préparer → Utiliser ce dossier).
   - P4 : deux appareils sur le même Drive.
   - P5 : conflit et résolution.
   - P6 : récupération sur un appareil vierge.
   - P7 : récupération après un premier lancement.
   - P8 : défauts signalés en production.
   - P9 : badge de sauvegarde, envoi automatique, expiration de session, hors ligne, arrière-plan.
2. **Exploration** : chaque bouton, lien et champ visible de chaque écran est retrouvé puis actionné. Les boîtes de confirmation sont annulées pendant l'exploration.
3. **Robustesse** : événements aléatoires dans la page (équivalent gremlins.js) avec une graine reproductible.

## Sorties (`recette-output/<navigateur>/`)

- `PARCOURS.md`, `parcours.json` : chaque étape, son résultat et le nombre d'erreurs console non expliquées.
- `MATRICE.md`, `matrix.json` : écran, élément, navigateur et résultat, avec le taux couvert. Les résultats possibles sont :
  - OK ;
  - KO ;
  - MASQUÉ (recouvert par un autre élément) ;
  - SANS EFFET VISIBLE ;
  - DÉSACTIVÉ (expliqué) ou DÉSACTIVÉ SANS EXPLICATION ;
  - NON TESTABLE ;
  - NON RETROUVÉ.
- `errors.json` : toutes les erreurs console et exceptions. Une erreur est « expliquée » uniquement si sa cause vient de la recette elle-même, par exemple une requête externe bloquée.
- `dialogs.json`, `screenshots/` (une capture par étape), `traces/*.zip` (ouvrir avec `npx playwright show-trace`).

En CI, le workflow `recette.yml` publie ce dossier comme artefact `recette-chromium` / `recette-webkit`.

## Non testable ici : check-list manuelle

- Vraie connexion Google : choix du compte, consentement, écran « application non validée » en mode Test.
- Vrai Google Drive : quotas, latence, dossier partagé, fichier supprimé depuis drive.google.com.
- Sélecteur Google Picker (« Choisir le dossier Google Drive ») : non simulé.
- iPhone physique en application d'écran d'accueil :
  - suspension réelle en arrière-plan ;
  - reprise après plusieurs heures ;
  - stockage effacé par iOS après 7 jours d'inactivité ;
  - feuille de partage pour l'export.
- Téléchargements sur iOS : « Exporter une copie chiffrée indépendante » de recovery.html.
- Notifications ntfy réelles et vrais calendriers.
