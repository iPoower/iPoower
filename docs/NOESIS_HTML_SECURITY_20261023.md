# NOESIS Security Fix — revue indépendante Race Control
Date : 23 octobre 2026 · Périmètre : `iPoower/iPoower` uniquement · PR : #236 (brouillon)
Base revue : `c9c833944f7da45d3a74394c5bcd6040582e302b` (main).

## NOESIS-XSS-001 — Injection HTML dans le comparateur
- **Source** : réglage utilisateur `cars[i].short` ; restauration de réglages sauvegardés `Backup.restorePlan` V1/V2 ; données chiffrées déverrouillées par `loadSettings`. L'import des liens de configuration valide la structure, mais un texte valide n'est pas nécessairement sûr pour `innerHTML`.
- **Sink** : `renderCompare` construit l'entrée « Pneus » du tableau `why` avec `r.car.short` brut, puis injecte `why.map(...)` par `innerHTML`. Les autres textes déjà échappés ne doivent PAS subir un nouvel échappement global.
- **Défaut** : un marqueur HTML fictif de type `<mark>` devient une structure HTML au parsing. Il n'existe pas ici de preuve d'exécution JavaScript ; une CSP restrictive empêche notamment les gestionnaires d'événement inline.
- **Correction ciblée** : `esc(r.car.short)` au seul point d'interpolation du texte concerné. Les caractères `& < > " '` et les accents doivent rester visibles littéralement et sans double échappement.
- **Gravité** : injection de HTML confirmée statiquement et par parseur isolé ; possibilité de script effectif non démontrée, impact dépend de la provenance des réglages et des protections.

## NOESIS-XSS-002 — Attribut image construit depuis une sauvegarde
- **Source** : téléversement local `resizePhoto` génère du `data:image/jpeg;base64` ; le lien `ConfigImport.car` autorise `png/jpeg/webp` dans des limites propres à ce canal ; `loadSettings` et `Backup.restorePlan` peuvent toutefois exposer d'anciennes valeurs persistées qui n'ont pas repassé ce validateur.
- **Sink** : `carThumb(car)` injectait une valeur `car.photo` brute dans `<img src="...">`. Un guillemet dans une valeur restaurée pouvait créer un attribut HTML supplémentaire. Ceci ne prouve pas une exécution JS.
- **Correction ciblée** : `safeCarPhoto` n'autorise au moment du rendu que `data:image/(png|jpeg|webp);base64,` avec alphabet Base64, puis `esc(ph)` lors de l'insertion d'attribut.
- **Préservation** : aucune limite de taille ajoutée pour le rendu ; aucune migration ni réécriture des réglages, sauvegardes ou photographies. Une donnée non admise affiche la silhouette native ; sa valeur reste stockée telle quelle, exportable et donc récupérable après analyse/rectification volontaire. Aucune image valide remplacée.
- **Attention** : la validation syntaxique d'un `data:image` ne prouve pas que tous les octets encodent une image décodable. Le navigateur gère l'échec normal d'image ; aucune nouvelle transformation du contenu n'est autorisée dans cette PR.

## Audit complémentaire `innerHTML` (inspection statique)
- Décompte ponctuel : plus de 50 occurrences `innerHTML` dans `src/app.js`, la plupart pour les gabarits d'application, ou pour les données enveloppées par `esc()`. Ce décompte n'est **pas** un nombre de vulnérabilités.
- Zones revues : `renderCompare` (source `car.short`) et `carThumb` (source `car.photo`), réglages `bindIn` (attribut `value` échappé), noms de véhicule (souvent échappés), emplacement `#geoHits` à soumettre à un contrôle complémentaire si une trace non fiable est isolée, affichages météo et sources externes sans injection supplémentaire confirmée dans ce lot.
- Tout autre chemin suspect exige revue source → transformation → sink et reproduction indépendantes ; la PR ne refond pas le moteur de rendu.

## CSP et origines de publication
- `tools/build.js` génère `script-src` à empreintes SHA-256 (plus actifs approuvés), `script-src-attr 'none'`, `object-src 'none'`, `base-uri 'none'`, `frame-src 'none'` hors profil Drive (exceptions d'identité Google).
- GitHub Pages : politique en `<meta http-equiv="Content-Security-Policy">` ; Cloudflare Pages : même politique en `_headers`, avec `frame-ancestors 'none'` et plusieurs en-têtes supplémentaires. Contrôle d'application effective en production NON exécuté par cette PR.
- Aucun assouplissement CSP.

## Protocole de preuve — ne pas confondre test et succès
- **Rouge local minimal** : interpolation dans un parseur HTML isolé avec `<mark data-noesis-short>` et `data-noesis-photo` : création de structure/attribut confirmée ; aucun script offensif.
- **Rouge réel dans l'application** : à établir séparément par CI Chromium/WebKit sur le code initial, sans scripts dangereux. Une anomalie préliminaire de garde-fou de registre (`test_ci_lanes`, quantité attendue) ne constitue PAS une preuve rouge navigateur.
- **Vert** : suite `tests/e2e86-html-security.js` sur DOM réel et deux facteurs de forme iPhone/PC, en Chromium et WebKit ; suite `tests/test_backup.js` V1/V2 ; suite CI historique non réduite, et contrôles CodeQL/confidentialité. Ne déclarer la validation qu'après lecture des rapports/actions associés au SHA de tête final.
- **Préconditions de fusion** : toutes les validations sur le SHA exact, revue humaine des deux chemins d'injection et compatibilité photo, et GO de fusion distinct. Cette PR n'autorise ni fusion, ni publication, ni accès Google personnel.

## Quatre risques distincts — constats statiques, hors PR
| Risque | Statut | Protection / contrepoint | Preuve manquante et décision |
| --- | --- | --- | --- |
| Première écriture A1 concurrente | Confirmé dans la justification/contre-tests documentés de PR #234 ; correction proposée dans #234 non fusionnée | file durable et blocage des reprises incohérentes | Revue indépendante #234 et vérification finale ; pas de GO Drive |
| Éviction IndexedDB / perte de la seule copie locale | Risque générique conditionnel, aucune perte concrète constatée par cet audit | coffre local, contrôles de lecture, sauvegarde indépendante envisagée | essai de récupération multi-appareils, copie indépendante hors navigateur ; pas de GO Drive |
| Upload Google Drive partiel | Risque de transport soumis aux coupures ; perte démontrée NON constatée | SHA-256, relecture des octets, statuts incomplets refusés, outbox ; corrections indépendantes #234/#235 en cours | tests réseau Google isolés + revue idempotence et destination ; pas de GO Drive |
| Origines GitHub Pages ↔ Cloudflare Pages | Distinction de stockage/origine confirmée ; échec de migration utilisateur NON démontré | `test_origin_build.js`, `e2e84-sw-data-origin.js`, confinement de la base données relais | plan de récupération explicite et essai réel de bascule sur appareils de test ; pas de GO Drive |

## Périmètre et retour arrière
Aucun fichier de PR #234 ou #235 touché. Aucun `main`, OAuth, chiffrement, contenu privé, Google Drive, Control Vault, Reconversion Control ou Twin Garage modifié. Retour arrière possible uniquement par nouvelle PR, sans suppression ou migration des données historiques.

**Décision** : NO GO fusion/publication tant que la CI complète sur le SHA exact de la PR et la revue humaine ne sont pas documentées.
