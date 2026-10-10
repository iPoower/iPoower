# Profil : validation des lieux configurés

## Reproduction sur la version initiale

1. Un départ sans latitude et une arrivée valide, avec un modèle de pneus renseigné : `generic=false`, `commuteOk=true`. Le profil incomplet pouvait donc autoriser une conclusion personnelle.
2. Un identifiant de départ ou d'arrivée explicitement sélectionné mais introuvable : le validateur utilisait silencieusement le premier ou deuxième lieu et retournait le même résultat favorable.
3. Une destination enregistrée choisie dans le raccourci « Vers » : `PROFILE` ne recevait que `S.locs`, sans `S.customs`. Le validateur pouvait utiliser le deuxième lieu d'exemple au lieu de la destination choisie, imposer un aperçu et déclarer le planning incohérent.
4. Sur le site public verrouillé, la vue Analyse affichait correctement l'aperçu mais « Saison pneus » déclarait les pneus adaptés avec des jours GO (y compris dans ses libellés accessibles). Les carrés des prévisions 7 jours utilisaient aussi des verdicts personnels sans lire le profil.
5. Le rendu des étapes Agenda donnait un GO/100 pour un profil verrouillé. Reproduction par exécution du vrai rendu sur une météo favorable fictive.

Ces résultats ont été reproduits avec des coordonnées fictives par exécution du moteur actuel, puis verrouillés par des tests.

## Correction

- Le profil lit `calendarPlaces()`, la liste existante des lieux configurés (zones principales + destinations enregistrées). Ni GPS courant ni prévision consultée ne devient une nouvelle configuration.
- Un choix explicite introuvable reste incomplet ; le repli historique par index ne s'applique qu'en l'absence d'identifiant.
- Des coordonnées absentes, non finies ou hors limites imposent l'aperçu et suspendent l'estimation de chauffe du trajet domicile-travail.
- Le briefing explique de renseigner les lieux lorsqu'ils manquent, et conserve sa consigne sur la durée lorsqu'un planning connu est incohérent. Il ne déréférence plus un planning absent.
- Saison pneus et carrés des prévisions appliquent le profil existant : aperçu neutre visible et accessible avec températures conservées, puis conseils et couleurs rétablis après configuration. Le calendrier de montage reste disponible.
- Les étapes et trajets Agenda signalent l'aperçu lorsque le profil nécessaire manque ; itinéraires, horaires, navigation et alertes météo restent disponibles.

Aucun changement de stockage, de chiffrement, de sauvegarde, de Google Agenda, de position GPS, de Service Worker ou de workflow. Les champs facultatifs (DOT, dimension, pression, profondeur) ne deviennent pas obligatoires pour un conseil personnel.

## Validation

`test_profile_check.js` : 16 scénarios, onze mutations rejetées, y compris la source des lieux de l'application et l'exécution des vrais rendus Saison/7 jours/Agenda. Les assertions de rendu échouent avant la correction. `e2e63-generic-profile.js` conserve les assertions historiques et ajoute, sur PC/iPhone simulé, les couleurs et libellés de saison, les rendez-vous avec et sans étapes, le choix réel d'une destination enregistrée, l'effacement d'une coordonnée via Réglages, l'absence de GO personnel, la suspension de chauffe, le rechargement, le hors ligne et la restauration du conseil après correction.

Les 42 suites unitaires passent localement. Les 136 exécutions applicables de la CI complète, la QA d'origine calendrier, le scan de confidentialité et les deux profilages restent obligatoires avant fusion sur le HEAD final. La validation matériel iPhone et la publication sont des contrôles distincts.
