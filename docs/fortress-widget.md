# Widget Scriptable — code installé, réseau limité aux données

## Défaut confirmé

Le widget installé téléchargeait à chaque actualisation `engine.js` depuis gh-pages et l’exécutait avec `new Function`, dans le contexte Scriptable qui contient sa configuration locale. Un écrivain de production pouvait donc faire exécuter du code à un widget déjà installé, sans nouvelle copie volontaire. Ce risque est distinct de la CSP de Safari : Scriptable n’est pas la page Web. Aucune compromission réelle ou lecture de données personnelles n’est démontrée.

## Correction proposée

Le build embarque le moteur pur du même checkout approuvé dans une fonction statique du widget. Aucun `eval`, `new Function` ou téléchargement de JavaScript pendant ses actualisations. Les appels Open-Meteo/AROME restent des réponses JSON ; météo, pneus, trajet calculé et rythme de rafraîchissement gardent leur logique. Le widget public reste `CFG = null` ; sa configuration n’est ajoutée que par le geste local existant de copie dans l’application.

Les prochaines évolutions du moteur exigent de recopier volontairement le widget depuis l’application validée. Cela empêche une mise à jour silencieuse du code installé ; aucun widget déjà installé n’est modifié pendant la préparation ou par la seule fusion d’une PR. Les widgets historiques continuent de télécharger le moteur tant qu’ils n’ont pas été remplacés volontairement. Le fichier copié doit toujours provenir d’une publication de confiance : embarquer le moteur ne signe pas à lui seul toute la distribution.

## Preuves

Le test Scriptable conserve la simulation historique de rendu, et ajoute des assertions de météo, chaussée, pneus, départ, rafraîchissement, destination et terminaison effective. Les chaînes compilées sont interdites dans le harnais. Une panne AROME conserve le modèle de base. Un contre-test réintroduisant la requête `engine.js` échoue ; aucune requête réseau réelle ni configuration privée n’est utilisée.

Exiger unitaires, six lots Chromium/WebKit, validation, confidentialité, profilage et QA du head exact. La simulation Scriptable et WebKit ne prouvent pas un essai sur iPhone physique ; la copie/installation locale et la taille du script devront être vérifiées sur l’iPhone avant de remplacer le widget quotidien.

## Retour arrière

Avant fusion, fermer la PR. Après publication autorisée, conserver une copie du widget embarqué déjà installé et sa configuration locale. Préférer réparer le build ou recopier une version embarquée validée ; revenir à l’ancien téléchargement réintroduit le risque. Aucune modification, suppression ou réinitialisation de l’application, du coffre ou des réglages utilisateur n’est nécessaire. Aucun remplacement automatique du widget ou déploiement n’est autorisé par cette PR.
