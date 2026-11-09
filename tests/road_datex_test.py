"""Fixtures DATEX synthétiques ; aucun réseau, aucune donnée personnelle."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'tools/road-datex/sync.py'
spec = importlib.util.spec_from_file_location('road_datex', SCRIPT)
D = importlib.util.module_from_spec(spec)
spec.loader.exec_module(D)
NOW = D.timestamp('2026-10-05T10:00:00Z')

def record(ident='r1', kind='Accident', end='', extra='', direction='northBound', point=True):
    location = '<pointCoordinates><latitude>48.8572</latitude><longitude>2.3501</longitude></pointCoordinates>'
    if not point:
        location = '<tpegLinearLocation><from>' + location + '</from><to><pointCoordinates><latitude>48.8592</latitude><longitude>2.3501</longitude></pointCoordinates></to></tpegLinearLocation>'
    return f'''<situationRecord id="{ident}" xsi:type="d:{kind}"><situationRecordVersionTime>2026-10-05T09:59:30Z</situationRecordVersionTime>
    <validity><validityStatus>definedByValidityTimeSpec</validityStatus><overallStartTime>2026-10-05T09:00:00Z</overallStartTime>{end}</validity>
    <groupOfLocations><roadNumber>A1</roadNumber><tpegDirection>{direction}</tpegDirection>{location}</groupOfLocations>{extra}</situationRecord>'''

def situation(records=None, ident='s1', extra=''):
    return f'<situation id="{ident}"><informationStatus>real</informationStatus><confidentiality>noRestriction</confidentiality><overallSeverity>high</overallSeverity>{record() if records is None else records}{extra}</situation>'

def publication(situations='', cursor=100, method='snapshot', date='2026-10-05T09:59:40Z'):
    return f'''<d2LogicalModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:d="urn:datex"><payloadPublication>
    <publicationTime>{date}</publicationTime><feedType>{cursor}</feedType><updateMethod>{method}</updateMethod>{situations}</payloadPublication></d2LogicalModel>'''.encode()

def ingest(snapshot=None, deltas=(), previous=None):
    data = {'index.txt': str(100 + len(deltas)).encode(), 'content.xml': publication(situation()) if snapshot is None else snapshot}
    data.update({str(100 + i) + '.xml': x for i, x in enumerate(deltas)})
    return D.sync(data.__getitem__, previous, NOW)

class Datex(unittest.TestCase):
    def test_snapshot(self):
        j = ingest(); self.assertTrue(j['complete']); self.assertEqual(len(j['events']), 1)
        self.assertEqual(j['events'][0]['geometry']['coordinates'], [2.3501, 48.8572])
        self.assertEqual(j['events'][0]['geometry']['type'], 'Point'); self.assertEqual(j['flows'], [])
        self.assertIsNone(j['events'][0]['currentSpeed']); self.assertIsNone(j['events'][0]['freeFlowSpeed'])

    def test_delta_replace_and_ended(self):
        replacement = publication(situation(record('r2')), 100, 'allElementUpdate')
        self.assertEqual([e['sourceId'] for e in ingest(deltas=[replacement])['events']], ['r2'])
        ended = publication(situation(record('r2', extra='<end>true</end>')), 101, 'allElementUpdate')
        self.assertEqual(ingest(deltas=[replacement, ended])['events'], [])

    def test_next_cursor_replays_first_delta_and_excludes_index(self):
        first = publication(situation(record('first'), ident='s2'), 100, 'allElementUpdate')
        last = publication(situation(record('last'), ident='s3'), 101, 'allElementUpdate')
        result = ingest(deltas=[first, last])
        self.assertEqual(result['cursor'], 102)
        self.assertEqual([e['sourceId'] for e in result['events']], ['first', 'last', 'r1'])

    def test_expiry_suspend_future(self):
        for r in [record(end='<overallEndTime>2026-10-05T10:00:00Z</overallEndTime>'),
                  record().replace('definedByValidityTimeSpec', 'suspended'),
                  record().replace('09:00:00Z', '11:00:00Z')]:
            self.assertEqual(ingest(publication(situation(r)))['events'], [])

    def test_exception_period_validity_and_boundaries(self):
        for start, end, active in [('09:30:00', '10:30:00', False),
                                   ('10:00:00', '10:30:00', False),
                                   ('09:00:00', '09:30:00', True),
                                   ('09:30:00', '10:00:00', True),
                                   ('10:30:00', '11:00:00', True)]:
            with self.subTest(start=start, end=end):
                exclusion = f'<exceptionPeriod><startOfPeriod>2026-10-05T{start}Z</startOfPeriod><endOfPeriod>2026-10-05T{end}Z</endOfPeriod></exceptionPeriod>'
                r = record().replace('</validity>', exclusion + '</validity>')
                self.assertEqual(len(ingest(publication(situation(r)))['events']), int(active))
        for exclusion in ['<exceptionPeriod/>',
                          '<exceptionPeriod><startOfPeriod>2026-10-05T09:30:00Z</startOfPeriod></exceptionPeriod>',
                          '<exceptionPeriod><startOfPeriod>invalid</startOfPeriod><endOfPeriod>2026-10-05T10:30:00Z</endOfPeriod></exceptionPeriod>',
                          '<exceptionPeriod><startOfPeriod>2026-10-05T10:30:00Z</startOfPeriod><endOfPeriod>2026-10-05T09:30:00Z</endOfPeriod></exceptionPeriod>']:
            with self.subTest(exclusion=exclusion):
                r = record().replace('</validity>', exclusion + '</validity>')
                self.assertEqual(ingest(publication(situation(r)))['events'], [])

    def test_future_activates_without_delta(self):
        # Un précédent JSON filtré vide ne doit jamais effacer la vérité du snapshot.
        previous = ingest(publication(situation(record().replace('09:00:00Z', '11:00:00Z'))))
        self.assertEqual(previous['events'], []); self.assertEqual(len(ingest(previous=previous)['events']), 1)

    def test_empty_situation_tombstone(self):
        self.assertEqual(ingest(deltas=[publication(situation(''), 100, 'allElementUpdate')])['events'], [])

    def test_partial_missing_gap_and_index(self):
        with self.assertRaises(ValueError): ingest(deltas=[publication(situation(), 101, 'singleElementUpdate')])
        with self.assertRaises(KeyError): D.sync({'index.txt': b'101', 'content.xml': publication(situation())}.__getitem__, now=NOW)
        for target in [b'1000', b'bad', b'-1']:
            with self.assertRaises(ValueError): D.sync({'index.txt': target, 'content.xml': publication(situation())}.__getitem__, now=NOW)

    def test_delta_cursor_must_match_requested_sequence(self):
        for cursor in [99, 101, 999, 'invalid', '']:
            with self.subTest(cursor=cursor):
                delta = publication(situation(record('r2')), cursor, 'allElementUpdate')
                with self.assertRaises(ValueError): ingest(deltas=[delta])
        delta = publication(situation(record('r2')), '0100', 'allElementUpdate')
        self.assertEqual(ingest(deltas=[delta])['cursor'], 101)
        # Les fichiers incrémentaux DIR réels n'ont aucun feedType.
        delta = publication(situation(record('r2')), 100, 'allElementUpdate').replace(b'<feedType>100</feedType>', b'')
        self.assertEqual(ingest(deltas=[delta])['events'][0]['sourceId'], 'r2')

    def test_snapshot_ahead_resync_index(self):
        reads = iter([b'100', b'101'])
        def fetch(name): return next(reads) if name == 'index.txt' else publication(situation(), 101)
        self.assertEqual(D.sync(fetch, now=NOW)['cursor'], 101)

    def test_new_snapshot_does_not_retain_old_events(self):
        previous = ingest(); self.assertEqual(ingest(publication(''), previous=previous)['events'], [])

    def test_types_and_real_fields(self):
        for kind, expected in [('Accident', 'accident'), ('MaintenanceWorks', 'works'), ('VehicleObstruction', 'stopped_vehicle'), ('GeneralObstruction', 'obstacle'), ('WeatherRelatedRoadConditions', 'weather'), ('AbnormalTraffic', 'congestion'), ('SpeedManagement', 'restriction')]:
            e = ingest(publication(situation(record(kind=kind, extra='<delayTimeValue>120</delayTimeValue><numberOfLanesRestricted>1</numberOfLanesRestricted>'))))['events'][0]
            self.assertEqual(e['type'], expected); self.assertEqual(e['delaySeconds'], 120); self.assertIn('1 voie', e['laneInfo'])
        e = ingest(publication(situation(record(kind='RoadOrCarriagewayOrLaneManagement', extra='<roadOrCarriagewayOrLaneManagementType>roadClosed</roadOrCarriagewayOrLaneManagementType>'))))['events'][0]
        self.assertEqual(e['type'], 'closure')
        for subtype, expected in [('queuingTraffic', 'jam'), ('stationaryTraffic', 'jam'), ('slowTraffic', 'slowdown')]:
            e = ingest(publication(situation(record(kind='AbnormalTraffic', extra=f'<abnormalTrafficType>{subtype}</abnormalTrafficType>'))))['events'][0]
            self.assertEqual(e['type'], expected); self.assertEqual(e['congestion'], subtype); self.assertIsNone(e['currentSpeed'])

    def test_location_and_vehicle_restrictions(self):
        e = ingest(publication(situation(record(point=False))))['events'][0]
        self.assertEqual(e['geometry']['type'], 'LineString'); self.assertEqual(len(e['geometry']['coordinates']), 2)
        for extra in ['<forVehiclesWithCharacteristicsOf><vehicleType>heavyGoodsVehicle</vehicleType></forVehiclesWithCharacteristicsOf>', '<recurringTimePeriodOfDay/>']:
            self.assertEqual(ingest(publication(situation(record(extra=extra))))['events'], [])

    def test_private_test_unknown_invalid_and_duplicates(self):
        for data in [publication(situation().replace('noRestriction', 'restricted')), publication(situation().replace('real', 'test')), publication(situation(record(kind='Unknown'))), publication(situation(record().replace('48.8572', '999')))]:
            self.assertEqual(ingest(data)['events'], [])
        with self.assertRaises(ValueError): ingest(publication(situation(record() + record())))

    def test_xml_and_timestamps(self):
        for data in [b'<html/>', b'<!DOCTYPE x><x/>', b'<!ENTITY e "x"><x/>', b'x' * (D.MAX_XML + 1), publication(situation(), date='invalid'), publication(situation(), date='2026-10-05T11:00:00Z')]:
            with self.assertRaises((ValueError, D.ET.ParseError)): ingest(data)

    def test_failure_preserves_file_and_success_is_atomic(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder); out = p / 'road.json'; out.write_text('previous valid file')
            (p / 'index.txt').write_text('bad'); (p / 'content.xml').write_bytes(publication(situation()))
            command = ['python3', str(SCRIPT), '--output', str(out), '--fixture-dir', folder, '--now', '2026-10-05T10:00:00Z']
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0); self.assertEqual(out.read_text(), 'previous valid file')
            (p / 'index.txt').write_text('101'); (p / '100.xml').write_bytes(publication(situation(), 999, 'allElementUpdate'))
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0); self.assertEqual(out.read_text(), 'previous valid file')
            (p / 'index.txt').write_text('100'); self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(len(json.loads(out.read_text())['events']), 1); self.assertFalse((p / 'road.tmp').exists())

    def test_network_errors_are_retried_but_client_errors_are_not(self):
        import urllib.error
        calls = []
        class Response:
            status = 200
            def __init__(self, name): self.url = D.BASE + name
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self, n): return b'101'
        def flaky(request, timeout):
            calls.append(request.full_url)
            if len(calls) < 3: raise urllib.error.URLError('timed out')
            return Response('index.txt')
        sleeps = []
        old_open, old_sleep = D.urllib.request.urlopen, D.time.sleep
        D.urllib.request.urlopen, D.time.sleep = flaky, sleeps.append
        try:
            self.assertEqual(D.download('index.txt'), b'101'); self.assertEqual((len(calls), sleeps), (3, [3, 8]))
            calls.clear(); sleeps.clear()
            def missing(request, timeout):
                calls.append(1); raise urllib.error.HTTPError(request.full_url, 404, 'Not Found', None, None)
            D.urllib.request.urlopen = missing
            with self.assertRaises(urllib.error.HTTPError): D.download('index.txt')
            self.assertEqual((len(calls), sleeps), (1, []))
            calls.clear()
            def always_down(request, timeout):
                calls.append(1); raise urllib.error.URLError('timed out')
            D.urllib.request.urlopen = always_down
            with self.assertRaises(urllib.error.URLError): D.download('index.txt')
            self.assertEqual(len(calls), 3)
        finally:
            D.urllib.request.urlopen, D.time.sleep = old_open, old_sleep

    def test_unreachable_source_keeps_recent_publication_only(self):
        import urllib.error
        now = D.timestamp('2026-10-06T16:00:00Z')
        def down(name): raise urllib.error.URLError('timed out')
        def corrupt(name): raise ValueError('bad source')
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / 'road.json'
            argv = ['--output', str(out)]
            self.assertEqual(D.cli(argv, down, now), 1)                     # aucune publication précédente
            recent = json.dumps({'checkedAt': '2026-10-06T15:50:00+00:00', 'events': []}); out.write_text(recent)
            self.assertEqual(D.cli(argv, down, now), 0); self.assertEqual(out.read_text(), recent)   # gardée telle quelle
            self.assertEqual(D.cli(argv, corrupt, now), 1)                  # une source invalide n'est jamais masquée
            out.write_text(json.dumps({'checkedAt': '2026-10-06T14:30:00+00:00', 'events': []}))
            self.assertEqual(D.cli(argv, down, now), 1)                     # plus d'une heure : l'échec redevient visible

    def test_rush_hour_gap_is_ingested_but_stays_bounded(self):
        # Pics des 04/11 et 05/11 : ~12 deltas/min, snapshot horaire ; 700 deltas doivent passer, 769 non.
        def feed(gap):
            data = {'index.txt': str(100 + gap).encode(), 'content.xml': publication(situation())}
            return lambda name: data[name] if name in data else publication('', int(name[:-4]), 'allElementUpdate')
        result = D.sync(feed(700), None, NOW)
        self.assertEqual((result['cursor'], len(result['events'])), (800, 1))
        with self.assertRaises(ValueError): D.sync(feed(D.MAX_GAP + 1), None, NOW)
        self.assertEqual(D.MAX_GAP, 768)

    def test_announced_delta_still_404_is_retried_briefly(self):
        # Mesure du 09/11 : index.txt avance avant que le dernier delta annoncé soit servi (404 pendant 0 à 7 s).
        import urllib.error
        calls, sleeps = [], []
        class Response:
            status = 200
            def __init__(self, name): self.url = D.BASE + name
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self, n): return b'<x/>'
        def late(request, timeout):
            calls.append(request.full_url)
            if len(calls) < 3: raise urllib.error.HTTPError(request.full_url, 404, 'Not Found', None, None)
            return Response('3655011.xml')
        old_open, old_sleep = D.urllib.request.urlopen, D.time.sleep
        D.urllib.request.urlopen, D.time.sleep = late, sleeps.append
        try:
            self.assertEqual(D.download('3655011.xml'), b'<x/>'); self.assertEqual((len(calls), sleeps), (3, [3, 8]))
            calls.clear(); sleeps.clear()
            def gone(request, timeout):
                calls.append(1); raise urllib.error.HTTPError(request.full_url, 404, 'Not Found', None, None)
            D.urllib.request.urlopen = gone
            with self.assertRaises(urllib.error.HTTPError) as caught: D.download('3655011.xml')
            self.assertEqual((len(calls), sleeps, caught.exception.source_name), (3, [3, 8], '3655011.xml'))   # borné puis visible
            calls.clear(); sleeps.clear()
            for name in ('index.txt', 'content.xml'):                                                 # jamais retenté hors delta
                with self.assertRaises(urllib.error.HTTPError): D.download(name)
            self.assertEqual((len(calls), sleeps), (2, []))
            def forbidden(request, timeout):
                calls.append(1); raise urllib.error.HTTPError(request.full_url, 403, 'Forbidden', None, None)
            calls.clear(); D.urllib.request.urlopen = forbidden
            with self.assertRaises(urllib.error.HTTPError): D.download('3655011.xml')
            self.assertEqual((len(calls), sleeps), (1, []))                                            # autre 4xx : définitif
        finally:
            D.urllib.request.urlopen, D.time.sleep = old_open, old_sleep

    def test_truncated_xml_is_refetched_once_then_fails_visibly(self):
        # Run du 09/11 03:24 UTC : « DATEX sync failed: ParseError » (XML tronqué côté source).
        full = publication(situation())
        calls, sleeps = [], []
        old_sleep = D.time.sleep; D.time.sleep = sleeps.append
        try:
            def once(name):
                calls.append(name)
                if name == 'index.txt': return b'100'
                return full[:200] if calls.count(name) == 1 else full
            self.assertEqual(len(D.sync(once, None, NOW)['events']), 1)      # tronqué puis complet : succès réel
            self.assertEqual((calls.count('content.xml'), sleeps), (2, [3]))
            calls.clear(); sleeps.clear()
            def always(name):
                calls.append(name)
                return b'100' if name == 'index.txt' else full[:200]
            with self.assertRaises(D.ET.ParseError) as caught: D.sync(always, None, NOW)
            self.assertEqual(calls.count('content.xml'), 2)                    # une seule nouvelle tentative
            self.assertEqual(caught.exception.source_name, 'content.xml')
            calls.clear()
            def delta(name):
                calls.append(name)
                data = {'index.txt': b'101', 'content.xml': full}
                return data.get(name, publication(situation(), 100, 'allElementUpdate')[:150])
            with self.assertRaises(D.ET.ParseError) as caught: D.sync(delta, None, NOW)
            self.assertEqual((calls.count('100.xml'), caught.exception.source_name), (2, '100.xml'))
        finally:
            D.time.sleep = old_sleep

    def test_invalid_publication_is_never_refetched(self):
        calls = []
        def invalid(name):
            calls.append(name)
            return b'100' if name == 'index.txt' else b'<d2LogicalModel><x/></d2LogicalModel>'
        with self.assertRaises(ValueError) as caught: D.sync(invalid, None, NOW)
        self.assertEqual((calls.count('content.xml'), caught.exception.source_name), (1, 'content.xml'))

    def test_failure_log_names_code_file_and_reason(self):
        import contextlib, io, urllib.error
        full = publication(situation())
        def gone(name):
            if name == 'index.txt': return b'102'
            if name == 'content.xml': return full
            if name == '101.xml': raise D.tag(urllib.error.HTTPError(D.BASE + name, 404, 'Not Found', None, None), name)
            return publication(situation(), int(name[:-4]), 'allElementUpdate')
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / 'road.json'; out.write_text('previous valid file')
            err, std = io.StringIO(), io.StringIO()
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(std):
                self.assertEqual(D.cli(['--output', str(out)], gone, NOW), 1)
            self.assertIn('DATEX sync failed: HTTPError · HTTP 404 · 101.xml', err.getvalue())
            self.assertEqual(out.read_text(), 'previous valid file')
            def far(name): return {'index.txt': b'900', 'content.xml': full}[name]
            err = io.StringIO()
            with contextlib.redirect_stderr(err): self.assertEqual(D.cli(['--output', str(out)], far, NOW), 1)
            self.assertIn('ValueError · content.xml · Incremental gap exceeds bounded ingestion (snapshot 100, index 900)', err.getvalue())
            for secretish in ('token', 'Authorization', '@'):
                self.assertNotIn(secretish, err.getvalue())

    def test_kept_publication_is_announced_as_warning_not_silent(self):
        import contextlib, io, urllib.error
        now = D.timestamp('2026-10-06T16:00:00Z')
        def down(name): raise D.tag(urllib.error.HTTPError(D.BASE + name, 503, 'Unavailable', None, None), name)
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / 'road.json'
            recent = json.dumps({'checkedAt': '2026-10-06T15:50:00+00:00', 'events': []}); out.write_text(recent)
            std, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(std), contextlib.redirect_stderr(err):
                self.assertEqual(D.cli(['--output', str(out)], down, now), 0)
            self.assertIn('::warning title=DATEX non actualisé::', std.getvalue())
            self.assertIn('HTTP 503 · index.txt', std.getvalue())
            self.assertEqual(out.read_text(), recent)

if __name__ == '__main__':
    unittest.main()
