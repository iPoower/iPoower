# Diagnostic de l’agenda verrouillé

Sur la version publique `prod-79`, le diagnostic affiche indéfiniment `Agenda : chargement…` alors que la configuration est verrouillée. `loadCalendar` quitte avant toute lecture lorsque le code de session est absent, ou lorsque le contexte ne permet pas le déchiffrement ; `CALDONE` reste faux. La ligne de diagnostic ne vérifiait que cette variable.

Le statut indique désormais le verrouillage et l’action de déverrouillage, ou l’indisponibilité du contexte sécurisé. Une véritable lecture conserve `chargement…`, une lecture terminée sans agenda conserve `indisponible`, et les agendas déjà chargés conservent leur fraîcheur, le nombre d’événements et l’indication de copie hors ligne.

Le nouveau test exécute l’expression de la vraie ligne Agenda du diagnostic : il échoue sur `prod-79` avec `chargement…` au lieu d’un statut verrouillé. Les cas de fin de lecture, HTTP, Web Crypto indisponible, agenda courant et cache ancien sont couverts ; trois mutations sont rejetées. `e2e63` vérifie le statut visible et le texte de diagnostic sur PC/iPhone simulé, sans déverrouillage ni lecture de données personnelles.

La correction porte uniquement sur l’affichage du diagnostic. Le chargement, le déchiffrement, les données, le stockage, les autorisations, les workflows et le Service Worker restent inchangés.
