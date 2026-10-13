# Forteresse II — Phase 5 : deux copies locales de la vraie application

> **BANC D'ESSAI, PR DRAFT. Aucune fusion, migration ou modification de production.**

## Objet

Les étapes #134–#137 démontraient l'isolation et les transactions par des scripts
autonomes. Ce test exécute réellement **l'application compilée depuis `src/`**
avec la configuration et le calendrier artificiels générés par
`tests/ci/workspace.prepare()`, puis présente deux copies statiques sur
**deux ports `127.0.0.1` différents** à Chromium et WebKit.

Le navigateur est un contexte neuf sans profils utilisateurs. Seules les deux
origines loopback sont autorisées ; fonts, météo tierce, géocodage, site public
et toute autre destination sont systématiquement bloqués. Aucun serveur public,
compte, iCal, secret privé ou vrai coffre n'est lu. Les clés sont celles du jeu
de tests de la CI, et non les clés de production. Aucun artefact contenant les
états privés de la copie de test n'est publié.

## Scénarios

1. La PWA compilée démarre, ses faux préréglages se déverrouillent via son
   **vrai SessionVault** et deux origines disposent de coffres distincts.
2. La modification d'un véhicule fictif dans la première copie ne se
   propage pas à la seconde.
3. L'application accepte deux fausses observations humaines
   (`twrc.reports.v1` et `twrc.shadow.v1`) dans son coffre chiffré.
   **Le vrai Backup V2 ne les inclut pas**, donc le contrôle préparatoire
   rend un **NO GO** et n'essaie pas de restaurer ces données.
4. Après suppression **uniquement de ces deux observations inventées**
   dans la copie de test, l'export intégré est téléchargé via l'interface
   officielle de l'application. Le fichier est une enveloppe AES-GCM V2
   et ne contient pas les noms fictifs en clair.
5. La véritable interface d'import de la seconde copie refuse un mauvais
   mot de passe, puis accepte l'archive de test authentique avec confirmation.
   Après rechargement, les réglages conservés par Backup V2 sont présents.
6. Les deux coffres demeurent chiffrés à la fin ; aucun réglage brut n'est
   laissé dans le localStorage physique.

## Limitations explicites

- **Ce n'est pas une migration du coffre complet.** Les observations humaines,
  clés dynamiques et les sous-champs non conservés par Backup V2 nécessitent
  un nouvel exporteur/importeur exhaustif à étudier ultérieurement.
- Les copies partagent le même code source mais aucune clé ni aucun état
  de navigateur avec l'utilisateur. Les deux URL ne sont **pas** les URL
  de production, ni un futur hébergeur Cloudflare.
- Le test désactive les Service Workers et toute requête internet :
  il ne prouve pas le fonctionnement offline, la météo LIVE, le relais,
  les en-têtes HTTP de Cloudflare, ni la liaison CORS future.
- WebKit Playwright sur runner Linux n'est pas une validation Safari
  sur iPhone 11 Pro Max physique.
- Les éventuels incidents du test peuvent révéler une fragilité dans
  le script de test ou dans l'app existante; documenter et isoler avant
  de proposer tout changement du code en production.

**GO : copie fictive, PR-only, vérification du flux V2 réellement supporté.**
**NO GO : fusion, nouveau domaine, migration du coffre réel, DNS et déploiement.**
