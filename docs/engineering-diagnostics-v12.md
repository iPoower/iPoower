# Diagnostics V1.2 — preuves, priorités et contexte

Lot ordinaire de lecture et de présentation, indépendant des correctifs sensibles
de restauration. Aucun nouveau stockage, capteur, format, service ou workflow.

## Comportement

Les règles de risque documenté précèdent la vigilance et les données manquantes.
La sculpture mesurée sous 1,6 mm reste prioritaire même sans météo. Une estimation
sous ce seuil déclenche une vérification avant circulation, sans diagnostic
fictif de non-conformité mesurée. L'ancien verdict garde sa prudence et sa couleur
d'alerte ; ses textes distinguent désormais également cette estimation.

Les prévisions d'air et de chaussée sont étiquetées ESTIMÉE ou INCONNUE, avec
source, portée, réception, âge et état hors ligne. Leurs plages sont arrondies
vers l'extérieur au degré. Au-delà de 60 minutes ou sans date fiable, aucun
contexte actuel de pluie n'est affirmé. Une ancienne valeur de pression à zéro
reste une vigilance historique, sans prétendre mesurer la pression actuelle.

Les essais conservent leurs valeurs, leurs protocoles, dimension/variante,
publication et date de vérification, avec liens directs. Les résultats
contradictoires restent distincts et leur conclusion est suspendue. Une
homologation connue d'un seul côté interdit le qualificatif de preuve exacte.

Un véhicule choisi dans le contexte global actualise aussi un brouillon Trajet
déjà ouvert, sans remplacer son départ, sa destination ou son horaire. Ce lien
est une mémoire d'initialisation de l'interface, sans nouvelle source métier.
Un choix local du brouillon reste conservé tant que le véhicule global ne change
pas. Aucune sélection de pneu stocké/prévu ne remplace la monte active.

## Défauts reproduits et validation

- Sur `c4b8821d`, un essai sans homologation publiée pouvait être qualifié exact
  face à une monte homologuée ; régression sur l'identité des références.
- Le verdict historique présentait une profondeur estimée comme une
  non-conformité mesurée ; régression sur le vrai moteur, alerte maintenue.
- Un brouillon Trajet déjà lié au véhicule A restait sur A après choix global B ;
  régression sur le vrai initialiseur et conservation des autres champs.
- La capture mobile du candidat `474ae5f3` montrait des libellés de priorité
  coupés au milieu des mots par la disposition héritée. Le flux de texte est
  rétabli ; le test navigateur vérifie les lignes de chaque mot des libellés.
- Oracles : seuil exact 1,6 mm, météo absente/ancienne/non datée, frontière
  60/60,1 minutes, pression zéro récente/historique, sources contradictoires,
  mesure contre estimation et absence de mutation.
- Parcours navigateur étendus : clavier et focus après rendu, risque visible
  sans météo, liens des sources, changement réel de véhicule entre trois vues,
  iPhone/PC et hors ligne. La CI exacte et la production doivent être vérifiées
  séparément ; aucun appareil physique testé n'est revendiqué.

## Références normatives et limites

[Arrêté du 18 juillet 2019, article 5](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000038995312)
: minimum de 1,6 mm dans les rainures principales pour les catégories M1/N1/O1/O2.
Texte vérifié par les résultats indexés de la source officielle le 19/10/2026 ;
l'accès direct automatisé a répondu 403. Ce seuil ne certifie pas l'état du pneu.

[Michelin, contrôle de pression](https://www.michelin.fr/auto/conseils/guide-pneus-hiver/quelle-pression-pneus-hiver)
: contrôle mensuel et à froid, source consultée le 19/10/2026. La pression
recommandée dépend du véhicule et de sa charge ; aucune valeur cible inventée.

Les valeurs historiques du catalogue restent celles de leurs publications ;
leur date de vérification n'est pas la date d'un nouvel essai. Aucun score,
coefficient d'adhérence, distance personnalisée ou vitesse sûre n'est ajouté.
Retour arrière logiciel possible sans migration ni perte de fonction antérieure.
