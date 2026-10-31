# Plan — Reconnexion Google Drive au premier geste (option 2)

Statut : **plan écrit, aucun code**. PR en brouillon **après la fusion de #285**.
Revue obligatoire du propriétaire : authentification Google (AGENTS.md, « security- or data-sensitive work »).
Décisions du propriétaire : option 2 retenue ; option 3 (jeton longue durée conservé par un serveur) **refusée** ; option 4 (copie locale automatique) **reportée**.

## 1. Constat (état de `main`, `bc1ea10`)

- Le jeton Google vit **uniquement en mémoire** (`src/google-drive-session.js`) : perdu à chaque ouverture de page, à la fermeture de l'onglet (`pagehide` → `stop`, `src/app/drive-sync-view.js`) et à son expiration (~1 h ; l'app le tient pour expiré 30 s avant).
- La reprise exige un geste (`connect()` ouvre la fenêtre Google avec `prompt: 'select_account'`), puis `resume()` revérifie la liaison compte + dossier par empreinte, sans nouveau choix de dossier.
- Conséquence sur PC : un clic sur « Reconnexion requise » à chaque ouverture, puis toutes les heures.
- **Défaut annexe** : le compteur « N modifs en attente » (`DRIVE_BADGE.pending`, ligne 112) n'existe qu'en mémoire. Après réouverture, le badge affiche « Reconnexion requise » **sans** le nombre de modifications non envoyées, alors qu'elles existent.

## 2. Objectif

Le premier geste ordinaire de l'utilisateur dans l'app (clic, touche) suffit à rétablir la synchro, sans choix de compte, sans choix de dossier, sans affaiblir les garanties actuelles.

## 3. Conception

1. **Renouvellement silencieux** : nouvelle fonction `renew()` dans la session Google, appelée seulement si une liaison confirmée existe (`resumeHint`). Elle demande le jeton avec `prompt: ''` (aucun écran si le consentement existe déjà) et l'indice du compte lié, puis enchaîne `resume(hint)` sans aucune différence.
2. **Déclencheur** : un seul écouteur `pointerdown` / `keydown` au niveau de la page, actif tant que la synchro est en pause et la liaison connue. Une tentative au plus par chargement de page et par expiration ; aucun réessai en boucle.
3. **Renouvellement anticipé** : si le jeton expire dans moins de 10 minutes, le prochain geste le renouvelle avant l'expiration (plus de coupure horaire pendant l'usage).
4. **Échec** (fenêtre bloquée ou fermée, compte différent, réseau) : retour exact au comportement actuel (« Reconnexion requise », un appui). Jamais d'approbation implicite d'un autre compte ; l'empreinte compte + dossier reste exigée.
5. **Compteur persistant** : le nombre de modifications en attente est déduit de l'état local déjà chiffré (écart entre l'état local et la dernière révision envoyée), et non plus d'un compteur en mémoire. Il est donc juste après réouverture.
6. **Inchangé** : jeton jamais stocké (ni stockage local, ni Service Worker, ni URL) ; portée `drive.file` seule ; aucun serveur ; aucune donnée nouvelle hors du coffre chiffré. Si l'indice de compte doit être conservé, il l'est dans le coffre chiffré, jamais en clair.

## 4. Fichiers touchés

- `src/google-drive-session.js` (authentification) : `renew()`.
- `src/app/drive-sync-view.js` : déclencheur, renouvellement anticipé, compteur persistant.
- `AGENTS.md` : ajout de `src/google-drive-session.js` à la liste des chemins sensibles (revue propriétaire).

## 5. Preuves exigées

- Unitaires (fournisseur Google simulé) : `prompt: ''` utilisé seulement avec liaison confirmée ; compte différent → aucune approbation ; réponse tardive d'une ancienne demande ignorée ; aucun jeton écrit dans un stockage (espion sur `localStorage`, IndexedDB, Cache) ; une seule tentative par chargement.
- Compteur : modification saisie, page rechargée → le badge affiche toujours la modification en attente.
- E2E Chromium + WebKit avec Google simulé ; chaque nouveau test E2E passe **10 fois de suite en local** avant l'ouverture de la PR (Chromium ; WebKit par la CI seulement).
- Mutation : sans la vérification d'empreinte dans `renew()`, un test doit échouer.
- Réel : test du propriétaire sur PC (Chrome/Edge) puis iPhone. **À VÉRIFIER** : le comportement exact de la fenêtre Google avec `prompt: ''` (s'ouvre-t-elle brièvement, se referme-t-elle seule) sur chaque navigateur.

## 6. Risques et limites

- Une fenêtre Google peut apparaître brièvement au premier geste : acceptable sur PC, à juger sur iPhone (option possible : activer seulement sur PC).
- Si le navigateur bloque la fenêtre, le comportement actuel s'applique : aucune régression, aucune perte.
- Sans aucun geste (app ouverte mais inutilisée), rien n'est envoyé : les saisies restent dans le coffre local. Seule l'option 3, refusée, l'éviterait.
