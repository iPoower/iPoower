// Données entièrement fictives, indépendantes du profil et du réseau réel.
'use strict';
const NOW = Date.parse('2026-10-05T10:00:00Z');
const coordinates = Array.from({ length: 11 }, (_, i) => [2.3501, 48.8502 + i / 1000]);
const routeJSON = { routes: [{ geometry: { type: 'LineString', coordinates }, distance: 1112, duration: 600,
  legs: [{ annotation: { duration: Array(10).fill(60) }, steps: [{ ref: 'A 1', name: 'A1', geometry: { type: 'LineString', coordinates } }] }] }] };
const fix = { lon: coordinates[1][0], lat: coordinates[1][1], acc: 18, ts: NOW };
const event = (extra = {}) => ({ sourceId: 'fixture-accident', type: 'accident', title: 'Accident signalé', severity: 3, status: 'active',
  geometry: { type: 'Point', coordinates: coordinates[7] }, roadNumber: 'A1', direction: 'northBound',
  startTime: new Date(NOW - 3600000).toISOString(), endTime: new Date(NOW + 3600000).toISOString(), updatedAt: new Date(NOW - 30000).toISOString(),
  producer: 'DIR fictive', sourceUrl: 'https://www.bison-fute.gouv.fr/donnees-sur-la-circulation-du.html', officialSource: true, ...extra });
const feed = (provider = 'datex', extra = {}) => ({ schema: 1, provider, complete: true, cursor: 101,
  checkedAt: new Date(NOW).toISOString(), publicationTime: new Date(NOW - 30000).toISOString(), coverage: 'Couverture partielle fictive', events: [event()], flows: [], ...extra });
module.exports = { NOW, coordinates, routeJSON, fix, event, feed };
