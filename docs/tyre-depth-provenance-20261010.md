# Provenance des profondeurs après un relevé par essieu

## Reproduction

Le vrai handler `tread-add` écrit une estimation AV de 2,3 mm, puis une mesure AR de 6,5 mm. La profondeur effective reste correctement AV 2,3 mm, mais le dernier relevé écrase `treadEst` à zéro : `USER_MEASURED`, qualité verte, avertissement de jauge supprimé et confiance accrue. La reproduction unitaire échouait avec `false !== true`. La même erreur existe dans l'autre sens ; une estimation de l'essieu moins usé peut aussi déclasser une mesure du plus usé.

## Correction minimale

`setTreadAxle` accepte l'origine du nouveau relevé. Il la reprend si ce relevé détermine la profondeur effective et conserve celle de l'essieu plus usé lorsque l'autre est saisi. Si le plus usé devient un autre essieu, son dernier relevé cohérent fournit sa provenance. À profondeur égale, une saisie isolée ne suffit pas à déclarer mesurées deux profondeurs dont une était estimée ; une mesure des deux essieux rétablit ce statut.

Les corrections manuelles de l'origine restent respectées, y compris après deux profondeurs égales : leur indicateur global reste prioritaire sur l'ancien relevé. L'ancienne API à trois arguments conserve son comportement. Aucun relevé historique, profondeur, date, kilométrage, format, chiffrement, import, Service Worker, workflow ou protection n'est réécrit. Les anciens indicateurs globaux restent des choix déclarés : aucune migration ne devine une éventuelle correction manuelle antérieure.

## Non-régression

- `test_wear_consistency.js` exécute le vrai handler de saisie : 15 scénarios et six mutations rejetées, dont les essieux inversés, le changement du plus usé, l'égalité et les choix manuels. Le scénario exact trouvé par l'E2E (deux profondeurs égales, origine changée manuellement, nouveau relevé arrière) échoue aussi avant correction en unitaire.
- Les 22 scénarios et huit mutations de `test_tyrestate.js` sont conservés.
- `e2e69-wear.js` ajoute des saisies natives PC/iPhone simulé, l'origine affichée dans Réglages/Pneus/Analyse, la recharge, le hors ligne et le retour à une mesure des deux essieux.
- CI complète au HEAD exact, confidentialité PR, relay-smoke, QA origine et profilages Chromium/WebKit obligatoires avant fusion ; validation production et publication distinctes ensuite.
