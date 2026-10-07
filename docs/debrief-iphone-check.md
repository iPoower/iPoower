# Validation iPhone physique — Débrief

**État : à effectuer sur l'appareil.** Aucun résultat automatisé ne vaut validation physique.

Application : https://ipoower.github.io/iPoower/race-control/

Noter avant le passage : modèle iPhone, version iOS, Safari ou PWA, date, version prod-N et SHA affichés dans le diagnostic. Confirmer la version publiée dans `version.json`. Faire les manipulations à l'arrêt ou comme passager.

| Passage | Manipulation sur l'iPhone | Résultat attendu | Résultat physique |
| --- | --- | --- | --- |
| Safari | Ouvrir puis visiter Pneus, Météo, Tenue, Analyse ; ouvrir le menu des lieux | Noms lisibles, commandes accessibles, lieu confirmé cohérent | À faire |
| PWA | Ouvrir depuis l'écran d'accueil, visiter les mêmes vues | Même profil, même lieu et même contexte | À faire |
| Départ | Choisir le prochain trajet puis « Je pars maintenant » | Un trajet en cours, départ réel conservé, aucune arrivée inventée | À faire |
| Veille | Verrouiller 60 s puis reprendre | Même trajet ; GPS/météo anciens signalés, aucune arrivée sur un relevé périmé | À faire |
| Réseau | Passer Wi-Fi → 5G, puis mode avion et retour réseau | Trajet conservé ; données hors ligne identifiées ; reprise sans doublon | À faire |
| Fermeture | Fermer la PWA pendant le trajet, la rouvrir hors ligne | Même départ et même prévision initiale ; aucune deuxième entrée | À faire |
| Arrivée GPS | À destination, laisser arriver deux relevés précis distincts | Une arrivée, un débrief ; pas d'arrivée sur GPS approximatif | À faire |
| Arrivée manuelle | Sur un autre trajet, utiliser « Bien arrivé » ou la confirmation du lieu | Même journal et même demande de débrief | À faire |
| Après coup | Sur un trajet sans départ déclaré, utiliser « Déjà rentré » quand proposé | Arrivée sans durée réelle ni prévision initiale inventées | À faire |
| Observation | Renseigner les conditions réellement rencontrées, enregistrer, visiter les quatre vues, fermer et rouvrir | Une seule observation, mêmes faits dans toutes les vues | À faire |
| Report | Sur un autre débrief, « Plus tard », puis le reprendre dans le journal | Aucun retour considéré comme renseigné avant la saisie | À faire |
| Correction | Modifier un débrief ; en cas d'arrivée déclarée trop tôt, « Annuler l'arrivée » | Modification sans nouvel échantillon ; arrivée annulée retirée du journal | À faire |
| Annulation | Annuler un trajet puis annuler cette annulation | Aucun débrief d'arrivée créé | À faire |

Pour un défaut, noter l'étape, le comportement attendu/obtenu, prod-N, iOS, réseau et le diagnostic. Masquer les noms et positions personnels avant partage.

Validation physique acquise seulement lorsque ces passages ont été réalisés et leurs résultats consignés avec le modèle, iOS et la version de l'application.
