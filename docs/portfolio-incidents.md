# Portfolio — trois incidents techniques documentés

> **Études de cas réelles, non tutoriels fictifs.** Les références ci-dessous proviennent de PR fusionnées dans Race Control. Cette fiche résume les correctifs documentés et leurs preuves automatisées ; elle ne prétend pas qu'une seule personne a écrit tout le code ni qu'un test sur iPhone physique a été réalisé à chaque étape.

## Incident 1 — Verrouillage et restauration : ne pas perdre les données

**Contexte.** Race Control stocke localement les réglages, les informations des pneumatiques et un journal des trajets. Le bouton de verrouillage conservait certaines données lisibles et un import pouvait annoncer un succès malgré une écriture refusée.

**Hypothèse technique vérifiée dans la PR.** Une écriture locale peut échouer silencieusement ou être interrompue ; il faut considérer l'import comme une opération transactionnelle et ne jamais supprimer l'ancienne version avant validation.

**Correction documentée.**
- Produire puis relire une copie chiffrée avant de retirer les copies lisibles au verrouillage.
- Vérifier les écritures et suppressions de l'import ; conserver un journal de récupération permettant le retour à l'ancien état après interruption.
- Éviter les écritures tardives d'autres modules pendant la transition.

**Preuves.** [PR #73 — verrouillage et import](https://github.com/iPoower/iPoower/pull/73) et [PR #76 — tests de régression indépendants](https://github.com/iPoower/iPoower/pull/76). Les descriptions de PR rapportent des tests avec quota refusé, redémarrage, récupération de données et navigateurs simulés. [Exécution CI référencée par la PR #73](https://github.com/iPoower/iPoower/actions/runs/37749110110).

**Limites et leçon.** Une CI verte n'est pas une preuve de confidentialité absolue ; le modèle de stockage reste à renforcer. Compétence illustrée : raisonnement sur les échecs et conservation des données.

## Incident 2 — Des réponses météo contradictoires

**Contexte.** Un panneau indiquait « pas de pluie » alors que le score route appliquait une pénalité en présence d'une forte probabilité de pluie.

**Cause identifiée.** La synthèse, le score route et les conseils de tenue utilisaient **trois seuils différents**. La fusion du modèle AROME avec le modèle de base pouvait aggraver cette contradiction : quantité de pluie faible selon un modèle, probabilité élevée selon l'autre.

**Correction documentée.**
- Centraliser un signal cohérent « pluie possible » partagé par les panneaux concernés.
- Conserver les deux sources et expliquer explicitement leur désaccord.
- Éviter de modifier la réponse météo brute mise en cache lors de la fusion des modèles.

**Preuves.** [PR #77 — météo, score et Tenue](https://github.com/iPoower/iPoower/pull/77). Sa description mentionne six scénarios ciblés, une grille de 360 combinaisons, des tests des moteurs et un parcours navigateur `e2e61-rain-signal` qui échouait avec l'ancien comportement.

**Limites et leçon.** Un verdict produit doit être traçable jusqu'aux sources ; l'absence d'une quantité prévue n'est pas forcément une preuve d'absence de pluie.

## Incident 3 — Lieu confirmé mais itinéraire depuis l'ancienne origine

**Contexte.** Le lieu actuel était confirmé manuellement, GPS indisponible, mais la carte « prochain trajet » affichait encore l'origine précédente et une durée déjà calculée.

**Cause retenue.** La représentation du trajet agenda et la confirmation du lieu courant n'étaient pas toujours synchronisées. Des métriques routières devenaient obsolètes lorsque l'origine changeait.

**Correction documentée.**
- Utiliser la confirmation manuelle pour le premier aller agenda encore à venir, avec des exclusions pour les trajets terminés et les consignes particulières.
- Invalider la route, les kilomètres et la durée hérités avant recalcul ; afficher honnêtement « recalcul en cours ».
- Conserver l'identifiant du trajet lorsque son heure calculée change, pour éviter qu'un trajet terminé réapparaisse.

**Preuves.** [PR #79 — origine confirmée](https://github.com/iPoower/iPoower/pull/79) ; [CI de la PR réussie](https://github.com/iPoower/iPoower/actions/runs/37775658994) ; [CI après fusion réussie](https://github.com/iPoower/iPoower/actions/runs/37777192410).

**Limites et leçon.** Une correction locale doit conserver les invariants d'autres modules (retours, rendez-vous suivants, historique d'arrivée). Tests navigateur simulés ≠ confirmation sur tous les téléphones réels.

---

## En entretien : démontrer la compréhension

Pour chaque incident, expliquer avec ses propres mots : **symptôme → reproduction → hypothèse → code concerné → test de non-régression → limite actuelle**. Préparer une démonstration sur une branche de test avec des données fictives. Un candidat ne devrait pas se présenter comme auteur exclusif des correctifs si le code a été réalisé avec des agents d'IA.
