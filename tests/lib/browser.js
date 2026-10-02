// Navigateur des tests : BROWSER=chromium (défaut) ou webkit (moteur de Safari, pour le profil iPhone).
// En local, le Chromium préinstallé est utilisé s'il existe ; dans GitHub Actions, celui installé par Playwright.
const pw = require('playwright'), fs = require('fs');
const NAME = (process.env.BROWSER || 'chromium').toLowerCase();
const LOCAL = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
exports.NAME = NAME;
exports.launch = () => NAME === 'webkit' ? pw.webkit.launch()
  : pw.chromium.launch(fs.existsSync(LOCAL) ? { executablePath: LOCAL, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
