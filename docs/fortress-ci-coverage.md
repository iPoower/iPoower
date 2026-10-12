# Disponibilité du relais : valider chaque SHA main

Le confinement #128 exige une CI push complète réussie sur le SHA exact de main. Le filtre historique `on.push.paths` de la CI excluait README, AGENTS et certains workflows. Après un commit limité à ces fichiers, aucune CI push ne démarrait et le relais refusait durablement les secrets pour ce nouveau SHA. Ce cas n’avait pas été couvert par les premiers tests de disponibilité. Aucun blocage permanent de ce type n’est observé pendant cette intégration, où les commits modifient des sources couvertes.

La CI doit se déclencher sur chaque push de main, sans filtre de chemins, en gardant main comme seule branche de push. Le contrôle du relais reste strict : même SHA, même dépôt, workflow attendu, event push, dernière exécution terminée et réussie. Aucun fallback vers une révision non approuvée ou un ancien vert ; aucune permission ou protection affaiblie.

Coût assumé : les commits de documentation déclenchent aussi la matrice complète et le déploiement GitHub Pages existant après réussite, éventuellement avec les mêmes octets applicatifs et un nouveau numéro prod. Le relais attend la fin de cette CI, comme pour un commit applicatif. Les données précédentes restent conservées ; cette correction évite un blocage sans fin mais ne garantit pas la ponctualité du scheduler.

Le huitième scénario de relay-trust vérifie le workflow réel et rejette les contre-tests réintroduisant paths, paths-ignore ou une autre branche. Un run workflow_dispatch ne remplace pas l’approbation push. Tous les autres scénarios, suites Chromium/WebKit, confidentialité et QA restent obligatoires sur le head exact.

Retour arrière : ne pas remettre le filtre de chemins sans architecture équivalente prouvant l’approbation du code exécutable et conservant la disponibilité. Préférer réparer ce déclencheur ; ne pas désactiver la garde des secrets pour compenser. Aucun secret, DNS, coffre ou domaine modifié.

Cette PR de suivi reste distincte de #128–131 et attend une revue/autorisation explicite avant sa fusion.
