/* Catalogue PUBLIC d'essais, édition contrôlée avec revue et tests ; jamais de réseau à l'exécution.
 * Sources relues le 18/10/2026. Les inconnues restent null. Aucune donnée de véhicule privé ici.
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
      'Indices, renfort et homologation non documentés dans les données retenues.'] };
  const data = {
    schemaVersion: 1, revision: 1, reviewedOn: '2026-10-18',
    models: [
      { id: 'michelin-ps4s', brand: 'Michelin', model: 'Pilot Sport 4S', aliases: ['Pilot Sport 4 S'], type: 'summer', gap: null },
      { id: 'rovelo-rpx988', brand: 'Rovelo', model: 'RPX-988', aliases: ['RPX988', 'RPX 988'], type: 'summer',
        gap: 'Données d’essais insuffisantes : publication primaire non vérifiée. Aucun résultat attribué au RPX-998.' },
      { id: 'goodyear-ugp3', brand: 'Goodyear', model: 'UltraGrip Performance 3', aliases: [], type: 'winter', gap: null }
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
        ] }
    ]
  };
  // Pas de partage d'objet mutable entre catalogue, règles et vues.
  const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
  return freeze(data);
})();
