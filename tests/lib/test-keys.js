// Clés de TEST, publiques par construction : elles ne protègent que des données fictives (tests/fixtures/).
// Deux clés volontairement différentes, comme en production : APP_KEY_TEST (app : préréglage + agenda), RC_KEY_TEST (configuration du relais).
// Aucune vraie clé ni donnée réelle n'est utilisée par les tests.
'use strict';
module.exports = { APP_KEY_TEST: 'ci-app-key-test-only-not-secret', RC_KEY_TEST: 'ci-rc-key-test-only-not-secret-0123456789' };
