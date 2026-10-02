// Navigateur des tests : BROWSER=chromium (défaut) ou webkit (moteur de Safari, pour le profil iPhone).
// En local, le Chromium préinstallé est utilisé s'il existe ; dans GitHub Actions, celui installé par Playwright.
// Isolement réseau strict : toutes les réponses viennent des simulations des tests. Le navigateur passe par un proxy
// inexistant (aucune requête ne peut atteindre Internet, ni le vrai site, ni le vrai agenda) et les service workers sont bloqués.
const pw = require('playwright'), fs = require('fs');
const NAME = (process.env.BROWSER || 'chromium').toLowerCase();
const LOCAL = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DEAD = { server: 'http://127.0.0.1:9' };
exports.NAME = NAME;
exports.launch = async () => {
  const b = NAME === 'webkit' ? await pw.webkit.launch({ proxy: DEAD })
    : await pw.chromium.launch({ ...(fs.existsSync(LOCAL) ? { executablePath: LOCAL } : {}), args: ['--no-sandbox'], proxy: DEAD });
  const nc = b.newContext.bind(b);
  b.newContext = async (o = {}) => {
    const c = await nc({ ...o, serviceWorkers: 'block' });
    await c.route('**/*', r => r.abort());   // filet de sécurité : tout ce que la page ne simule pas est refusé
    return c;
  };
  return b;
};
