# GPS « assez bon » · critères de sortie du gel

**Statut au 21/11/2026 : GEL DES FONCTIONS GPS.**
Aucune nouvelle fonction de navigation (guidage, voix, voies, limitations, recalcul, carte) n'est ajoutée tant que les critères ci-dessous ne sont pas remplis **sur trajets réels**. Seules restent permises :
- les corrections de défauts constatés ;
- les mesures et les relevés ;
- les renvois vers une app tierce (« Guider avec… »), qui n'ajoutent aucun code de navigation.

Les tests automatiques (Chromium, WebKit) prouvent le comportement sur des données fictives. Ils ne prouvent ni la justesse des consignes sur la route, ni la batterie, ni la précision GPS d'un vrai iPhone. Seul le terrain le peut.

## Appareil de référence
- **Téléphone :** iPhone 11 Pro Max, PWA lancée depuis l'écran d'accueil, version affichée dans Réglages (`version.json`).
- **Conditions :** luminosité automatique, téléphone sur support, sans recharge pendant le trajet (sinon, la batterie n'est pas mesurable, voir C3).

## Critères mesurables

| # | Critère | Seuil de sortie | Mesure | Source |
|---|---|---|---|---|
| C1 | Consignes fausses | **0** sur **10 trajets réels** consécutifs (≥ 5 km chacun, dont ≥ 3 avec au moins un rond-point et ≥ 2 hors agglomération) | Relevé du journal : « consigne fausse » | Passager |
| C2 | Recalcul hors itinéraire | **< 10 s** entre la sortie réelle de l'itinéraire et l'affichage des nouvelles consignes, sur **≥ 3 sorties volontaires** | Chronomètre du passager | Passager |
| C3 | Batterie | **≤ 15 %/h** en mode EN DIRECT sur iPhone 11 Pro Max, moyenne de **≥ 3 trajets de ≥ 30 min** sans recharge | Relevé : batterie au départ et à l'arrivée, durée du trajet | Passager, journal |
| C4 | Précision affichée | **Moyenne des « GPS ± N m » notés ≤ 20 m**, aucune valeur > 50 m hors tunnel | Relevé de la valeur affichée à chaque manœuvre (5 par trajet) | Passager |
| C5 | Perte du GPS | **≤ 1** perte de plus de 30 s par heure hors tunnel ou parking couvert | Relevé : « perte du GPS » | Passager |
| C6 | Annonces trop tardives | **≤ 1** pour 10 manœuvres. Une annonce est trop tardive si le palier « 200 m » apparaît après le début du freinage nécessaire. | Relevé : « annonce trop tardive » | Passager |

Seuils C1 à C4 : décision du propriétaire, le 21/11/2026. Seuils C5 et C6 : proposition, à valider.

### Calcul des indicateurs
- **C3 :** `(batterie départ − batterie arrivée) / durée du trajet (h)`. On écarte les trajets avec recharge ou de moins de 30 min, trop bruités.
- **C4 :** moyenne simple des valeurs « GPS ± N m » lues sur l'écran EN DIRECT. C'est la précision **annoncée par l'iPhone**, pas une erreur mesurée.
  - Le passager note aussi, à chaque manœuvre, si la flèche était **sur la bonne route** (oui / non).
  - Une moyenne ≤ 20 m avec une flèche régulièrement sur la mauvaise route fait **échouer** C4.
- **C1 :** une consigne est **fausse** si elle demande une manœuvre impossible ou interdite, ou contraire à l'itinéraire que l'app suit elle-même : mauvais côté, mauvaise sortie de rond-point, rue inexistante.
  - Une consigne **inutile mais exécutable** n'est pas fausse. On la note en commentaire.

## Points de vigilance connus (sans changement de code pendant le gel)
- **Recalcul (C2) :**
  - L'app attend 3 relevés précis hors itinéraire, à plus de 70 m de la route, sur au moins 4 s, avant de recalculer. Elle n'enchaîne jamais deux recalculs à moins de 20 s d'écart (protection contre le recalcul en boucle, #360).
  - Une deuxième sortie de route dans les 20 s qui suivent un recalcul **dépassera donc 10 s**. On la note à part pour ne pas confondre avec une lenteur du service.
- **Batterie (C3) :**
  - La carte 3D consomme plus que la carte à plat. L'app bascule seule à plat si la 3D est trop lente, mais pas pour économiser la batterie.
  - Noter pour chaque trajet le mode affiché : 3D ou plat.
- **Service d'itinéraire :** le serveur OSRM de démonstration n'a pas d'engagement de disponibilité. Une panne affiche « itinéraire précédent conservé » : on la note, mais ce n'est pas une consigne fausse.

## Décision de sortie du gel
Le gel est levé fonction par fonction, quand C1 à C4 sont remplis et que C5 et C6 sont validés ou remplis, preuves à l'appui. Les preuves sont :
- les relevés du journal ;
- les fiches de comparaison avec Apple Plans (`docs/GPS_PROTOCOLE_APPLE_PLANS.md`).

Le dépôt ne contient **jamais** de lieu, d'adresse, de coordonnée ni d'horaire réel. Les relevés restent dans le journal chiffré de l'app.
