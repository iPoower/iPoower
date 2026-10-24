# Garage · Coûts réels et rentabilité (V1)
 
## Statut au 23 octobre 2026
**Module raccordé au code de l'onglet Garage sur la PR #231 en brouillon, non fusionné et non déployé.**
La connexion aux données réelles de l'utilisateur s'effectue exclusivement dans la PWA déverrouillée ; les prix, plaques et autres données personnelles ne doivent pas apparaître dans GitHub.

## Interface livrée sur la branche
- Dans chaque fiche véhicule existante, volet repliable « 💶 Coût & rentabilité ».
- Références facultatives : prix réellement payé, date de l'achat, compteur à l'achat, kilométrage annuel prévisionnel, valeur de revente seulement estimée.
- Journal des dépenses datées : carburant, assurance, entretien, réparations, pneus, péages, loyer LOA/LLD, autres. Montants saisis en euros et stockés en centimes ; catégorie et date obligatoires, compteur et note facultatifs.
- Totaux mensuels et historique des 15 dernières écritures (les autres restent conservées), suppression sur confirmation.
- Amortissement du prix d'acquisition à 3 et 5 ans et coût déclaré par km depuis achat, si compteur et prix disponibles.
- Coûts partiels et kilométrages manquants explicités ; les loyers LOA ne doivent pas être additionnés deux fois au prix comptant du même véhicule.
- Aucune nouvelle requête réseau, nouvelle clé de stockage, nouvelle application, nouveau minuteur ou diagnostic mécanique.

## Données et conservation
La source unique est `S.cars[i].economics`, enregistrée dans les réglages déjà chiffrés de Race Control, sous `twrc.settings.v1`. Le module ne copie aucune donnée financière dans le JavaScript public. Il utilise la sauvegarde et le protocole de synchronisation des réglages déjà présents, **sans promettre un test physique PC ↔ iPhone**.

Sur modification, le module appelle `markEdit('cars.i.economics')`, `saveSettings()`, vérifie la lecture locale et attend `TWRC_VAULT.flush()` ; un échec est signalé et les valeurs nouvelles demeurent en mémoire sans être présentées comme sauvegardées. La remise à jour du préréglage chiffré préserve désormais l'objet `economics` en plus des données véhicule historiques. Sauvegarde de réinitialisation manuelle et suppression restent sensibles : ne pas activer sans contrôles de restauration.

**Limites réelles :** la synchronisation Google Drive des réglages peut conduire à un conflit conservateur entre plusieurs appareils. Aucune fusion automatique des journaux financiers concurrents n'est ajoutée ; les conflits doivent être arbitrés. Les dépenses déclarées ne sont pas un TCO complet ni un seuil de rentabilité garanti.


## Extension tickets carburant (V1.1, PR en brouillon)
- Catégorie « Carburant » : chaque ravitaillement permet de renseigner **date, montant réellement payé APRÈS remise, litres (trois décimales), type de carburant déclaré, compteur si disponible, commentaire et case « plein complet confirmé »**.
- Les carburants sont des valeurs déclarées : gazole, gazole premium, SP98 E5, SP95 E5, SP95 E10, E85, autre ou « à confirmer » ; ne pas inférer le carburant depuis une étiquette « B7 » ou un ticket ambigu.
- Prix du litre effectif = montant payé ÷ volume effectivement remis. Moyenne pondérée = somme des montants pour les tickets dont le volume est connu / somme de leurs litres. Les tickets sans volume restent comptés dans les dépenses, **pas** dans le prix moyen.
- La consommation entre pleins est une **estimation conditionnelle de ravitaillement** : deux pleins complets datés, deux compteurs, volume connu pour **tous** les ravitaillements entre eux, chronologie cohérente et aucun double plein indécidable le même jour ; volume des pleins intermédiaires compris. Si l'une des conditions manque, affichage « — ».
- Après remise TotalEnergies, ne pas enregistrer deux fois le remboursement : seule la somme effectivement déboursée sert au prix réel, et une réduction éventuelle est informative.
- Les relevés sont conservés dans le même journal canonique \`S.cars[i].economics.entries\`, avec \`volumeMl\` entier, \`fuelType\` et \`fullTank\`. Anciennes dépenses carburant sans litres restent lisibles et ne sont ni complétées fictivement ni supprimées.
- Les fichiers publics contiennent uniquement des valeurs fictives de tests ; **pas de photos de tickets, reçus réels, numéros de carte ni données d'identité en GitHub**.
- Dépôt et sync Drive de l'autre agent non modifiés. Aucun accès direct à la PWA chiffrée depuis une photo transmise dans ChatGPT : **la lecture de photo n'est pas une sauvegarde**. Un futur import sécurisé côté application demandera authentification, confirmation de l'utilisateur, accusé de sauvegarde et vérification sur les deux appareils.
- Contrôles : \`node tests/test_garage_fuel.js\`, et inclusion dans \`tests/test_garage.js\`. Tester le coût au litre après remise, litre manquant, deux pleins avec appoint, compteur décroissant, doublon/date, deux véhicules isolés, affichage mobile, verrouillage du coffre.

## Coordination sans collision
- Aucun fichier de Twin Garage Scene, Live Route, Service Worker, du coffre, des workflows ou des autres dépôts modifié.
- `src/app/garage-view.js` : montage ciblé du volet + conservation de son état ouvert. `src/app.js` : uniquement préservation explicite du journal lors d'un changement de préréglage.
- `src/app/garage-economics-core.js`, `src/app/garage-economics-view.js` et `src/app/garage-economics-style.js` : nouveaux fichiers.
- `tests/test_garage.js` appelle la nouvelle suite dédiée ; le registre CI partagé reste inchangé (important pour #193).
- Vérifier le statut de #193 Garage Life, de #230 navigation et des autres PR avant toute fusion. Ne pas rendre la branche prête à fusionner avant CI exacte complète et revue du propriétaire, les données financières étant sensibles.

## Tests requis
- `node tests/test_garage_economics.js`, puis `node tests/test_garage.js`.
- Build et scanners de confidentialité ; CI GitHub sur le SHA exact, matrice 3 Chromium + 3 WebKit, tests conservations/backup, intégration et restauration.
- Exercice navigateur 320/375/414 px et ordinateur, clair/sombre ; entrées invalides, suppression, fermeture/réouverture du coffre, mise à jour du préréglage, panne de stockage et conflit multi-appareils.
- Vérification iPhone physique distincte d'un test WebKit simulé. Interdire la fusion/déploiement tant qu'une étape obligatoire échoue.

## Mode d'emploi sécurisé
Ouvrir Garage, développer « Coût & rentabilité » sur la voiture ciblée, renseigner le prix d'achat et sa date, puis ajouter chaque paiement avec sa date, catégorie et montant réellement payé. Pour une LOA, saisir les loyers **payés** en « Loyer LOA/LLD » ; ne jamais saisir simultanément des loyers projetés et le prix comptant comme des décaissements effectifs. L'ancienne feuille Excel reste une référence distincte jusqu'à une procédure d'import auditée.
