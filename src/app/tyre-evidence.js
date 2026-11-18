/* Catalogue PUBLIC d'essais, édition contrôlée avec revue et tests ; jamais de réseau à l'exécution.
 * Sources relues le 18/10/2026 ; révision 2 du 17/11/2026 (essais ADAC relus page par page, voir docs/tyre-wet-evidence-20261117.md).
 * Les inconnues restent null. Aucune donnée de véhicule privé ici. Aucun résultat d'essai ni étiquette UE n'est converti en
 * coefficient : le catalogue est AFFICHÉ avec sa comparabilité, il ne modifie aucun calcul d'adhérence, de distance ou d'alerte.
 * Une mesure publiée n'est ni une prévision pour le véhicule, ni un seuil de vitesse autorisée.
 */
const TYRE_TEST_EVIDENCE = (() => {
  const metric = (id, value, unit, rank, count, protocol, extra = {}) => ({
    id, value, unit, rank, count, protocol, startKmh: null, endKmh: null,
    temperatureC: null, temperatureKind: null, surface: null, waterMm: null, kind: 'measured', ...extra
  });
  const common = { variant: null, loadIndex: null, speedIndex: null, xl: null, homologation: null,
    tyreState: null, treadMm: null, airC: null, roadC: null, track: null,
    limitations: ['Résultats historiques du protocole publié, non transposables en distance réelle sur un autre véhicule.',
      'État et profondeur initiaux non chiffrés dans les données retenues ; aucune extrapolation à un pneu usé.',
      'Renfort ou homologation partiellement documentés dans les données retenues.'] };
  const data = {
    schemaVersion: 1, revision: 2, reviewedOn: '2026-11-17',
    models: [
      { id: 'michelin-ps4s', brand: 'Michelin', model: 'Pilot Sport 4S', aliases: ['Pilot Sport 4 S'], type: 'summer', gap: null },
      { id: 'rovelo-rpx988', brand: 'Rovelo', model: 'RPX-988', aliases: ['RPX988', 'RPX 988'], type: 'summer',
        gap: 'Données d’essais insuffisantes : publication primaire non vérifiée. Des essais existent pour un modèle voisin (RPX-998) : ils ne sont pas utilisés pour ton pneu.' },
      { id: 'goodyear-ugp3', brand: 'Goodyear', model: 'UltraGrip Performance 3', aliases: [], type: 'winter', gap: null },
      { id: 'continental-pc7', brand: 'Continental', model: 'PremiumContact 7', aliases: [], type: 'summer', gap: null },
      { id: 'goodyear-ef1a6', brand: 'Goodyear', model: 'Eagle F1 Asymmetric 6', aliases: [], type: 'summer', gap: null },
      { id: 'pirelli-cinturato-as-sf3', brand: 'Pirelli', model: 'Cinturato All Season SF3', aliases: [], type: 'allseason', gap: null },
      { id: 'goodyear-vector-as4', brand: 'Goodyear', model: 'Vector All Season 4', aliases: [], type: 'allseason',
        gap: 'Données d’essais insuffisantes : aucun essai ADAC ni partenaire trouvé au 17/11/2026. Un essai Auto Bild 2026 en 225/45 R17, soutenu en partie par Goodyear, n’est pas intégré : ses valeurs ne sont pas attribuables au modèle avec certitude. Les essais du Vector 4Seasons Gen-3 concernent un autre pneu et ne sont pas utilisés.' }
    ],
    tests: [
      { ...common, id: 'tr-2021-uhp-ps4s', testId: 'tr-2021-uhp', modelId: 'michelin-ps4s', size: '225/40 R18',
        source: { organisation: 'Tyre Reviews', url: 'https://www.tyrereviews.com/Tyre-Tests/2021-Tyre-Reviews-UHP-Summer-Tyre-Test.htm',
          primary: true, year: 2021, publishedOn: '2021-05-10', checkedOn: '2026-10-18' },
        vehicle: 'Volkswagen Golf GTI', loadIndex: 92, speedIndex: 'Y', xl: true, treadMm: 7.62,
        limitations: ['Variante en 225/40 R18 92Y XL ; aucune extrapolation à une autre dimension.', 'Profondeur publiée de 7,62 mm pour cet exemplaire, sans modèle validé de correction pour usure.', 'Températures et profondeur d’eau non documentées dans les données retenues.'],
        metrics: [
          metric('dryBraking', 33.18, 'm', 1, 14, 'ABS · freinage sur sec, 100 → 1 km/h', { startKmh: 100, endKmh: 1, surface: 'dry' }),
          metric('wetBraking', 35.52, 'm', 7, 14, 'ABS · freinage sur mouillé, 80 → 1 km/h', { startKmh: 80, endKmh: 1, surface: 'wet' }),
          metric('dryHandling', 94.42, 's', 3, 14, 'Chronométrage du circuit sec', { surface: 'dry' }),
          metric('wetHandling', 65.23, 's', 7, 14, 'Chronométrage du circuit mouillé', { surface: 'wet' }),
          metric('aquaLongitudinal', 78.5, 'km/h', 2, 14, 'Aquaplaning en ligne droite ; profondeur d’eau non renseignée'),
          metric('aquaLateral', 2.18, 'm/s²', 6, 14, 'Aquaplaning en courbe ; accélération latérale'),
          metric('noise', 72.2, 'dB', 12, 14, 'Bruit extérieur de passage publié'),
          metric('rollingResistance', 9.67, 'kg/t', 13, 14, 'Résistance au roulement publiée')
        ] },
      { ...common, id: 'tr-2023-winter-ugp3', testId: 'tr-2023-winter', modelId: 'goodyear-ugp3', size: '225/45 R18',
        source: { organisation: 'Tyre Reviews', url: 'https://www.tyrereviews.com/Tyre-Tests/2023-Tyre-Reviews-Winter-Tyre-Test.htm',
          primary: true, year: 2023, publishedOn: '2023-10-02', checkedOn: '2026-10-18' }, vehicle: null, loadIndex: 95, speedIndex: 'V', xl: true,
        metrics: [
          metric('dryBraking', 42.54, 'm', 3, 11, 'ABS · freinage sur sec, 100 → 5 km/h', { startKmh: 100, endKmh: 5, surface: 'dry', temperatureC: [8, 9], temperatureKind: 'unspecified' }),
          metric('wetBraking', 28.5, 'm', 6, 11, 'ABS · freinage sur mouillé, 80 → 5 km/h', { startKmh: 80, endKmh: 5, surface: 'wet' }),
          metric('dryHandling', 72.06, 's', 10, 11, 'Chronométrage du circuit sec', { surface: 'dry' }),
          metric('wetHandling', 58.01, 's', 5, 11, 'Chronométrage du circuit mouillé', { surface: 'wet' }),
          metric('aquaLongitudinal', 94.96, 'km/h', 5, 11, 'Aquaplaning en ligne droite ; profondeur d’eau non renseignée'),
          metric('comfort', 100, 'points', 1, 11, 'Confort subjectif publié, classement ex æquo', { kind: 'subjective' }),
          metric('rollingResistance', 8.62, 'kg/t', 8, 11, 'Résistance au roulement publiée'),
          metric('snowBraking', 18.38, 'm', 4, 11, 'Freinage neige, 40 → 5 km/h', { startKmh: 40, endKmh: 5, surface: 'snow' })
        ], limitations: [...common.limitations, 'Onze pneus hiver classés ; deux pneus de référence hors classement.', 'La température 8–9 °C est celle publiée pour le freinage sec, sans distinction air/chaussée. Aucun seuil universel de froid déduit.'] },
      { ...common, id: 'adac-2024-winter-ugp3', testId: 'adac-2024-20555r16', modelId: 'goodyear-ugp3', size: '205/55 R16',
        loadIndex: 91, speedIndex: 'H',
        source: { organisation: 'ADAC', url: 'https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/winterreifen/205-55-r16/goodyear-ultragrip-performance-3-id-4909/',
          primary: true, year: 2024, publishedOn: null, checkedOn: '2026-10-18' }, vehicle: null,
        metrics: [
          metric('dryBraking', 44.2, 'm', null, 12, 'Freinage sec, 100 → 0 km/h', { startKmh: 100, endKmh: 0, surface: 'dry' }),
          metric('wetBraking', 35.5, 'm', null, 12, 'Freinage sur asphalte mouillé, 80 → 0 km/h', { startKmh: 80, endKmh: 0, surface: 'wet-asphalt' }),
          metric('wetBraking', 39.2, 'm', null, 12, 'Freinage sur béton mouillé, 80 → 0 km/h', { startKmh: 80, endKmh: 0, surface: 'wet-concrete' }),
          metric('aquaLongitudinal', 83.1, 'km/h', null, 12, 'Vitesse de déjaugeage longitudinal publiée'),
          metric('aquaLateral', 3.6, 'm/s²', null, 12, 'Aquaplaning sur cercle ; accélération latérale'),
          metric('wear', 49100, 'km', null, 12, 'Kilométrage projeté jusqu’au minimum de sculpture du protocole ADAC', { kind: 'projection' })
        ] },
      { ...common, id: 'adac-2026-22550r17-pc7', testId: 'adac-2026-22550r17', modelId: 'continental-pc7', size: '225/50 R17',
        loadIndex: 98, speedIndex: 'Y',
        source: { organisation: 'ADAC', url: 'https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/sommerreifen/225-50-r17-2026/continental-premiumcontact-7-id-5128/',
          primary: true, year: 2026, publishedOn: null, checkedOn: '2026-11-17' }, vehicle: null,
        limitations: ['Variante 225/50 R17 98Y ; renfort XL et véhicule d’essai non précisés sur la fiche. Aucune extrapolation à une autre dimension (ex. 225/45 R17).', 'Classement, notes et pondérations ADAC non repris : seules les mesures publiées sont conservées.',
          'Aucune température d’air ni de chaussée publiée : aucun comportement au froid n’en est déduit.',
          'Comparaison valable seulement avec les autres pneus du même essai ; jamais avec un essai d’une autre dimension, campagne ou année.',
          'Résultats du véhicule d’essai, non transposables en distance réelle sur un autre véhicule.'],
        metrics: [
          metric('dryBraking', 35.0, 'm', null, 16, 'Freinage sec, 100 → 0 km/h ; meilleur–pire de l’essai 33,9–36,7 m', { startKmh: 100, endKmh: 0, surface: 'dry' }),
          metric('wetBraking', 30.1, 'm', null, 16, 'Freinage sur asphalte mouillé, 80 → 0 km/h ; meilleur–pire de l’essai 30,1–37,9 m', { startKmh: 80, endKmh: 0, surface: 'wet-asphalt' }),
          metric('wetBraking', 34.9, 'm', null, 16, 'Freinage sur béton mouillé, 80 → 0 km/h ; meilleur–pire de l’essai 32,3–44,5 m', { startKmh: 80, endKmh: 0, surface: 'wet-concrete' }),
          metric('aquaLongitudinal', 79.7, 'km/h', null, 16, 'Vitesse de déjaugeage longitudinal publiée ; meilleur–pire de l’essai 79,7–72,9 km/h'),
          metric('aquaLateral', 3.7, 'm/s²', null, 16, 'Aquaplaning sur cercle ; accélération latérale ; meilleur–pire de l’essai 3,7–2,9 m/s²')
        ] },
      { ...common, id: 'adac-2025-22540r18-ef1a6', testId: 'adac-2025-22540r18', modelId: 'goodyear-ef1a6', size: '225/40 R18',
        loadIndex: 92, speedIndex: 'Y',
        source: { organisation: 'ADAC', url: 'https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/sommerreifen/225-40-r18/goodyear-eagle-f1-asymmetric-6-id-4971/',
          primary: true, year: 2025, publishedOn: null, checkedOn: '2026-11-17' }, vehicle: null,
        limitations: ['Variante 225/40 R18 92Y ; renfort XL non précisé. Véhicule et nombre de pneus de l’essai non indiqués sur la fiche.', 'Classement, notes et pondérations ADAC non repris : seules les mesures publiées sont conservées.',
          'Aucune température d’air ni de chaussée publiée : aucun comportement au froid n’en est déduit.',
          'Comparaison valable seulement avec les autres pneus du même essai ; jamais avec un essai d’une autre dimension, campagne ou année.',
          'Résultats du véhicule d’essai, non transposables en distance réelle sur un autre véhicule.'],
        metrics: [
          metric('dryBraking', 35.5, 'm', null, null, 'Freinage sec, 100 → 0 km/h ; meilleur–pire de l’essai 34,8–39,5 m', { startKmh: 100, endKmh: 0, surface: 'dry' }),
          metric('wetBraking', 29.5, 'm', null, null, 'Freinage sur asphalte mouillé, 80 → 0 km/h ; meilleur–pire de l’essai 28,4–45,1 m', { startKmh: 80, endKmh: 0, surface: 'wet-asphalt' }),
          metric('wetBraking', 35.8, 'm', null, null, 'Freinage sur béton mouillé, 80 → 0 km/h ; meilleur–pire de l’essai 34,2–55,2 m', { startKmh: 80, endKmh: 0, surface: 'wet-concrete' }),
          metric('aquaLongitudinal', 79.4, 'km/h', null, null, 'Vitesse de déjaugeage longitudinal publiée ; meilleur–pire de l’essai 83,7–69,3 km/h'),
          metric('aquaLateral', 3.1, 'm/s²', null, null, 'Aquaplaning sur cercle ; accélération latérale ; meilleur–pire de l’essai 3,5–1,9 m/s²')
        ] },
      { ...common, id: 'adac-2025-22545r17-sf3', testId: 'adac-2025-22545r17-4s', modelId: 'pirelli-cinturato-as-sf3', size: '225/45 R17',
        loadIndex: 94, speedIndex: 'W',
        source: { organisation: 'ADAC', url: 'https://www.adac.de/rund-ums-fahrzeug/ausstattung-technik-zubehoer/reifen/reifentest/ganzjahresreifen/225-45-r17/pirelli-cinturato-all-season-sf3-id-5036/',
          primary: true, year: 2025, publishedOn: null, checkedOn: '2026-11-17' }, vehicle: 'Volkswagen Golf',
        limitations: ['Variante 225/45 R17 94W ; renfort XL non précisé.', 'Essai 4 saisons (conditions estivales, hivernales et mouillé) : aucune comparaison directe avec un essai de pneus été.', 'Classement, notes et pondérations ADAC non repris : seules les mesures publiées sont conservées.',
          'Aucune température d’air ni de chaussée publiée : aucun comportement au froid n’en est déduit.',
          'Comparaison valable seulement avec les autres pneus du même essai ; jamais avec un essai d’une autre dimension, campagne ou année.',
          'Résultats du véhicule d’essai, non transposables en distance réelle sur un autre véhicule.'],
        metrics: [
          metric('wetBraking', 32.5, 'm', null, 16, 'Freinage sur asphalte mouillé, 80 → 0 km/h ; meilleur–pire de l’essai 31,3–42,6 m', { startKmh: 80, endKmh: 0, surface: 'wet-asphalt' }),
          metric('wetBraking', 38.8, 'm', null, 16, 'Freinage sur béton mouillé, 80 → 0 km/h ; meilleur–pire de l’essai 38,4–52,6 m', { startKmh: 80, endKmh: 0, surface: 'wet-concrete' }),
          metric('aquaLongitudinal', 78.3, 'km/h', null, 16, 'Vitesse de déjaugeage longitudinal publiée ; meilleur–pire de l’essai 65,6–78,5 km/h'),
          metric('aquaLateral', 2.8, 'm/s²', null, 16, 'Aquaplaning sur cercle ; accélération latérale ; meilleur–pire de l’essai 1,8–2,8 m/s²')
        ] }
    ]
  };
  // Pas de partage d'objet mutable entre catalogue, règles et vues.
  const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
  return freeze(data);
})();
