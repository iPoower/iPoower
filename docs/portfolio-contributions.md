# Méthode de travail et contribution personnelle

Ce document explicite honnêtement les contributions au portfolio. Il évite d'attribuer au propriétaire du dépôt des lignes de code réalisées par des agents d'IA.

## Ce que les dépôts démontrent directement

- Applications navigables et code source public ;
- mécanismes de CI/CD, Playwright, tests unitaires, rapports d'incidents, revue par PR ;
- décisions d'architecture, limites et problèmes documentés dans les PR ;
- correction de bugs observés en usage et validation de scénarios automatisés.

## Organisation du travail

| Activité | Rôle et preuve attendue |
|---|---|
| Besoin produit, priorités, critères d'acceptation | Pilotage du projet ; demandes fonctionnelles, retours d'usage et scénarios de défaut |
| Proposition de code | Assistance possible de Claude, ChatGPT et autres outils ; ne pas confondre génération du code et compétence personnelle |
| Revue et acceptation | Examiner le diff, la CI, les risques de perte de données et les impacts de déploiement ; conserver les PR comme traçabilité |
| Tests automatisés | Scripts versionnés et exécutions Actions vérifiables ; ne pas déclarer un test sur appareil réel sans compte rendu |
| Compétence individuelle | À démontrer par explication technique, reproduction d'un bug, modification autonome et tests exécutés personnellement |

## Exemple de formulation pour un recruteur

« J'ai défini et fait évoluer plusieurs applications personnelles à partir de besoins concrets. J'utilise des assistants IA pour accélérer certaines implémentations, tout en travaillant sur l'analyse des bugs, les critères d'acceptation, la validation par tests et les revues de sécurité. Mon objectif est de renforcer mes fondamentaux Linux, réseau, Cloud et DevSecOps afin de comprendre, maintenir et faire évoluer ces solutions de façon autonome. »

## Ce qu'il reste à prouver

- Exécution personnelle des commandes du laboratoire Linux/Docker ;
- compréhension de l'authentification, des permissions, de l'isolation et de la chaîne de déploiement ;
- écriture et explication d'un correctif sans déléguer toutes les décisions à un assistant ;
- logs de tests d'intégration sur appareil physique lorsque ces affirmations sont utilisées en entretien.

## Liens utiles

- [Trois incidents techniques](portfolio-incidents.md)
- [Race Control](https://github.com/iPoower/iPoower)
- [Reconversion Control](https://github.com/iPoower/Reconversion-Control)
- [Control Vault](https://github.com/iPoower/Control-Vault) — développement encore par phases ; les démos ne prouvent pas l'activation des services réels.
