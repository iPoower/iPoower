# Forteresse II — Phase 6 : sauvegarde exhaustive expérimentale, sur données fictives uniquement

> PR en brouillon. **Le vrai Backup V2 est inchangé** et ne devient pas exhaustif du fait de ce test. Aucun déploiement, domaine, secret, migration ou fichier de production.

## Expérience

La CI compile **deux copies de la véritable application Race Control** à partir des préréglages/chiffrements de test déjà présents dans `tests/ci/workspace.js`. Chaque copie tourne sous un port `127.0.0.1` différent, avec un contexte Playwright privé. Toutes les requêtes extérieures sont bloquées, les Service Workers désactivés. Chromium et WebKit exécutent chacun les mêmes scénarios.

Les 10 scénarios Phase 5 vérifient au préalable le **vrai** coffre SessionVault, le téléchargement chiffré par le bouton officiel, l'import V2 partiel, son refus du mauvais mot de passe, et les deux observations humaines **omises par V2**.

La phase 6 charge ensuite un **outil de laboratoire via Playwright** dans l'environnement d'exécution de la page, jamais dans `src/` ni dans le build. Cet outil :

1. Énumère les clés `twrc.*` vues dans le stockage déverrouillé de l'application fictive, selon une liste explicite de valeurs durables. Il bloque les clés inconnues au lieu d'inventer leur traitement.
2. Transfère les valeurs pertinentes sous forme exacte, dont les signalements `twrc.reports.v1` et l'historique `twrc.shadow.v1`, les pneus fictifs, les annulations et réglages. Les métadonnées de session, les caches et le GPS courant sont exclus. Les rubriques `twrc.trend` et `twrc.weather.incidents.v1`, encore à arbitrer, bloquent si elles sont non vides.
3. Construit un paquet AES-256-GCM / PBKDF2-SHA256 600 000 itérations, sel/IV aléatoires, authentification GCM et **AAD associant la version, l'origine source et l'origine cible**. Aucun mot de passe, nom de véhicule ou contenu de rapport ne figure en clair dans l'enveloppe.
4. Vérifie l'authenticité, la version, les clés, l'origine et les volumes **avant** un import fictif. Mauvais code, ciphertext modifié et mauvaise origine sont rejetés.
5. N'applique une copie test que sur confirmation, avec photographie en mémoire de l'état précédent, `TWRC_VAULT.flush()`, relecture et retour arrière d'essai en cas d'interruption injectée.
6. Vérifie la conservation des observations humaines et des autres chaînes durables après rechargement, puis refuse un retour arrière automatique lorsque de nouvelles observations figurent sur la destination.

## Contraintes bloquantes avant tout passage en production

- Le transfert **n'est pas un composant de Race Control** et son importeur de test n'est pas adapté à de vraies données utilisateur. **Ne pas le publier ni le fusionner en tant que fonctionnalité**.
- Le registre utilisé par l'expérience couvre seulement les références observées dans ce profil et les cas étudiés. Des clés dynamiques, IndexedDB nouveaux, historiques humains cachés dans des objets mixtes ou des valeurs atypiques exigent un **inventaire runtime sur profil de test**, avec classification et consentement explicites.
- Le rollback d'essai via mémoire + `flush()` n'est **pas** une transaction atomique globale Web Storage / IndexedDB / Cache ; une panne réelle iOS, un quota réel, l'expiration du stockage et l'interruption physique demandent des validations indépendantes.
- Le paquet de test ne sert qu'aux deux origines locales. Aucune interface utilisateur d'export exhaustif n'a été ajoutée. L'interface officielle conserve son comportement **Backup V2 partiel**.
- Le test ne prouve pas la politique HTTPS/CSP/CORS d'un futur domaine, le fonctionnement hors ligne d'un miroir de JSON, les notifications, permissions GPS et Safari PWA installé sur l'iPhone.
- La CI complète du SHA exact doit être verte avant une clôture de revue ; les tests fictifs seuls ne valent pas GO migration. **Toute fusion vers `main` peut déclencher la CI et le mécanisme de déploiement automatique existant**, même lorsque le diff ne change pas l'application. Ne fusionner que sur décision distincte et avec la contrainte de déploiement comprise.

**GO : laboratoire documenté/testé en PR Draft. NO GO : fusion automatique, nouveau domaine, migration réelle ou manipulation du coffre personnel.**
