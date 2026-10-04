# Préparer une correction privée du lieu de travail

Le lieu doit être corrigé dans le préréglage de l’application **et** dans la configuration du relais. Modifier seulement l’appareil laisse les notifications cloud calculées depuis l’ancienne destination.

L’outil `tools/update-work-location.js` prépare les deux fichiers chiffrés, sans modifier les fichiers sources ni publier quoi que ce soit. Le dossier de sortie apparaît en une seule opération après validation et chiffrement des deux configurations. Une sortie existante est refusée.

1. Créer hors Git, par exemple dans `private/work-location.patch.json`, un objet contenant `name`, `address`, `lat` et `lon`. Les coordonnées doivent être des nombres GPS valides, correspondant au site exact. `sub` peut remplacer `address` ; l’adresse validée est enregistrée dans les deux champs pour l’affichage de l’app.
2. Fournir `APP_KEY` et `RC_KEY` dans l’environnement local sécurisé. Ne pas les inscrire dans les arguments de commande, un fichier suivi par Git, une conversation ou les logs. Elles doivent être distinctes ; la clé relais conserve le minimum existant de 16 caractères.
3. Exécuter :

   ```sh
   node tools/update-work-location.js --patch private/work-location.patch.json --encrypted encrypted --out private/prepared-work-location
   node tools/check-keys.js --enc private/prepared-work-location
   ```

   `check-keys.js` applique sa politique de contrôle existante, dont un minimum de 32 caractères pour la clé relais. L’outil de préparation accepte le minimum historique de 16 caractères : une éventuelle rotation est une opération distincte.

La destination est celle de `preset.work.to`, recherchée par identifiant dans les lieux configurés et personnalisés. L’ordre des lieux n’est jamais utilisé pour déterminer le travail. Le relais doit viser cette même destination ; une configuration ambiguë est refusée. Les voitures, le domicile, les horaires, les jours de travail, les notifications et les autres réglages restent identiques.

Le préréglage chiffré reçoit une révision de lieu aléatoire dans `locRevisions`. La migration de l’application retire une seule fois les anciennes modifications locales du nom, de l’adresse et des coordonnées de ce lieu. Les autres modifications locales restent conservées. Aucune adresse ni coordonnée n’est placée dans un identifiant public.

Les coordonnées exactes restent internes aux configurations chiffrées. Les arrondis de confidentialité déjà appliqués aux requêtes de route sont conservés. Les fichiers produits ne contiennent aucune configuration en clair ; la préparation n’écrit ni agenda, ni `obs.json`, ni stockage du téléphone.

Une correction réelle exige l’accès autorisé aux deux clés et une étape de publication distincte après revue. La présence de l’outil ou de ses tests ne signifie pas que la destination privée a été modifiée en production. Aucun nouveau workflow détenteur de secrets n’est nécessaire à cette préparation.
