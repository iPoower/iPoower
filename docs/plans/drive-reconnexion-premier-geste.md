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

## 7. Diagnostic écrit (lecture seule, 01/11, sur `main` 6b0a622) — en attente de l'OK du propriétaire

Constat propriétaire : sélecteur de compte affiché sur iPhone avec UN SEUL compte (≈ 6 s, après un écran blanc).

1. **Sélecteur forcé — CONFIRMÉ** : `src/google-drive-session.js:89` appelle toujours `requestAccessToken({ prompt: 'select_account' })`, y compris pour une simple reprise. Google affiche donc « Accéder à l'application · Utiliser un autre compte » à chaque connexion.
2. **Garde-fou compte existant — CONFIRMÉ, à renforcer** : la reprise exige que l'empreinte `SHA-256(clientId, compte, dossier)` corresponde (`resume`, `src/google-drive-session.js:134-146`) ; le compte est l'identifiant opaque Drive `about.get → user.permissionId` (`src/drive-transport.js:388-398`). Il n'existe pas de message dédié « autre compte Google » : un compte différent échoue en « confirmation ».
3. **`login_hint` — À DÉCIDER** : Google n'accepte comme indice qu'une **adresse e-mail** ou l'identifiant OpenID **`sub`**, pas `permissionId`. Proposition : conserver l'e-mail du compte lié (`identity.label`, déjà lu par `about.get`) **dans le coffre chiffré** comme indice, et `permissionId` comme **garde-fou** (comparaison obligatoire après chaque jeton, refus explicite sinon). Sans indice, `prompt: ''` seul laisse Google choisir le compte connecté (souvent suffisant avec un compte unique).
4. **Création automatique d'un fichier de synchro alors qu'un fichier est connu — DÉFAUT CONFIRMÉ** : `src/drive-sync.js:91-104`. Si le dossier ne liste **aucun** profil (`profiles.length === 0`, catalogue vide) et qu'aucune création n'est en cours, l'app **crée un nouveau profil de synchro** (`SyncKey.create`, envoi), puis **remplace** `s.profile` (empreinte du profil connu) par le nouveau. Cela arrive si l'on se connecte avec un **autre compte** ou au **mauvais dossier** (avec la portée `drive.file`, le dossier paraît vide). Correction proposée : si `s.profile` (ou une liaison) est déjà connu et que le profil est absent → **arrêt explicite** (« fichier de synchronisation attendu introuvable : vérifie le compte et le dossier »), jamais de création ; création seulement au tout premier appairage, sans profil connu localement.
5. **Indice de reprise** : `DriveSync.resumeHint` (`src/drive-sync.js:52-55`) ne garde que dossier + empreinte (IndexedDB de l'app) : aucun e-mail aujourd'hui, donc aucun `login_hint` possible sans stocker l'e-mail (dans le coffre, cf. 3).

**Plan de code proposé (après OK)** : (a) `prompt: ''` + `login_hint` = e-mail du compte lié (coffre) pour la reprise, `select_account` gardé pour « Changer de compte » ; (b) garde-fou : `permissionId` relu après chaque jeton, égal au compte lié, sinon déconnexion + message « autre compte Google : synchronisation refusée » ; (c) blocage de la création automatique décrit en 4 ; (d) compteur d'attente persistant (§ 3.5). Tests : fournisseur Google simulé (sélecteur absent en reprise, autre compte refusé, aucune création de profil quand un profil est connu — mutation), E2E 10 passages, WebKit par la CI. Chemins sensibles : `src/drive-sync.js` 🔒 (+ `src/google-drive-session.js`, à ajouter à la liste).
