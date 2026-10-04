#!/usr/bin/env node
// Mise à jour du lieu de travail : exclusivement des configurations et clés fictives.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { spawnSync } = require('child_process');
const { seal, tryUnseal } = require('../tools/keys');
const { validatePatch, prepareWorkUpdate, writePrepared } = require('../tools/update-work-location');
const { APP_KEY_TEST, RC_KEY_TEST } = require('./lib/test-keys');
const ROOT = path.resolve(__dirname, '..'), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-work-location-test-'));
const fixture = filename => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf8'));
const json = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value));
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const patch = { name: 'Site fictif corrigé', address: '42 rue du test, Commune fictive', lat: 48.81234, lon: 2.23456 };
const keys = { APP_KEY: APP_KEY_TEST, RC_KEY: RC_KEY_TEST };
const preset = fixture('preset.fake.json'), relay = fixture('relay-config.fake.json');
// Le travail est volontairement le troisième élément : ne jamais supposer locs[1].
preset.locs.splice(1, 0, { id: 'other', name: 'Autre lieu fictif', sub: '', lat: 48.7, lon: 2.2 });
preset.gpsAuto = 0; preset.edits = { 'work.dep': 1, 'locs.0.name': 1 }; preset.calib = [{ id: 'fake', value: 1 }]; preset.journal = { fake: 1 };
preset.locRevisions = { other: '00000000000000000000000000000001' };
relay.extra = { preserve: true };
const envelope = (value, key) => ({ v: crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 10), sealed: seal(value, key) });
const sourcePreset = envelope(preset, APP_KEY_TEST), sourceRelay = envelope(relay, RC_KEY_TEST);
const source = path.join(temporary, 'encrypted'); fs.mkdirSync(source);
json(path.join(source, 'preset.sealed.json'), sourcePreset); json(path.join(source, 'relay-config.sealed.json'), sourceRelay);
const original = ['preset.sealed.json', 'relay-config.sealed.json'].map(filename => fs.readFileSync(path.join(source, filename)));
const rows = []; let failed = 0;
function check(name, fn) { try { fn(); rows.push('✅ ' + name); } catch (error) { failed++; rows.push('❌ ' + name); } }
const refused = fn => assert.throws(fn);
let prepared, updatedPreset, updatedRelay;
try {
  check('destination sélectionnée par work.to, sans dépendre de l’ordre des lieux', () => {
    prepared = prepareWorkUpdate(sourcePreset, sourceRelay, patch, keys);
    updatedPreset = tryUnseal(prepared['preset.sealed.json'].sealed, APP_KEY_TEST);
    updatedRelay = tryUnseal(prepared['relay-config.sealed.json'].sealed, RC_KEY_TEST);
    assert.deepStrictEqual(updatedPreset.locs[2], { ...preset.locs[2], ...patch, sub: patch.address });
    assert.deepStrictEqual(updatedPreset.locs[1], preset.locs[1]);
  });
  check('app et relais reçoivent la même destination exacte, adresse comprise', () => {
    assert.deepStrictEqual(updatedRelay.work, { ...relay.work, ...patch, sub: patch.address });
    assert.strictEqual(updatedRelay.work.lat, updatedPreset.locs[2].lat);
    assert.strictEqual(updatedRelay.work.lon, updatedPreset.locs[2].lon);
  });
  check('domicile, voitures, horaires, notifications et réglages indépendants conservés', () => {
    const expectedPreset = clone(preset); Object.assign(expectedPreset.locs[2], patch, { sub: patch.address }); expectedPreset.locRevisions.work = updatedPreset.locRevisions.work;
    assert.deepStrictEqual(updatedPreset, expectedPreset);
    assert.deepStrictEqual(updatedRelay, { ...relay, work: { ...relay.work, ...patch, sub: patch.address } });
  });
  check('révision de migration opaque et versions chiffrées renouvelées', () => {
    assert.match(updatedPreset.locRevisions.work, /^[a-f0-9]{32}$/);
    assert.strictEqual(updatedPreset.locRevisions.other, preset.locRevisions.other);
    assert.notStrictEqual(prepared['preset.sealed.json'].v, sourcePreset.v);
    assert.notStrictEqual(prepared['relay-config.sealed.json'].v, sourceRelay.v);
  });
  check('deux clés séparées : aucune n’ouvre le fichier de l’autre', () => {
    assert.strictEqual(tryUnseal(prepared['preset.sealed.json'].sealed, RC_KEY_TEST), null);
    assert.strictEqual(tryUnseal(prepared['relay-config.sealed.json'].sealed, APP_KEY_TEST), null);
  });
  check('sortie atomique : deux fichiers chiffrés privés, source identique', () => {
    const output = path.join(temporary, 'prepared'); writePrepared(prepared, source, output);
    assert.deepStrictEqual(fs.readdirSync(output).sort(), ['preset.sealed.json', 'relay-config.sealed.json']);
    for (const filename of fs.readdirSync(output)) {
      assert.deepStrictEqual(read(path.join(output, filename)), prepared[filename]);
      assert.strictEqual(fs.statSync(path.join(output, filename)).mode & 0o777, 0o600);
      const text = fs.readFileSync(path.join(output, filename), 'utf8');
      for (const value of [patch.name, patch.address, String(patch.lat), String(patch.lon), APP_KEY_TEST, RC_KEY_TEST]) assert(!text.includes(value));
    }
    assert.strictEqual(fs.statSync(output).mode & 0o777, 0o700);
    original.forEach((value, index) => assert(value.equals(fs.readFileSync(path.join(source, ['preset.sealed.json', 'relay-config.sealed.json'][index])))));
  });
  check('aucune écriture si une clé est erronée, manquante, inversée ou identique', () => {
    for (const supplied of [{ APP_KEY: APP_KEY_TEST, RC_KEY: 'wrong-key-for-relay-0000000000' }, { RC_KEY: RC_KEY_TEST }, { APP_KEY: RC_KEY_TEST, RC_KEY: APP_KEY_TEST }, { APP_KEY: APP_KEY_TEST, RC_KEY: APP_KEY_TEST }]) refused(() => prepareWorkUpdate(sourcePreset, sourceRelay, patch, supplied));
    assert(!fs.existsSync(path.join(temporary, 'failed')));
  });
  check('GPS numériques finis et bornés, nom et adresse requis, champs inattendus refusés', () => {
    for (const invalid of [{ ...patch, lat: NaN }, { ...patch, lat: Infinity }, { ...patch, lon: 181 }, { ...patch, lat: -91 }, { ...patch, lat: '48.1' }, { ...patch, name: '' }, { ...patch, address: '' }, { ...patch, address: undefined }, { ...patch, name: 'test\nname' }, { ...patch, id: 'home' }, { ...patch, sub: 'different' }, null]) refused(() => validatePatch(invalid));
    const { address, ...alias } = patch; assert.deepStrictEqual(validatePatch({ ...alias, sub: address }), { ...patch, sub: address });
  });
  check('enveloppes malformées et nombre excessif d’itérations refusés avant chiffrement', () => {
    for (const fields of [{ it: Infinity }, { it: 2000001 }, { it: -1 }, { kdf: 'unsupported' }, { s: 'not-base64' }, { i: 'bad' }, { c: '' }]) {
      const malformed = clone(sourceRelay); Object.assign(malformed.sealed, fields);
      refused(() => prepareWorkUpdate(sourcePreset, malformed, patch, keys));
    }
    refused(() => prepareWorkUpdate(null, sourceRelay, patch, keys));
  });
  check('destination absente, doublon ou relais visant un autre lieu refusés', () => {
    const missing = clone(preset); missing.work.to = 'missing';
    const duplicate = clone(preset); duplicate.customs.push(clone(preset.locs[2]));
    const wrongRelay = clone(relay); wrongRelay.work.id = 'other';
    for (const [app, cloud] of [[missing, relay], [duplicate, relay], [preset, wrongRelay]]) refused(() => prepareWorkUpdate(envelope(app, APP_KEY_TEST), envelope(cloud, RC_KEY_TEST), patch, keys));
  });
  check('cible domicile refusée sans sortie ; travail distinct à la même adresse accepté', () => {
    for (const homeId of ['home', 'primary-home-test', 'reserved-home-test']) {
      const app = clone(preset), cloud = clone(relay); app.locs[0].id = homeId;
      if (homeId === 'reserved-home-test') {
        app.customs.push({ ...clone(app.locs[0]), id: 'home' }); app.work.to = 'home'; cloud.work = clone(app.customs[app.customs.length - 1]);
      } else { app.work.to = homeId; cloud.work = clone(app.locs[0]); }
      const output = path.join(temporary, 'refused-home-' + homeId);
      refused(() => {
        const result = prepareWorkUpdate(envelope(app, APP_KEY_TEST), envelope(cloud, RC_KEY_TEST), patch, keys);
        writePrepared(result, source, output);
      });
      assert(!fs.existsSync(output));
    }
    const app = clone(preset), cloud = clone(relay);
    Object.assign(app.locs[2], { lat: app.locs[0].lat, lon: app.locs[0].lon }); cloud.work = clone(app.locs[2]);
    const result = prepareWorkUpdate(envelope(app, APP_KEY_TEST), envelope(cloud, RC_KEY_TEST), patch, keys);
    const decoded = tryUnseal(result['preset.sealed.json'].sealed, APP_KEY_TEST);
    assert.deepStrictEqual(decoded.locs[0], app.locs[0]);
    assert.strictEqual(decoded.locs[2].id, 'work'); assert.strictEqual(decoded.locs[2].address, patch.address);
    original.forEach((value, index) => assert(value.equals(fs.readFileSync(path.join(source, ['preset.sealed.json', 'relay-config.sealed.json'][index])))));
  });
  check('travail sélectionné dans un lieu personnalisé, anciennes configurations sans id cohérentes', () => {
    const custom = clone(preset); custom.work.to = 'lieu3'; const cloud = clone(relay); cloud.work = clone(custom.customs[0]); delete cloud.work.id;
    const output = prepareWorkUpdate(envelope(custom, APP_KEY_TEST), envelope(cloud, RC_KEY_TEST), patch, keys);
    assert.deepStrictEqual(tryUnseal(output['preset.sealed.json'].sealed, APP_KEY_TEST).customs[0], { ...custom.customs[0], ...patch, sub: patch.address });
    const mismatch = clone(cloud); mismatch.work.lat += 1;
    refused(() => prepareWorkUpdate(envelope(custom, APP_KEY_TEST), envelope(mismatch, RC_KEY_TEST), patch, keys));
  });
  check('sortie existante, source et alias de la source refusés', () => {
    for (const output of [source, path.join(source, 'new'), path.dirname(source), path.join(temporary, 'prepared')]) refused(() => writePrepared(prepared, source, output));
    const alias = path.join(temporary, 'alias'); fs.symlinkSync(source, alias, 'dir'); refused(() => writePrepared(prepared, source, path.join(alias, 'prepared')));
  });
  check('panne pendant la deuxième écriture : aucun fichier final ni staging partiel', () => {
    const before = fs.readdirSync(temporary).sort(), originalOpen = fs.openSync; let count = 0;
    try {
      fs.openSync = (...args) => { if (++count === 2) throw new Error('fictive I/O error'); return originalOpen(...args); };
      refused(() => writePrepared(prepared, source, path.join(temporary, 'failed')));
    } finally { fs.openSync = originalOpen; }
    assert.deepStrictEqual(fs.readdirSync(temporary).sort(), before);
  });
  check('CLI : aucune clé, adresse, coordonnée ou chemin privé dans les sorties', () => {
    const privatePatch = path.join(temporary, 'patch-private.json'); json(privatePatch, patch);
    const output = path.join(temporary, 'cli-output');
    const args = [path.join(ROOT, 'tools/update-work-location.js'), '--patch', privatePatch, '--encrypted', source, '--out', output];
    const failedOutput = path.join(temporary, 'failed-cli');
    const wrongArgs = [...args]; wrongArgs[wrongArgs.length - 1] = failedOutput;
    const results = [spawnSync(process.execPath, args, { encoding: 'utf8', env: { PATH: process.env.PATH, ...keys } }), spawnSync(process.execPath, wrongArgs, { encoding: 'utf8', env: { PATH: process.env.PATH, ...keys, RC_KEY: 'wrong-key-for-relay-0000000000' } })];
    assert.strictEqual(results[0].status, 0); assert.strictEqual(results[1].status, 1);
    assert(fs.existsSync(path.join(output, 'preset.sealed.json')));
    assert(!fs.existsSync(failedOutput));
    for (const result of results) for (const value of [APP_KEY_TEST, RC_KEY_TEST, patch.name, patch.address, String(patch.lat), String(patch.lon), privatePatch, source, output, failedOutput]) assert(!(result.stdout + result.stderr).includes(value));
  });
  check('clé relais de 16 caractères toujours compatible avec le contrat existant', () => {
    const relayKey = 'fictive-relay-16'; assert.strictEqual(relayKey.length, 16);
    const result = prepareWorkUpdate(sourcePreset, envelope(relay, relayKey), patch, { APP_KEY: APP_KEY_TEST, RC_KEY: relayKey });
    assert(tryUnseal(result['relay-config.sealed.json'].sealed, relayKey));
  });
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
console.log(rows.join('\n') + `\n\n${failed ? '❌ ' + failed + ' contrôles en échec' : '✅ ' + rows.length + ' contrôles de préparation du lieu de travail au vert'}`);
process.exitCode = failed ? 1 : 0;
