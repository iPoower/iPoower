# Erreurs du relais : diagnostics publics sans coordonnées

## Défaut reproduit

Sur `d8c7639a61e0c045d55942c12a0e17af6d1fdf94`, un HTTP 503 de la prévision du matin
fait remonter l'URL Open-Meteo complète dans `console.log('Verdict impossible', e.message)`.
Cette URL contient les coordonnées du domicile ou du travail provenant de la configuration
chiffrée. La copie dans `obs.json` masque déjà les URL, mais pas les logs GitHub.
Une erreur réseau ou JSON portant une URL ou un extrait de réponse peut suivre le même chemin.
Il s'agit d'une possibilité d'exposition, reproduite uniquement avec les lieux et clés fictifs
du harnais ; aucune consultation des anciennes valeurs privées dans les logs de production.

## Correction

`getJSON` construit un diagnostic avec le nom du fournisseur et le type de panne :
statut HTTP, réseau/délai ou réponse JSON invalide. Il attend et contrôle aussi la lecture
du JSON avant de rendre la main. Aucune URL, aucun corps ni message brut n'est transmis
aux appelants. Les erreurs restent visibles ; une panne ne déclenche aucune notification
et n'est jamais assimilée à des conditions sans alerte.

## Validation

Le vrai `relay.js` est exécuté avec sa configuration chiffrée fictive, son agenda, ses
routes et ses API simulées. Trois nouvelles pannes (HTTP 503, réseau, JSON) vérifient
les logs, les observations publiques, la visibilité du fournisseur/type et l'absence
de faux verdict ou notification. Un retour à la météo normale rétablit exactement une
alerte. Les dix nouveaux contrôles donnent six échecs avant correction ; les contrôles
existants restent verts. La CI complète Chromium/WebKit, le scanner PR, la QA agenda
et le profilage restent requis avant fusion.

La modification porte sur les diagnostics d'erreur du relais. Les formats, clés,
permissions, données du propriétaire et Service Worker sont conservés.
