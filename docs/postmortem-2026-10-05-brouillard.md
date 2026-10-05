# Post-mortem · brouillard non signalé · 5 octobre 2026

## Résumé
Brouillard et brume en bancs ressentis sur le trajet du matin ; Race Control n’a émis aucune alerte et affichait un score
de 90–100. Cause racine : **architecture de décision** (brouillard décidé uniquement par la visibilité numérique), amplifiée
par la **sémantique du score** (aptitude pneus, pas une confiance) et, sur PC, possiblement par la **localisation VPN**.

## Chronologie reconstituée (sources publiques : `obs.json` versionné sur `gh-pages`, METAR LFAQ)
| UTC | LFAQ Albert-Bray (METAR brut) | Lecture |
|---|---|---|
| 00:00 | `01004KT 9000 NSC 12/11` | air presque saturé |
| 01:30 | `34005KT 5000 BR NSC 10/10` | **T = Td**, brume |
| 03:00 | `35005KT 3700 BR NSC 09/09` | saturé, vent ≈ 9 km/h |
| 04:30 | `33005KT 2100 BR FEW003 OVC140 08/08` | saturé, **nuages à 300 ft**, visibilité 2,1 km |
| 05:30 | `35005KT 2300 BR NSC 09/09` | toujours saturé |
LFAY (Amiens-Glisy) : aucun METAR publié sur la période. Relais : exécuté toutes les ~9 min (horloge Cloudflare), sans erreur ;
`morning = { f: false, checks: 10 }` : 10 contrôles du matin, brouillard = faux.

## Où le signal a été perdu
1. **Moteur (règle)** : alerte brouillard seulement si la visibilité (modèle ou station) est < 500 m (« fog ») ou < 1 000 m
   (« vis »). La brume saturée (BR, 2–4 km) avec T = Td, vent faible et plafond à 300 ft n’est jamais une alerte.
2. **Assimilation** : `applyObs` reporte la température, le point de rosée et la visibilité de la station la plus proche
   (≤ 35 km) mais **n’utilise ni T − Td, ni le temps présent BR, ni le plafond** ; la visibilité observée (2,1 km) est
   reportée telle quelle (aucune lecture « bancs plus denses probables à l’écart de la station »).
3. **Modèle** : la visibilité des prévisions vient du modèle de base d’Open-Meteo (AROME n’en fournit pas) ; elle rate
   souvent les brouillards locaux. Les valeurs brutes de ce matin ne sont pas récupérables : les journaux du relais sont
   volontairement muets et Open-Meteo n’est pas joignable depuis l’environnement d’analyse. *Non vérifié.*
4. **Score** : « 90–100 » est le **score d’aptitude pneus** (100 − pénalités ; visibilité pénalisée seulement < 1 000 m).
   Rejeu avec le METAR réel de 04:30 : station appliquée (19 km), T − Td = 0, visibilité 2 100 m → **aucune alerte, 92/100**.
   Ce n’est pas une confiance, mais il était lu comme tel.
5. **Localisation (PC)** : avant le correctif « lieu courant », une position réseau/VPN pouvait devenir « Ma position »
   et le lieu affiché ; l’onglet Météo affichait alors la météo d’une autre ville, sans observation proche (> 35 km).
   Le relais et le briefing de trajet utilisent les lieux enregistrés : ils n’étaient pas touchés. *Ce que le PC affichait
   ce matin n’est pas vérifiable (aucun journal côté navigateur).*

## Classement
Architecture / fusion (principal) · mapping (BR, plafond, T − Td ignorés) · confiance (score mal nommé) · localisation (PC,
possible) · fournisseur (visibilité modèle, probable mais non vérifiée). Fraîcheur et relais : hors de cause.

## Corrections
- **Moteur de preuves v2** (`src/evidence.js`) : couches A observation · C modèle · D terrain · E physique ; brume saturée
  sous vent faible ou plafond ≤ 300 ft = brouillard local probable ; contradiction modèle / observation visible ; pire condition
  crédible le long du trajet ; confiance par phénomène, plafonnée par la localisation ; décote par distance, âge, altitude, échéance.
  Rejeu du 5 octobre : **BROUILLARD LOCAL PROBABLE**, contradiction détectée (test automatique).
- **App : v2 actif par défaut** (Réglages → Moteur météo v2 : Actif / Observation / Désactivé) : un brouillard prouvé passe en tête
  de l’onglet Météo et en bandeau, même sous un score pneus élevé. **Relais : mode fantôme**, notifications inchangées ; le relais écrit `morning.v2` dans
  `obs.json` (niveaux seuls, aucun lieu) : l’historique de `gh-pages` devient le journal de comparaison.
- **Signalement terrain** (« 🌫 Brouillard », « 🧊 Verglas »…) : observation utilisateur non officielle, journal prévision / observation.
- **Lieu courant de confiance** : une position réseau/VPN n’est plus jamais la position physique.

## Sources étudiées
| Source | Statut | Coût / quota | Accès |
|---|---|---|---|
| METAR (aviationweather.gov) | **intégré** (relais : LFAQ, LFAY) | gratuit | sans clé |
| Météo-France API Données d’observation (≈ 2 000 stations, 6 min, visibilité) | **à valider** | gratuit, 100 req/min | compte + jeton (secret GitHub) |
| SYNOP Météo-France (données ouvertes) | proposé | gratuit, Licence Ouverte | sans clé, toutes les 3 h |
| Radar (RainViewer, déjà affiché) | carte seulement | gratuit | non utilisé dans la décision |
| Waze (Waze for Cities) | **non accessible** | — | réservé aux autorités publiques ; données non publiables ; aucun scraping |
| Données routières, webcams | à étudier | — | licence et réutilisation automatisée à vérifier |
Aucune de ces sources n’était joignable depuis l’environnement d’analyse : rien n’est présenté comme intégré sans vérification.
