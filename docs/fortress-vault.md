# Forteresse — session enveloppée, coffre conservé

## Défaut confirmé et choix

Le coffre local v2 utilise AES-256-GCM et PBKDF2-SHA256 à 600000 itérations, avec sel de 16 octets et IV aléatoire de 12 octets. Les écritures sont authentifiées, relues et coordonnées par Web Locks. Mais le format de session v3 conservait la clé dérivée en Base64 dans `sessionStorage` : cette copie est directement réutilisable pour ouvrir le coffre.

Le format **du coffre ne change pas**. La session v4 conserve seulement un identifiant aléatoire, le sel, le signal de révocation, l'échéance et la clé dérivée chiffrée par AES-GCM. La clé d'enveloppe est un `CryptoKey` AES-256 non extractible stocké dans IndexedDB ; les métadonnées de session sont authentifiées comme données associées GCM. Les buffers temporaires utilisés par le coffre sont remis à zéro après emploi. Cela réduit l'exposition des clés transportables ; JavaScript/WebCrypto et le navigateur ne fournissent pas une garantie générale d'effacement mémoire matériel.

L'ancienne session v3 est authentifiée contre le coffre puis convertie en v4, sans prolonger sa date d'expiration. Une session v4 copiée à l'ouverture d'un onglet garde sa référence valide ; la rotation à chaque rechargement invaliderait à tort l'onglet parent. Les clés expirées sont collectées et le verrouillage explicite révoque toutes les enveloppes de sessions. Le signal durable est vérifié même après une suspension sans notification `storage`.

Si IndexedDB ou sessionStorage est plein/refusé, la session courante reste utilisable, le coffre est conservé et le code est redemandé au prochain chargement. **Aucun repli vers une clé brute.** Les conflits, quota du coffre et récupération des écritures non confirmées gardent leurs traitements existants.

Les enveloppes de préréglage, agenda et sauvegarde sont vérifiées avant PBKDF2 : coût attendu 600000, tailles de sel/IV, Base64 et ciphertext borné. Les sauvegardes historiques omettant it/kdf/v gardent leurs valeurs par défaut. La borne de fichier est 68 MiB et de ciphertext encodé 64 MiB ; un fichier plus gros est refusé explicitement, sans modification de réglages. Aucun algorithme ni clé du coffre n'est migré.

## Validation

Les 36 scénarios initiaux du coffre sont conservés et étendus à 43 ; les 17 contre-tests restent bloquants. Nouvelles preuves : absence de clé brute, export WebCrypto refusé, reprise v3/v4, métadonnées altérées, refus IndexedDB, révocation sans événements, effacement des enveloppes au verrouillage et transfert chiffré **fictif** conservant chaque valeur durable, le plan pneus et le journal.

Le test de stockage vérifie aussi les enveloppes hostiles avant dérivation. Le scénario navigateur hebdomadaire exige un vrai CryptoKey non extractible et une session v4 dans Chromium/WebKit, sans retirer les contrôles d'expiration et de réauthentification. L'horloge est fixée à l'instant courant avant les authentifications après les sauts multi-pages ; la réussite exige toujours `mode=vault` et `LOCKED=false` sous 30 secondes, avec diagnostic dépourvu de clés.

Exiger la CI complète du head exact, confidentialité, six lots navigateur, QA et profilage avant revue du propriétaire. Une simulation WebKit ne prouve pas un essai sur iPhone physique.

## Risques résiduels

- Un script hostile **de même origine** peut invoquer les CryptoKey IndexedDB ; non extractible ne signifie pas inaccessible. L'isolation de domaine reste obligatoire pour séparer les applications.
- Les données publiques chiffrées restent soumises aux attaques hors ligne sur un code faible. PBKDF2 ralentit les essais, il ne crée pas d'entropie. La robustesse du vrai code n'a pas été inspectée ; une future rotation nécessite récupération et autorisation séparées. La normalisation historique des codes n'est pas modifiée.
- Un navigateur compromis, une session ouverte ou un script approuvé malveillant peut accéder aux valeurs en mémoire. Aucune promesse de protection contre ces cas.
- Le stockage navigateur n'est pas un stockage matériel attesté ; Safari peut refuser ou évincer IndexedDB. Le repli est la ressaisie du code, jamais une perte volontaire des données durables.

## Retour arrière et récupération

Avant fusion, fermer la PR. Après fusion autorisée, privilégier un correctif conservant le lecteur v4. L'ancien code ne lit pas v4 et peut redemander le code ; il lit toujours le coffre v2 inchangé. Ne pas réintroduire automatiquement une session avec clé brute. Si le code est perdu ou si la récupération n'a pas été validée, ne pas lancer de rollback. Une sauvegarde locale chiffrée et le coffre original restent les points de récupération. Aucun reset, aucune suppression du coffre ni transfert réel d'origine n'est autorisé par cette PR.
