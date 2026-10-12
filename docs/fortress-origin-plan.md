# Origine dédiée — plan à approuver, aucune migration effectuée

## Situation actuelle

Race Control (`/iPoower/race-control/`) et Reconversion Control (`/Reconversion-Control/`) ont la même origine HTTPS `ipoower.github.io`. Les chemins, préfixes des clés, scopes de Service Workers et noms de bases ne sont pas des frontières de confidentialité.

Un JavaScript exécuté dans l'une des applications peut accéder au localStorage, aux bases IndexedDB et à Cache Storage de cette origine. Il peut invoquer un CryptoKey non extractible, interagir avec les fenêtres de même origine et, selon le navigateur, utiliser des permissions déjà accordées à l'origine. Une sessionStorage est propre au contexte d'onglet, mais les pages d'un même onglet partageant l'origine l'utilisent, et un opener peut en fournir une copie. La CSP de Race Control ne contraint pas un document voisin qui dispose de son propre contexte/politique.

Un Service Worker de sous-dossier a une portée de navigation limitée ; cette portée n'empêche pas le JavaScript voisin d'accéder aux stockages de l'origine. Le SW v12 réduit l'interception accidentelle des requêtes d'autres dossiers, sans prétendre isoler ces stockages.

## Architecture cible

Choisir une origine **réservée à Race Control**, par exemple un projet Cloudflare Pages autonome ou un sous-domaine possédé par le propriétaire. Nom non choisi à ce stade. Ne pas y héberger Reconversion Control ni des scripts non contrôlés. Les en-têtes de `_headers` s'appliquent aux assets statiques Pages ; une future fonction/Worker doit produire ses propres en-têtes.

Le relais peut rester dans GitHub Actions après #128. Le client lit les JSON publics/chiffrés depuis une base de données HTTP explicite configurée au build (`RC_DATA_BASE`). Le préréglage, le coffre, les notifications et l'agenda restent chiffrés selon leurs formats existants. Les CORS des endpoints et leur fraîcheur doivent être vérifiés, jamais supposés. Ne pas transporter un secret iCal dans le client ou l'URL de migration.

## Impacts à résoudre avant bascule

| Élément | Préparation et preuve exigées |
| --- | --- |
| Adresse et raccourci iPhone | Ancienne URL conservée ; nouveau manifeste, start_url, scope et ajout sur écran d'accueil testés sur appareil physique. Pas de redirection forcée. |
| Coffre local | Stockage vide sur la nouvelle origine. Transfert chiffré volontaire et vérifié, aucune copie en clair du mot de passe ou de la clé. |
| Connexion 7 jours | Les CryptoKey IndexedDB ne sont pas transférées. Authentification et consentement explicites sur le nouvel appareil/origine. |
| GPS | Nouvelle autorisation de l'origine ; coordonnées durables conservées, observations physiques/permissions runtime renouvelées. Pas de fabrication de position depuis l'ancien cache. |
| Notifications | Re-demander permission si nécessaire ; tester Chrome/Windows et PWA iOS. Le lien du relais `cfg.site` et le widget doivent être mis à jour dans une PR séparée, sans dévoiler la configuration privée. |
| Agenda | Accès au blob chiffré, déchiffrement, fraîcheur/cache, identifiants, origines manuelles et règles d'agenda testés. Aucun changement de secret iCal. |
| Météo et cartes | CSP/CORS, same-origin assets, fournisseurs exacts, reprise LIVE, 429 et affichage CACHE testés sur le nouveau host. |
| Itinéraires | URLs relatives, liens Waze/Maps, départs personnalisés, véhicule/jour et contexte conservés. |
| Hors ligne | Nouveau SW de cette origine, premier chargement contrôlé, démarrage à froid hors ligne et coexistence avec l'ancienne PWA. |

## Mécanisme de transfert à préparer dans une PR distincte

1. À partir de l'ancienne page de confiance, après déverrouillage, terminer `flush` sous Web Locks. Refuser l'export si des écritures non confirmées subsistent. Garder le coffre original.
2. Produire un fichier **local chiffré**, par geste explicite : sauvegarde V2 standard pour les réglages/contexte, plus un instantané complet et versionné du coffre pour couvrir toute clé durable non prévue dans Backup V2. Les informations d'origine/version sont authentifiées dans l'enveloppe de transfert ; le hash de ciphertext sert à détecter les erreurs de transport, pas à remplacer GCM.
3. Exclure les clés de session, descripteurs de connexion, CryptoKey d'appareil mémorisé, tokens, permissions et diagnostics. Le fichier ne contient ni URL iCal ni donnée déchiffrée. Aucun paramètre URL, presse-papiers automatique, postMessage générique ou transfert cloud en clair.
4. Sur la nouvelle origine, sélectionner ce fichier et saisir le code. Valider format, taille, KDF, authenticité GCM et manifest des clés avant tout changement. Rendre les données dans un stockage provisoire ; comparer **chaque valeur durable** (véhicules, pneus actifs/plans, DOT/profondeurs, préférences, journal, historiques, origines agenda). Exiger une couverture complète ; une sauvegarde partielle ne doit pas effacer des valeurs inconnues.
5. Après confirmation, écrire sous Web Locks, relire/déchiffrer et comparer. Quota, mauvais code, corruption ou interruption conservent le coffre précédent et un chemin de reprise. Les observations GPS et trajets runtime sont renouvelés explicitement, sans supprimer les historiques durables.
6. Réauthentifier l'appareil et demander ses permissions. L'ancienne application et sa sauvegarde restent disponibles jusqu'à validation.

Les unitaires de #129 démontrent déjà un transfert **fictif** de coffre v2 avec toutes les valeurs durables identiques, y compris plan pneus et journal, en conservant le coffre d'origine. Ils ne constituent pas une implémentation de l'interface de migration ni une preuve sur les données réelles de l'iPhone. L'outil de transfert et sa restauration interrompue doivent obtenir leur PR et leurs tests avant toute bascule.

## Retour arrière

Ne pas désinstaller l'ancienne PWA ni vider ses données. Avant de revenir après de nouvelles écritures, exporter un paquet chiffré depuis la nouvelle origine ; restaurer volontairement vers l'ancienne après comparaison et confirmation. Tester ce chemin inverse sur fixtures : source préservée, edits post-bascule conservés, mauvais code/corruption/quota/interruption sans perte. Une simple réouverture de l'ancienne URL ne transporte pas les changements faits sur la nouvelle.

## Conditions d'autorisation

Toutes les PR de sécurité doivent être relues, synchronisées et validées sur leurs heads exacts. Exiger une matrice complète sur leur combinaison après intégration autorisée, les contrôles réels de l'hébergement, un refus d'iframe avec les vrais en-têtes, un test d'attaque depuis l'application voisine et les parcours iPhone/PC. Vérifier le confinement GitHub, l'accès aux secrets, les comptes et le retour arrière.

Autorisation du propriétaire distincte pour le choix/paiement éventuel du domaine, DNS, publication, migration utilisateur et changement des liens du relais. Aucune de ces actions n'est déclenchée par ce document.

## Références primaires

- MDN, Same-origin policy : https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy
- MDN, frame-ancestors (pas de support via meta) : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
- Cloudflare Pages, headers : https://developers.cloudflare.com/pages/configuration/headers/
- GitHub, secure use : https://docs.github.com/en/actions/reference/security/secure-use
