// NOESIS-XSS-001/002 : fixtures fictives, marqueurs HTML inoffensifs, aucun accès extérieur.
// Exécuter avant correction (rouge attendu), puis après correction dans Chromium ET WebKit.
// Les données sont confinées au contexte Playwright créé par session().
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
const SHORT = 'Essai <mark data-noesis-short="marker">texte HTML fictif</mark> & accents éè \' "';
const PHOTO = 'data:image/png;base64,AA==" data-noesis-photo="marker';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let checks = 0;
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(browser, { at: '2026-10-23T12:00:00+02:00', dev });
      try {
        const p = s.p;
        const inspect = (seed = true) => p.evaluate(({ short, photo, seed }) => {
          if (seed) {
            S.cars[0].short = short;
            S.cars[0].photo = photo;
            for (const c of S.cars) Object.assign(c.tire, { type: 'allseason', brand: 'Marque fictive', model: 'Modèle fictif', size: '205/55 R16' });
          }
          rebuild();
          renderAll();
          renderCompare();
          const card = document.createElement('div');
          card.innerHTML = carThumb(S.cars[0]);
          const cmp = document.querySelector('#secCmp');
          return {
            active: !!cmp && !!cmp.querySelector('.why'),
            htmlTag: !!cmp && !!cmp.querySelector('[data-noesis-short]'),
            shortText: cmp ? cmp.textContent : '',
            photoAttribute: !!card.querySelector('[data-noesis-photo]'),
            pictureCount: card.querySelectorAll('img').length,
            storedShort: S.cars[0].short,
            storedPhoto: S.cars[0].photo
          };
        }, { short: SHORT, photo: PHOTO, seed });
        const a = await inspect();
        assert.equal(a.active, true, dev + ' : comparaison affichée');
        assert.equal(a.storedShort, SHORT);
        assert.equal(a.storedPhoto, PHOTO);
        assert.equal(a.htmlTag, false, dev + ' : le marqueur doit être du texte, jamais une balise');
        assert.match(a.shortText, /texte HTML fictif/);
        assert(a.shortText.includes(SHORT), dev + ' : accents, apostrophe, & et balises visibles comme texte sans double échappement');
        assert.equal(a.photoAttribute, false, dev + ' : le champ photo ne crée pas un attribut HTML');
        assert.equal(a.pictureCount, 0, dev + ' : URI photo invalide non utilisée');
        checks++;

        // L'URI data:image valide existante doit rester affichable et les octets ne doivent pas changer.
        const ok = await p.evaluate(png => {
          S.cars[0].photo = png;
          const x = document.createElement('div');
          x.innerHTML = carThumb(S.cars[0]);
          return { raw: S.cars[0].photo, attr: x.querySelector('img') && x.querySelector('img').getAttribute('src'), count: x.querySelectorAll('img').length };
        }, PNG);
        assert.equal(ok.count, 1); assert.equal(ok.raw, PNG); assert.equal(ok.attr, PNG);
        checks++;

        const formats = await p.evaluate(() => {
          const valid = ['png', 'jpeg', 'webp'].map(kind => { const value = 'data:image/' + kind + ';base64,AA=='; return safeCarPhoto(value) === value; });
          const invalid = ['javascript:alert(1)', 'https://example.invalid/photo.png', 'blob:photo', 'data:image/svg+xml;base64,AA==',
            'data:text/html;base64,AA==', 'data:image/png;base64,AA==" data-extra="marker'].map(value => safeCarPhoto(value) === '');
          const long = 'data:image/jpeg;base64,' + 'A'.repeat(130000);
          return { valid, invalid, largeAccepted: safeCarPhoto(long) === long };
        });
        assert(formats.valid.every(Boolean), 'PNG/JPEG/WebP compatibles');
        assert(formats.invalid.every(Boolean), 'schémas et attributs interdits');
        assert(formats.largeAccepted, 'aucune nouvelle limite de taille introduite');
        checks++;

        // Une ancienne donnée invalide reste récupérable dans la sauvegarde fictive,
        // mais ne redevient jamais structure HTML après fermeture/réouverture.
        await p.evaluate(({ short, photo }) => {
          S.cars[0].short = short;
          S.cars[0].photo = photo;
          saveSettings();
        }, { short: SHORT, photo: PHOTO });
        await s.settle(5);
        await p.reload(); await s.settle(8);
        const restored = await inspect(false);
        assert.equal(restored.storedShort, SHORT);
        assert.equal(restored.storedPhoto, PHOTO);
        assert.equal(restored.htmlTag, false);
        assert.equal(restored.photoAttribute, false);
        assert.equal(restored.pictureCount, 0);
        checks++;
        console.log('✅ ' + dev + ' : texte, image et ancienne sauvegarde fictive préservés');
      } finally { await s.c.close(); }
    }
    assert.deepEqual(errors, [], errors.join(' | '));
    console.log('✅ ' + checks + ' groupes de contrôles NOESIS DOM');
  } finally { await browser.close(); }
})().catch(e => { console.error('❌ NOESIS HTML security : ' + (e && e.stack || e)); process.exit(1); });
