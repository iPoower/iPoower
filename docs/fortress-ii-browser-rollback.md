# FORTERESSE II — Étape 3 : navigateur isolé et rollback fictif

> **PR de tests uniquement. Aucun export/import réel. Ne pas fusionner.**
> Complément indépendant de [la PR #134](https://github.com/iPoower/iPoower/pull/134) et de [la PR #135](https://github.com/iPoower/iPoower/pull/135).

## Constat et méthode

Les tests Node précédents utilisaient FakeStore / Service Worker en VM. Ils ne pouvaient pas prouver le comportement transactionnel **IndexedDB réel** ni l'isolation observée par un navigateur réel. Ce test cible ces limites sans utiliser le coffre de Race Control.

Le script `tests/fortress-ii-browser-isolation.js` crée **deux serveurs HTTP éphémères sur `127.0.0.1`, ports distincts**. Les ports différents constituent deux origines distinctes. Leurs URL sont totalement indépendantes de `ipoower.github.io`. Playwright ouvre les deux pages dans **le même contexte navigateur** pour démontrer que les storages sont cloisonnés par origine, avec Chromium et WebKit en CI.

Les pages hébergent uniquement une fixture JavaScript créée pour le test; **ce n'est pas l'application Race Control**. Les requêtes non destinées aux deux origines loopback sont bloquées via Playwright. Les Service Workers sont désactivés pour isoler la preuve des transactions de la preuve offline apportée en #135. Aucun secret, API, compte, domaine futur ou donnée Safari utilisateur ne sont utilisés.

## Ce qui est testé

| Test | Attendu |
|---|---|
| localStorage + IndexedDB entre deux ports `127.0.0.1` | Aucun état commun |
| Paquet chiffré fictif | AES-256-GCM, PBKDF2-SHA256 (80 000 itérations **uniquement dans le banc d'essai**), AAD liant source/destination/version, sel et IV aléatoires |
| Clé fictive inconnue | Export bloqué, aucun paquet publié |
| Session et valeurs runtime factices | Non incluses dans l'export |
| Mauvais mot de passe, paquet altéré, origine ou version incohérente | Rejet avant création du staging |
| « Quota » | **Seuil simulé avant écriture**, pas de quota navigateur réel |
| Interruption de transaction IndexedDB au staging | Transaction annulée, aucune écriture partielle |
| Activation sans consentement | Refus |
| Transaction d'activation interrompue | Active reste vide, staging fictif demeure |
| Activation explicitement confirmée | Écriture atomique dans **une seule transaction IDB** et relecture |
| Rechargement de page | État restauré toujours présent sous la bonne origine |
| Deuxième tentative de remplacement | Refus si cible déjà occupée |
| Modifications après la bascule, paquet inverse | Conflit détecté avant écrasement sur l'origine initiale |
| Origine initiale | Restée intacte pendant toutes les simulations |

Les chaînes `CAR-FAKE`, `observation-FAKE` et `NON_REAL_SESSION_STRING` sont des valeurs inventées.

## Limites déterminantes

- **Pas de migration fonctionnelle :** aucune API d'import/export ne sera ajoutée à Race Control par cette PR.
- L'activation du faux paquet écrit dans un objet **IndexedDB**, pas dans les clés réelles `twrc.*`. Une migration concrète des données mixtes `localStorage` / `IndexedDB` n'est **pas transactionnelle globalement**, même si le test IDB individuel est vert. Elle exigera un protocole distinct, avec journal de reprise et vérification après commit.
- Ce test sert sur `http://127.0.0.1`, un contexte loopback considéré potentiellement fiable. Il **ne démontre pas** HTTPS/CSP/CORS ni le vrai `pages.dev`, les en-têtes et la chaîne de publication.
- WebKit Playwright **ne remplace pas** une validation sur iPhone physique avec installation PWA, stockage préexistant, veille, permissions et mode offline.
- **PBKDF2 80 000 itérations n'est pas le coût du coffre actuel**, qui exige son propre audit/contrôle. Aucun paramètre cryptographique ici n'autorise un affaiblissement du coffre.
- Le test de « quota » est une injection d'erreur : le vrai refus de stockage navigateur et les interruptions de processus restent des cas à valider ensuite.
- Le retour arrière produit seulement une prévisualisation du conflit et refuse toute écriture automatique. La stratégie de résolution des conflits et la conservation intégrale des observations humaines doivent être décidées avant toute migration.

## Conditions de sortie

**GO pour la démonstration navigateur fictive** seulement si le workflow dédié et la matrice habituelle PR sont verts sur le SHA exact. **NO GO pour fusion, déploiement, migration, transfert du coffre, domaine, DNS, secrets ou modifications de Reconversion Control.** Les PR #134 et #135 restent séparées et en brouillon.

À une phase future nécessitant un accord distinct : mesurer un système de restauration réaliste uniquement sur **profil iPhone de test**, comparer chaque sous-champ utilisateur durable avec une photographie versionnée, vérifier le support hors ligne du futur miroir same-origin et établir un rollback inverse chiffré avec gestion des conflits. L'ancienne application et son coffre doivent rester intacts.
