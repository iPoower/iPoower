# Audit des interactions et de la localisation

Périmètre : les 57 actions visibles déclarées dans la page, les contrôles natifs et les commandes dynamiques. Données de test exclusivement fictives. Les clics ajoutés utilisent Playwright sans `force`, sur PC et profil iPhone 11 Pro Max. Une ligne relie la commande à son résultat et à la suite qui vérifie le parcours. Le contrat dans `test_app_source.js` refuse une commande nouvelle sans entrée d’audit ou une commande sans handler.

## Causes reproduites avant modification

- Précision navigateur > 1,5 km transformée en position IP et suspicion de VPN sans preuve.
- Premier point approximatif : suivi automatique non activé ; watch économique avec cache de cinq minutes et sans timeout.
- Relevé à ±900 m écrasant celui à ±18 m reçu deux secondes avant.
- Un point précis suffisant à changer le lieu logique.
- Compteur vide et recherche de moins de deux caractères quittant leur handler sans explication.
- Réponses de recherche écrivant dans un panneau détaché ou remplaçant une recherche plus récente.
- Radar : commandes actives avant chargement ; aucune reprise après une panne initiale.
- Copie du widget acceptant le corps d’une réponse HTTP en erreur.

## Chaîne UI → événement → handler → état → résultat

Les événements `click` sont délégués sur `document` : le rerender ne détruit pas ces handlers. Les contrôles natifs restent associés au document ou sont réattachés lors de leur création (radar et graphique).

| Action `data-act` | État/action et résultat attendu | Suite |
| --- | --- | --- |
| `bcar` | véhicule du trajet retenu | `e2e49-interactions.js` |
| `bk-export` | export chiffré ou erreur de saisie visible | `e2e49-interactions.js` |
| `caldirect` | enchaînement agenda direct recalculé | `e2e32.js` |
| `calib-reset` | calibration effacée | `e2e49-interactions.js` |
| `copy` | presse-papiers ou sélection manuelle expliquée | `e2e49-interactions.js` |
| `copy-widget` | script valide copié, erreur HTTP expliquée | `e2e49-interactions.js` |
| `day` | jour de trajet sélectionné | `e2e49-interactions.js` |
| `demo` | simulation disponible en cas de panne | `e2e40-network.js` |
| `demo-off` | retour aux données réelles | `e2e49-interactions.js` |
| `demo-sel` | scénario de démo démarré | `e2e49-interactions.js` |
| `diag-copy` | diagnostic copié ou refus expliqué | `e2e49-interactions.js` |
| `dir` | sens du trajet modifié | `e2e49-interactions.js` |
| `ev-flag` | mode du moteur de preuves enregistré | `e2e49-interactions.js` |
| `ev-report` | preuve terrain datée et résultat visible | `e2e45-evidence.js` |
| `fb` | retour terrain enregistré | `e2e49-interactions.js` |
| `from` | origine du trajet enregistrée | `e2e49-interactions.js` |
| `geo-add` | destination ajoutée ou limite expliquée | `e2e49-interactions.js` |
| `geo-search` | résultats actuels ou erreur visible | `e2e49-interactions.js` |
| `goset` | paramètres ouverts et champ destination ciblé | `e2e49-interactions.js` |
| `goset-cfg` | paramètres accessibles sans préréglage | `e2e49-interactions.js` |
| `gps-forget` | suivi arrêté, anciens callbacks ignorés | `e2e50-geolocation.js` |
| `labcar` | véhicule Analyse retenu | `e2e49-interactions.js` |
| `loc` | météo du lieu choisi | `e2e49-interactions.js` |
| `loc-del` | destination supprimée | `e2e49-interactions.js` |
| `locate` | demande bornée, résultat ou erreur distincte | `e2e50-geolocation.js` |
| `lock` | réglages personnels verrouillés | `e2e49-interactions.js` |
| `locs-toggle` | liste des lieux dépliée | `e2e49-interactions.js` |
| `nocode` | réglages personnels manuels accessibles | `e2e49-interactions.js` |
| `ntfy-test` | POST simulé et résultat visible | `e2e49-interactions.js` |
| `odo` | compteur enregistré ou saisie expliquée | `e2e49-interactions.js` |
| `outfit-day` | jour Tenue choisi | `e2e49-interactions.js` |
| `outfit-occasion` | usage Tenue choisi | `e2e49-interactions.js` |
| `pchk` | contrôle de pression daté | `e2e49-interactions.js` |
| `photo-del` | photo supprimée | `e2e49-interactions.js` |
| `place-confirm` | override enregistré et contexte mis à jour | `e2e50-geolocation.js` |
| `place-leave` | confirmation terminée, aucun départ inventé | `e2e50-geolocation.js` |
| `rcenter` | radar recentré | `e2e49-interactions.js` |
| `refresh` | météo actualisée ou cache offline conservé | `e2e49-interactions.js` |
| `reset` | réglages par défaut rétablis | `e2e49-interactions.js` |
| `return-home` | retour domicile ajouté à la chaîne | `e2e35.js` |
| `return-home-done` | retour terminé | `e2e35.js` |
| `return-home-undo` | retour restauré | `e2e35.js` |
| `rot` | permutation datée avec compteur | `e2e49-interactions.js` |
| `rplay` | lecture / pause radar | `e2e49-interactions.js` |
| `tip` | astuce suivante | `e2e49-interactions.js` |
| `tire` | monte changée et Analyse recalculée | `e2e49-interactions.js` |
| `tread-add` | profondeur enregistrée ou erreur visible | `e2e49-interactions.js` |
| `trip-arrived` | arrivée confirmée, moteur terminé | `e2e30.js` |
| `trip-cancel` | annulation locale du trajet et de sa chaîne | `e2e34.js` |
| `trip-cancel-undo` | annulation restaurée | `e2e34.js` |
| `trip-preview` | aperçu GPS frais, sans départ inventé | `e2e34.js` |
| `trip-start` | trajet démarré par action explicite | `e2e48-tripstart.js` |
| `trip-undo` | arrivée annulée sans arrivée automatique immédiate | `e2e30.js` |
| `tripmap` | mini-carte ouverte / refermée | `e2e27.js` |
| `view` | onglet affiché et état aria-pressed | `e2e49-interactions.js` |
| `wday` | jours enregistrés, dernier jour protégé | `e2e49-interactions.js` |
| `withcode` | formulaire de déverrouillage rétabli | `e2e49-interactions.js` |

