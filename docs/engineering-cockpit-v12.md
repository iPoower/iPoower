# Engineering Cockpit V1.2

Six domaines dans Analyse : accélération, freinage, tenue en virage, stabilité,
aquaplaning et état pneumatique. Lecture de la monte active et du contexte
existant ; aucun nouveau stockage, service, capteur ou réglage.

Chaque valeur porte sa nature : **MESURÉE** (mesure saisie par l'utilisateur),
**ESTIMÉE** (estimation déclarée), **DOCUMENTÉE** (résultat publié avec protocole)
ou **INCONNUE**. Une mesure datée n'est pas une télémétrie actuelle ; un essai
publié ne devient pas une performance de ce véhicule. Les inconnues restent
affichées, notamment accélération et stabilité dynamique.

Les distances de freinage et vitesses d'aquaplaning reprises du catalogue sont
des résultats historiques, assortis de dimension et de limites. Aucune valeur
personnalisée, coefficient d'adhérence, score ou vitesse sûre n'est calculé.
Sources détaillées conservées dans Intelligence pneumatique. Le modèle
thermique historique et toutes les fonctions précédentes restent disponibles.

Projection pure dans `engineering-cockpit.js`, adaptateur de rendu en lecture
seule, cartes à ouverture native au clavier et au toucher. L'état d'ouverture
utilise la mémoire de rendu existante ; aucune clé persistante ajoutée.

Validation : oracles de nature des données et non-mutation inclus dans la suite
pneumatique ; parcours Chromium/WebKit existant étendu aux six cartes, aux deux
tailles d'écran et à la lecture seule. La CI sur le SHA exact, sa suite complète
et le SHA réellement servi restent nécessaires avant livraison. Aucun appareil
physique n'est testé par ces simulations.
