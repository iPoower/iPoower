# TRAJET : conserver les commandes pendant l'actualisation

## Anomalie et reproduction

La validation WebKit de la PR #102 (run 38037027452) a échoué sur
« pc · annulation rend la priorité au planning sans perdre le lieu Travail ».
Les seules modifications de #102 sont les versions d'upload-artifact ; l'échec
du scénario intervient avant l'envoi de son rapport.

renderTripView réécrit tout le formulaire via innerHTML à chaque rendu.
Une commande peut être détachée entre l'appui et le relâchement ; le clic
n'atteint alors plus le gestionnaire du document. Les champs perdent aussi
leur focus même lorsque leurs valeurs n'ont pas changé.

La fonction réelle a été exécutée séparément dans un DOM simulé avec des
lieux et un véhicule fictifs. Sans correction, le bouton tenu est déconnecté,
le clic n'atteint pas le document et le focus est perdu après un rendu identique,
un passage hors ligne ou une reconnexion.

Le scénario E2E existant ajoute un appui souris réel sur le bouton visible,
une coupure réseau et un rendu avant le relâchement. Il conserve ses assertions
sur le planning, le lieu Travail, les trajets, la persistance et le mobile.

## Correction minimale

Comparer le HTML dérivé des commandes du formulaire. Lorsqu'il est identique,
conserver ces éléments et actualiser seulement le bloc d'état de l'itinéraire.
Quand les valeurs du formulaire changent, conserver le rendu complet existant.
L'annulation retire toujours sa commande après changement du contexte.

Le cache de rendu est une propriété éphémère de l'élément DOM. Il ne crée pas
de stockage, ne modifie aucune donnée utilisateur ni le contexte canonique.
Les libellés, la structure affichée et les mécanismes de calcul restent identiques.

## Validation

La reproduction DOM passe avec correction : mêmes boutons connectés,
clic reçu, focus conservé et indication réseau actualisée ; aucun bouton
d'annulation restant lorsque le trajet manuel a disparu.
Les 42 suites unitaires passent localement. Les matrices navigateur,
la QA agenda, le profilage et la confidentialité doivent être verts sur
le HEAD exact avant toute fusion.
