# Origine dédiée — compléter les en-têtes préparatoires

Le prévol Control Vault du lot C relève l’absence de
`Cross-Origin-Resource-Policy: same-origin` dans le build Race Control.
Ce correctif ajoute uniquement cet en-tête au bloc `/*` de `_headers`, déjà
destiné à un hébergement dédié. La régression vérifie CORP et COOP dans le
build fictif, ainsi que la limite Cloudflare Pages de 2000 caractères par ligne.
Source : https://developers.cloudflare.com/pages/configuration/headers/

GitHub Pages ignore `_headers` : aucune protection HTTP supplémentaire n’est
annoncée sur la production actuelle. HTML, scripts, styles, animations, manifest
et Service Worker restent identiques. Aucune donnée, clé, permission, migration,
DNS, session, cache ou configuration Google n’est modifiée.

CORP complète la politique de chargement des ressources ; il ne remplace pas
la séparation des origines, ne cloisonne pas localStorage et ne suffit pas à
garantir l’exclusivité d’un hébergement. Avant Google réel, la nouvelle origine
doit encore être revue, publiée et testée, avec migration récupérable et recette
sur iPhone physique. Les éventuels flux publics de relais/CORS feront l’objet
de leur propre politique explicite ; ce lot n’ouvre pas un accès inter-apps.

Revue sensible obligatoire car `tools/build.js` est un chemin protégé par
AGENTS.md. Retour arrière : retirer cet en-tête et sa régression. Aucun état
de données à annuler ; aucune autre application n’est modifiée.

La CI initiale a également révélé un contrôle trop précoce du bouton de
notification dans `e2e49-interactions.js`. Sa régression attend désormais la
réponse POST simulée 200 et son topic fictif, puis le vrai libellé visible sous
délai borné. Une erreur réseau, un mauvais POST ou un résultat absent restent
des échecs. Aucun skip, clic forcé ou état de succès injecté ; le code produit
de notification ne change pas. La même régression est partagée avec #216.
