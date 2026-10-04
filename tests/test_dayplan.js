// Scénarios métier du moteur pur ; également utilisés par les contre-tests.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const sourcePath = path.join(__dirname, '../src/dayplan.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/wardrobe.js'), 'utf8') + '\n' + source + '\nthis.plan = dayplan;', ctx);
  const sample = (T, extra = {}) => ({ T, Tapp: T, P: 0, pp: 0, gust: 10, wind: 5, snow: 0, code: 0, uv: 0, ...extra });
  const time = hour => '2026-10-03T' + hour;
  const moment = (start, end, T, extra = {}) => ({ start: time(start), end: time(end), location: 'Domicile', kind: 'home', weather: sample(T), ...extra });
  const input = moments => ({ date: '2026-10-03', start: time('08:00'), end: time('22:00'), occasion: 'office', moments });
  const plan = moments => ctx.plan(input(moments));
  const plain = value => JSON.parse(JSON.stringify(value));
  const levelAt = (result, hour) => result.timeline.find(row => row.start <= time(hour) && row.end > time(hour)).level;
  let count = 0;
  const test = (name, fn) => {
    try { fn(); } catch (error) { error.scenario = name; throw error; }
    count++; if (!options.quiet) console.log('✅ ' + name);
  };
  test('aucun programme ne produit pas de tenue inventée', () => assert.equal(plan([]), null));
  test('aucune température valide ne produit pas de tenue inventée', () => assert.equal(plan([moment('08:00', '20:00', null)]), null));
  test('NaN et Infinity restent invalides', () => assert.equal(plan([moment('08:00', '12:00', NaN), moment('12:00', '20:00', Infinity)]), null));
  test('0 °C reste valide, avec accessoires grand froid', () => {
    const result = plan([moment('08:00', '20:00', 0)]);
    assert.equal(result.base.level, 5); assert(result.base.layers.some(layer => /gants/.test(layer))); assert.match(result.advice.title, /Grand froid/);
  });
  test('les six seuils sont ceux de wardrobe.js', () => {
    for (const [T, expected] of [[-1, 5], [0, 5], [0.1, 4], [7, 4], [7.1, 3], [13, 3], [13.1, 2], [19, 2], [19.1, 1], [25, 1], [25.1, 0]]) {
      assert.equal(plan([moment('08:00', '20:00', T)]).base.level, expected, String(T));
    }
  });
  test('chaque niveau ajoute une couche sans supprimer les précédentes', () => {
    let previous = [];
    for (const T of [28, 22, 16, 10, 4, -1]) {
      const result = plan([moment('08:00', '20:00', T)]);
      assert.deepEqual(plain(result.base.layers.slice(0, -1)), previous); previous = plain(result.base.layers);
    }
  });
  test('le ressenti pilote le niveau sans refroidissement double par le vent', () => {
    const result = plan([moment('08:00', '20:00', 16, { weather: sample(16, { Tapp: 5, gust: 35 }) })]);
    assert.equal(result.base.level, 4); assert.equal(result.advice.low, 5);
  });
  test('ressenti absent : température air et détail partiel', () => {
    const result = plan([moment('08:00', '20:00', 16, { weather: sample(16, { Tapp: null }) })]);
    assert.equal(result.base.level, 2); assert(result.advice.tempFallback);
  });
  test('la base couvre le soir froid, la carte affiche le même manteau', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '21:00', 4, { location: 'Restaurant', kind: 'event', event: true })]);
    assert.equal(result.base.level, 4); assert(result.base.layers.includes('Manteau'));
    assert.match(result.advice.pieces[0].item, /Manteau/); assert.equal(levelAt(result, '09:00'), 1);
    assert(result.actions.some(action => /rendez-vous du soir.*manteau/i.test(action.text)));
  });
  test('les couches du soir sont explicitement à emporter', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '21:00', 4, { event: true })]);
    assert(result.carry.includes('Manteau')); assert(result.carry.includes('Maille chaude')); assert(!result.carry.includes('Chemise légère'));
  });
  test('froid chaud froid : retirer puis remettre les mêmes couches', () => {
    const result = plan([moment('08:00', '11:00', 4), moment('11:00', '17:00', 22), moment('17:00', '21:00', 4)]);
    assert.equal(levelAt(result, '12:00'), 1); assert.equal(levelAt(result, '18:00'), 4);
    assert(result.actions.some(action => /retire.*Manteau/.test(action.text)));
    assert(result.actions.some(action => /remets.*Manteau/.test(action.text)));
    assert.match(result.advice.pieces[0].item, /Manteau/);
  });
  test('une oscillation thermique de 90 min ne change pas la tenue', () => {
    const result = plan([moment('08:00', '10:00', 22), moment('10:00', '11:30', 4), moment('11:30', '20:00', 22)]);
    assert.equal(levelAt(result, '10:30'), 1); assert.equal(result.base.level, 1);
    assert.equal(result.actions.filter(action => action.kind === 'thermal').length, 0); assert.equal(result.advice.low, 4); assert.equal(result.advice.high, 22);
  });
  test('120 minutes exactes déclenchent un changement thermique', () => {
    const result = plan([moment('08:00', '10:00', 22), moment('10:00', '12:00', 4), moment('12:00', '20:00', 22)]);
    assert.equal(levelAt(result, '10:30'), 4);
  });
  test('deux créneaux horaires froids consécutifs comptent comme 2 h', () => {
    const result = plan([moment('08:00', '10:00', 22), moment('10:00', '11:00', 4), moment('11:00', '12:00', 4), moment('12:00', '20:00', 22)]);
    assert.equal(levelAt(result, '10:30'), 4);
  });
  test('une interruption inconnue ne complète pas artificiellement 2 h', () => {
    const result = plan([moment('08:00', '10:00', 22), moment('10:00', '11:00', 4), moment('11:00', '12:00', null, { unknown: true, weather: null }), moment('12:00', '13:00', 4), moment('13:00', '20:00', 22)]);
    assert.equal(result.base.level, 1);
  });
  test('un événement froid de 30 min reste un vrai besoin thermique', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '18:30', 4, { event: true, kind: 'event' }), moment('18:30', '21:00', 22)]);
    assert.equal(levelAt(result, '18:15'), 4); assert(result.carry.includes('Manteau'));
  });
  test('hystérésis : un écart inférieur à 1 °C ne fait pas osciller', () => {
    const result = plan([moment('08:00', '10:00', 7), moment('10:00', '16:00', 7.8), moment('16:00', '20:00', 7)]);
    assert.equal(levelAt(result, '12:00'), 4); assert.equal(result.actions.length, 0);
  });
  test('hystérésis : une vraie sortie de bande change le niveau', () => {
    const result = plan([moment('08:00', '10:00', 7), moment('10:00', '16:00', 8.2)]);
    assert.equal(levelAt(result, '12:00'), 3);
  });
  test('pluie uniquement au retour : protection en sac et action au bon moment', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '18:30', 22, { kind: 'trip', weather: sample(22, { P: 1 }) })]);
    assert(result.carry.some(layer => /Imperméable/.test(layer))); assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].time, time('18:00')); assert.match(result.advice.pieces[3].item, /gomme/);
  });
  test('fin de pluie confirmée : protection utile jusqu’à la bonne heure', () => {
    const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1 }) }), moment('09:00', '20:00', 22)]);
    assert(result.actions.some(action => action.time === time('09:00') && action.kind === 'weather' && /jusqu’à 09:00.*range l.imperméable/.test(action.text)));
  });
  test('lieu ou précipitations inconnus ne prouvent pas une fin de pluie', () => {
    for (const extra of [{ unknown: true, weather: sample(22) }, { weather: null }, { weather: sample(22, { P: null, pp: null, snow: null, code: null }) }]) {
      const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1 }) }), moment('09:00', '20:00', 22, extra)]);
      assert(!result.actions.some(action => /jusqu’à|range l.imperméable/.test(action.text)), JSON.stringify(extra));
    }
  });
  test('snow:0 seul ne prouve pas la fin de pluie et garde la mémoire jusqu’à confirmation', () => {
    const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1 }) }),
      moment('09:00', '10:00', 22, { weather: sample(22, { P: null, pp: null, snow: 0, code: null }) }),
      moment('10:00', '20:00', 22)]);
    const endings = result.actions.filter(action => /jusqu’à|range l.imperméable/.test(action.text));
    assert.equal(endings.length, 1); assert.equal(endings[0].time, time('10:00'));
    assert(!result.timeline.find(row => row.start === time('09:00')).actions.length);
  });
  test('quantité ou probabilité isolées et code inconnu ne prouvent pas un temps sec', () => {
    for (const partial of [{ P: 0, pp: null }, { P: null, pp: 0 }, { P: null, pp: null, code: 999 }]) {
      const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1 }) }),
        moment('09:00', '10:00', 22, { weather: sample(22, { P: null, pp: null, snow: null, code: null, ...partial }) }),
        moment('10:00', '20:00', 22)]);
      const endings = result.actions.filter(action => /range l.imperméable/.test(action.text));
      assert.equal(endings.length, 1); assert.equal(endings[0].time, time('10:00'), JSON.stringify(partial));
    }
  });
  test('code WMO sec reconnu confirme la fin même sans quantité ni probabilité', () => {
    for (const code of [0, 1, 2, 3, 45, 48]) {
      const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1 }) }),
        moment('09:00', '20:00', 22, { weather: sample(22, { P: null, pp: null, snow: null, code }) })]);
      assert(result.actions.some(action => action.time === time('09:00') && /range l.imperméable/.test(action.text)), String(code));
    }
  });
  test('quantité et probabilité sèches ensemble confirment la fin de pluie ordinaire', () => {
    const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1 }) }),
      moment('09:00', '20:00', 22, { weather: sample(22, { P: 0, pp: 0, snow: null, code: null }) })]);
    assert(result.actions.some(action => action.time === time('09:00') && /range l.imperméable/.test(action.text)));
  });
  test('données sèches contradictoires avec un danger ne rangent pas la protection', () => {
    for (const weather of [{ P: 1, pp: 0, code: 0 }, { P: 0, pp: 60, code: 0 }, { P: 0, pp: 0, code: 66 }, { P: 0, pp: 0, snow: 1, code: 0 }]) {
      const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1 }) }),
        moment('09:00', '20:00', 22, { weather: sample(22, weather) })]);
      assert(!result.actions.some(action => /range l.imperméable/.test(action.text)), JSON.stringify(weather));
    }
  });
  test('trou, lieu inconnu ou météo ancienne gardent le danger jusqu’à confirmation fraîche', () => {
    for (const extra of [{ unknown: true, weather: sample(22) }, { weather: null }, { stale: true, weather: sample(22) }]) {
      const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1 }) }),
        moment('09:00', '10:00', 22, extra), moment('10:00', '20:00', 22)]);
      const endings = result.actions.filter(action => /range l.imperméable/.test(action.text));
      assert.equal(endings.length, 1); assert.equal(endings[0].time, time('10:00'), JSON.stringify(extra));
    }
  });
  test('pluie identique après un trou ne crée pas une reprise artificielle', () => {
    const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1 }) }),
      moment('09:00', '10:00', 22, { weather: null }),
      moment('10:00', '20:00', 22, { weather: sample(22, { P: 1 }) })]);
    const starts = result.actions.filter(action => /Pluie :/.test(action.text));
    assert.equal(starts.length, 1); assert.equal(starts[0].time, time('08:00'));
  });
  test('après neige, verglas ou orage, des quantités sèches sans code ne confirment pas la fin du danger', () => {
    for (const code of [73, 66, 95]) {
      const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { code }) }),
        moment('09:00', '10:00', 22, { weather: sample(22, { code: null, snow: 0, P: 0, pp: 0 }) }),
        moment('10:00', '20:00', 22)]);
      const endings = result.actions.filter(action => /range l.imperméable/.test(action.text));
      assert.equal(endings.length, 1); assert.equal(endings[0].time, time('10:00'), String(code));
      assert(result.weatherWarning);
    }
  });
  test('fin de pluie avec vent fort maintenu : garder la couche extérieure', () => {
    const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1, gust: 60 }) }),
      moment('09:00', '20:00', 22, { weather: sample(22, { gust: 60 }) })]);
    assert(result.actions.some(action => action.time === time('09:00') && /garde la couche extérieure contre le vent/.test(action.text)));
    assert(!result.actions.some(action => /range l.imperméable/.test(action.text)));
  });
  test('fin de pluie ne range pas le coupe-vent après un trou de données de vent', () => {
    const result = plan([moment('08:00', '09:00', 22, { weather: sample(22, { P: 1, gust: 60 }) }),
      moment('09:00', '10:00', 22, { weather: null }),
      moment('10:00', '20:00', 22, { weather: sample(22, { gust: null, wind: null }) })]);
    assert(result.actions.some(action => action.time === time('10:00') && /garde la couche extérieure contre le vent/.test(action.text)));
    assert(!result.actions.some(action => /range l.imperméable/.test(action.text)));
  });
  test('les cinq dangers restent immédiats pendant 30 min', () => {
    for (const weather of [{ P: 1 }, { code: 73 }, { code: 66 }, { code: 95 }, { gust: 50 }, { wind: 50 }]) {
      const result = plan([moment('08:00', '18:00', 22), moment('18:00', '18:30', 22, { weather: sample(22, weather) }), moment('18:30', '21:00', 22)]);
      assert(result.actions.some(action => action.time === time('18:00') && action.kind === 'weather'), JSON.stringify(weather));
    }
  });
  test('tous les dangers restent détectés sans température locale', () => {
    for (const weather of [{ P: 1 }, { code: 73 }, { code: 66 }, { code: 95 }, { gust: 50 }, { wind: 50 }]) {
      const result = plan([moment('08:00', '18:00', 22), moment('18:00', '18:30', null, { weather: sample(null, weather) })]);
      assert(result.actions.some(action => action.time === time('18:00') && action.kind === 'weather'), JSON.stringify(weather));
      assert.equal(levelAt(result, '18:15'), null);
    }
  });
  test('pluie verglaçante sans température locale conserve son action', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '18:30', null, { weather: sample(null, { code: 66 }) })]);
    assert(result.actions.some(action => /verglaçante/.test(action.text)));
    assert.match(result.advice.pieces[3].item, /crantée/); assert.equal(levelAt(result, '18:15'), null);
  });
  test('neige sans ressenti ni température déclenche protection et semelle crantée', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '18:30', null, { weather: sample(null, { snow: 0.2 }) })]);
    assert(result.actions.some(action => /Neige/.test(action.text))); assert.match(result.advice.pieces[3].item, /crantée/);
  });
  test('rafales fortes : capuche et absence de parapluie en sac', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '18:30', 22, { weather: sample(22, { P: 1, gust: 58 }) })]);
    assert(result.carry.some(layer => /capuche/.test(layer))); assert(!result.carry.includes('Parapluie'));
    assert.equal(result.indicator.level, 'adapt'); assert(result.weatherWarning.risks.includes('wind'));
  });
  test('49 km/h seuls ne deviennent pas un danger à 50 km/h', () => {
    const result = plan([moment('08:00', '20:00', 22, { weather: sample(22, { gust: 49 }) })]);
    assert.equal(result.actions.length, 0);
  });
  test('vent soutenu : prudence à 40 km/h, conforme à wardrobe.js', () => {
    const below = plan([moment('08:00', '20:00', 22, { weather: sample(22, { wind: 39 }) })]);
    const strong = plan([moment('08:00', '18:00', 22), moment('18:00', '18:30', 22, { weather: sample(22, { wind: 40 }) })]);
    assert.equal(below.actions.length, 0); assert(strong.advice.strongWind);
    assert(strong.actions.some(action => /Vent fort/.test(action.text))); assert(strong.carry.some(layer => /coupe-vent/.test(layer)));
  });
  test('lieu inconnu : aucune adaptation même avec une météo injectée', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '21:00', -5, { unknown: true, event: true, location: 'Inconnu', weather: sample(-5, { code: 66 }) })]);
    assert.equal(result.base.level, 1); assert.equal(result.actions.length, 0); assert.equal(result.carry.length, 0);
    assert.equal(result.timeline[1].status, 'Lieu inconnu · météo locale non calculée'); assert.equal(result.timeline[1].level, null);
    assert.match(result.advice.pieces[0].item, /Veste légère/);
    assert.doesNotMatch(result.advice.pieces[0].item, /Manteau/);
    assert.doesNotMatch(result.advice.pieces[0].detail, /manteau/i);
  });
  test('la carte affiche le coupe-vent ajouté par le plan', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '18:30', 22, { weather: sample(22, { gust: 60 }) })]);
    assert(result.carry.some(layer => /coupe-vent/.test(layer)));
    assert.match(result.advice.pieces[0].item, /coupe-vent/);
  });
  test('météo absente : aucun changement ou action inventé', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '21:00', null, { weather: null, event: true })]);
    assert.equal(result.actions.length, 0); assert.equal(result.timeline[1].level, null); assert.match(result.timeline[1].status, /non calculée/);
  });
  test('seulement un lieu inconnu ne permet pas de calculer le plan', () => assert.equal(plan([moment('08:00', '20:00', 0, { unknown: true })]), null));
  test('données anciennes : statut, avertissement et action à confirmer', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '21:00', 4, { stale: true, event: true })]);
    assert.match(result.timeline[1].status, /anciennes.*confirmer/); assert(result.warnings.some(warning => /anciennes/.test(warning)));
    assert(result.actions.some(action => /À confirmer/.test(action.text)));
  });
  test('créneaux identiques consécutifs regroupés sans changer la base', () => {
    const result = plan([moment('08:00', '09:00', 22), moment('09:00', '10:00', 22), moment('10:00', '11:00', 22)]);
    assert.equal(result.timeline.length, 1); assert.equal(result.timeline[0].end, time('11:00'));
  });
  test('températures horaires variables : une ligne, amplitude et pires rafales conservées', () => {
    const result = plan([moment('08:00', '09:00', 20), moment('09:00', '10:00', 22, { weather: sample(22, { gust: 30 }) }), moment('10:00', '11:00', 24)]);
    assert.equal(result.timeline.length, 1);
    assert.deepEqual(plain(result.timeline[0].temperatureRange), { low: 20, high: 24 });
    assert.equal(result.timeline[0].weather.gust, 30);
  });
  test('la fusion ne masque pas une averse de 30 min', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '18:30', 22, { weather: sample(22, { P: 1 }) }), moment('18:30', '21:00', 22)]);
    assert.equal(result.timeline.length, 3); assert(result.timeline[1].actions.length);
  });
  test('lieux différents conservés même quand leur météo est identique', () => {
    const result = plan([moment('08:00', '10:00', 22), moment('10:00', '18:00', 22, { location: 'Travail', kind: 'work' })]);
    assert.equal(result.timeline.length, 2); assert.equal(result.timeline[1].location, 'Travail');
  });
  test('détail garde quatre pièces et personnalise bureau ou marche', () => {
    const office = plan([moment('08:00', '20:00', 28)]);
    const walkInput = input([moment('08:00', '20:00', 28)]); walkInput.occasion = 'walk';
    const walk = ctx.plan(walkInput);
    assert.equal(office.advice.pieces.length, 4); assert(office.advice.accessories.some(value => /Cravate/.test(value)));
    assert.match(office.advice.pieces[1].item, /lin/); assert.match(walk.advice.pieces[3].item, /gomme/);
  });
  test('extérieur et lieux chauffés : une note explicite sans modèle intérieur inventé', () => {
    const result = plan([moment('08:00', '20:00', 10)]);
    assert.equal(result.notes.filter(value => /lieux chauffés/.test(value)).length, 1);
    assert(!result.advice.pieces.some(piece => /chauffés/.test(piece.detail)));
  });
  test('carte détaillée développe toutes les couches du même kit', () => {
    for (const T of [28, 22, 16, 10, 4, -1]) {
      const result = plan([moment('08:00', '20:00', T)]);
      const level = result.base.level, outer = result.advice.pieces[0].item, upper = result.advice.pieces[1].item;
      assert.match(upper, /Chemise/);
      if (level >= 1) assert.match(outer, /Veste légère/);
      if (level >= 2) assert.match(upper, /Maille fine/); else assert.doesNotMatch(upper, /Maille fine/);
      if (level >= 3) assert.match(upper, /Maille chaude/); else assert.doesNotMatch(upper, /Maille chaude/);
      if (level >= 4) assert.match(outer, /Manteau/); else assert.doesNotMatch(outer, /Manteau/);
      if (level === 5) assert(result.advice.accessories.some(value => /gants/.test(value)));
    }
  });
  test('N3 reste une maille chaude dans le titre et la pièce principale', () => {
    const result = plan([moment('08:00', '12:00', 10), moment('12:00', '20:00', 22)]);
    assert.equal(result.base.level, 3);
    assert.match(result.advice.title, /Fraîcheur.*mailles amovibles/);
    assert.match(result.advice.pieces[1].item, /Maille fine.*Maille chaude/);
    assert.match(result.advice.pieces[0].item, /Veste légère/);
    assert.doesNotMatch(result.advice.pieces[0].item, /Manteau/);
    assert.doesNotMatch(result.advice.pieces[0].detail, /manteau/i);
  });
  test('indicateur distingue zéro, une et plusieurs transitions', () => {
    const stable = plan([moment('08:00', '20:00', 22)]);
    const one = plan([moment('08:00', '18:00', 22), moment('18:00', '21:00', 4)]);
    const multiple = plan([moment('08:00', '11:00', 4), moment('11:00', '17:00', 22), moment('17:00', '21:00', 4)]);
    assert.equal(stable.indicator.count, 0); assert.equal(stable.indicator.text, 'Tenue valable toute la journée');
    assert.equal(one.indicator.count, 1); assert.equal(one.indicator.text, '1 adaptation nécessaire');
    assert.equal(multiple.indicator.count, 2); assert.equal(multiple.indicator.text, 'Plusieurs adaptations');
    assert.equal(stable.weatherWarning, null); assert.equal(one.weatherWarning, null); assert.equal(multiple.weatherWarning, null);
  });
  test('danger avec zéro adaptation : indicateur stable et avertissement séparé', () => {
    const result = plan([moment('08:00', '20:00', 22, { weather: sample(22, { gust: 60 }) })]);
    assert.equal(result.indicator.level, 'stable'); assert.equal(result.indicator.count, 0);
    assert.equal(result.indicator.text, 'Tenue valable toute la journée');
    assert.equal(result.weatherWarning.text, 'Protection météo nécessaire'); assert(result.weatherWarning.risks.includes('wind'));
  });
  test('danger avec une adaptation : indicateur adapt et avertissement séparé', () => {
    const result = plan([moment('08:00', '18:00', 22, { weather: sample(22, { gust: 60 }) }),
      moment('18:00', '21:00', 4, { weather: sample(4, { gust: 60 }) })]);
    assert.equal(result.indicator.level, 'adapt'); assert.equal(result.indicator.count, 1);
    assert.equal(result.indicator.text, '1 adaptation nécessaire'); assert(result.weatherWarning.risks.includes('wind'));
  });
  test('danger avec plusieurs adaptations : indicateur multiple et avertissement séparé', () => {
    const result = plan([moment('08:00', '11:00', 4, { weather: sample(4, { gust: 60 }) }),
      moment('11:00', '17:00', 22, { weather: sample(22, { gust: 60 }) }),
      moment('17:00', '21:00', 4, { weather: sample(4, { gust: 60 }) })]);
    assert.equal(result.indicator.level, 'multiple'); assert.equal(result.indicator.count, 2);
    assert.equal(result.indicator.text, 'Plusieurs adaptations'); assert(result.weatherWarning.risks.includes('wind'));
  });
  test('la pluie figure aussi dans l’avertissement séparé sans modifier les trois états', () => {
    const rainy = (start, end, T) => moment(start, end, T, { weather: sample(T, { P: 1 }) });
    for (const [moments, level, count] of [
      [[rainy('08:00', '20:00', 22)], 'stable', 0],
      [[rainy('08:00', '18:00', 22), rainy('18:00', '21:00', 4)], 'adapt', 1],
      [[rainy('08:00', '11:00', 4), rainy('11:00', '17:00', 22), rainy('17:00', '21:00', 4)], 'multiple', 2]
    ]) {
      const result = plan(moments);
      assert.equal(result.indicator.level, level); assert.equal(result.indicator.count, count);
      assert.equal(result.weatherWarning.text, 'Protection météo nécessaire');
      assert.deepEqual(plain(result.weatherWarning.risks), ['rain']);
    }
  });
  test('protection déjà portée au départ ne devient pas une adaptation ultérieure', () => {
    const result = plan([moment('08:00', '20:00', 22, { weather: sample(22, { P: 1 }) })]);
    assert.equal(result.actions.length, 1); assert.equal(result.indicator.count, 0);
  });
  test('grande amplitude réelle explicitement signalée', () => {
    const result = plan([moment('08:00', '18:00', 22), moment('18:00', '21:00', 4)]);
    assert(result.notes.some(note => /10 °C/.test(note)));
  });
  test('tri stable, déterminisme et absence de mutation des entrées', () => {
    const value = input([moment('18:00', '21:00', 4, { event: true }), moment('08:00', '18:00', 22)]);
    value.warnings = ['Météo partielle', 'Météo partielle'];
    const before = JSON.stringify(value);
    const freeze = object => { Object.freeze(object); Object.values(object).forEach(item => { if (item && typeof item === 'object') freeze(item); }); };
    freeze(value);
    const firstResult = ctx.plan(value), secondResult = ctx.plan(value);
    assert.deepEqual(plain(firstResult), plain(secondResult)); assert.equal(JSON.stringify(value), before);
    assert.equal(firstResult.timeline[0].start, time('08:00')); assert.equal(firstResult.warnings.length, 1);
  });
  if (!options.quiet) console.log(count + '/' + count + ' scénarios dayplan OK');
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) runTests();
