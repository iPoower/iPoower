# NOESIS 8 — prototype borné, données fictives

Ce répertoire démontre une boucle d'ingénierie reproductible : objectif et critères écrits avant l'exécution, candidat défectueux, contrôle automatique séparé, critique, correction, nouvelle validation, journal et mesures. Il ne modifie aucun fichier applicatif Race Control, Control Vault ou Reconversion Control et ne contient aucun outil de production.

**Statut : prototype partiel.** La construction et la correction utilisent deux programmes prédéfinis et approuvés par SHA-256. Aucun modèle IA n'est appelé par le runner. Une vraie IA peut préparer une proposition en amont, mais son code arbitraire est refusé par ce prototype. Le gain d'une orchestration multi-agent n'est pas mesuré ici.

## Exécution locale

Python 3.12 ou compatible, environnement POSIX/Linux avec le module standard `resource`. Aucune dépendance à installer, aucun abonnement, secret ou compte cloud.

```bash
python3 -m unittest discover -s noesis8 -p 'test_*.py' -v
python3 noesis8/controller.py --run-id exemple-hybride
python3 noesis8/controller.py --run-id exemple-un-passage --mode single
```

La dernière commande retourne **1**, volontairement : le contrôle en un passage détecte le défaut et refuse le candidat. Le mode `hybrid` s'arrête après deux candidats : **9/11**, puis **11/11**. Ce nom de mode décrit la boucle contrôlée, pas une orchestration effective de plusieurs modèles. Une procédure mono-agent munie de la même boucle peut obtenir le même résultat.

Les résultats sont dans `noesis8/runs/<identifiant>/`. Un identifiant déjà présent est refusé pour conserver les preuves. Les runs sont ignorés par Git. Ne placez aucune donnée personnelle ou professionnelle dans ce répertoire.

Pour relire les preuves, conservez le `journal_head` du résumé dans un emplacement de confiance distinct, puis :

```bash
python3 noesis8/verify_evidence.py noesis8/runs/exemple-hybride --head EMPREINTE_HEXADECIMALE_64_CARACTERES
```

Le vérificateur reconstruit les artefacts attendus depuis le journal ancré, contrôle le plan canonique, les candidats, les rapports, la complétude du manifeste et la cohérence de la fin d'exécution. Le checkpoint reste **non signé**. Un acteur pouvant remplacer les sources, les fichiers et le checkpoint conservé peut réécrire l'ensemble. Cette vérification n'est ni une attestation SLSA ni une preuve opposable.

## Cas d'essai et preuves

La microtâche restaure un JSON synthétique dans un fichier temporaire. Le premier candidat vérifie la longueur du digest mais pas son lien avec les octets. Deux contrôles indépendants révèlent l'erreur. La correction compare le SHA-256 calculé avant toute écriture. L'oracle vérifie aussi la relecture exacte, la conservation des réglages, un conflit de révision, une interruption avant remplacement, les schémas invalides et le refus d'une cible symlink.

Le SHA-256 de cet exemple est un contrôle d'intégrité **non authentifié** : il ne remplace jamais AES-GCM/AAD ou une signature pour une sauvegarde réelle. L'interruption testée est une exception injectée avant commit; ce n'est pas une panne électrique, un crash de noyau ou une preuve de résistance à des écritures concurrentes réelles.

Chaque run conserve `plan.json`, les deux candidats éventuels, `validation-N.json`, `journal.jsonl` et `summary.json`. Les rapports indiquent la commande, le cwd, le Python, la plateforme, la durée, le CPU enfant et un RSS de pointe cumulatif. Le coût API du runner est zéro parce qu'il n'appelle aucune API de modèle. Le coût, les tokens et la durée totale de la session ChatGPT qui a produit le code ne sont pas disponibles au runner.

## Bornes et permissions

- Tâche structurée : exactement identifiant, classification `synthetic`, budget entier entre 1 et 5. Aucun champ commande, URL, instruction système, permission ou approbation.
- Deux capacités internes : écrire le candidat synthétique et lancer son validateur. Toute capacité sensible demandée est refusée.
- Candidats et oracle approuvés par empreintes dans le contrôleur. Leur mise à jour relève d'une revue humaine du code de confiance.
- Délai de tâche 30 s, délai de processus 5 s; limites CPU, espace d'adressage, fichiers et descripteurs. Un échec inconnu ou un contrôle modifié provoque l'arrêt.
- Processus Python séparé, environnement minimal, `-I -B`; aucune commande shell fournie par la tâche, aucun identifiant hérité dans l'environnement.
- Répertoire privé créé sans écrasement, refus des liens symboliques connus, journal écrit avec flush/fsync.

**Limite fondamentale : ce n'est pas une sandbox de sécurité pour code hostile.** Le contrôleur et le candidat utilisent le même UID. Le candidat est importé dans le processus de l'oracle. Les fichiers restent accessibles au même utilisateur; une course filesystem ou un contrôle de l'hôte n'est pas neutralisé. Le réseau n'est pas techniquement désactivé par ce runner. Les deux fixtures approuvées n'ont aucun appel réseau. N'ouvrez pas ce contrôleur à des programmes générés librement.

Pour généraliser, il faut d'abord un exécuteur éphémère avec une vraie séparation d'identités, une sortie réseau contrôlée, une copie de validation de confiance en lecture seule, aucun secret cloud et un contrôleur externe. Les sous-agents ChatGPT Work de cette mission partagent outils et filesystem; leur consigne de moindre privilège n'est pas une restriction technique de leurs comptes.

## Réutilisation prudente avec GitHub Actions

`workflow.example.yml.disabled` est un exemple **inactif**, hors `.github/workflows`. Il utilise un runner standard et les outils existants; aucune publication, fusion, secret de production ou permission cloud. Il ne s'exécute pas avec cette PR. Son adoption modifierait la CI et doit recevoir la revue explicite du propriétaire prévue par `AGENTS.md`.

Ne reliez jamais automatiquement un statut vert à une fusion ou un déploiement. Gardez une décision humaine distincte portant sur le SHA exact, les artefacts et l'action sensible. Les règles historiques GREEN → MERGE sont suspendues pour cette mission par l'instruction explicite de Bryan.

## Évaluation et suites

Les tests couvrent les refus de capacités, l'entrée stricte, le budget, le délai, les faux résultats verts, l'oracle altéré, les candidats non approuvés, les preuves modifiées ou tronquées, l'omission d'un manifeste et la conservation des runs existants. Les mocks vérifient des décisions du contrôleur; ils ne constituent pas des essais d'intrusion contre un conteneur.

Avant toute généralisation, comparer au minimum plusieurs tâches et variantes : mono-agent avec la même boucle et le même oracle, puis revue indépendante conditionnelle. Mesurer réussite au premier essai, régressions, temps total, tokens facturés et coût de revue. Fixer les seuils avant l'essai; conserver le mono-agent si l'ajout d'agents ne montre pas d'avantage. Aucune procédure ne peut modifier elle-même ses permissions, son oracle ou les limites approuvées.
