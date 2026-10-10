# Publication : refuser un succès après cinq pushes échoués

## Défaut reproduit

La fin réelle de l'étape « Publier sur gh-pages » a été exécutée avec un Git
fictif : cinq pushes refusés, cinq rebases réussis. Sur main 13008ec, Bash
termine avec le code zéro et écrit done=1.

La boucle ne vérifie pas qu'un push a réussi avant cette sortie. Si seuls le
relais ou d'autres fichiers externes changent, le contrôle de l'HTML peut encore
passer puisque cet HTML est identique. Une étiquette peut alors désigner une
publication qui n'a pas atteint gh-pages.

Aucun incident de ce type n'a été observé sur la publication réelle pendant
cet audit. La reproduction utilise uniquement des commandes et fichiers fictifs,
sans accès réseau, sans dépôt distant et sans données du propriétaire.

## Correction proposée

Retenir explicitement le succès d'un push. Après les cinq tentatives autorisées,
échouer si aucun push n'a réussi ; ne jamais émettre done=1 dans ce cas.
Les rebases, le nombre de tentatives, les sorties en cas de contenu identique,
les permissions et les contrôles préalables restent inchangés.

## Non-régression

Sept scénarios exécutent la fin de la vraie étape, avec Git et sleep fictifs :
succès immédiat ; collisions puis succès ; succès à la cinquième tentative ;
cinq échecs ; échec du rebase ; échec du commit ; aucun contenu à publier.
Les tests vérifient aussi qu'aucune réécriture forcée n'est employée.

Le nouveau test échoue sur le workflow initial : cinq échecs donnent le code
zéro. Il est ajouté à la suite CI existante, sans supprimer de contrôle ni
modifier le registre ou les règles de validation.

Cette correction concerne une protection de déploiement. La revue explicite
du propriétaire prévue par AGENTS.md reste nécessaire avant sa fusion.
