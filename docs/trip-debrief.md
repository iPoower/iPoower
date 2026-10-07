# Débrief du trajet

La boucle est : prévision au départ → arrivée → observation conducteur → journal local → comparaison des phénomènes.

`debriefDeparture()` fige le trajet, la voiture active, les phénomènes annoncés, l'âge des données, les preuves brouillard du moteur v2 actif et la thermique prévue à l'arrivée. Un rafraîchissement ou une réouverture ne remplace pas cette prévision initiale.

`closeTrip()` termine les trois chemins existants dans une transaction du contexte canonique : `liveArrive()` (GPS ou « Bien arrivé »), `placeConfirm()` et `returnHomeDone()` (« Déjà rentré »). Le bilan thermique est calculé avant la remise à zéro de LIVE. Le départ est retiré, le lieu est mis à jour et le journal reçoit au plus une entrée par clé de trajet. Les callbacks tardifs ne modifient pas une arrivée déjà enregistrée.

Une confirmation après coup conserve une arrivée et laisse le départ et la prévision inconnus. Annulation, expiration et coupe-circuit abandonnent le snapshot actif sans créer de trajet arrivé. « Annuler l'arrivée » retire aussi le débrief correspondant.

Le conducteur renseigne explicitement les phénomènes rencontrés : chaussée humide, pluie, brume/brouillard, neige, verglas, ou aucun de ces phénomènes. L'adhérence ressentie est facultative. « Plus tard » garde une entrée sans inventer d'observation. Le retour peut être repris ou corrigé depuis le journal dans les quatre vues.

## Comparaison et limites

La comparaison classe les retours : concordant, phénomène non annoncé, alerte non rencontrée, écart mixte, ou prévision non comparable. Pluie et humidité sont regroupées ; brume, neige et verglas gardent leur identité. La prévision doit exister et son âge au départ doit être connu et inférieur ou égal à 90 minutes. Aucun pourcentage de certitude, ajustement automatique du moteur ni extrapolation à tous les trajets n'est produit.

Les températures prévues et celles calculées à l'arrivée restent deux estimations du modèle thermique générique. Les cinq états 0–4 et la confiance faible/moyenne sont ceux de `tyreLab`. Le ressenti du conducteur n'est pas une mesure de gomme, de pression ou d'adhérence physique.

## Persistance et confidentialité

`twrc.context.v1.debrief` est le document canonique partagé : snapshot actif et 60 trajets maximum sur 90 jours. Les champs sont sélectionnés explicitement. Le journal ne contient aucune coordonnée, trace GPS ni payload fournisseur et n'ajoute aucun envoi réseau. Les noms des trajets et des lieux restent locaux. Le miroir local `twrc.debrief.v1`, écrit après le document canonique, permet la récupération si une ancienne page ignore le nouveau champ ; il ne prévaut jamais sur un champ canonique présent, même vide. Le bouton « Effacer le journal » demande une confirmation et efface les entrées locales ; le snapshot d'un trajet encore en cours est conservé pour son arrivée.

## Vérifications

- `test_debrief.js` : invariants purs, fidélité des snapshots, dédoublonnage, écarts, fraîcheur, états thermiques 3/4, confidentialité, rétention, correction et annulation d'arrivée.
- `debrief-countertests.js` : les mêmes invariants doivent rejeter les implémentations volontairement erronées.
- `e2e56-debrief.js` : vrais clics/taps sur profils fictifs PC et viewport iPhone, trois chemins d'arrivée, GPS, annulation, quatre vues, modification, effacement et rechargement.
- `e2e54-context-sw.js` : fermeture puis réouverture hors ligne avec un vrai Service Worker, observation et prévision conservées.

Ces tests ne certifient pas Safari ni une PWA sur un iPhone physique. Le protocole appareil est dans [debrief-iphone-check.md](debrief-iphone-check.md).
