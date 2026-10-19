# Import et concurrence — contre-revue du 19 octobre 2026

Base : `c4b8821d01336d3d63ed3e0bdb88d7bb29c21deb`.
Correction sensible de restauration, **accord humain requis avant fusion**.
Aucun fichier utilisateur, clé réelle ou stockage de production consulté.

## Défaut reproduit

Après publication du plan dans le stockage mémoire de session, l'import attend
la confirmation chiffrée. Si celle-ci échoue, `backupApplyPlan` réinstallait
inconditionnellement les valeurs préalables. Une nouvelle valeur reçue pendant
cette attente pouvait donc être remplacée par une valeur ancienne. Le test du
vrai gestionnaire et de `DeviceStorage.apply` échoue sur la base : ajout concurrent
aux réglages remplacé par « avant-réglages ».

## Correction ciblée

Capturer les valeurs réellement publiées par notre plan. En cas d'échec, revenir
à l'état préalable seulement pour les clés encore identiques à cette publication.
Préserver chaque clé modifiée entre-temps et les ajouts hors du plan. Une erreur
distincte informe de la présence de modifications concurrentes en mémoire, sans
annoncer ni import réussi ni retour global exact. L'erreur initiale est conservée
même si la tentative de retour arrière change ensuite le statut du coffre.

Ce contrôle n'est ni une transaction multi-appareils ni une garantie de durabilité
des modifications non confirmées. Le protocole chiffré, ses verrous et son union
du journal restent inchangés. Une valeur encore volatile peut être perdue si le
navigateur est fermé ; l'interface demande de conserver la page ouverte.

## Validation et retour arrière

Régression dans la suite stockage existante : écriture concurrente sur clé
remplacée, ajout sur clé supprimée, ajout hors plan, retour exact sans conflit
et succès sans panne. Faux stockage et panne simulée ; vrai gestionnaire et vrai
moteur DeviceStorage. CI complète Chromium/WebKit exigée sur le SHA courant.

L'entrée d'import acceptait aussi deux lectures de fichier simultanées dans une
même page. Le contre-test ouvre une lecture lente puis soumet un deuxième
fichier : deux lectures démarrent avant correction. Un verrou volatile refuse
désormais le deuxième import avant lecture ou mutation, se libère après chaque
sortie ou erreur et refuse une nouvelle opération pendant le gel/rechargement.
Ce garde-fou ne constitue pas un verrou inter-onglets supplémentaire.

Pas de nouveau format, clé, permission, service, SW ou migration. Revenir au code
précédent réintroduit le risque ; ne pas déclencher d'import tant qu'il est présent.
Un revert logiciel ne restaure pas une donnée déjà écrasée. Recette physique
Safari/PWA NON TESTÉE. Cette PR est indépendante du refus de troncature météo.
