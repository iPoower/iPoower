# Registre de dette — Race Control

Une ligne = un défaut connu, **non corrigé volontairement**, avec sa preuve et sa condition de reprise. Données fictives uniquement.

| ID | Constat | Risque | Preuve | Reprise |
|---|---|---|---|---|
| D1 | Une saisie faite pendant que la page est **verrouillée** (démarrage sans session) est gardée en mémoire seulement, puis **abandonnée au déverrouillage, sans avertissement**. Le coffre n'est jamais modifié (sécurité tenue). | Zero Data Loss : perte silencieuse d'une saisie si l'interface laisse saisir en page verrouillée (À VÉRIFIER en navigateur : les champs de réglages liés semblent sans garde `LOCKED()` dans le gestionnaire de changement de `src/app.js`, alors que les commandes compteur et profondeur en ont une). | `tests/test_session_vault.js`, « écritures forcées · 7 » (sécurité figée) ; contre-test « saisies verrouillées reprises au déverrouillage ». | Décision du propriétaire : refuser la saisie en page verrouillée (champs désactivés + message), sans jamais reporter une saisie verrouillée dans le coffre. |
| D2 | `evidenceHtml()` (`src/app/weather-view.js`) écrit le journal de preuves à **chaque rendu** de l'onglet Météo. | Écritures concurrentes imprévisibles (cause du test instable e2e92, contourné par #288). | #288. | PR dédiée : écrire seulement sur événement, jamais pendant un rendu. `src/evidence.js` = chemin sensible. |