| Contrôle natif | Résultat et vérification |
| --- | --- |
| Formulaire de déverrouillage / Entrée | Déchiffrement, erreur visible, focus préservé (`e2e49-interactions`, `e2e40-network`) |
| Selects / champs `data-bind` | Réglage enregistré, recalcul, persistance (`e2e17`, `e2e46-tyrelink`, `e2e49-interactions`) |
| Switches d’alertes | État enregistré, bandeaux recalculés (`e2e49-interactions`) |
| Photo / fichier de sauvegarde | Chargement, retrait, import chiffré ou erreur (`e2e49-interactions`) |
| Démo `change` | Scénario et verdict mis à jour (`e2e49-interactions`) |
| Curseur radar / carte Leaflet | Image, recentrage, lecture/pause ; interactions tactiles et couches (`e2e49-interactions`, `e2e27`, `e2e39-layout`) |
| Graphique, flèches clavier / pointeur | Heure et détail sélectionnés (`e2e49-interactions`) |
| `details/summary`, liens de section | Panneau ouvert, paramètres rendus ; déplacement vers la section (`e2e49-interactions`) |
| Liens Waze et sources | URL de la destination affichée et attributs de navigation (`e2e29`) |

## Localisation et suspension

- Aucune origine IP déduite de l’accuracy de `navigator.geolocation`. Le projet ne dispose actuellement d’aucun fournisseur IP indépendant : le diagnostic le dit. Le fallback réseau est testé avec une entrée fictive explicite, sans ajout de fournisseur ni requête nouvelle.
- Demande précise au démarrage, au clic et à la reprise, timeout de 15 s ; suivi avec cache maximal de 10 s et timeout de 30 s. Permissions API optionnelle ; refus, indisponibilité et timeout distincts.
- GPS précis récent conservé face à un point moins précis. Géofence d’entrée `max(150 m, 2 × accuracy)` réservée aux observations ≤100 m ; sortie `max(350 m, 3 × accuracy)`, deux observations distinctes cohérentes pour changer de lieu. Adresses qui se recouvrent : confirmation disponible.
- Points invalides, anciens, futurs, déplacements ou vitesses impossibles refusés. L’heure ne déclenche toujours pas un trajet : la machine existante demande déplacement et deux vitesses cohérentes.
- Suspension : arrêt du watch, invalidation des callbacks, série de confirmation abandonnée. Premier plan : demande fraîche et un seul watch. Rechargement pendant une confirmation ne transforme pas un point isolé en lieu validé. Oubli manuel empêche les anciennes réponses de réactiver le GPS.
- Coordonnées détaillées seulement dans le diagnostic à l’écran ; diagnostic copié arrondi à environ 1 km. Aucune coordonnée nouvelle stockée dans le lieu logique.

## PWA et cache

Le shell contient ensemble HTML, JavaScript et CSS. Navigation network-first ; secours après 3 s si le réseau ne répond plus. `skipWaiting`, `clients.claim` et purge des anciennes générations sont déjà présents. La génération statique passe à v9 pour précharger le correctif ; le cache des données chiffrées reste v3. Le diagnostic distingue le hash de l’application réellement chargée et `version.json` du serveur, qui peut être plus récent que le shell offline. Les suites réelles `e2e37-sw` et `e2e41-sw-coldstart` vérifient Cache Storage, caches précédents, réseau muet et reprise hors ligne.

## Limites de vérification

Chromium et WebKit sont exécutés dans GitHub CI, les navigateurs locaux étant bloqués par les restrictions de sockets. Le profil WebKit mobile couvre la résolution 414 × 896, le tactile et les reprises simulées ; il ne remplace pas un iPhone physique. Verrouillage matériel, suspension du système iOS, précision du capteur et changement de radio Wi-Fi/4G/5G restent à vérifier sur appareil après déploiement. Les anciens parcours de réseau téléportaient parfois les positions de plusieurs kilomètres en une seconde ; leurs déplacements volontaires ont désormais des horodatages routiers cohérents. Les assertions de trajet, de réponses tardives et de cache sont conservées. Les tests de saut aberrant gardent leurs points impossibles. Aucun merge ni déploiement dans cette PR.
